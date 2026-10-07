import React, { useCallback, useEffect, useState } from 'react';
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
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList } from '../../types';
import PropertyCardSkeleton from '../../components/common/PropertyCardSkeleton';
import { useResponsive } from '../../hooks/useResponsive';
import { getUserStats } from '../../services/statsService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CONTENT_MAX_WIDTH = 960;

/** Days-on-market threshold for the "stale" indicator. */
const STALE_DAYS = 30;

/**
 * Seller Performance Dashboard — single-read dashboard.
 *
 * The portfolio summary (active count, total views, total inquiries, avg
 * days on market, stale count) is precomputed nightly by the Cloud
 * Function `updateUserStats` and inflated incrementally on property writes.
 * The screen performs exactly ONE read: `users/{uid}/stats/seller`.
 *
 * Individual listing rows carry only live fields (title, status, city,
 * state, views, inquiries, price, type, thumbnail); all portfolio math lives
 * in the stats doc.
 */
export default function SellerPerformanceScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();

  /** The single precomputed stats doc — no live aggregation on this screen. */
  const [stats, setStats] = useState<{
    totalListings: number;
    activeListings: number;
    totalViews: number;
    totalInquiries: number;
    avgDaysOnMarket: number;
    staleCount: number;
    updatedAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const contentWidth = Math.min(responsive.contentWidth, CONTENT_MAX_WIDTH);

  const loadStats = useCallback(async () => {
    const uid = user?.uid;
    if (!uid) return;
    try {
      const s = await getUserStats(uid);
      setStats(s);
    } catch (error) {
      console.error('Error loading seller stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
  }, [loadStats]);

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
        {
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          width: (contentWidth - spacing.lg * 2 - spacing.md * 3) / 4,
        },
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
      ) : (
        <FlatList
          data={[]}
          // Header-only list: the portfolio summary lives in
          // ListHeaderComponent; there are no row items to render.
          renderItem={() => null}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <>
              {/* Portfolio Summary — from the single precomputed stats doc. */}
              <View style={[styles.summaryRow, { gap: spacing.md }]}>
                {renderMetricCard('home', stats?.activeListings ?? 0, 'Active', colors.primary)}
                {renderMetricCard('eye', stats?.totalViews ?? 0, 'Views', colors.info)}
                {renderMetricCard('email-search-outline', stats?.totalInquiries ?? 0, 'Inquiries', colors.success)}
                {renderMetricCard('calendar-clock', stats?.avgDaysOnMarket ?? 0, 'Avg Days', colors.warning)}
              </View>

              <View style={[styles.staleRow, { marginTop: spacing.md }]}>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
                  Stale listings (&gt;{STALE_DAYS}d active): {stats?.staleCount ?? 0} ·
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }}>
                  Updated {stats?.updatedAt ? new Date(stats.updatedAt).toLocaleString() : '—'}
                </Text>
              </View>
            </>
          }
        />
      )}
    </View>
  );
}

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
  staleRow: {
    alignItems: 'center',
  },
});
