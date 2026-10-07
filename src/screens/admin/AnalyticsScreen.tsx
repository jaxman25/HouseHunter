import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import AdminGuard from '../../components/admin/AdminGuard';
import AdminLayout from '../../components/admin/AdminLayout';
import MetricCard from '../../components/admin/MetricCard';
import { getPlatformMetrics, PlatformMetrics } from '../../services/adminService';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { metricsDocIdFor } from '../../utils/monitoring/firestoreMetrics';

interface FsUsageRow {
  collection: string;
  reads: number;
  writes: number;
}

interface BarDatum {
  label: string;
  value: number;
  color: string;
}

export default function AnalyticsScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [statusBars, setStatusBars] = useState<BarDatum[]>([]);
  const [reportBars, setReportBars] = useState<BarDatum[]>([]);
  const [fsUsage, setFsUsage] = useState<FsUsageRow[] | null>(null);
  const [fsUsageError, setFsUsageError] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        // ONE read of the maintained `config/metrics` doc (kept up to date by
        // the platformMetrics Cloud Function triggers + nightly reconcile) —
        // replaces seven client-side `getCountFromServer` aggregations.
        const p = await getPlatformMetrics();
        setMetrics(p);
        setStatusBars([
          { label: 'Active', value: p.propertiesActive, color: colors.success },
          { label: 'Pending', value: p.propertiesPending, color: colors.warning },
          { label: 'Sold/Rented', value: p.propertiesSold, color: colors.error },
          { label: 'Inactive', value: p.propertiesInactive, color: colors.gray500 },
        ]);
        setReportBars([
          { label: 'Pending', value: p.reportsPending, color: colors.warning },
          { label: 'Dismissed', value: p.reportsDismissed, color: colors.gray500 },
          { label: 'Resolved', value: p.reportsResolved, color: colors.success },
        ]);
      } catch (error) {
        console.error('Analytics load failed:', error);
      }
    };
    void run();
  }, [colors]);

  useEffect(() => {
    // Firestore cost accounting (rules: admin-only read). Raw Firestore
    // access on purpose — the metrics doc must not count itself. Aggregates
    // the per-collection increments from the last 7 daily docs.
    const run = async () => {
      try {
        const dayIds = new Set(
          Array.from({ length: 7 }, (_, i) =>
            metricsDocIdFor(new Date(Date.now() - i * 24 * 60 * 60 * 1000))
          )
        );
        const snap = await getDocs(collection(db, 'metrics'));
        const reads: Record<string, number> = {};
        const writes: Record<string, number> = {};
        snap.forEach((d) => {
          if (!dayIds.has(d.id)) return;
          const r = (d.get('reads') ?? {}) as Record<string, unknown>;
          const w = (d.get('writes') ?? {}) as Record<string, unknown>;
          for (const [c, n] of Object.entries(r)) {
            if (typeof n === 'number') reads[c] = (reads[c] ?? 0) + n;
          }
          for (const [c, n] of Object.entries(w)) {
            if (typeof n === 'number') writes[c] = (writes[c] ?? 0) + n;
          }
        });
        const rows = [...new Set([...Object.keys(reads), ...Object.keys(writes)])]
          .map((c) => ({ collection: c, reads: reads[c] ?? 0, writes: writes[c] ?? 0 }))
          .sort((a, b) => b.reads + b.writes - (a.reads + a.writes));
        setFsUsage(rows);
      } catch {
        setFsUsageError(true);
      }
    };
    void run();
  }, []);

  return (
    <AdminGuard>
      <AdminLayout title="Analytics" active="analytics">
        {metrics ? (
          <View style={styles.metricRow}>
            <MetricCard icon="account-outline" label="Users" value={metrics.users} />
            <MetricCard icon="home-city-outline" label="Listings" value={metrics.properties} />
            <MetricCard icon="flag-outline" label="Open reports" value={metrics.reportsPending} />
          </View>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>Loading…</Text>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg, marginTop: spacing.xl }]}>
          Listings by status
        </Text>
        <View style={[styles.chartCard, { backgroundColor: colors.surface, borderRadius: radius.lg }, shadow.sm]}>
          {statusBars.map((bar) => (
            <BarRow key={bar.label} datum={bar} colors={colors} />
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg, marginTop: spacing.xl }]}>
          Reports by status
        </Text>
        <View style={[styles.chartCard, { backgroundColor: colors.surface, borderRadius: radius.lg }, shadow.sm]}>
          {reportBars.map((bar) => (
            <BarRow key={bar.label} datum={bar} colors={colors} />
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg, marginTop: spacing.xl }]}>
          Firestore usage (7d)
        </Text>
        <View style={[styles.chartCard, { backgroundColor: colors.surface, borderRadius: radius.lg }, shadow.sm]}>
          {fsUsage === null ? (
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
              {fsUsageError ? 'Metrics unavailable' : 'Loading…'}
            </Text>
          ) : fsUsage.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
              No metrics recorded yet — set EXPO_PUBLIC_METRICS_ENABLED=true to start accounting.
            </Text>
          ) : (
            <View>
              <View style={styles.usageRow}>
                <Text style={[styles.usageHead, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
                  Collection
                </Text>
                <Text style={[styles.usageNum, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
                  Reads
                </Text>
                <Text style={[styles.usageNum, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
                  Writes
                </Text>
              </View>
              {fsUsage.map((row) => (
                <View key={row.collection} style={styles.usageRow}>
                  <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '600', flex: 1 }}>
                    {row.collection}
                  </Text>
                  <Text style={[styles.usageNum, { color: colors.text, fontSize: fontSize.sm }]}>
                    {row.reads.toLocaleString()}
                  </Text>
                  <Text style={[styles.usageNum, { color: colors.text, fontSize: fontSize.sm }]}>
                    {row.writes.toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </AdminLayout>
    </AdminGuard>
  );
}

function BarRow({ datum, colors }: { datum: BarDatum; colors: any }) {
  return (
    <View style={styles.barRow}>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', width: 100 }}>
        {datum.label}
      </Text>
      <View style={[styles.barTrack, { backgroundColor: colors.gray100, borderRadius: 6 }]}>
        <View
          style={[
            styles.barFill,
            {
              backgroundColor: datum.color,
              borderRadius: 6,
              // flex distributes proportionally across sibling fills, so bar
              // widths are proportional to the counts.
              flex: datum.value + 1,
            },
          ]}
        />
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 12, width: 44, textAlign: 'right' }}>
        {datum.value.toLocaleString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sectionTitle: {
    fontWeight: '800',
    marginBottom: 12,
  },
  chartCard: {
    padding: 16,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  barTrack: {
    flex: 1,
    height: 10,
    marginHorizontal: 10,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    alignSelf: 'flex-start',
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  usageHead: {
    flex: 1,
    fontWeight: '700',
  },
  usageNum: {
    width: 72,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});