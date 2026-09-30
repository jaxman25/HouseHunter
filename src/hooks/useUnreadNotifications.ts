import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { subscribeToNotifications } from '../services/notificationService';

/**
 * Live unread-notification count for the signed-in user — the shared source
 * for every badge that points at the notifications list (Home header bell,
 * Settings row). Replaces per-screen subscriptions so badges can't disagree.
 *
 * The Firestore snapshot subscription runs only while the app is FOREGROUND
 * (detached while backgrounded) so backgrounded apps don't pay for updates
 * they aren't displaying. The flip side: a badge is frozen while backgrounded
 * — it refreshes as soon as the app returns, and push notifications remain
 * the true "something happened" channel.
 *
 * Returns 0 when signed out.
 */
export function useUnreadNotifications(userId: string | undefined): number {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    let unsubscribe: (() => void) | null = null;

    const sync = (state: AppStateStatus) => {
      if (state === 'active' && !unsubscribe) {
        unsubscribe = subscribeToNotifications(userId, (items) => {
          setUnreadCount(items.reduce((count, n) => count + (n.read ? 0 : 1), 0));
        });
      } else if (state !== 'active' && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };

    sync(AppState.currentState);
    const subscription = AppState.addEventListener('change', sync);

    return () => {
      subscription.remove();
      unsubscribe?.();
    };
  }, [userId]);

  // Signed out → always 0, even if state still holds a stale count (also
  // avoids a setState-in-effect just to reset it).
  return userId ? unreadCount : 0;
}
