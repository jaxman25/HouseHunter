import React, { useEffect, useRef, useCallback } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { RootStackParamList } from '../types';
import { parseDeepLink, handleDeepLink } from '../utils/deepLinking';
import {
  addNotificationResponseListener,
  markNotificationAsRead,
} from '../services/notificationService';
import ErrorBoundary from '../utils/errors/ErrorBoundary';
import AuthNavigator from './AuthNavigator';
import MainTabNavigator from './MainTabNavigator';
import PropertyDetailScreen from '../screens/property/PropertyDetailScreen';
import AddPropertyScreen from '../screens/property/AddPropertyScreen';
import EditPropertyScreen from '../screens/property/EditPropertyScreen';
import MyListingsScreen from '../screens/property/MyListingsScreen';
import SearchScreen from '../screens/search/SearchScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import ConversationsScreen from '../screens/chat/ConversationsScreen';
import RecentlyViewedScreen from '../screens/main/RecentlyViewedScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import EditProfileScreen from '../screens/settings/EditProfileScreen';
import ChangePasswordScreen from '../screens/settings/ChangePasswordScreen';
import DeleteAccountScreen from '../screens/settings/DeleteAccountScreen';
import SavedSearchesScreen from '../screens/main/SavedSearchesScreen';
import AdminLoginScreen from '../screens/admin/AdminLoginScreen';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import UsersManagementScreen from '../screens/admin/UsersManagementScreen';
import ReportsManagementScreen from '../screens/admin/ReportsManagementScreen';
import SystemSettingsScreen from '../screens/admin/SystemSettingsScreen';
import AnalyticsScreen from '../screens/admin/AnalyticsScreen';
import ReviewModerationScreen from '../screens/admin/ReviewModerationScreen';
import ReviewsScreen from '../screens/property/ReviewsScreen';
import WriteReviewScreen from '../screens/property/WriteReviewScreen';
import SellerReviewsScreen from '../screens/property/SellerReviewsScreen';
import ToursScreen from '../screens/property/ToursScreen';
import TourDetailsScreen from '../screens/property/TourDetailsScreen';
import TourSettingsScreen from '../screens/property/TourSettingsScreen';
import UserAnalyticsScreen from '../screens/settings/UserAnalyticsScreen';
import DataExportScreen from '../screens/settings/DataExportScreen';
import CurrencySettingsScreen from '../screens/settings/CurrencySettingsScreen';
import LanguageSettingsScreen from '../screens/settings/LanguageSettingsScreen';
import ThemeSettingsScreen from '../screens/settings/ThemeSettingsScreen';
import NotificationPreferencesScreen from '../screens/settings/NotificationPreferencesScreen';
import SellerPerformanceScreen from '../screens/property/SellerPerformanceScreen';
import TermsGate from '../screens/legal/TermsGate';
import {
  PrivacyPolicyScreen,
  TermsOfServiceScreen,
} from '../screens/legal/LegalScreens';

/**
 * Wrap a screen component in an error boundary so a crash in one screen
 * shows a themed retry fallback instead of killing the whole navigator.
 * Called at module scope so each wrapped component is created exactly once.
 */
