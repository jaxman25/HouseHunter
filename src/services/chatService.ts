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
  Timestamp,
  DocumentReference,
  DocumentData,
} from 'firebase/firestore';
import * as Crypto from 'expo-crypto';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { Conversation, Message } from '../types';
import { CHAT_COLLECTION, MESSAGES_COLLECTION } from '../utils/constants';
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

  // Idempotent create: `setDoc` with a deterministic ID + merge means two
  // concurrent callers converge on one document instead of creating two
  // (Firestore resolves the race; the second setDoc becomes an update, which
  // rules allow for participants). Never overwrites existing data.
  await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        setDoc(convRef, {
          participants: [userId1, userId2],
          participantNames: {
            [userId1]: user1Name,
            [userId2]: user2Name,
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
        }, { merge: true }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  return deterministicId;
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  text: string,
  image?: string,
  recipientId?: string
): Promise<string> {
  // Resolve the recipient (needed for the unread-count bump). Callers that
  // already know the other participant (ChatScreen, PropertyDetailScreen)
  // pass it to skip an extra read.
  let recipient = recipientId;
  if (!recipient) {
    const convDoc = await firestoreCircuitBreaker.execute(() =>
      withRetry(() => withTimeout(getDoc(doc(db, CHAT_COLLECTION, conversationId)), DEFAULT_TIMEOUT_MS))
    );
    if (!convDoc.exists()) throw new Error('Conversation not found');
    const participants = convDoc.data().participants as string[];
    recipient = participants.find((id: string) => id !== senderId);
    if (!recipient) throw new Error('Conversation has no recipient');
  }

  // createdAt uses serverTimestamp() so message ordering comes from Firestore's
  // clock, not the sender's device (avoids clock-skew misordering). Subscribers
  // normalize the Timestamp back to an ISO string (see subscribeToMessages).
  const messageData: Record<string, unknown> = {
    conversationId,
    senderId,
    text,
    read: false,
    createdAt: serverTimestamp(),
  };
  if (image) {
    messageData.image = image;
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
      lastMessage: text || 'Photo',
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
