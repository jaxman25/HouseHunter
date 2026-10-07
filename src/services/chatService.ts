import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  increment,
  Timestamp,
  DocumentSnapshot,
  DocumentReference,
  DocumentData,
} from 'firebase/firestore';
import {
  trackedGetDoc,
  trackedGetDocs,
  trackedSetDoc,
  trackedOnSnapshot,
  trackedOnSnapshotDoc,
  trackedWriteBatch,
} from '../utils/firestore/tracked';
import * as Crypto from 'expo-crypto';
import { auth, db } from '../config/firebase';
import { CLOUDINARY_CLOUD_NAME, uploadImage } from './storageService';
import { Conversation, Message } from '../types';
import {
  CHAT_COLLECTION,
  MESSAGES_COLLECTION,
  PAGE_SIZE_DEFAULT,
  USERS_COLLECTION,
} from '../utils/constants';
import { firestoreCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../utils/network/timeout';
import { trackMetric } from '../utils/monitoring/metrics';
import { sanitizeRichText, sanitize } from '../utils/security/sanitize';
import { pageHasMore } from './messagePagination';

/**
 * Deterministic conversation ID for a (buyer, seller, property) triple.
 *
 * IDs are derived from the sorted participant IDs + property ID, so two users
 * starting a conversation about the same property at the same time converge on
 * the SAME document instead of racing to create duplicate conversations
 * (idempotent create — see getOrCreateConversation).
 */
async function conversationIdFor(
  userId1: string,
  userId2: string,
  propertyId: string
): Promise<string> {
  const [a, b] = [userId1, userId2].sort();
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${a}|${b}|${propertyId}`
  );
  return `conv_${digest}`;
}

export async function getOrCreateConversation(
  userId1: string,
  userId2: string,
  propertyId: string,
  propertyTitle: string,
  propertyImage: string,
  user1Name: string,
  user1Photo: string,
  user2Name: string,
  user2Photo: string
): Promise<string> {
  const deterministicId = await conversationIdFor(userId1, userId2, propertyId);
  const convRef = doc(db, CHAT_COLLECTION, deterministicId);

  // Fast path: the deterministic ID already exists → return it.
  const existing = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(trackedGetDoc(convRef), DEFAULT_TIMEOUT_MS))
  );
  if (existing.exists()) {
    return existing.id;
  }

  // Fallback: conversations created before deterministic IDs (auto IDs) —
  // look them up the old way so we never fork a thread.
  const q = query(
    collection(db, CHAT_COLLECTION),
    where('participants', 'array-contains', userId1),
    where('propertyId', '==', propertyId),
    // Bounded: deterministic-ID fast path covers real conversations; this
    // legacy fallback only needs the most recent handful.
    limit(20)
  );
  const querySnapshot = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(trackedGetDocs(q, CHAT_COLLECTION), DEFAULT_TIMEOUT_MS))
  );
  for (const docSnap of querySnapshot.docs) {
    const data = docSnap.data();
    if (data.participants.includes(userId2)) {
      return docSnap.id;
    }
  }

  // SECURITY (MEDIUM 7): Use setDoc WITHOUT merge for the initial create,
  // then fall back to explicit field-path updates if the doc already exists.
  // This avoids the nested-map merge bug where Firestore replaces entire
  // nested objects instead of merging individual keys.
  const convData = {
    participants: [userId1, userId2],
    participantNames: {
      [userId1]: sanitize(user1Name, 100),
      [userId2]: sanitize(user2Name, 100),
    },
    participantPhotos: {
      [userId1]: user1Photo,
      [userId2]: user2Photo,
    },
    lastMessage: '',
    lastMessageTime: new Date().toISOString(),
    lastMessageSenderId: '',
    unreadCount: {
      [userId1]: 0,
      [userId2]: 0,
    },
    propertyId,
    propertyTitle,
    propertyImage,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    // Try to create the document (will fail if it already exists)
    await firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          trackedSetDoc(convRef, convData),
          DEFAULT_TIMEOUT_MS
        )
      )
    );
  } catch (error: any) {
    // If the document already exists (race condition), update with explicit
    // field paths instead of using merge — this prevents nested map overwrite.
    if (error?.code === 'already-exists' || error?.message?.includes('already exists')) {
      await firestoreCircuitBreaker.execute(() =>
        withRetry(() =>
          withTimeout(
            trackedSetDoc(convRef, convData, { merge: true }),
            DEFAULT_TIMEOUT_MS
          )
        )
      );
    } else {
      throw error;
    }
  }

  return deterministicId;
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  text: string,
  image?: string,
  recipientId?: string
): Promise<string> {
  // SECURITY (IDOR): Verify the caller is the sender.
  const user = auth.currentUser;
  if (!user || user.uid !== senderId) {
    throw new Error('Unauthorized: you can only send messages as yourself');
  }

  // SECURITY (IDOR): Verify the caller is a participant in this conversation.
  const convDoc = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(trackedGetDoc(doc(db, CHAT_COLLECTION, conversationId)), DEFAULT_TIMEOUT_MS))
  );
  if (!convDoc.exists()) throw new Error('Conversation not found');
  const participants = convDoc.data().participants as string[];
  if (!participants.includes(senderId)) {
    throw new Error('Unauthorized: you are not a participant in this conversation');
  }

  // Resolve the recipient (needed for the unread-count bump). Callers that
  // already know the other participant (ChatScreen, PropertyDetailScreen)
  // pass it to skip an extra read.
  let recipient = recipientId;
  if (!recipient) {
    recipient = participants.find((id: string) => id !== senderId);
    if (!recipient) throw new Error('Conversation has no recipient');
  }

  // SECURITY: Sanitize message text — strip dangerous HTML, enforce length.
  const sanitizedText = sanitizeRichText(text, 2000);
  if (!sanitizedText) {
    throw new Error('Message cannot be empty');
  }

  // SECURITY: Validate image URL if provided.
  // Accepts https-only URLs from our two storage origins:
  //  - Cloudinary (current): https://res.cloudinary.com/<cloud>/...
  //  - Firebase Storage (legacy images sent before the migration)
  let sanitizedImage: string | undefined;
  if (image) {
    const cloudinaryPrefix = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/`;
    const legacyFirebasePrefix = 'https://firebasestorage.googleapis.com/';
    if (!image.startsWith(cloudinaryPrefix) && !image.startsWith(legacyFirebasePrefix)) {
      throw new Error('Invalid image URL');
    }
    sanitizedImage = image;
  }

  // createdAt uses serverTimestamp() so message ordering comes from Firestore's
  // clock, not the sender's device (avoids clock-skew misordering). Subscribers
  // normalize the Timestamp back to an ISO string (see subscribeToMessages).
  const messageData: Record<string, unknown> = {
    conversationId,
    senderId,
    text: sanitizedText,
    read: false,
    createdAt: serverTimestamp(),
  };
  if (sanitizedImage) {
    messageData.image = sanitizedImage;
  }

  // One atomic batch: message + conversation metadata + unread-count bump
  // commit together. Previously this was four sequential round-trips
  // (addDoc → updateDoc → getDoc → updateDoc), which could leave the
  // conversation's lastMessage/unreadCount inconsistent with the message
  // (partial failure) or double-count unread on retries.
  // NB: the batch is built per attempt — a Firestore WriteBatch can only be
  // committed once, so a retried commit needs a fresh batch (and a fresh
  // message ref, since a used ref's batch is gone).
  let messageRef: DocumentReference<DocumentData>;
  const commitMessage = () => {
    messageRef = doc(
      collection(db, CHAT_COLLECTION, conversationId, MESSAGES_COLLECTION)
    );
    const batch = trackedWriteBatch();
    batch.set(messageRef, messageData);
    batch.update(doc(db, CHAT_COLLECTION, conversationId), {
      lastMessage: sanitizedText || 'Photo',
      lastMessageTime: new Date().toISOString(),
      lastMessageSenderId: senderId,
      updatedAt: serverTimestamp(),
      [`unreadCount.${recipient}`]: increment(1),
    });
    return batch.commit();
  };

  await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(trackMetric('chat.sendMessage', commitMessage), DEFAULT_TIMEOUT_MS)
    )
  );

  return messageRef!.id;
}

