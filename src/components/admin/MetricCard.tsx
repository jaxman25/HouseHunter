import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

export default function MetricCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number | string;
}) {
  const { colors, fontSize, radius, shadow } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
        },
        shadow.sm,
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight, borderRadius: radius.round }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={colors.primary} />
      </View>
      <Text style={[styles.value, { color: colors.text, fontSize: fontSize.xxl }]}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Text>
      <Text style={[styles.label, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    padding: 14,
  },
  iconCircle: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  value: {
    fontWeight: '800',
  },
  label: {
    marginTop: 2,
    fontWeight: '500',
  },
});