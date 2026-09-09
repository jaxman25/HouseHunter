import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

interface CrimeRateDisplayProps {
  rate: 'Low' | 'Moderate' | 'High';
}

const RATE_CONFIG = {
  Low: { color: '#047857', bgColor: '#04785715', icon: 'shield-check', label: 'Low Crime Rate' },
  Moderate: { color: '#B45309', bgColor: '#B4530915', icon: 'shield-alert', label: 'Moderate Crime Rate' },
  High: { color: '#B91C1C', bgColor: '#B91C1C15', icon: 'shield-remove', label: 'High Crime Rate' },
};

export default function CrimeRateDisplay({ rate }: CrimeRateDisplayProps) {
  const { colors, fontSize } = useTheme();
  const config = RATE_CONFIG[rate];

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor, borderRadius: 12 }]}>
      <MaterialCommunityIcons name={config.icon as any} size={24} color={config.color} />
      <View style={styles.info}>
        <Text style={[styles.label, { color: config.color, fontSize: fontSize.md, fontWeight: '700' }]}>
          {config.label}
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
          Based on local crime statistics
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  info: { flex: 1 },
  label: {},
  description: { marginTop: 2 },
});
