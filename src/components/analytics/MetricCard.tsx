import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: string;
  color?: string;
  subtitle?: string;
}

export default function MetricCard({ title, value, icon, color, subtitle }: MetricCardProps) {
  const { colors, fontSize, radius } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderRadius: radius.md, borderColor: colors.border }]}>
      <View style={[styles.iconContainer, { backgroundColor: (color || colors.primary) + '15' }]}>
        <MaterialCommunityIcons
          name={icon as any}
          size={24}
          color={color || colors.primary}
        />
      </View>
      <View style={styles.info}>
        <Text style={[styles.value, { color: colors.text, fontSize: fontSize.xl }]}>{value}</Text>
        <Text style={[styles.title, { color: colors.textSecondary, fontSize: fontSize.xs }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: colors.textLight, fontSize: 10 }]}>{subtitle}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderWidth: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  value: { fontWeight: '700', marginBottom: 2 },
  title: { fontWeight: '500' },
  subtitle: { marginTop: 1 },
});
