import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

interface SellerMetricsProps {
  totalViews: number;
  totalInquiries: number;
  conversionRate: number;
  averageResponseTime?: number;
}

export default function SellerMetrics({ totalViews, totalInquiries, conversionRate, averageResponseTime }: SellerMetricsProps) {
  const { colors, fontSize, radius } = useTheme();

  const metrics = [
    { label: 'Total Views', value: totalViews.toLocaleString(), icon: 'eye', color: colors.info },
    { label: 'Inquiries', value: totalInquiries.toLocaleString(), icon: 'message-text', color: colors.primary },
    { label: 'Conversion', value: `${conversionRate}%`, icon: 'chart-line', color: colors.success },
    ...(averageResponseTime !== undefined
      ? [{ label: 'Avg Response', value: `${averageResponseTime}m`, icon: 'clock-fast', color: colors.warning }]
      : []),
  ];

  return (
    <View style={styles.container}>
      {metrics.map((metric, i) => (
        <View key={i} style={[styles.metricCard, { backgroundColor: colors.gray100, borderRadius: radius.sm }]}>
          <MaterialCommunityIcons name={metric.icon as any} size={20} color={metric.color} />
          <Text style={[styles.metricValue, { color: colors.text, fontSize: fontSize.lg }]}>
            {metric.value}
          </Text>
          <Text style={[styles.metricLabel, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
            {metric.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '47%',
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: { fontWeight: '700' },
  metricLabel: { fontWeight: '500' },
});
