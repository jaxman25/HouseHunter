import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface BadgeProps {
  count?: number;
  label?: string;
  variant?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export default function Badge({
  count,
  label,
  variant = 'primary',
  size = 'sm',
  style,
}: BadgeProps) {
  const { colors, fontSize } = useTheme();

  const variantColors: Record<string, string> = {
    primary: colors.primary,
    secondary: colors.secondary,
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    info: colors.info,
    neutral: colors.gray600,
  };

  const displayText = count !== undefined ? (count > 99 ? '99+' : String(count)) : label;
  if (!displayText) return null;

  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: variantColors[variant],
          paddingHorizontal: isSmall ? 6 : 10,
          paddingVertical: isSmall ? 2 : 4,
          borderRadius: isSmall ? 10 : 12,
          minWidth: isSmall ? 20 : 28,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: colors.white,
            fontSize: isSmall ? 10 : fontSize.xs,
          },
        ]}
      >
        {displayText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
  },
});