export async function uploadChatImage(
  uri: string,
  conversationId: string
): Promise<string> {
  // Delegates to the shared Cloudinary uploader (replaces direct
  // firebase/storage usage). The conversationId no longer forms the storage
  // path — Cloudinary's unsigned preset controls the folder — but it stays
  // in the signature for API compatibility and for the legacy-style path arg.
  const filename = `chat/${conversationId}/image_${Date.now()}`;
  return trackMetric('chat.uploadImage', () => uploadImage(uri, filename));
}

/** Newest-message window kept live in the open thread (paged older below). */
export const MESSAGE_WINDOW = 30;

/** Read-receipt subcollection: `conversations/{id}/reads/{uid}`. */
export const READ_RECEIPTS_SUBCOLLECTION = 'reads';

/** Minimum interval between a client's receipt writes (≤1 write / 5s). */
const READ_RECEIPT_THROTTLE_MS = 5000;

/** Normalize a message doc (serverTimestamp createdAt → ISO string). */
function toMessage(snap: DocumentSnapshot<DocumentData>): Message {
  const data = snap.data() ?? {};
  const createdAt =
    data.createdAt instanceof Timestamp
      ? data.createdAt.toDate().toISOString()
      : (data.createdAt as string);
  return { id: snap.id, ...data, createdAt } as Message;
}

