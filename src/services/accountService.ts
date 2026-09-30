import {
  collection,
  query,
  where,
  doc,
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
} from '../utils/constants';
import { deleteImage } from './storageService';
import { getUserProperties, deleteProperty } from './propertyService';
import { USER_REVIEWS_COLLECTION } from './userReviewService';
import { invalidateUserProfile, invalidateFavorites } from '../utils/cache/cacheInvalidation';
import { captureError } from '../utils/monitoring/sentry';

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

  // Property listings (each deletes its storage images too).
  try {
    const listings = await getUserProperties(uid);
    for (const listing of listings) {
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
  } catch (error) {
    failures.push('listings');
    captureError(error, { tags: { category: 'account-deletion' }, extra: { step: 'properties' } });
  }

  // Notifications.
  try {
    const snaps = await trackedGetDocs(
      query(collection(db, NOTIFICATIONS_COLLECTION), where('userId', '==', uid)),
      NOTIFICATIONS_COLLECTION
    );
    for (const snap of snaps.docs) {
      await trackedDeleteDoc(snap.ref);
    }
  } catch (error) {
    failures.push('notifications');
    captureError(error, { tags: { category: 'account-deletion' }, extra: { step: 'notifications' } });
  }

  // Chat: own messages, then remove self from conversation metadata.
  try {
    const convSnaps = await trackedGetDocs(
      query(
        collection(db, CHAT_COLLECTION),
        where('participants', 'array-contains', uid)
      ),
      CHAT_COLLECTION
    );
    for (const convSnap of convSnaps.docs) {
      const convData = convSnap.data();
      const messages = await trackedGetDocs(
        query(
          collection(db, CHAT_COLLECTION, convSnap.id, MESSAGES_COLLECTION),
          where('senderId', '==', uid)
        ),
        MESSAGES_COLLECTION
      );
      for (const msg of messages.docs) {
        await trackedDeleteDoc(msg.ref);
      }
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
    const written = await trackedGetDocs(
      query(collection(db, USER_REVIEWS_COLLECTION), where('reviewerId', '==', uid)),
      USER_REVIEWS_COLLECTION
    );
    for (const snap of written.docs) {
      await trackedDeleteDoc(snap.ref);
    }
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
