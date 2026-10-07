/**
 * House Hunter — chat activity meta + batched read receipts.
 *
 * `users/{uid}/meta/chat` = { lastMessageAt, unreadCount } is the ONLY
 * real-time change signal for the conversations list (the previous design
 * kept an onSnapshot over the whole first page of conversations — N reads
 * per change — see chatService.subscribeToChatMeta).
 *
 *   platformChatOnMessage — on create of a message: bumps the recipient's
 *     meta (lastMessageAt + unreadCount +1) and the sender's meta
 *     (lastMessageAt, so their own list reorders when they return from the
 *     thread). Conversation metadata (lastMessage / unread badge) stays in
 *     the client's send batch, unchanged.
 *
 *   platformChatOnRead — on write of `conversations/{id}/reads/{uid}` (the
 *     client's batched receipt, ≤1 write / 5s): resets that reader's
 *     per-conversation unread badge and recomputes their meta.unreadCount
 *     as the exact sum over their conversations — so the receipt stays a
 *     single client write and the meta count self-heals any drift.
 *
 * Rules (firestore.rules): `users/{uid}/meta/chat` is owner-read /
 * Cloud-Function-write only; `conversations/{id}/reads/{uid}` is
 * create/update by its own participant only.
 *
 * Deploy with: firebase deploy --only functions
 */
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

/** Bump `users/{uid}/meta/chat` for one participant of a new message. */
async function bumpMeta(
  uid: string,
  changes: Record<string, unknown>
): Promise<void> {
  await db.doc(`users/${uid}/meta/chat`).set(changes, { merge: true });
}

/** A message landed: refresh both participants' change signals. */
export const platformChatOnMessage = onDocumentCreated(
  'conversations/{conversationId}/messages/{messageId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    try {
      const message = snap.data();
      const senderId = message?.senderId as string | undefined;
      const convSnap = await db
        .doc(`conversations/${event.params.conversationId}`)
        .get();
      if (!convSnap.exists) return;
      const participants = (convSnap.data()?.participants as string[] | undefined) ?? [];

      // Sender's meta: their list stays mounted behind ChatScreen, so this
      // is what reorders/refetches it when they return (and it is what the
      // receiving-side accounting counts as the sender's own write).
      if (senderId) {
        await bumpMeta(senderId, {
          lastMessageAt: FieldValue.serverTimestamp(),
        });
      }

      const recipientId = participants.find((id) => id !== senderId);
      if (!recipientId) return;

      // Recipient's meta: this is the 1-read-per-change signal their open
      // conversations list listens to (and drives their total unread badge).
      await bumpMeta(recipientId, {
        lastMessageAt: FieldValue.serverTimestamp(),
        unreadCount: FieldValue.increment(1),
      });
    } catch (error) {
      // No retry (default): a missed bump only delays a list refresh until
      // the next message or read; retries would risk double increments.
      console.error('[platformChatOnMessage] meta update failed:', error);
    }
  }
);

/**
 * A receipt landed: clear this reader's conversation badge (client write
 * budget stays at exactly one doc — the receipt) and recompute their total
 * unread from the conversation docs so `meta/chat.unreadCount` stays exact.
 */
export const platformChatOnRead = onDocumentWritten(
  'conversations/{conversationId}/reads/{readerId}',
  async (event) => {
    const change = event.data;
    if (!change || !change.after.exists) return; // deleted → nothing to do
    const { conversationId, readerId } = event.params;

    try {
      // 1) Reset this reader's badge for THIS conversation (sequential await
      //    on purpose: the recompute below must observe the reset).
      await db
        .doc(`conversations/${conversationId}`)
        .set({ [`unreadCount.${readerId}`]: 0 }, { merge: true });

      // 2) Exact total across the reader's conversations (bounded by how
      //    many threads the user has; runs at most once / 5s per open
      //    thread because the client throttles receipt writes).
      const convs = await db
        .collection('conversations')
        .where('participants', 'array-contains', readerId)
        .get();
      let total = 0;
      for (const doc of convs.docs) {
        const unread =
          (doc.data()?.unreadCount as Record<string, number> | undefined)?.[readerId] ?? 0;
        total += Number(unread) || 0;
      }

      await db
        .doc(`users/${readerId}/meta/chat`)
        .set({ unreadCount: total }, { merge: true });
    } catch (error) {
      console.error('[platformChatOnRead] read-receipt handling failed:', error);
    }
  }
);
