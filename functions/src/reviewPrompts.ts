/**
 * Reputation review prompts — server-side nudges to rate the other party.
 *
 * Two triggers create `system` notifications that deep-link to the
 * WriteUserReview screen:
 *
 *   1. reviewPromptTourCompleted — a tour document flips to `completed`;
 *      both buyer and seller get a one-time prompt to rate each other.
 *   2. reviewPromptChatDepth — when a conversation's message count crosses
 *      5 (counter maintained by the message-created trigger below), each
 *      participant is prompted once (per-conversation `reviewPrompted` map).
 *
 * Notifications carry data: { type: 'user_review', revieweeId, ... } so the
 * notification-tap router in AppNavigator can open the review form.
 */

import { onDocumentUpdated, onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

/** Chat-depth threshold that unlocks the rate-the-other-party prompt. */
const CHAT_PROMPT_THRESHOLD = 5;

async function createReviewPrompt(opts: {
  reviewerId: string;
  revieweeId: string;
  revieweeName: string;
  context: string;
  tourId?: string;
  propertyId?: string;
  conversationId?: string;
}): Promise<void> {
  const { reviewerId, revieweeId, revieweeName, context } = opts;
  await db.collection('notifications').add({
    userId: reviewerId,
    title: 'Rate your experience',
    body: `How was your interaction with ${revieweeName}? ${context}`,
    type: 'system',
    data: {
      type: 'user_review',
      revieweeId,
      ...(opts.revieweeName ? { revieweeName: opts.revieweeName } : {}),
      ...(opts.tourId ? { tourId: opts.tourId } : {}),
      ...(opts.propertyId ? { propertyId: opts.propertyId } : {}),
      ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
    },
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Trigger: tour status → completed. Prompt both parties once (guard flag on
 * the tour doc so a completed→completed rewrite doesn't re-prompt).
 */
export const reviewPromptTourCompleted = onDocumentUpdated('tours/{tourId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (before.status === 'completed' || after.status !== 'completed') return;

  const tourId = event.params.tourId;
  if (after.reviewPromptsSent) return; // idempotent

  const buyerId = after.buyerId as string;
  const sellerId = after.sellerId as string;
  if (!buyerId || !sellerId || buyerId === sellerId) return;

  const buyerName = (after.buyerName as string) ?? 'the buyer';
  const sellerName = (after.sellerName as string) ?? 'the seller';

  try {
    await createReviewPrompt({
      reviewerId: buyerId,
      revieweeId: sellerId,
      revieweeName: sellerName,
      context: 'You viewed this property.',
      tourId,
      propertyId: after.propertyId as string,
    });
    await createReviewPrompt({
      reviewerId: sellerId,
      revieweeId: buyerId,
      revieweeName: buyerName,
      context: 'A viewing was completed.',
      tourId,
      propertyId: after.propertyId as string,
    });
    await event.data!.after.ref.update({ reviewPromptsSent: true });
  } catch (error) {
    console.error(`[reviewPromptTourCompleted] failed for tour ${tourId}:`, error);
  }
});

/**
 * Trigger: message created. Maintains conversations/{id}.messageCount and,
 * when the count first reaches the threshold, prompts each participant to
 * rate the other (guarded by the per-conversation reviewPrompted map).
 */
export const reviewPromptChatDepth = onDocumentCreated(
  'conversations/{conversationId}/messages/{messageId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const message = snap.data();
    const senderId = message.senderId as string;
    const conversationId = event.params.conversationId;
    if (!senderId) return;

    const convRef = db.doc(`conversations/${conversationId}`);
    interface PromptTarget {
      reviewerId: string;
      revieweeId: string;
      revieweeName: string;
    }

    // The transaction returns the prompt targets so the notifications can be
    // written outside it (best-effort) — avoids closure-narrowing issues too.
    const promptTargets = await db.runTransaction(
      async (tx): Promise<PromptTarget[] | null> => {
      const convSnap = await tx.get(convRef);
      if (!convSnap.exists) return null;
      const conv = convSnap.data()!;
      const participants = (conv.participants as string[]) ?? [];
      if (participants.length !== 2) return null;

      const currentCount = (conv.messageCount as number) ?? 0;
      const nextCount = currentCount + 1;
      const prompted = (conv.reviewPrompted as Record<string, boolean>) ?? {};

      const update: Record<string, unknown> = { messageCount: nextCount };
      const targets: Array<{ reviewerId: string; revieweeId: string; revieweeName: string }> = [];

      if (nextCount >= CHAT_PROMPT_THRESHOLD) {
        const [a, b] = participants;
        const pendingA = !prompted[a];
        const pendingB = !prompted[b];
        if (pendingA || pendingB) {
          const names = (conv.participantNames as Record<string, string>) ?? {};
          if (pendingA) {
            targets.push({ reviewerId: a, revieweeId: b, revieweeName: names[b] ?? 'the other party' });
            prompted[a] = true;
          }
          if (pendingB) {
            targets.push({ reviewerId: b, revieweeId: a, revieweeName: names[a] ?? 'the other party' });
            prompted[b] = true;
          }
          update.reviewPrompted = prompted;
        }
      }

      tx.update(convRef, update);
      return targets.length > 0 ? targets : null;
    });

    // Notifications are written outside the transaction (best-effort).
    if (promptTargets) {
      for (const t of promptTargets) {
        try {
          await createReviewPrompt({
            reviewerId: t.reviewerId,
            revieweeId: t.revieweeId,
            revieweeName: t.revieweeName,
            context: 'You chatted about a property.',
            conversationId,
            propertyId: (await convRef.get()).data()?.propertyId,
          });
        } catch (error) {
          console.error(`[reviewPromptChatDepth] notification failed for ${conversationId}:`, error);
        }
      }
    }
  }
);
