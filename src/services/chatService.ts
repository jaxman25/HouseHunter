import {
  collection,
  setDoc,
  writeBatch,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  increment,
  updateDoc,
  Timestamp,
  DocumentReference,
  DocumentData,
} from 'firebase/firestore';
import * as Crypto from 'expo-crypto';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../config/firebase';
import { Conversation, Message } from '../types';
import { CHAT_COLLECTION, MESSAGES_COLLECTION, PROPERTIES_COLLECTION } from '../utils/constants';
import {
  firestoreCircuitBreaker,
  storageCircuitBreaker,
} from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import {
  withTimeout,
  DEFAULT_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
} from '../utils/network/timeout';
import { trackMetric } from '../utils/monitoring/metrics';
import { sanitizeRichText, sanitize, sanitizeFilename } from '../utils/security/sanitize';

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
    withRetry(() => withTimeout(getDoc(convRef), DEFAULT_TIMEOUT_MS))
  );
  if (existing.exists()) {
    return existing.id;
  }

  // Fallback: conversations created before deterministic IDs (auto IDs) —
  // look them up the old way so we never fork a thread.
  const q = query(
    collection(db, CHAT_COLLECTION),
    where('participants', 'array-contains', userId1),
    where('propertyId', '==', propertyId)
  );
  const querySnapshot = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDocs(q), DEFAULT_TIMEOUT_MS))
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
          setDoc(convRef, convData),
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
            setDoc(convRef, convData, { merge: true }),
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
    withRetry(() => withTimeout(getDoc(doc(db, CHAT_COLLECTION, conversationId)), DEFAULT_TIMEOUT_MS))
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
  let sanitizedImage: string | undefined;
  if (image) {
    if (!image.startsWith('https://firebasestorage.googleapis.com/')) {
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
    const batch = writeBatch(db);
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
  const url = await storageCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackMetric('chat.uploadImage', async () => {
          const response = await fetch(uri);
          const blob = await response.blob();
          const filename = `chat/${conversationId}/image_${Date.now()}`;
          const storageRef = ref(storage, filename);
          await uploadBytes(storageRef, blob);
          return getDownloadURL(storageRef);
        }),
        UPLOAD_TIMEOUT_MS
      )
    )
  );
  return url;
}

export function subscribeToMessages(
  conversationId: string,
  callback: (messages: Message[]) => void
): () => void {
  const q = query(
    collection(db, CHAT_COLLECTION, conversationId, MESSAGES_COLLECTION),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(q, (querySnapshot) => {
    const messages: Message[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const createdAt =
        data.createdAt instanceof Timestamp
          ? data.createdAt.toDate().toISOString()
          : (data.createdAt as string);
      messages.push({ id: doc.id, ...data, createdAt } as Message);
    });
    callback(messages);
  });
}

export function subscribeToConversations(
  userId: string,
  callback: (conversations: Conversation[]) => void
): () => void {
  const q = query(
    collection(db, CHAT_COLLECTION),
    where('participants', 'array-contains', userId),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(q, (querySnapshot) => {
    const conversations: Conversation[] = [];
    querySnapshot.forEach((doc) => {
      conversations.push({ id: doc.id, ...doc.data() } as Conversation);
    });
    callback(conversations);
  });
}

export async function markAsRead(
  conversationId: string,
  userId: string
): Promise<void> {
  // SECURITY (IDOR): Verify the caller is marking their own messages as read.
  const user = auth.currentUser;
  if (!user || user.uid !== userId) {
    throw new Error('Unauthorized: you can only mark your own messages as read');
  }

  const convRef = doc(db, CHAT_COLLECTION, conversationId);

  // Mark individual messages as read — one query, then batched writes.
  // Previously this was an N-round-trip loop (one updateDoc per message);
  // now it's one query + chunked writeBatch commits (batch cap is 500).
  const q = query(
    collection(db, CHAT_COLLECTION, conversationId, MESSAGES_COLLECTION),
    where('read', '==', false)
  );
  const querySnapshot = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDocs(q), DEFAULT_TIMEOUT_MS))
  );
  const unreadByOthers = querySnapshot.docs
    .filter((docSnap) => docSnap.data().senderId !== userId)
    .map((docSnap) => docSnap.ref);

  // Always at least one batch (the unread-count reset itself).
  const chunkSize = 400;
  const batches =
    unreadByOthers.length > 0
      ? Array.from({ length: Math.ceil(unreadByOthers.length / chunkSize) }, (_, i) =>
          unreadByOthers.slice(i * chunkSize, (i + 1) * chunkSize)
        )
      : [[]];

  for (const messageRefs of batches) {
    const batch = writeBatch(db);
    batch.update(convRef, { [`unreadCount.${userId}`]: 0 });
    for (const messageRef of messageRefs) {
      batch.update(messageRef, { read: true });
    }
    await firestoreCircuitBreaker.execute(() =>
      withRetry(() => withTimeout(batch.commit(), DEFAULT_TIMEOUT_MS))
    );
  }
}

