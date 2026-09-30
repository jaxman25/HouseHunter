import { Platform } from 'react-native';

// expo-notifications is not supported on web, so it is only loaded on
// iOS/Android — same lazy-load pattern as services/notificationService.
// Static import would evaluate the package (and its native/web shims) on web.
type NotificationsModule = typeof import('expo-notifications');

let notificationsPromise: Promise<NotificationsModule | null> | null = null;

function loadNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') {
    return Promise.resolve(null);
  }
  if (!notificationsPromise) {
    notificationsPromise = import('expo-notifications');
  }
  return notificationsPromise;
}

/** New-format push payloads carry the sender's unread count… */
export function extractUnreadCount(
  data: Record<string, unknown> | undefined | null
): number | null {
  if (!data) return null;
  const raw = data.unreadCount ?? data.unread_count ?? data.badge ?? data.count ?? null;
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** iOS renders "9+" above 9; the OS caps badges at 99. */
export function displayCount(unreadCount: number | null | undefined): number {
  if (unreadCount == null || unreadCount <= 0) return 0;
  return Math.min(unreadCount, 99);
}

/**
 * Home-screen app-icon badge, kept in sync with the user's unread
 * notification count (AppIconBadgeSync drives it from the shared count).
 *
 * - iOS: setBadgeCountAsync writes the icon badge natively.
 * - Android: launchers implement their own badge protocols (none are
 *   expo-supported) — the icon part is a no-op there.
 * - Web: no app icon — no-op.
 *
 * Whenever the count is 0 we also clear the local-notification displays
 * (Android's shaded-list counter / iOS's notification-center list), so the
 * visible count never goes stale after the user reads everything in-app.
 */
export async function syncAppIconBadge(
  unreadCount: number | null | undefined
): Promise<void> {
  if (Platform.OS === 'web') return;
  const count = displayCount(unreadCount ?? 0);

  if (count === 0) {
    try {
      const Notifications = await loadNotifications();
      await Notifications?.dismissAllNotificationsAsync();
    } catch {
      // Best-effort.
    }
  }

  if (Platform.OS === 'ios') {
    try {
      const Notifications = await loadNotifications();
      await Notifications?.setBadgeCountAsync(count);
    } catch {
      // Best-effort: badge sync must never break the calling screen.
    }
  }
}
