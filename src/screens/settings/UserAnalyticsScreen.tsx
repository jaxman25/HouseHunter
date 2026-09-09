import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';
import { useAuthContext } from '../../context/AuthContext';
import { useUserAnalytics } from '../../hooks/useAnalytics';
import MetricCard from '../../components/analytics/MetricCard';
import SellerMetrics from '../../components/analytics/SellerMetrics';
import ActivityChart from '../../components/analytics/ActivityChart';
import DataExportModal from '../../components/analytics/DataExportModal';

export default function UserAnalyticsScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuthContext();
  const insets = useSafeAreaInsets();

  const { analytics, loading } = useUserAnalytics(user?.uid || '');
  const [showExportModal, setShowExportModal] = useState(false);

  if (loading || !analytics) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.gray500 }}>Loading analytics...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.gray100 }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          My Analytics
        </Text>
        <TouchableOpacity onPress={() => setShowExportModal(true)}>
          <MaterialCommunityIcons name="download" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary Cards */}
        <View style={styles.metricsGrid}>
          <MetricCard title="Listings" value={analytics.totalListings} icon="home" color={colors.primary} />
          <MetricCard title="Favorites" value={analytics.totalFavorites} icon="heart" color={colors.error} />
          <MetricCard title="Messages" value={analytics.totalMessages} icon="message-text" color={colors.info} />
          <MetricCard title="Tours" value={analytics.totalTours} icon="calendar" color={colors.success} />
        </View>

        {/* Seller Metrics */}
        {analytics.totalViews !== undefined && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
              Seller Performance
            </Text>
            <SellerMetrics
              totalViews={analytics.totalViews}
              totalInquiries={analytics.totalInquiries || 0}
              conversionRate={analytics.conversionRate || 0}
              averageResponseTime={analytics.averageResponseTime}
            />
          </View>
        )}

        {/* Activity Chart */}
        <View style={styles.section}>
          <ActivityChart data={analytics.dailyActivity} title="Daily Activity (Last 7 Days)" />
        </View>

        {/* Achievements */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
            Achievements
          </Text>
          <View style={styles.achievementsGrid}>
            {analytics.achievements.map((achievement) => {
              const unlocked = !!achievement.unlockedAt;
              return (
                <View
                  key={achievement.id}
                  style={[
                    styles.achievementCard,
                    {
                      backgroundColor: unlocked ? colors.primaryLight : colors.gray100,
                      borderRadius: 12,
                      opacity: unlocked ? 1 : 0.5,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={achievement.icon as any}
                    size={28}
                    color={unlocked ? colors.primary : colors.gray400}
                  />
                  <Text
                    style={[
                      styles.achievementTitle,
                      { color: unlocked ? colors.text : colors.gray500, fontSize: fontSize.xs, fontWeight: '600' },
                    ]}
                  >
                    {achievement.title}
                  </Text>
                  <Text
                    style={[
                      styles.achievementDesc,
                      { color: colors.textLight, fontSize: 10 },
                    ]}
                    numberOfLines={2}
                  >
                    {achievement.description}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Data Export Button */}
        <TouchableOpacity
          onPress={() => setShowExportModal(true)}
          style={[styles.exportBtn, { backgroundColor: colors.gray100, borderRadius: 12 }]}
        >
          <MaterialCommunityIcons name="download" size={20} color={colors.primary} />
          <Text style={[styles.exportBtnText, { color: colors.primary, fontSize: fontSize.md }]}>
            Request Data Export (GDPR)
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <DataExportModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        onRequestSubmitted={() => setShowExportModal(false)}
      />
    </View>
  );
}

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
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  metricsGrid: { gap: 10 },
  section: { marginTop: 24 },
  sectionTitle: { fontWeight: '700', marginBottom: 12 },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  achievementCard: {
    width: '30%',
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  achievementTitle: { textAlign: 'center' },
  achievementDesc: { textAlign: 'center', lineHeight: 14 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    marginTop: 24,
  },
  exportBtnText: { fontWeight: '600' },
});
