/**
 * House Hunter — peer-review counter maintained on the reviewee's user doc.
 *
 * `getUserRating` (profile screens) used a client-side `getCountFromServer`
 * aggregation over `userReviews`. It now reads the trigger-maintained
 * `peerReviewCount` field on `users/{revieweeId}` instead; this trigger is
 * the maintainer.
 *
 * Recompute-on-write (same pattern as updateRatings in reviews.ts): every
 * create/delete of a userReviews doc recounts the affected reviewee(s) with
 * a server-side aggregation. That is self-healing — the first write after
 * deploy materializes correct counts for that reviewee — and reviewees whose
 * reviews predate the trigger fall back to a bounded read in the service
 * until their next write.
 *
 * The field is deliberately NOT in the client users-update allowlist
 * (firestore.rules), so clients can read but never write it — only this
 * Admin-SDK trigger does.
 *
 * Deploy with: firebase deploy --only functions
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

/** Recount reviews about `revieweeId` and persist the maintained total. */
async function syncPeerReviewCount(revieweeId: string): Promise<void> {
  const snap = await db
    .collection('userReviews')
    .where('revieweeId', '==', revieweeId)
    .count()
    .get();
  try {
    // update() (not set-merge): never creates a ghost user doc if the
    // reviewee's account was already deleted.
    await db.doc(`users/${revieweeId}`).update({
      peerReviewCount: snap.data().count,
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'not-found') return; // reviewee gone — nothing to maintain
    throw error;
  }
}

export const updatePeerReviewStats = onDocumentWritten(
  'userReviews/{reviewId}',
  async (event) => {
    const change = event.data;
    if (!change) return;

    // Reviews are immutable client-side, but admins can delete them, so take
    // the union of both sides' revieweeIds (normally the same one).
    const ids = new Set<string>();
    if (change.before.exists) {
      const id = change.before.get('revieweeId');
      if (typeof id === 'string' && id) ids.add(id);
    }
    if (change.after.exists) {
      const id = change.after.get('revieweeId');
      if (typeof id === 'string' && id) ids.add(id);
    }

    for (const uid of ids) {
      try {
        await syncPeerReviewCount(uid);
      } catch (error) {
        console.error(
          `[updatePeerReviewStats] failed to sync count for ${uid}:`,
          error
        );
      }
    }
  }
);