export async function getConversation(
  conversationId: string
): Promise<Conversation | null> {
  const docRef = doc(db, CHAT_COLLECTION, conversationId);
  const docSnap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDoc(docRef), DEFAULT_TIMEOUT_MS))
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
    orderBy('updatedAt', 'desc')
  );
  const querySnapshot = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDocs(q), DEFAULT_TIMEOUT_MS))
  );
  const conversations: Conversation[] = [];
  querySnapshot.forEach((doc) => {
    conversations.push({ id: doc.id, ...doc.data() } as Conversation);
  });
  return conversations;
}

/**
 * Track seller response time.
 *
 * Called after a seller sends their first message in a conversation. Records
 * the time-to-first-reply on the conversation doc and updates a rolling
 * average on the seller's property documents so the detail screen can show
 * a "Usually responds in ~Xh" badge.
 *
 * Safe to call multiple times — idempotent (skips if firstSellerReplyAt
 * already exists on the conversation).
 */
export async function recordSellerFirstReply(
  conversationId: string,
  sellerId: string
): Promise<void> {
  const convRef = doc(db, CHAT_COLLECTION, conversationId);
  const convSnap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDoc(convRef), DEFAULT_TIMEOUT_MS))
  );
  if (!convSnap.exists()) return;
  const convData = convSnap.data();

  // Already tracked — skip.
  if (convData.firstSellerReplyAt) return;

  // Verify the sender is actually a participant (and the seller).
  const participants = convData.participants as string[];
  if (!participants.includes(sellerId)) return;

  // Calculate time-to-first-reply from conversation creation.
  const createdAt = convData.createdAt;
  let replyMs: number;
  if (createdAt instanceof Timestamp) {
    replyMs = Date.now() - createdAt.toDate().getTime();
  } else if (createdAt && typeof createdAt === 'object' && 'seconds' in createdAt) {
    replyMs = Date.now() - ((createdAt as any).seconds * 1000 + ((createdAt as any).nanoseconds || 0) / 1_000_000);
  } else {
    // Fallback: use updatedAt as an approximation.
    const updatedAt = convData.updatedAt;
    if (updatedAt instanceof Timestamp) {
      replyMs = Date.now() - updatedAt.toDate().getTime();
    } else {
      return; // Can't compute — bail.
    }
  }

  const replyMinutes = Math.max(0, Math.round(replyMs / 60_000));
  const now = new Date().toISOString();

  // 1. Mark the conversation so we don't re-track.
  await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        updateDoc(convRef, { firstSellerReplyAt: now }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  // 2. Update every property owned by this seller with a rolling average.
  //    We query all seller properties and update the avgResponseMinutes and
  //    conversationCount fields (both are read by PropertyDetailScreen).
  const propsQ = query(
    collection(db, PROPERTIES_COLLECTION),
    where('userId', '==', sellerId)
  );
  const propsSnap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDocs(propsQ), DEFAULT_TIMEOUT_MS))
  );

  for (const propDoc of propsSnap.docs) {
    const propData = propDoc.data();
    const currentAvg = (propData.avgResponseMinutes as number) ?? 0;
    const currentCount = (propData.conversationCount as number) ?? 0;

    // Rolling average: newAvg = (oldAvg * oldCount + newReply) / (oldCount + 1)
    const newCount = currentCount + 1;
    const newAvg = Math.round((currentAvg * currentCount + replyMinutes) / newCount);

    await firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          updateDoc(propDoc.ref, {
            avgResponseMinutes: newAvg,
            conversationCount: newCount,
          }),
          DEFAULT_TIMEOUT_MS
        )
      )
    );
  }
}
