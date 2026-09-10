import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList, Property } from '../../types';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import PropertyCardSkeleton from '../../components/common/PropertyCardSkeleton';
import { getUserProperties } from '../../services/propertyService';
import { useResponsive } from '../../hooks/useResponsive';
import PriceDisplay from '../../components/common/PriceDisplay';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CONTENT_MAX_WIDTH = 960;

type SortKey = 'newest' | 'views' | 'inquiries';

interface ListingMetric {
  property: Property;
  daysOnMarket: number;
}

/** Days-on-market threshold for the "stale" indicator. */
const STALE_DAYS = 30;

export default function SellerPerformanceScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('newest');

  const contentWidth = Math.min(responsive.contentWidth, CONTENT_MAX_WIDTH);
  const columns = responsive.gridColumns();

  const loadProperties = useCallback(async () => {
    const uid = user?.uid;
    if (!uid) return;
    try {
      const result = await getUserProperties(uid);
      setProperties(result);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProperties();
  }, [loadProperties]);

  // ─── Computed metrics ─────────────────────────────────────────
  const metrics: ListingMetric[] = useMemo(() => {
    const now = Date.now();
    return properties.map((p) => {
      const created = new Date(p.createdAt).getTime();
      const daysOnMarket = Math.max(0, Math.floor((now - created) / 86_400_000));
      return { property: p, daysOnMarket };
    });
  }, [properties]);

  const sorted = useMemo(() => {
    const copy = [...metrics];
    switch (sortBy) {
      case 'views':
        return copy.sort((a, b) => b.property.views - a.property.views);
      case 'inquiries':
        return copy.sort((a, b) => b.property.inquiries - a.property.inquiries);
      case 'newest':
      default:
        return copy.sort(
          (a, b) =>
            new Date(b.property.createdAt).getTime() -
            new Date(a.property.createdAt).getTime()
        );
    }
  }, [metrics, sortBy]);

  // ─── Portfolio summary ────────────────────────────────────────
  const summary = useMemo(() => {
    const active = properties.filter((p) => p.status === 'active');
    const totalViews = properties.reduce((s, p) => s + (p.views ?? 0), 0);
    const totalInquiries = properties.reduce((s, p) => s + (p.inquiries ?? 0), 0);
    const avgDays =
      metrics.length > 0
        ? Math.round(metrics.reduce((s, m) => s + m.daysOnMarket, 0) / metrics.length)
        : 0;
    return {
      activeCount: active.length,
      totalCount: properties.length,
      totalViews,
      totalInquiries,
      avgDays,
    };
  }, [properties, metrics]);

  // ─── Sort options ─────────────────────────────────────────────
  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'newest', label: 'Newest' },
    { key: 'views', label: 'Most Views' },
    { key: 'inquiries', label: 'Most Inquiries' },
  ];

  // ─── Render helpers ───────────────────────────────────────────
  const renderMetricCard = (
    icon: string,
    value: string | number,
    label: string,
    accentColor: string
  ) => (
    <View
      style={[
        styles.metricCard,
        { backgroundColor: colors.surface, borderRadius: radius.xl, width: (contentWidth - spacing.lg * 2 - spacing.md * 3) / 4 },
      ]}
    >
      <View style={[styles.metricIcon, { backgroundColor: accentColor + '12' }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={accentColor} />
      </View>
      <Text style={[styles.metricValue, { color: colors.text, fontSize: fontSize.xl }]}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
        {label}
      </Text>
    </View>
  );

  const renderListingRow = ({ item }: { item: ListingMetric }) => {
    const { property, daysOnMarket } = item;
    const isStale = daysOnMarket > STALE_DAYS && property.status === 'active';
    const thumb = property.images?.[0];

    return (
      <TouchableOpacity
        style={[
          styles.listingRow,
          {
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderColor: isStale ? colors.warning + '40' : colors.border,
            borderWidth: isStale ? 1.5 : 0.5,
          },
        ]}
        onPress={() => navigation.navigate('PropertyDetail', { propertyId: property.id })}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${property.title}: ${property.views} views, ${property.inquiries} inquiries, ${daysOnMarket} days on market`}
      >
        {/* Thumbnail */}
        <Image
          source={thumb ? { uri: thumb } : undefined}
          style={[styles.thumb, { borderRadius: radius.sm }]}
          contentFit="cover"
        />

        {/* Content */}
        <View style={styles.listingContent}>
          <View style={styles.listingTitleRow}>
            <Text
              style={[styles.listingTitle, { color: colors.text, fontSize: fontSize.md }]}
              numberOfLines={1}
            >
              {property.title}
            </Text>
            <StatusBadge status={property.status} size="sm" />
          </View>

          <View style={styles.listingLocation}>
            <MaterialCommunityIcons name="map-marker-outline" size={11} color={colors.textSecondary} />
            <Text
              style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginLeft: 3, flex: 1 }}
              numberOfLines={1}
            >
              {property.city}, {property.state}
            </Text>
          </View>

          {/* Metrics row */}
          <View style={styles.metricsRow}>
            <MetricChip
              icon="eye-outline"
              value={property.views ?? 0}
              colors={colors}
              fontSize={fontSize}
            />
            <MetricChip
              icon="email-search-outline"
              value={property.inquiries ?? 0}
              colors={colors}
              fontSize={fontSize}
            />
            <MetricChip
              icon="calendar-outline"
              value={`${daysOnMarket}d`}
              colors={colors}
              fontSize={fontSize}
            />
            {isStale && (
              <View style={[styles.staleBadge, { backgroundColor: colors.warning + '18' }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={11} color={colors.warning} />
                <Text style={[styles.staleText, { color: colors.warning, fontSize: fontSize.xs }]}>
                  Stale
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Price + chevron */}
        <View style={styles.listingPriceCol}>
          <PriceDisplay
            amount={property.price}
            listingType={property.listingType}
            fontSize={fontSize.sm}
          />
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.gray400} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
      ]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.xl }]}>
          Performance
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={{ padding: spacing.xl }}>
          {[0, 1, 2].map((i) => (
            <PropertyCardSkeleton key={i} />
          ))}
        </View>
      ) : properties.length === 0 ? (
        <EmptyState
          icon="chart-bar"
          title="No listings yet"
          description="Create your first property listing to see performance metrics."
          actionLabel="List Property"
          onAction={() => navigation.navigate('AddProperty')}
        />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.property.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <>
              {/* Portfolio Summary */}
              <View style={[styles.summaryRow, { gap: spacing.md }]}>
                {renderMetricCard('home', summary.activeCount, 'Active', colors.primary)}
                {renderMetricCard('eye', summary.totalViews, 'Views', colors.info)}
                {renderMetricCard('email-search-outline', summary.totalInquiries, 'Inquiries', colors.success)}
                {renderMetricCard('calendar-clock', summary.avgDays, 'Avg Days', colors.warning)}
              </View>

              <Text
                style={[
                  styles.limitNote,
                  { color: colors.textLight, fontSize: fontSize.xs, marginTop: spacing.sm },
                ]}
              >
                Showing all-time metrics. Trend data coming in a future update.
              </Text>

              {/* Sort chips */}
              <View style={[styles.sortRow, { marginTop: spacing.lg, marginBottom: spacing.md }]}>
                {SORT_OPTIONS.map((opt) => {
                  const selected = sortBy === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.sortChip,
                        {
                          backgroundColor: selected ? colors.primary : colors.gray100,
                          borderRadius: radius.round,
                        },
                      ]}
                      onPress={() => setSortBy(opt.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={{
                          color: selected ? colors.white : colors.text,
                          fontSize: fontSize.sm,
                          fontWeight: '600',
                        }}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          }
          renderItem={renderListingRow}
          ListEmptyComponent={null}
        />
      )}
    </View>
  );
}

// ─── Metric chip (inline helper) ────────────────────────────────────────────
function MetricChip({
  icon,
  value,
  colors,
  fontSize,
}: {
  icon: string;
  value: string | number;
  colors: any;
  fontSize: any;
}) {
  return (
    <View style={metricStyles.chip}>
      <MaterialCommunityIcons name={icon as any} size={12} color={colors.gray400} />
      <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '500', marginLeft: 3 }}>
        {value}
      </Text>
    </View>
  );
}

const metricStyles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center' },
});

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontWeight: '700' },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metricCard: {
    padding: 12,
    alignItems: 'center',
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  metricValue: { fontWeight: '700' },
  metricLabel: { marginTop: 2, fontWeight: '500' },
  limitNote: { textAlign: 'center' },
  sortRow: { flexDirection: 'row', gap: 8 },
  sortChip: { paddingHorizontal: 14, paddingVertical: 8 },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 10,
  },
  thumb: {
    width: 72,
    height: 72,
    backgroundColor: '#E5E7EB',
  },
  listingContent: {
    flex: 1,
    marginLeft: 12,
  },
  listingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listingTitle: { fontWeight: '600', flex: 1 },
  listingLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  staleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  staleText: { fontWeight: '600' },
  listingPriceCol: {
    alignItems: 'flex-end',
    marginLeft: 12,
    gap: 4,
  },
});
