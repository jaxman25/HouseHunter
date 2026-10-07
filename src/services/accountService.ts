import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  doc,
  DocumentSnapshot,
  DocumentData,
  Query,
  QuerySnapshot,
} from 'firebase/firestore';
import {
  trackedGetDocs,
  trackedDeleteDoc,
  trackedUpdateDoc,
} from '../utils/firestore/tracked';
import { db } from '../config/firebase';
import {
  USERS_COLLECTION,
  CHAT_COLLECTION,
  NOTIFICATIONS_COLLECTION,
  MESSAGES_COLLECTION,
  PROPERTIES_COLLECTION,
  PAGE_SIZE_DEFAULT,
} from '../utils/constants';
import { deleteImage } from './storageService';
import { deleteProperty } from './propertyService';
import { USER_REVIEWS_COLLECTION } from './userReviewService';
import {
  invalidateUserTags,
  invalidateUserProfile,
  invalidateFavorites,
} from '../utils/cache/cacheInvalidation';
import { captureError } from '../utils/monitoring/sentry';

type ListingPageSnap = QuerySnapshot<DocumentData>;

const DELETE_PAGE_SIZE = 400;

/**
 * Drain-and-delete a user-scoped set in bounded pages: fetch a cursor page,
 * delete its docs, advance. Re-querying per page (delete-by-page) avoids the
 * classic pitfall of holding every doc id in memory for large accounts; the
 * loop ends when a page comes back empty.
 */
async function deleteAllPages(
  collectionName: string,
  buildPage: (
    cursor: DocumentSnapshot<DocumentData> | null
  ) => Query<DocumentData, DocumentData>
): Promise<number> {
  let deleted = 0;
  let cursor: DocumentSnapshot<DocumentData> | null = null;
  // Safety valve — 50 pages x 400 docs; deletion is user-scoped so a full
  // drain always finishes well inside this.
  for (let i = 0; i < 50; i++) {
    const snap: QuerySnapshot<DocumentData> = await trackedGetDocs(
      buildPage(cursor),
      collectionName
    );
    if (snap.empty) break;
    for (const d of snap.docs) {
      await trackedDeleteDoc(d.ref);
      deleted++;
    }
    if (snap.size < DELETE_PAGE_SIZE) {
      cursor = null;
      break;
    }
    cursor = snap.docs[snap.docs.length - 1];
  }
  return deleted;
}

/**
 * Permanently erase every piece of data the account owns. Runs BEFORE
 * `authService.deleteAuthAccount` so the auth token still authorizes each
 * delete against the security rules.
 *
 * What gets removed:
 *  - profile avatar in Storage (own `profiles/{uid}/` files),
 *  - the user's property listings (docs + their images in Storage),
 *  - notifications addressed to the user,
 *  - the user's chat messages, and the user's own entries in the
 *    participants/unread metadata of each conversation (conversation docs
 *    themselves are shared with other users and are left intact).
 *
 * Deletion is best-effort per category: if one category fails (e.g. the
 * write-rate limiter trips after deleting many listings) the remaining
 * categories still run and the error is reported to Sentry.
 */
