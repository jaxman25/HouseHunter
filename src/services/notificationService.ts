import { Platform } from 'react-native';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { AppNotification } from '../types';
import { NOTIFICATIONS_COLLECTION } from '../utils/constants';

// expo-notifications is not supported on web, so it is only loaded on
// iOS/Android. On web these functions become safe no-ops.
type NotificationsModule = typeof import('expo-notifications');

let notificationsPromise: Promise<NotificationsModule | null> | null = null;

function loadNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') {
    return Promise.resolve(null);
  }
  if (!notificationsPromise) {
    notificationsPromise = import('expo-notifications').then((mod) => {
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      return mod;
    });
  }
  return notificationsPromise;
}

export async function registerForPushNotifications(
  userId: string
): Promise<string | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}

export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data || {},
      sound: true,
    },
    trigger: null,
  });
}

export async function createNotification(
  userId: string,
  title: string,
  body: string,
  type: AppNotification['type'],
  data: Record<string, string> = {}
): Promise<void> {
  await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
    userId,
    title,
    body,
    type,
    data,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void
): () => void {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (querySnapshot) => {
    const notifications: AppNotification[] = [];
    querySnapshot.forEach((doc) => {
      notifications.push({ id: doc.id, ...doc.data() } as AppNotification);
    });
    callback(notifications);
  });
}

export async function markNotificationAsRead(
  notificationId: string
): Promise<void> {
  await updateDoc(
    doc(db, NOTIFICATIONS_COLLECTION, notificationId),
    { read: true }
  );
}

export async function markAllNotificationsAsRead(
  notifications: AppNotification[]
): Promise<void> {
  for (const n of notifications) {
    if (!n.read) {
      await markNotificationAsRead(n.id);
    }
  }
}

export async function addNotificationListener(
  callback: (notification: any) => void
): Promise<() => void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return () => {};

  const subscription = Notifications.addNotificationReceivedListener(callback);
  return () => subscription.remove();
}

export async function addNotificationResponseListener(
  callback: (response: any) => void
): Promise<() => void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return () => {};

  const subscription =
    Notifications.addNotificationResponseReceivedListener(callback);
  return () => subscription.remove();
}