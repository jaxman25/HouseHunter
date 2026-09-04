import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { RootStackParamList } from '../types';
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
import SettingsScreen from '../screens/settings/SettingsScreen';
import EditProfileScreen from '../screens/settings/EditProfileScreen';
import ChangePasswordScreen from '../screens/settings/ChangePasswordScreen';

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
      <Stack.Screen name="Settings" component={withErrorBoundary(SettingsScreen)} />
      <Stack.Screen name="EditProfile" component={withErrorBoundary(EditProfileScreen)} />
      <Stack.Screen name="ChangePassword" component={withErrorBoundary(ChangePasswordScreen)} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuthContext();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.primary }]}>
        <ActivityIndicator size="large" color={colors.white} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <MainStack /> : <ErrorBoundary><AuthNavigator /></ErrorBoundary>}
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
