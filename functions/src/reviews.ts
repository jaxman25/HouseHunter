/**
 * Reviews Cloud Function — updates seller average rating when reviews change.
 *
 * Triggered by Firestore writes to reviews/{reviewId}. When a review is
 * created or its isRemoved flag changes, recalculates the seller's average
 * rating and total review count on their user document.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

/** Recalculate and write a seller's rating stats. */
async function recalculateSellerRating(sellerId: string): Promise<void> {
  const reviewsSnap = await db
    .collection('reviews')
    .where('sellerId', '==', sellerId)
    .where('isRemoved', '==', false)
    .get();

  let totalRating = 0;
  const totalReviews = reviewsSnap.size;
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const doc of reviewsSnap.docs) {
    const rating = doc.data().rating as number;
    totalRating += rating;
    breakdown[rating as keyof typeof breakdown]++;
  }

  const averageRating = totalReviews > 0
    ? Math.round((totalRating / totalReviews) * 10) / 10
    : 0;

  await db.doc(`users/${sellerId}`).update({
    averageRating,
    totalReviews,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Trigger 1 — when a review is created, updated (sellerResponse, isRemoved),
 * or deleted, recalculate the affected seller's rating.
 */
export const updateRatings = onDocumentWritten(
  'reviews/{reviewId}',
  async (event) => {
    // Get the sellerId from either the before or after state
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const sellerId = after?.sellerId || before?.sellerId;

    if (!sellerId) return;

    try {
      await recalculateSellerRating(sellerId);
    } catch (error) {
      console.error(`[updateRatings] Failed to update rating for seller ${sellerId}:`, error);
    }
  }
);
