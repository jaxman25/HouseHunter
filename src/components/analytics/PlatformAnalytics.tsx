import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { PlatformAnalytics as PlatformAnalyticsType } from '../../types';
import { getPlatformAnalytics } from '../../services/analyticsService';
import MetricCard from './MetricCard';
import ActivityChart from './ActivityChart';

export default function PlatformAnalytics() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const [data, setData] = useState<PlatformAnalyticsType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const result = await getPlatformAnalytics();
      setData(result);
    } catch {
      // Use default empty data
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!data) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Key Metrics */}
      <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
        Platform Metrics
      </Text>
      <View style={styles.metricsGrid}>
        <MetricCard title="DAU" value={data.dau.toLocaleString()} icon="account-group" color={colors.primary} />
        <MetricCard title="MAU" value={data.mau.toLocaleString()} icon="account-multiple" color={colors.info} />
        <MetricCard title="New Users" value={data.newUsers.toLocaleString()} icon="account-plus" color={colors.success} />
        <MetricCard title="New Listings" value={data.newListings.toLocaleString()} icon="home-plus" color={colors.warning} />
      </View>

      {/* Conversion Funnel */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Conversion Funnel
        </Text>
        <View style={[styles.funnelCard, { backgroundColor: colors.card, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1 }]}>
          {[
            { label: 'Views', value: data.conversionFunnel.views, icon: 'eye', pct: 100 },
            { label: 'Favorites', value: data.conversionFunnel.favorites, icon: 'heart', pct: data.conversionFunnel.views > 0 ? Math.round((data.conversionFunnel.favorites / data.conversionFunnel.views) * 100) : 0 },
            { label: 'Inquiries', value: data.conversionFunnel.inquiries, icon: 'message-text', pct: data.conversionFunnel.views > 0 ? Math.round((data.conversionFunnel.inquiries / data.conversionFunnel.views) * 100) : 0 },
            { label: 'Tours', value: data.conversionFunnel.tours, icon: 'calendar-check', pct: data.conversionFunnel.views > 0 ? Math.round((data.conversionFunnel.tours / data.conversionFunnel.views) * 100) : 0 },
          ].map((step, i) => (
            <View key={i} style={[styles.funnelStep, { borderBottomColor: colors.gray200 }]}>
              <MaterialCommunityIcons name={step.icon as any} size={20} color={colors.primary} />
              <View style={styles.funnelInfo}>
                <Text style={[styles.funnelLabel, { color: colors.text, fontSize: fontSize.sm }]}>{step.label}</Text>
                <View style={[styles.funnelBarTrack, { backgroundColor: colors.gray200 }]}>
                  <View style={[styles.funnelBar, { width: `${step.pct}%`, backgroundColor: colors.primary }]} />
                </View>
              </View>
              <Text style={[styles.funnelValue, { color: colors.text, fontSize: fontSize.sm }]}>
                {step.value.toLocaleString()}
              </Text>
              <Text style={[styles.funnelPct, { color: colors.textLight, fontSize: fontSize.xs }]}>
                {step.pct}%
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Most Searched Cities */}
      {data.mostSearchedCities.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
            Most Searched Cities
          </Text>
          {data.mostSearchedCities.map((city, i) => (
            <View key={i} style={[styles.cityRow, { borderBottomColor: colors.gray200 }]}>
              <Text style={[styles.cityRank, { color: colors.textLight, fontSize: fontSize.sm }]}>
                {i + 1}.
              </Text>
              <Text style={[styles.cityName, { color: colors.text, fontSize: fontSize.sm }]}>
                {city.city}
              </Text>
              <Text style={[styles.cityCount, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
                {city.count.toLocaleString()} searches
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 20 },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  section: { marginTop: 24 },
  sectionTitle: { fontWeight: '700', marginBottom: 12 },
  metricsGrid: { gap: 10 },
  funnelCard: { padding: 16 },
  funnelStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  funnelInfo: { flex: 1 },
  funnelLabel: { fontWeight: '500', marginBottom: 4 },
  funnelBarTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  funnelBar: { height: '100%', borderRadius: 3 },
  funnelValue: { fontWeight: '600', minWidth: 50, textAlign: 'right' },
  funnelPct: { minWidth: 40, textAlign: 'right' },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  cityRank: { width: 24, fontWeight: '600' },
  cityName: { flex: 1, fontWeight: '500' },
  cityCount: {},
});
