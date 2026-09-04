import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/utils/errors/ErrorBoundary';
import { initSentry } from './src/utils/monitoring/sentry';

LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'Setting a timer for a long period',
]);

export default function App() {
  initSentry();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ErrorBoundary>
            <AuthProvider>
              <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
              <AppNavigator />
            </AuthProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
