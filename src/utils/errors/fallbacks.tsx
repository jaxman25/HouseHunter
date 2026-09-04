/**
 * Fallback UI for error boundaries and loading states.
 * Uses the app's design system (theme + Button) so error screens match the rest of the app.
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import Button from '../../components/common/Button';

interface ErrorScreenProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** Icon name from MaterialCommunityIcons. */
  icon?: string;
}

/**
 * Full-screen error state with a friendly message and an optional retry action.
 */
export function ErrorScreen({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  onRetry,
  icon = 'alert-circle-outline',
}: ErrorScreenProps) {
  const { colors, fontSize, spacing } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
        <MaterialCommunityIcons name={icon as any} size={48} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xl }]}>
        {title}
      </Text>
      <Text
        style={[
          styles.message,
          { color: colors.textSecondary, fontSize: fontSize.md },
        ]}
      >
        {message}
      </Text>
      {onRetry && (
        <View style={{ marginTop: spacing.xl, width: 200 }}>
          <Button title="Try Again" onPress={onRetry} variant="primary" />
        </View>
      )}
    </View>
  );
}

interface LoadingFallbackProps {
  message?: string;
}

/**
 * Simple centered loading state used while a screen hydrates.
 */
export function LoadingFallback({ message }: LoadingFallbackProps) {
  const { colors, fontSize, spacing } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? (
        <Text
          style={[
            styles.message,
            { color: colors.textSecondary, fontSize: fontSize.md, marginTop: spacing.lg },
          ]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    textAlign: 'center',
    lineHeight: 22,
  },
});