export function subscribeToMessages(
  conversationId: string,
  callback: (
    messages: Message[],
    oldestSnapshot: DocumentSnapshot<DocumentData> | null
  ) => void
): () => void {
  // Live window: ONLY the newest 30 messages (was 200 — every open used to
  // (re)download 200 docs). Older history is paged in via getMessagesPage
  // on scroll-up; the callback also yields the window's OLDEST snapshot as
  // the cursor for that first older page.
  const q = query(
    collection(db, CHAT_COLLECTION, conversationId, MESSAGES_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(MESSAGE_WINDOW)
  );

  return trackedOnSnapshot(q, MESSAGES_COLLECTION, (querySnapshot) => {
    const docs = querySnapshot.docs;
    const messages = docs.map(toMessage);
    messages.reverse(); // ascending for display
    callback(messages, docs.length > 0 ? docs[docs.length - 1] : null);
  });
}

/**
 * One OLDER page of a thread — newest-first query reversed to ascending,
 * `cursor` = the oldest snapshot already loaded (initial window or previous
 * page). `hasMore` comes straight from the page fill: a short page ends
 * pagination (see pageHasMore).
 */
export async function getMessagesPage(
  conversationId: string,
  cursor: DocumentSnapshot<DocumentData> | null,
  pageSize: number = MESSAGE_WINDOW
): Promise<{
  items: Message[];
  cursor: DocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}> {
  const q = query(
    collection(db, CHAT_COLLECTION, conversationId, MESSAGES_COLLECTION),
    orderBy('createdAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize)
  );
  const snap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(trackedGetDocs(q, MESSAGES_COLLECTION), DEFAULT_TIMEOUT_MS))
  );
  const items = snap.docs.map(toMessage);
  items.reverse();
  return {
    items,
    cursor: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    hasMore: pageHasMore(snap.docs.length, pageSize),
  };
}

/** Shape of `users/{uid}/meta/chat` (written only by platformChat triggers). */
export interface ChatMeta {
  /** Epoch millis of the user's most recent message activity (0 = none). */
  lastMessageAt: number;
  /** Total unread messages across the user's conversations. */
  unreadCount: number;
}

/**
 * The conversations list's ONLY real-time subscription: one doc listener
 * on `users/{uid}/meta/chat` — 1 read per change, instead of the old
 * first-page query listener whose N conversation docs were re-billed on
 * every message. Callers refetch the first page with `getConversationsPage`
 * when the meta signature changes (ConversationsScreen skips the first
 * snapshot: the paged hook has just loaded page 1 on mount).
 */
export function subscribeToChatMeta(
  userId: string,
  callback: (meta: ChatMeta) => void
): () => void {
  const ref = doc(db, USERS_COLLECTION, userId, 'meta', 'chat');
  return trackedOnSnapshotDoc(ref, USERS_COLLECTION, (snap) => {
    const data = snap.exists() ? snap.data() : undefined;
    const at = data?.lastMessageAt;
    const atMs =
      at instanceof Timestamp
        ? at.toDate().getTime()
        : typeof at === 'string'
          ? Date.parse(at) || 0
          : 0;
    callback({
      lastMessageAt: atMs,
      unreadCount: typeof data?.unreadCount === 'number' ? data.unreadCount : 0,
    });
  });
}

