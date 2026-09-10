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
  const { colors, fontSize, spacing, radius } = useTheme();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: colors.primaryLight, borderRadius: radius.xl },
        ]}
      >
        <MaterialCommunityIcons
          name={icon as any}
          size={40}
          color={colors.primary}
        />
      </View>
      <Text
        style={[styles.title, { color: colors.text, fontSize: fontSize.lg }]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.description,
          { color: colors.textSecondary, fontSize: fontSize.sm },
        ]}
      >
        {description}
      </Text>
      {actionLabel && onAction && (
        <View style={{ marginTop: spacing.xl, width: 200 }}>
          <Button title={actionLabel} onPress={onAction} variant="primary" size="sm" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  description: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
