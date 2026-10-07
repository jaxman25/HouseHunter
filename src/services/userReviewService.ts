/**
 * User reputation service — peer reviews between buyers, sellers, and agents.
 *
 * A `UserReview` is written after a real interaction (completed viewing/tour
 * or a chat with 5+ messages, which is what generates the review prompt).
 * Aggregate avg/count is computed on read (same approach as reviewService's
 * getSellerRating) and kept small with a limit.
 *
 * Rules (firestore.rules): the client may only create reviews where it is
 * the reviewer; admins may delete abusive reviews; no client updates.
 */

import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  DocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { UserReview } from '../types';
import { firestoreCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../utils/network/timeout';
import { sanitize } from '../utils/security/sanitize';
import { trackMetric } from '../utils/monitoring/metrics';
import { PAGE_SIZE_DEFAULT, USERS_COLLECTION } from '../utils/constants';
import { cachedRead, buildCacheKey, CACHE_TTLS } from '../utils/cache/cacheService';
import { invalidateUserTags } from '../utils/cache/cacheInvalidation';
import {
  trackedGetDoc,
  trackedGetDocs,
  trackedAddDoc,
  trackedDeleteDoc,
} from '../utils/firestore/tracked';

/** Client-side collection constant (rules key off the same path). */
export const USER_REVIEWS_COLLECTION = 'userReviews';

export interface UserRatingSummary {
  averageRating: number;
  totalReviews: number;
}

/** Normalize a Firestore timestamp to an ISO string. */
function toISO(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  const t = value as { seconds?: unknown; nanoseconds?: unknown };
  if (typeof t.seconds === 'number' && typeof t.nanoseconds === 'number') {
    return new Date(t.seconds * 1000 + t.nanoseconds / 1_000_000).toISOString();
  }
  return new Date().toISOString();
}

function toUserReview(docData: DocumentData, id: string): UserReview {
  return {
    id,
    reviewerId: docData.reviewerId,
    revieweeId: docData.revieweeId,
    propertyId: docData.propertyId || undefined,
    tourId: docData.tourId || undefined,
    conversationId: docData.conversationId || undefined,
    reviewerName: docData.reviewerName || undefined,
    revieweeName: docData.revieweeName || undefined,
    rating: docData.rating,
    text: docData.text ?? '',
    createdAt: toISO(docData.createdAt),
  };
}

/**
 * Submit a peer review. The caller must be the reviewer; the reviewee must
 * differ; rating is clamped to 1–5; text is sanitized and length-capped
 * (rules enforce the same invariants server-side).
 */
export async function submitUserReview(review: {
  reviewerId: string;
  revieweeId: string;
  rating: number;
  text: string;
  reviewerName?: string;
  revieweeName?: string;
  propertyId?: string;
  tourId?: string;
  conversationId?: string;
}): Promise<string> {
  if (review.reviewerId === review.revieweeId) {
    throw new Error('You cannot review yourself.');
  }

  const payload = {
    reviewerId: review.reviewerId,
    revieweeId: review.revieweeId,
    rating: Math.max(1, Math.min(5, Math.round(review.rating))),
    text: sanitize(review.text, 1000),
    ...(review.reviewerName ? { reviewerName: sanitize(review.reviewerName, 100) } : {}),
    ...(review.revieweeName ? { revieweeName: sanitize(review.revieweeName, 100) } : {}),
    ...(review.propertyId ? { propertyId: review.propertyId } : {}),
    ...(review.tourId ? { tourId: review.tourId } : {}),
    ...(review.conversationId ? { conversationId: review.conversationId } : {}),
    createdAt: serverTimestamp(),
  };

  const docRef = await trackMetric('userReviews.submit', () =>
    firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          trackedAddDoc(collection(db, USER_REVIEWS_COLLECTION), payload),
          DEFAULT_TIMEOUT_MS
        )
      )
    )
  );
  // The reviewee's cached rating/agent bundle is now stale — purge by tag.
  await invalidateUserTags(review.revieweeId).catch(() => {});
  return docRef.id;
}

