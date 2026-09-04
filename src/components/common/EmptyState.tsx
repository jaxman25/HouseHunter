import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import Button from './Button';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { colors, fontSize, spacing } = useTheme();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: colors.primaryLight },
        ]}
      >
        <MaterialCommunityIcons
          name={icon as any}
          size={48}
          color={colors.primary}
        />
      </View>
      <Text
        style={[styles.title, { color: colors.text, fontSize: fontSize.xl }]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.description,
          { color: colors.textSecondary, fontSize: fontSize.md },
        ]}
      >
        {description}
      </Text>
      {actionLabel && onAction && (
        <View style={{ marginTop: spacing.xl, width: 200 }}>
          <Button title={actionLabel} onPress={onAction} variant="primary" />
        </View>
      )}
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
  description: {
    textAlign: 'center',
    lineHeight: 22,
  },
});
