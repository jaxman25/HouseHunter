import React from 'react';
import { StatusBar, LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuthContext } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { CurrencyProvider } from './src/context/CurrencyContext';
import { LanguageProvider } from './src/context/LanguageContext';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/utils/errors/ErrorBoundary';
import CookieConsentBanner from './src/components/common/CookieConsentBanner';
import NoticeBanner from './src/components/common/NoticeBanner';
import ToastHost from './src/components/common/ToastHost';
import AppIconBadgeSync from './src/components/common/AppIconBadgeSync';
import AppStartLoader from './src/components/common/AppStartLoader';
import WebFrame from './src/components/common/WebFrame';
import { initSentry } from './src/utils/monitoring/sentry';
import { validateEnv } from './src/utils/env';

LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'Setting a timer for a long period',
]);

function AppContent() {
  const { colors, isDark } = useTheme();
  // Hold the first frame on the launch screen until AuthContext has resolved
  // the session, so the app never flashes the auth screen to a signed-in user.
  const { loading: authLoading } = useAuthContext();

  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      {authLoading ? (
        <AppStartLoader />
      ) : (
        <>
          <AppNavigator />
          {/* Keeps the home-screen icon badge in sync with unread notifications. */}
          <AppIconBadgeSync />
          <CookieConsentBanner />
          <NoticeBanner />
          <ToastHost />
        </>
      )}
    </>
  );
}

export default function App() {
  validateEnv();
  initSentry();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <ErrorBoundary>
              <WebFrame>
                <CurrencyProvider>
                  <AuthProvider>
                    <AppContent />
                  </AuthProvider>
                </CurrencyProvider>
              </WebFrame>
            </ErrorBoundary>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