/** Reviews written ABOUT a user (their reputation), newest first. */
export async function getUserReviews(
  userId: string,
  maxResults: number = PAGE_SIZE_DEFAULT
): Promise<UserReview[]> {
  const result = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackedGetDocs(
          query(
            collection(db, USER_REVIEWS_COLLECTION),
            where('revieweeId', '==', userId),
            orderBy('createdAt', 'desc'),
            limit(maxResults)
          ),
          USER_REVIEWS_COLLECTION
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
  return result.docs.map((d) => toUserReview(d.data(), d.id));
}

/**
 * Avg + count of reviews about a user, CACHED (5-minute agent-profile TTL,
 * user-tagged) — profile screens re-mount often; within the TTL this is a
 * zero-read render. The aggregation-optimized read lives in getUserRating.
 */
export async function getUserRatingCached(userId: string): Promise<UserRatingSummary> {
  const result = await cachedRead(
    buildCacheKey('userReviews', 'rating', userId),
    CACHE_TTLS.agentProfile,
    () => getUserRating(userId),
    { tags: [`user:${userId}`] }
  );
  return result.data;
}

/**
 * Total reviews about a user, from the trigger-maintained `peerReviewCount`
 * field on `users/{uid}` (updatePeerReviewStats in functions/src — clients
 * can read the field but never write it; rules' users allowlist omits it).
 * One doc read replaces the client-side `getCountFromServer` aggregation.
 */
async function getPeerReviewCount(userId: string): Promise<number> {
  const userSnap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(trackedGetDoc(doc(db, USERS_COLLECTION, userId)), DEFAULT_TIMEOUT_MS)
    )
  );
  const maintained = userSnap.exists()
    ? (userSnap.data()?.peerReviewCount as unknown)
    : undefined;
  if (typeof maintained === 'number' && Number.isFinite(maintained)) {
    return maintained;
  }
  // Legacy fallback: reviews that all predate the trigger (no field written
  // yet) are counted with a bounded paged read (≤3 × 100 — composite index
  // userReviews[revieweeId, createdAt]) until the reviewee's next write
  // materializes the maintained counter.
  let total = 0;
  let cursor: DocumentSnapshot<DocumentData> | null = null;
  for (let page = 0; page < 3; page++) {
    const snap = await firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          trackedGetDocs(
            query(
              collection(db, USER_REVIEWS_COLLECTION),
              where('revieweeId', '==', userId),
              orderBy('createdAt', 'desc'),
              limit(100),
              ...(cursor ? [startAfter(cursor)] : [])
            ),
            USER_REVIEWS_COLLECTION
          ),
          DEFAULT_TIMEOUT_MS
        )
      )
    );
    total += snap.size;
    if (snap.size < 100) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return total;
}

/**
 * Avg + count of reviews about a user (profile screens). The count comes
 * from the trigger-maintained `peerReviewCount` field (eventually consistent,
 * no aggregation queries); the average samples the newest 100 reviews —
 * bounded, and statistically plenty for a 1-decimal average.
 */
export async function getUserRating(userId: string): Promise<UserRatingSummary> {
  const [total, recent] = await Promise.all([
    getPeerReviewCount(userId),
    firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          trackedGetDocs(
            query(
              collection(db, USER_REVIEWS_COLLECTION),
              where('revieweeId', '==', userId),
              orderBy('createdAt', 'desc'),
              limit(100)
            ),
            USER_REVIEWS_COLLECTION
          ),
          DEFAULT_TIMEOUT_MS
        )
      )
    ),
  ]);

  if (total === 0 || recent.empty) return { averageRating: 0, totalReviews: total };

  let sum = 0;
  recent.forEach((d) => {
    const r = Number(d.data().rating);
    if (r >= 1 && r <= 5) sum += r;
  });
  return {
    averageRating: Math.round((sum / recent.size) * 10) / 10,
    totalReviews: total,
  };
}

/** True when this reviewer already reviewed the user (one per pair). */
export async function hasUserReviewedReviewer(
  reviewerId: string,
  revieweeId: string
): Promise<boolean> {
  const result = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackedGetDocs(
          query(
            collection(db, USER_REVIEWS_COLLECTION),
            where('reviewerId', '==', reviewerId),
            where('revieweeId', '==', revieweeId),
            limit(1)
          ),
          USER_REVIEWS_COLLECTION
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
  return !result.empty;
}

/** Admin-only deletion path (rules allow deletes for admins only). */
export async function deleteUserReview(
  reviewId: string,
  /** Reviewee's cached rating/agent bundle purged via `user:${uid}` tag. */
  revieweeId?: string
): Promise<void> {
  await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackedDeleteDoc(doc(db, USER_REVIEWS_COLLECTION, reviewId)),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
  if (revieweeId) {
    await invalidateUserTags(revieweeId).catch(() => {});
  }
}

/**
 * Cursor page over a user's reputation reviews, newest first — paginated
 * variant for list screens (usePaginatedQuery).
 */
export async function getUserReviewsPage(
  userId: string,
  cursor: DocumentSnapshot<DocumentData> | null,
  pageSize: number = PAGE_SIZE_DEFAULT
): Promise<{ items: UserReview[]; cursor: DocumentSnapshot<DocumentData> | null }> {
  const q = query(
    collection(db, USER_REVIEWS_COLLECTION),
    where('revieweeId', '==', userId),
    orderBy('createdAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize)
  );
  const snap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackedGetDocs(q, USER_REVIEWS_COLLECTION),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
  return {
    items: snap.docs.map((d) => toUserReview(d.data(), d.id)),
    cursor: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
  };
}
