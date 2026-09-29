import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppNotification } from '../types';

/**
 * Local (per-device) UI preferences for the notifications screen.
 *
 * Non-critical data following the recentlyViewedService pattern: reads fall
 * back to defaults and writes no-op with a console.warn on failure. Works on
 * web via AsyncStorage's localStorage backend.
 */

const FILTER_PREF_KEY = '@house_hunter/notification_filter_v1';

export type NotificationFilter = 'all' | AppNotification['type'];

/** Read the last-selected filter chip. Falls back to 'all'. */
export async function readNotificationFilter(): Promise<NotificationFilter> {
  try {
    const raw = await AsyncStorage.getItem(FILTER_PREF_KEY);
    return raw && raw.length > 0 ? (raw as NotificationFilter) : 'all';
  } catch (error) {
    console.warn('Failed to read notification filter pref:', error);
    return 'all';
  }
}

/** Persist the last-selected filter chip. Never throws. */
export async function writeNotificationFilter(filter: NotificationFilter): Promise<void> {
  try {
    await AsyncStorage.setItem(FILTER_PREF_KEY, filter);
  } catch (error) {
    console.warn('Failed to save notification filter pref:', error);
  }
}
