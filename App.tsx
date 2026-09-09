import React from 'react';
import { StatusBar, LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { CurrencyProvider } from './src/context/CurrencyContext';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/utils/errors/ErrorBoundary';
import CookieConsentBanner from './src/components/common/CookieConsentBanner';
import NoticeBanner from './src/components/common/NoticeBanner';
import ToastHost from './src/components/common/ToastHost';
import WebFrame from './src/components/common/WebFrame';
import { initSentry } from './src/utils/monitoring/sentry';
import { validateEnv } from './src/utils/env';

LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'Setting a timer for a long period',
]);

export default function App() {
  validateEnv();
  initSentry();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ErrorBoundary>
            <WebFrame>
              <CurrencyProvider>
                <AuthProvider>
                  <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
                  <AppNavigator />
                </AuthProvider>
              </CurrencyProvider>
              {/* Web-only cookie/local-storage consent banner. */}
              <CookieConsentBanner />
              {/* Config-driven in-app notice banner (config/app_notice doc). */}
              <NoticeBanner />
              {/* Transient feedback (e.g. "link copied" on web share). */}
              <ToastHost />
            </WebFrame>
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
