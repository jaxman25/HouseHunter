import { Platform, AppState, AppStateStatus } from 'react-native';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  doc,
  serverTimestamp,
  deleteField,
  Timestamp,
} from 'firebase/firestore';
import {
  trackedAddDoc,
  trackedUpdateDoc,
  trackedDeleteDoc,
  trackedOnSnapshot,
  trackedWriteBatch,
} from '../utils/firestore/tracked';
import { db } from '../config/firebase';
import { AppNotification } from '../types';
import { NOTIFICATIONS_COLLECTION, USERS_COLLECTION } from '../utils/constants';

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

/**
 * Persist the push token to the user's Firestore doc so the scheduled
 * saved-search Cloud Function can send remote notifications.
 * Writes `expoPushToken` on the user doc (single-device model — new
 * token overwrites old; Expo invalidates stale tokens automatically).
 */
export async function persistPushToken(
  userId: string
): Promise<string | null> {
  const token = await registerForPushNotifications(userId);
  if (!token) return null;

  await trackedUpdateDoc(doc(db, USERS_COLLECTION, userId), {
    expoPushToken: token,
  }).catch(() => {
    // Best-effort; token persistence failure is non-fatal.
  });

  return token;
}

/**
 * Clear the push token on logout. The old token is useless after sign-out
 * (Expo will reject pushes), and re-login will write a fresh one.
 */
export async function clearPushToken(userId: string): Promise<void> {
  await trackedUpdateDoc(doc(db, USERS_COLLECTION, userId), {
    expoPushToken: deleteField(),
  }).catch(() => {
    // Best-effort; cleanup failure is non-fatal.
  });
}

/**
 * Watch for app foreground transitions and re-register the push token.
 * Expo can rotate tokens at any time; re-registering on foreground
 * ensures the stored token stays valid. The permission check in
 * registerForPushNotifications is a no-op if already granted, and
 * persistPushToken writes only if the token actually changed (Expo
 * returns the same token if nothing rotated).
 */
let foregroundSub: ReturnType<typeof AppState.addEventListener> | null = null;
let lastForegroundUid: string | null = null;

export function startForegroundTokenWatch(userId: string): void {
  lastForegroundUid = userId;
  if (foregroundSub) return; // already watching

  foregroundSub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active' && lastForegroundUid) {
      void persistPushToken(lastForegroundUid);
    }
  });
}

export function stopForegroundTokenWatch(): void {
  foregroundSub?.remove();
  foregroundSub = null;
  lastForegroundUid = null;
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
  await trackedAddDoc(collection(db, NOTIFICATIONS_COLLECTION), {
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
  callback: (notifications: AppNotification[]) => void,
  options?: { limit?: number }
): () => void {
  // Optional cap so long-lived accounts don't download their entire history
  // on every screen open; callers raise the limit for "load older".
  const constraints = [
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    ...(options?.limit != null ? [limit(options.limit)] : []),
  ];
  const q = query(collection(db, NOTIFICATIONS_COLLECTION), ...constraints);

  return trackedOnSnapshot(q, NOTIFICATIONS_COLLECTION, (querySnapshot) => {
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
  await trackedUpdateDoc(
    doc(db, NOTIFICATIONS_COLLECTION, notificationId),
    { read: true }
  );
}

/**
 * Set a notification's read state in a single write (rules allow updating
 * only the `read` field). Unlike markNotificationAsRead, this also handles
 * marking UNREAD — without the intermediate read:true echo that a
 * read-then-unread double write would produce.
 */
export async function setNotificationRead(
  notificationId: string,
  read: boolean
): Promise<void> {
  await trackedUpdateDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId), {
    read,
  });
}

/**
 * Mark every unread notification in the list read in ONE batched write —
 * a single round-trip and a single snapshot instead of N sequential updates
 * (N re-renders). Firestore batches cap at 500 ops; if a user ever has more
 * unread than that, the remainder is marked in a follow-up batch.
 *
 * Returns the number of documents actually written (unread ones).
 */
export async function markAllNotificationsAsRead(
  notifications: AppNotification[]
): Promise<number> {
  const unread = notifications.filter((n) => !n.read);
  for (let i = 0; i < unread.length; i += 500) {
    const batch = trackedWriteBatch();
    for (const n of unread.slice(i, i + 500)) {
      batch.update(doc(db, NOTIFICATIONS_COLLECTION, n.id), { read: true });
    }
    await batch.commit();
  }
  return unread.length;
}

/** Delete one of the user's own notifications (rules: userId must match). */
export async function deleteNotification(notificationId: string): Promise<void> {
  await trackedDeleteDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId));
}

/**
 * Recreate a notification (undo for swipe-to-delete). Writes a NEW doc with
 * the original fields and returns its id. Creation rules require the full
 * field set and a recognized type — satisfied by construction here.
 *
 * The original createdAt is preserved when it is a Firestore Timestamp (the
 * normal case for docs that came from the live subscription), so a restored
 * week-old notification doesn't jump to the top dated "now". String/missing
 * timestamps fall back to serverTimestamp().
 */
export async function restoreNotification(
  notification: AppNotification
): Promise<string> {
  let createdAt: Timestamp | ReturnType<typeof serverTimestamp> = serverTimestamp();
  // AppNotification types createdAt as string, but live-subscription docs
  // carry Firestore Timestamps at runtime — probe for toMillis rather than
  // trusting the declared type.
  const rawCreatedAt = notification.createdAt as unknown;
  if (typeof (rawCreatedAt as { toMillis?: unknown })?.toMillis === 'function') {
    createdAt = Timestamp.fromMillis((rawCreatedAt as { toMillis: () => number }).toMillis());
  }
  const ref = await trackedAddDoc(collection(db, NOTIFICATIONS_COLLECTION), {
    userId: notification.userId,
    title: notification.title,
    body: notification.body,
    type: notification.type,
    data: notification.data ?? {},
    read: notification.read ?? false,
    createdAt,
  });
  return ref.id;
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