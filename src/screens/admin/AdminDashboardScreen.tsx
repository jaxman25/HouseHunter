import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList } from '../../types';
import AdminGuard from '../../components/admin/AdminGuard';
import AdminLayout from '../../components/admin/AdminLayout';
import MetricCard from '../../components/admin/MetricCard';
import { getAdminMetrics, AdminMetrics } from '../../services/adminService';

const QUICK_ACTIONS: { icon: string; label: string; description: string; route: keyof RootStackParamList }[] = [
  { icon: 'account-group-outline', label: 'Users', description: 'Search, suspend, and manage accounts', route: 'AdminUsers' },
  { icon: 'flag-outline', label: 'Reports', description: 'Triage reported listings and users', route: 'AdminReports' },
  { icon: 'chart-bar', label: 'Analytics', description: 'Platform metrics and trends', route: 'AdminAnalytics' },
  { icon: 'bullhorn-outline', label: 'Announcements', description: 'Publish in-app notices', route: 'AdminSettings' },
];

export default function AdminDashboardScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        setMetrics(await getAdminMetrics());
      } catch (error) {
        console.error('Admin metrics failed:', error);
      }
    };
    void run();
  }, []);

  return (
    <AdminGuard>
      <AdminLayout title="Admin Dashboard" active="dashboard">
        {metrics ? (
          <View style={styles.metricRow}>
            <MetricCard icon="account-outline" label="Users" value={metrics.userCount} />
            <MetricCard icon="home-city-outline" label="Listings" value={metrics.propertyCount} />
            <MetricCard icon="home-check-outline" label="Active" value={metrics.activeListingCount} />
            <MetricCard icon="flag-outline" label="Pending reports" value={metrics.pendingReports} />
          </View>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
            Loading metrics…
          </Text>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg, marginTop: spacing.xl }]}>
          Moderation
        </Text>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.label}
            onPress={() => {
              // All admin routes take no params; union-dispatch via `never`.
              navigation.navigate(action.route as never);
            }}
            style={[
              styles.actionRow,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.lg,
                borderColor: colors.border,
              },
              shadow.sm,
            ]}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.primaryLight, borderRadius: radius.round }]}>
              <MaterialCommunityIcons name={action.icon as any} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '700' }}>
                {action.label}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }}>
                {action.description}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.gray400} />
          </TouchableOpacity>
        ))}

        <Text style={[styles.footnote, { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: spacing.lg }]}>
          Acting as {user?.email}. All moderation actions are written to the audit log.
        </Text>
      </AdminLayout>
    </AdminGuard>
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  actionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footnote: {
    lineHeight: 16,
  },
});