import { AppNotification } from '../types';

/**
 * Shared notification tap routing — ONE destination table for both in-app
 * list taps (NotificationsScreen) and push taps (AppNavigator). These were
 * two near-identical switch statements that had already drifted apart (the
 * in-app version deep-linked price drops/favorites to the property; the push
 * version dumped every non-message type on MainTabs).
 *
 * `navigate` is injected so both a screen's navigation prop and the
 * NavigationContainer ref can drive it. Returns the resolved route name —
 * useful for logging and tests. Whether the docs get marked read is the
 * CALLER's business (in-app taps mark the tapped doc; push taps mark
 * data.notificationIds).
 */
export type NotificationNavigate = (route: string, params?: unknown) => void;

export function routeNotificationData(
  data: Record<string, string> | undefined,
  navigate: NotificationNavigate
): string {
  const payload = data ?? {};
  switch (payload.type) {
    case 'user_review': {
      // Reputation prompt: open the peer review form for the other party.
      if (payload.revieweeId) {
        navigate('WriteUserReview', {
          revieweeId: payload.revieweeId,
          revieweeName: payload.revieweeName,
          tourId: payload.tourId,
          propertyId: payload.propertyId,
        });
        return 'WriteUserReview';
      }
      break;
    }
    case 'new_listing': {
      // Saved-search match: land on the matches for that search.
      if (payload.savedSearchId) {
        navigate('SavedSearches', { savedSearchId: payload.savedSearchId });
        return 'SavedSearches';
      }
      break;
    }
    case 'price_drop':
    case 'favorite': {
      if (payload.propertyId) {
        navigate('PropertyDetail', { propertyId: payload.propertyId });
        return 'PropertyDetail';
      }
      break;
    }
    case 'message':
      // No conversation ID in the payload — open the conversations list.
      navigate('Conversations');
      return 'Conversations';
    default:
      break;
  }
  // No specific destination — Tours/tour prompts are the common system case.
  if (payload.type === 'tour' || payload.tourId) {
    navigate('Tours');
    return 'Tours';
  }
  navigate('MainTabs');
  return 'MainTabs';
}

/**
 * Convenience for AppNotification values (in-app list taps): routes by the
 * notification's data payload.
 */
export function routeNotification(
  notification: AppNotification,
  navigate: NotificationNavigate
): string {
  return routeNotificationData(notification.data, navigate);
}
