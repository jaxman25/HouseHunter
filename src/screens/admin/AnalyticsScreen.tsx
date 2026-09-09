import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import AdminGuard from '../../components/admin/AdminGuard';
import AdminLayout from '../../components/admin/AdminLayout';
import MetricCard from '../../components/admin/MetricCard';
import { getAdminMetrics, AdminMetrics } from '../../services/adminService';
import { getCountFromServer, collection, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { PROPERTIES_COLLECTION, ADMIN_REPORTS_COLLECTION } from '../../utils/constants';

interface BarDatum {
  label: string;
  value: number;
  color: string;
}

export default function AnalyticsScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [statusBars, setStatusBars] = useState<BarDatum[]>([]);
  const [reportBars, setReportBars] = useState<BarDatum[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        const [m, active, pending, sold, inactive, repPending, repDismissed, repResolved] = await Promise.all([
          getAdminMetrics(),
          getCountFromServer(query(collection(db, PROPERTIES_COLLECTION), where('status', '==', 'active'))),
          getCountFromServer(query(collection(db, PROPERTIES_COLLECTION), where('status', '==', 'pending'))),
          getCountFromServer(query(collection(db, PROPERTIES_COLLECTION), where('status', 'in', ['sold', 'rented']))),
          getCountFromServer(query(collection(db, PROPERTIES_COLLECTION), where('status', '==', 'inactive'))),
          getCountFromServer(query(collection(db, ADMIN_REPORTS_COLLECTION), where('status', '==', 'pending'))),
          getCountFromServer(query(collection(db, ADMIN_REPORTS_COLLECTION), where('status', '==', 'dismissed'))),
          getCountFromServer(query(collection(db, ADMIN_REPORTS_COLLECTION), where('status', '==', 'resolved'))),
        ]);
        setMetrics(m);
        setStatusBars([
          { label: 'Active', value: active.data().count, color: colors.success },
          { label: 'Pending', value: pending.data().count, color: colors.warning },
          { label: 'Sold/Rented', value: sold.data().count, color: colors.error },
          { label: 'Inactive', value: inactive.data().count, color: colors.gray500 },
        ]);
        setReportBars([
          { label: 'Pending', value: repPending.data().count, color: colors.warning },
          { label: 'Dismissed', value: repDismissed.data().count, color: colors.gray500 },
          { label: 'Resolved', value: repResolved.data().count, color: colors.success },
        ]);
      } catch (error) {
        console.error('Analytics load failed:', error);
      }
    };
    void run();
  }, [colors]);

  return (
    <AdminGuard>
      <AdminLayout title="Analytics" active="analytics">
        {metrics ? (
          <View style={styles.metricRow}>
            <MetricCard icon="account-outline" label="Users" value={metrics.userCount} />
            <MetricCard icon="home-city-outline" label="Listings" value={metrics.propertyCount} />
            <MetricCard icon="flag-outline" label="Open reports" value={metrics.pendingReports} />
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
});