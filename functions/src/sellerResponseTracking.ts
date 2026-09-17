/**
 * Seller response-time tracking.
 *
 * Triggered when a new message is created in a conversation. If the sender is
 * the property owner (seller) and this is their first reply in the conversation,
 * we record the time-to-first-reply and update a rolling average on the
 * seller's property documents (avgResponseMinutes, conversationCount).
 *
 * Deploy with:  firebase deploy --only functions
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

export const trackSellerResponseTime = onDocumentCreated(
  'conversations/{conversationId}/messages/{messageId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const messageData = snap.data();
    const senderId = messageData.senderId as string;
    if (!senderId) return;

    const conversationId = event.params.conversationId;
    const convRef = db.doc(`conversations/${conversationId}`);
    const convSnap = await convRef.get();
    if (!convSnap.exists) return;

    const convData = convSnap.data()!;
    const participants = convData.participants as string[];
    const propertyId = convData.propertyId as string;

    // The seller is the property owner. Determine who that is by checking
    // which participant owns the property.
    if (!propertyId) return;

    const propertySnap = await db.doc(`properties/${propertyId}`).get();
    if (!propertySnap.exists) return;

    const ownerId = propertySnap.data()?.userId as string;
    if (!ownerId || senderId !== ownerId) return; // Not the seller replying

    // Already tracked — skip.
    if (convData.firstSellerReplyAt) return;

    // Calculate time-to-first-reply from conversation creation.
    const createdAt = convData.createdAt;
    if (!createdAt) return;

    const createdMs =
      createdAt instanceof FieldValue
        ? Date.now() // Shouldn't happen (serverTimestamp resolves), but fallback
        : createdAt.toMillis?.() ??
          (createdAt.seconds ?? 0) * 1000 + ((createdAt.nanoseconds ?? 0) / 1_000_000);

    const replyMs = Date.now() - createdMs;
    const replyMinutes = Math.max(0, Math.round(replyMs / 60_000));

    // 1. Mark the conversation so we don't re-track.
    await convRef.update({ firstSellerReplyAt: FieldValue.serverTimestamp() });

    // 2. Update every property owned by this seller with a rolling average.
    const propsSnap = await db
      .collection('properties')
      .where('userId', '==', ownerId)
      .get();

    for (const propDoc of propsSnap.docs) {
      const propData = propDoc.data();
      const currentAvg = (propData.avgResponseMinutes as number) ?? 0;
      const currentCount = (propData.conversationCount as number) ?? 0;

      // Rolling average: newAvg = (oldAvg * oldCount + newReply) / (oldCount + 1)
      const newCount = currentCount + 1;
      const newAvg = Math.round(
        (currentAvg * currentCount + replyMinutes) / newCount
      );

      await propDoc.ref.update({
        avgResponseMinutes: newAvg,
        conversationCount: newCount,
      });
    }
  }
);