export async function deleteAccountData(uid: string): Promise<void> {
  const failures: string[] = [];

  // Profile avatar.
  try {
    const userSnap = await trackedGetDocs(
      query(collection(db, USERS_COLLECTION), where('uid', '==', uid)),
      USERS_COLLECTION
    );
    const photoURL = userSnap.docs[0]?.data().photoURL as string | undefined;
    // Only touch assets that belong to this user's avatar: Cloudinary
    // (current, filenames are `avatar_<uid>_<ts>`) or Firebase Storage
    // (legacy `profiles/<uid>/` paths sent before the migration).
    if (
      photoURL &&
      (photoURL.includes(`avatar_${uid}_`) || photoURL.includes(`profiles/${uid}/`))
    ) {
      await deleteImage(photoURL);
    }
  } catch (error) {
    failures.push('profile photo');
    captureError(error, { tags: { category: 'account-deletion' }, extra: { step: 'avatar' } });
  }

  // Property listings (each deletes its storage images too). Bounded pages
  // looped to exhaustion — deletion must not stop at one page of listings.
  try {
    let cursor: DocumentSnapshot<DocumentData> | null = null;
    // Safety valve mirrors deleteAllPages (50 pages).
    for (let page = 0; page < 50; page++) {
      const listingsPage: ListingPageSnap = await trackedGetDocs(
        query(
          collection(db, PROPERTIES_COLLECTION),
          where('userId', '==', uid),
          orderBy('createdAt', 'asc'),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(PAGE_SIZE_DEFAULT)
        ),
        PROPERTIES_COLLECTION
      );
      if (listingsPage.empty) break;
      for (const listing of listingsPage.docs) {
        try {
          await deleteProperty(listing.id);
        } catch (error) {
          failures.push(`listing ${listing.id}`);
          captureError(error, {
            tags: { category: 'account-deletion' },
            extra: { step: 'property', propertyId: listing.id },
          });
        }
      }
      if (listingsPage.size < PAGE_SIZE_DEFAULT) break;
      cursor = listingsPage.docs[listingsPage.docs.length - 1];
    }
  } catch (error) {
    failures.push('listings');
    captureError(error, { tags: { category: 'account-deletion' }, extra: { step: 'properties' } });
  }

  // Notifications.
  try {
    await deleteAllPages(NOTIFICATIONS_COLLECTION, (cursor) =>
      query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', uid),
        orderBy('createdAt', 'asc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(DELETE_PAGE_SIZE)
      )
    );
  } catch (error) {
    failures.push('notifications');
    captureError(error, { tags: { category: 'account-deletion' }, extra: { step: 'notifications' } });
  }

  // Chat: own messages, then remove self from conversation metadata.
  try {
    const convSnaps = await trackedGetDocs(
      query(
        collection(db, CHAT_COLLECTION),
        where('participants', 'array-contains', uid),
        // Bounded: conversations are capped in practice; deletion only
        // needs to reach the user's own recent threads.
        limit(200)
      ),
      CHAT_COLLECTION
    );
    for (const convSnap of convSnaps.docs) {
      const convData = convSnap.data();
      await deleteAllPages(MESSAGES_COLLECTION, (cursor) =>
        query(
          collection(db, CHAT_COLLECTION, convSnap.id, MESSAGES_COLLECTION),
          where('senderId', '==', uid),
          orderBy('createdAt', 'asc'),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(DELETE_PAGE_SIZE)
        )
      );
      // Strip own entries from the shared conversation metadata.
      const next: Record<string, unknown> = {
        participants: (convData.participants || []).filter((id: string) => id !== uid),
        updatedAt: new Date(),
      };
      const names = { ...(convData.participantNames || {}) };
      const photos = { ...(convData.participantPhotos || {}) };
      const unread = { ...(convData.unreadCount || {}) };
      delete names[uid];
      delete photos[uid];
      delete unread[uid];
      next.participantNames = names;
      next.participantPhotos = photos;
      next.unreadCount = unread;
      await trackedUpdateDoc(doc(db, CHAT_COLLECTION, convSnap.id), next);
    }
  } catch (error) {
    failures.push('chat data');
    captureError(error, { tags: { category: 'account-deletion' }, extra: { step: 'chat' } });
  }

  // Peer reputation reviews they wrote (reviews about them stay — they are
  // about interactions others had with the account, and admin moderation
  // covers abuse; rules prevent client deletes anyway).
  try {
    await deleteAllPages(USER_REVIEWS_COLLECTION, (cursor) =>
      query(
        collection(db, USER_REVIEWS_COLLECTION),
        where('reviewerId', '==', uid),
        orderBy('createdAt', 'asc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(DELETE_PAGE_SIZE)
      )
    );
  } catch (error) {
    failures.push('peer reviews written');
    captureError(error, {
      tags: { category: 'account-deletion' },
      extra: { step: 'userReviews-written' },
    });
  }

  // User profile document last (listings still reference userName/userPhoto
  // until they are deleted above; chat metadata may too).
  try {
    await trackedDeleteDoc(doc(db, USERS_COLLECTION, uid));
    await invalidateUserTags(uid);
    await invalidateUserProfile(uid);
    await invalidateFavorites(uid);
  } catch (error) {
    failures.push('profile');
    captureError(error, { tags: { category: 'account-deletion' }, extra: { step: 'profile' } });
  }

  if (failures.length > 0) {
    throw new Error(
      `Account data could not be fully removed (${failures.join(', ')}). ` +
        'Contact support and we will finish the removal manually.'
    );
  }
}
