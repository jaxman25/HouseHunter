/**
 * Shared per-user daily budget for AI callables.
 *
 * Both `improveListing` and `parseSearchQuery` consume from the same budget so
 * the AI cost surface stays predictable: 20 calls/user/day across the two
 * entry points. Uses the same transactional counter pattern as
 * sendSellerInquiry (users/{uid}/inquiryCounters/{yyyymmdd}_ai).
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

/** Per-user daily budget across all AI callables. */
export const DAILY_AI_LIMIT = 20;

/**
 * Enforce the daily AI budget with a transactional counter (no fast writes).
 * Throws resource-exhausted when the budget is used up.
 */
export async function enforceDailyAiLimit(uid: string): Promise<void> {
  const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const counterRef = db.doc(`users/${uid}/inquiryCounters/${dateKey}_ai`);
  let limitReached = false;
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const count = snap.exists ? ((snap.data()?.count as number) ?? 0) : 0;
      if (count >= DAILY_AI_LIMIT) {
        limitReached = true;
        return;
      }
      tx.set(counterRef, { count: count + 1 }, { merge: true });
    });
  } catch (error) {
    throw new HttpsError('unavailable', 'Could not check AI usage limits. Please try again.');
  }
  if (limitReached) {
    throw new HttpsError(
      'resource-exhausted',
      `Daily AI limit reached (${DAILY_AI_LIMIT}). Please try again tomorrow.`
    );
  }
}
