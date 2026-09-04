import {
  collection,
  addDoc,
  updateDoc,
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
  limit,
} from 'firebase/firestore';
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
  // Check for existing conversation
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

  // Create new conversation
  const docRef = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        addDoc(collection(db, CHAT_COLLECTION), {
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
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  return docRef.id;
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  text: string,
  image?: string
): Promise<string> {
  const messageData: Omit<Message, 'id'> = {
    conversationId,
    senderId,
    text,
    read: false,
    createdAt: new Date().toISOString(),
  };
  if (image) {
    messageData.image = image;
  }

  const docRef = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        addDoc(
          collection(db, CHAT_COLLECTION, conversationId, MESSAGES_COLLECTION),
          messageData
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  // Update conversation's last message
  await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        updateDoc(doc(db, CHAT_COLLECTION, conversationId), {
          lastMessage: text || 'Photo',
          lastMessageTime: new Date().toISOString(),
          lastMessageSenderId: senderId,
          updatedAt: serverTimestamp(),
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  // Increment unread count for recipient
  const convDoc = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDoc(doc(db, CHAT_COLLECTION, conversationId)), DEFAULT_TIMEOUT_MS))
  );
  if (convDoc.exists()) {
    const participants = convDoc.data().participants;
    const recipientId = participants.find((id: string) => id !== senderId);
    if (recipientId) {
      await firestoreCircuitBreaker.execute(() =>
        withRetry(() =>
          withTimeout(
            updateDoc(doc(db, CHAT_COLLECTION, conversationId), {
              [`unreadCount.${recipientId}`]: increment(1),
            }),
            DEFAULT_TIMEOUT_MS
          )
        )
      );
    }
  }

  return docRef.id;
}

export async function uploadChatImage(
  uri: string,
  conversationId: string
): Promise<string> {
  const url = await storageCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        (async () => {
          const response = await fetch(uri);
          const blob = await response.blob();
          const filename = `chat/${conversationId}/image_${Date.now()}`;
          const storageRef = ref(storage, filename);
          await uploadBytes(storageRef, blob);
          return getDownloadURL(storageRef);
        })(),
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
      messages.push({ id: doc.id, ...doc.data() } as Message);
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
  await updateDoc(doc(db, CHAT_COLLECTION, conversationId), {
    [`unreadCount.${userId}`]: 0,
  });

  // Mark individual messages as read
  const q = query(
    collection(db, CHAT_COLLECTION, conversationId, MESSAGES_COLLECTION),
    where('read', '==', false)
  );
  const querySnapshot = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDocs(q), DEFAULT_TIMEOUT_MS))
  );
  for (const docSnap of querySnapshot.docs) {
    if (docSnap.data().senderId !== userId) {
      await firestoreCircuitBreaker.execute(() =>
        withRetry(() => withTimeout(updateDoc(docSnap.ref, { read: true }), DEFAULT_TIMEOUT_MS))
      );
    }
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
