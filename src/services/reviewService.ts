import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  increment,
  DocumentSnapshot,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Review, ReviewRatingBreakdown } from '../types';
import { REVIEWS_COLLECTION, PROPERTIES_COLLECTION, USERS_COLLECTION } from '../utils/constants';
import { firestoreCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../utils/network/timeout';

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

/** Map a Firestore review document to the Review type. */
function toReview(docSnap: DocumentSnapshot): Review {
  const data = docSnap.data()!;
  return {
    id: docSnap.id,
    propertyId: data.propertyId,
    sellerId: data.sellerId,
    buyerId: data.buyerId,
    rating: data.rating,
    title: data.title,
    content: data.content,
    pros: data.pros || [],
    cons: data.cons || [],
    isVerifiedPurchase: data.isVerifiedPurchase || false,
    sellerResponse: data.sellerResponse || undefined,
    isFlagged: data.isFlagged || false,
    isRemoved: data.isRemoved || false,
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt),
  };
}

/** Check if a user can review a property (must be sold, buyer involved, no existing review). */
export async function canUserReview(
  propertyId: string,
  userId: string
): Promise<{ canReview: boolean; reason?: string }> {
  const propertyDoc = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDoc(doc(db, PROPERTIES_COLLECTION, propertyId)), DEFAULT_TIMEOUT_MS))
  );

  if (!propertyDoc.exists()) {
    return { canReview: false, reason: 'Property not found' };
  }

  const property = propertyDoc.data();
  if (property.status !== 'sold' && property.status !== 'rented') {
    return { canReview: false, reason: 'Property must be sold or rented to leave a review' };
  }

  if (property.userId === userId) {
    return { canReview: false, reason: 'You cannot review your own listing' };
  }

  // Check for existing review
  const existingReview = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(
          query(
            collection(db, REVIEWS_COLLECTION),
            where('propertyId', '==', propertyId),
            where('buyerId', '==', userId)
          )
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  if (!existingReview.empty) {
    return { canReview: false, reason: 'You have already reviewed this property' };
  }

  return { canReview: true };
}

/** Create a new review. */
export async function createReview(
  review: Omit<Review, 'id' | 'createdAt' | 'updatedAt' | 'isFlagged' | 'isRemoved'>
): Promise<string> {
  const docRef = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        addDoc(collection(db, REVIEWS_COLLECTION), {
          ...review,
          isFlagged: false,
          isRemoved: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  // Update seller's average rating
  await updateSellerRating(review.sellerId);

  return docRef.id;
}

/** Get reviews for a property. */
export async function getPropertyReviews(propertyId: string): Promise<Review[]> {
  const result = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(
          query(
            collection(db, REVIEWS_COLLECTION),
            where('propertyId', '==', propertyId),
            where('isRemoved', '==', false),
            orderBy('createdAt', 'desc')
          )
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  return result.docs.map(toReview);
}

/** Get reviews for a seller. */
export async function getSellerReviews(sellerId: string, maxResults: number = 20): Promise<Review[]> {
  const result = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(
          query(
            collection(db, REVIEWS_COLLECTION),
            where('sellerId', '==', sellerId),
            where('isRemoved', '==', false),
            orderBy('createdAt', 'desc'),
            limit(maxResults)
          )
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  return result.docs.map(toReview);
}

/** Get rating breakdown for a seller. */
export async function getSellerRating(sellerId: string): Promise<ReviewRatingBreakdown> {
  const result = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(
          query(
            collection(db, REVIEWS_COLLECTION),
            where('sellerId', '==', sellerId),
            where('isRemoved', '==', false)
          )
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  const reviews = result.docs.map(toReview);
  const totalReviews = reviews.length;

  if (totalReviews === 0) {
    return { averageRating: 0, totalReviews: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  }

  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRating = 0;
  for (const review of reviews) {
    totalRating += review.rating;
    breakdown[review.rating as keyof typeof breakdown]++;
  }

  return {
    averageRating: Math.round((totalRating / totalReviews) * 10) / 10,
    totalReviews,
    breakdown,
  };
}

/** Recalculate and update a seller's average rating on their user doc. */
async function updateSellerRating(sellerId: string): Promise<void> {
  const rating = await getSellerRating(sellerId);
  await updateDoc(doc(db, USERS_COLLECTION, sellerId), {
    averageRating: rating.averageRating,
    totalReviews: rating.totalReviews,
  });
}

/** Add a seller response to a review. */
export async function respondToReview(
  reviewId: string,
  sellerId: string,
  content: string
): Promise<void> {
  const reviewDoc = await getDoc(doc(db, REVIEWS_COLLECTION, reviewId));
  if (!reviewDoc.exists()) throw new Error('Review not found');

  const review = reviewDoc.data();
  if (review.sellerId !== sellerId) throw new Error('Not authorized');

  await updateDoc(doc(db, REVIEWS_COLLECTION, reviewId), {
    sellerResponse: {
      content,
      respondedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });
}

/** Flag a review for moderation. */
export async function flagReview(reviewId: string, reporterId: string): Promise<void> {
  await updateDoc(doc(db, REVIEWS_COLLECTION, reviewId), {
    isFlagged: true,
    updatedAt: serverTimestamp(),
  });
}

/** Admin: remove a flagged review. */
export async function removeReview(reviewId: string): Promise<void> {
  const reviewDoc = await getDoc(doc(db, REVIEWS_COLLECTION, reviewId));
  if (!reviewDoc.exists()) throw new Error('Review not found');
  const review = reviewDoc.data();
  const batch = writeBatch(db);
  batch.update(doc(db, REVIEWS_COLLECTION, reviewId), {
    isRemoved: true,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  await updateSellerRating(review.sellerId);
}

/** Get flagged reviews (admin moderation). */
export async function getFlaggedReviews(): Promise<Review[]> {
  const result = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(
          query(
            collection(db, REVIEWS_COLLECTION),
            where('isFlagged', '==', true),
            where('isRemoved', '==', false),
            orderBy('createdAt', 'desc')
          )
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  return result.docs.map(toReview);
}

/** Real-time subscription to reviews for a property. */
export function subscribeToPropertyReviews(
  propertyId: string,
  callback: (reviews: Review[]) => void
): () => void {
  const q = query(
    collection(db, REVIEWS_COLLECTION),
    where('propertyId', '==', propertyId),
    where('isRemoved', '==', false),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const reviews = snapshot.docs.map(toReview);
    callback(reviews);
  });
}