function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>
): React.FC<P> {
  return function ScreenWithErrorBoundary(props: P) {
    return (
      <ErrorBoundary>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

const Stack = createNativeStackNavigator<RootStackParamList>();

function MainStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="MainTabs" component={withErrorBoundary(MainTabNavigator)} />
      <Stack.Screen name="PropertyDetail" component={withErrorBoundary(PropertyDetailScreen)} />
      <Stack.Screen name="AddProperty" component={withErrorBoundary(AddPropertyScreen)} />
      <Stack.Screen name="EditProperty" component={withErrorBoundary(EditPropertyScreen)} />
      <Stack.Screen name="MyListings" component={withErrorBoundary(MyListingsScreen)} />
      <Stack.Screen name="Search" component={withErrorBoundary(SearchScreen)} />
      <Stack.Screen name="Chat" component={withErrorBoundary(ChatScreen)} />
      <Stack.Screen name="Conversations" component={withErrorBoundary(ConversationsScreen)} />
      <Stack.Screen name="RecentlyViewed" component={withErrorBoundary(RecentlyViewedScreen)} />
      <Stack.Screen name="SavedSearches" component={withErrorBoundary(SavedSearchesScreen)} />
      <Stack.Screen name="AdminLogin" component={withErrorBoundary(AdminLoginScreen)} />
      <Stack.Screen name="AdminDashboard" component={withErrorBoundary(AdminDashboardScreen)} />
      <Stack.Screen name="AdminUsers" component={withErrorBoundary(UsersManagementScreen)} />
      <Stack.Screen name="AdminReports" component={withErrorBoundary(ReportsManagementScreen)} />
      <Stack.Screen name="AdminSettings" component={withErrorBoundary(SystemSettingsScreen)} />
      <Stack.Screen name="AdminAnalytics" component={withErrorBoundary(AnalyticsScreen)} />
      <Stack.Screen name="Settings" component={withErrorBoundary(SettingsScreen)} />
      <Stack.Screen name="EditProfile" component={withErrorBoundary(EditProfileScreen)} />
      <Stack.Screen name="ChangePassword" component={withErrorBoundary(ChangePasswordScreen)} />
      <Stack.Screen name="DeleteAccount" component={withErrorBoundary(DeleteAccountScreen)} />
      <Stack.Screen name="Terms" component={withErrorBoundary(TermsOfServiceScreen)} />
      <Stack.Screen name="PrivacyPolicy" component={withErrorBoundary(PrivacyPolicyScreen)} />
      {/* Feature Screens */}
      <Stack.Screen name="Reviews" component={withErrorBoundary(ReviewsScreen)} />
      <Stack.Screen name="WriteReview" component={withErrorBoundary(WriteReviewScreen)} />
      <Stack.Screen name="SellerReviews" component={withErrorBoundary(SellerReviewsScreen)} />
      <Stack.Screen name="ReviewModeration" component={withErrorBoundary(ReviewModerationScreen)} />
      <Stack.Screen name="Tours" component={withErrorBoundary(ToursScreen)} />
      <Stack.Screen name="TourDetails" component={withErrorBoundary(TourDetailsScreen)} />
      <Stack.Screen name="TourSettings" component={withErrorBoundary(TourSettingsScreen)} />
      <Stack.Screen name="UserAnalytics" component={withErrorBoundary(UserAnalyticsScreen)} />
      <Stack.Screen name="DataExport" component={withErrorBoundary(DataExportScreen)} />
      <Stack.Screen name="CurrencySettings" component={withErrorBoundary(CurrencySettingsScreen)} />
      <Stack.Screen name="LanguageSettings" component={withErrorBoundary(LanguageSettingsScreen)} />
      <Stack.Screen name="ThemeSettings" component={withErrorBoundary(ThemeSettingsScreen)} />
      <Stack.Screen name="NotificationPreferences" component={withErrorBoundary(NotificationPreferencesScreen)} />
      <Stack.Screen name="SellerPerformance" component={withErrorBoundary(SellerPerformanceScreen)} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuthContext();
  const { colors } = useTheme();

  // Deep-link routing: househunter://property/{id} (native) and
  // {origin}/property/{id} (web) open the property detail screen. Initial
  // URLs are queued until the navigator is ready (onReady), warm links are
  // handled as they arrive.
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const pendingDeepLink = useRef<string | null>(null);

  // Notification tap routing: queued until navigator + auth are ready.
  const pendingNotificationData = useRef<Record<string, string> | null>(null);

  /**
   * Route based on a notification's data payload.
   * Handles both foreground/background taps (listener fires immediately)
   * and cold-start taps (data stored in pendingNotificationData, routed
   * after auth + navigator are ready).
   */
  const handleNotificationTap = useCallback(
    (data: Record<string, string>) => {
      const type = data.type;

      // Mark as read (fire-and-forget, idempotent).
      const notificationIds = data.notificationIds
        ? data.notificationIds.split(',').filter(Boolean)
        : [];
      for (const nid of notificationIds) {
        markNotificationAsRead(nid).catch(() => {});
      }

      const nav = navigationRef.current;
      if (!nav?.isReady()) {
        // Navigator not ready — queue for onReady.
        pendingNotificationData.current = data;
        return;
      }

      switch (type) {
        case 'new_listing': {
          const savedSearchId = data.savedSearchId;
          if (savedSearchId) {
            nav.navigate('SavedSearches' as any, { savedSearchId } as any);
          } else {
            nav.navigate('MainTabs' as any, undefined as any);
          }
          break;
        }
        case 'message':
          // No conversation ID in push payload — navigate to Conversations list.
          nav.navigate('Conversations' as any, undefined as any);
          break;
        case 'inquiry':
          // No property ID in generic inquiry push — navigate to Home.
          nav.navigate('MainTabs' as any, undefined as any);
          break;
        case 'price_drop':
        case 'favorite':
        case 'system':
        default:
          nav.navigate('MainTabs' as any, undefined as any);
          break;
      }
    },
    []
  );

  useEffect(() => {
    // Cold start: web may hard-load on /property/{id}; native may open with
    // a househunter:// URL. Both surface through getInitialURL().
    Linking.getInitialURL()
      .then((url) => {
        if (url && parseDeepLink(url)) pendingDeepLink.current = url;
      })
      .catch(() => {});

    // Warm start: a link arrives while the app is already running.
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (navigationRef.current?.isReady()) {
        handleDeepLink(url, navigationRef.current);
      } else {
        pendingDeepLink.current = url;
      }
    });

    // Notification response listener (foreground + background-to-foreground).
    // This fires when the user taps a notification while the app is running.
    let removeNotificationListener: (() => void) | undefined;
    addNotificationResponseListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data && typeof data === 'object') {
        handleNotificationTap(data as Record<string, string>);
      }
    }).then((remove) => {
      removeNotificationListener = remove;
    });

    // Cold start: check if the app was opened by tapping a notification.
    // On native, getLastNotificationResponseAsync() returns the response
    // from the notification that launched the app. On web this is a no-op.
    if (Platform.OS !== 'web') {
      import('expo-notifications').then((Notifications) => {
        Notifications.getLastNotificationResponseAsync().then((response) => {
          if (response) {
            const data = response.notification?.request?.content?.data;
            if (data && typeof data === 'object') {
              handleNotificationTap(data as Record<string, string>);
            }
          }
        });
      });
    }

    return () => {
      subscription.remove();
      removeNotificationListener?.();
    };
  }, [handleNotificationTap]);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.primary }]}>
        <ActivityIndicator size="large" color={colors.white} />
      </View>
    );
  }

  // Accounts without an explicit terms acceptance (social sign-up, legacy
  // accounts) must agree before reaching the app.
  const needsTermsConsent = Boolean(user && !user.termsAcceptedVersion);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        if (pendingDeepLink.current) {
          handleDeepLink(pendingDeepLink.current, navigationRef.current);
          pendingDeepLink.current = null;
        }
        if (pendingNotificationData.current) {
          handleNotificationTap(pendingNotificationData.current);
          pendingNotificationData.current = null;
        }
      }}
    >
      {!user ? (
        <ErrorBoundary><AuthNavigator /></ErrorBoundary>
      ) : needsTermsConsent ? (
        <TermsGate userId={user.uid} />
      ) : (
        <MainStack />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