/**
 * Batched read receipt — writes ONLY `conversations/{id}/reads/{uid}` =
 * { lastReadAt } (server time), at most one write per 5s per conversation.
 * The `platformChatOnRead` trigger resets this conversation's unread badge
 * for the reader and recomputes their `meta/chat.unreadCount`, so this stays
 * a single doc write.
 *
 * Replaces the old per-message flow (one `read == false` query — up to 400
 * reads — plus a batch of `read: true` message updates on every open).
 * Never throws; returns whether a receipt was written (false = throttled).
 */
const lastReceiptAtByConversation = new Map<string, number>();

export async function recordReadReceipt(
  conversationId: string,
  userId: string
): Promise<boolean> {
  // SECURITY (IDOR): receipts are always the caller's own; rules additionally
  // pin reads/{uid} to auth.uid == readerId and participant membership.
  const user = auth.currentUser;
  if (!user || user.uid !== userId) return false;

  const now = Date.now();
  const last = lastReceiptAtByConversation.get(conversationId) ?? 0;
  if (now - last < READ_RECEIPT_THROTTLE_MS) return false;
  lastReceiptAtByConversation.set(conversationId, now);

  try {
    const receiptRef = doc(
      db,
      CHAT_COLLECTION,
      conversationId,
      READ_RECEIPTS_SUBCOLLECTION,
      userId
    );
    await firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          trackedSetDoc(receiptRef, { lastReadAt: serverTimestamp() }),
          DEFAULT_TIMEOUT_MS
        )
      )
    );
    return true;
  } catch (error) {
    // Failed write — allow the next call to retry immediately.
    lastReceiptAtByConversation.delete(conversationId);
    console.warn('Failed to record read receipt:', error);
    return false;
  }
}

/**
 * Watch the OTHER participant's receipt (one doc — 1 read per change) so the
 * thread renders live read checkmarks without any per-message writes: an
 * own message flips to read once its createdAt <= their `lastReadAt`.
 */
export function subscribeToReadReceipt(
  conversationId: string,
  readerId: string,
  callback: (lastReadAtMs: number) => void
): () => void {
  const ref = doc(
    db,
    CHAT_COLLECTION,
    conversationId,
    READ_RECEIPTS_SUBCOLLECTION,
    readerId
  );
  return trackedOnSnapshotDoc(ref, CHAT_COLLECTION, (snap) => {
    const at = snap.exists() ? snap.data()?.lastReadAt : undefined;
    callback(at instanceof Timestamp ? at.toDate().getTime() : 0);
  });
}

export async function getConversation(
  conversationId: string
): Promise<Conversation | null> {
  const docRef = doc(db, CHAT_COLLECTION, conversationId);
  const docSnap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(trackedGetDoc(docRef), DEFAULT_TIMEOUT_MS))
  );
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as Conversation;
  }
  return null;
}

export async function getConversationsForUser(
  userId: string
): Promise<Conversation[]> {
  const q = query(
    collection(db, CHAT_COLLECTION),
    where('participants', 'array-contains', userId),
    orderBy('updatedAt', 'desc'),
    // Bounded: list screens use getConversationsPage for older pages.
    limit(PAGE_SIZE_DEFAULT)
  );
  const querySnapshot = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(trackedGetDocs(q, CHAT_COLLECTION), DEFAULT_TIMEOUT_MS))
  );
  const conversations: Conversation[] = [];
  querySnapshot.forEach((doc) => {
    conversations.push({ id: doc.id, ...doc.data() } as Conversation);
  });
  return conversations;
}

/**
 * Cursor page over a user's conversations, most recently active first —
 * used by ConversationsScreen to fetch older pages on scroll (real-time
 * covers only the first page).
 */
export async function getConversationsPage(
  userId: string,
  cursor: DocumentSnapshot<DocumentData> | null,
  pageSize: number = PAGE_SIZE_DEFAULT
): Promise<{
  items: Conversation[];
  cursor: DocumentSnapshot<DocumentData> | null;
}> {
  const q = query(
    collection(db, CHAT_COLLECTION),
    where('participants', 'array-contains', userId),
    orderBy('updatedAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize)
  );
  const snap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(trackedGetDocs(q, CHAT_COLLECTION), DEFAULT_TIMEOUT_MS))
  );
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Conversation),
    cursor: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
  };
}
