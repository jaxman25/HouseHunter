import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';

const NAV_ITEMS: { key: string; label: string; icon: string; route: keyof RootStackParamList }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'view-dashboard-outline', route: 'AdminDashboard' },
  { key: 'users', label: 'Users', icon: 'account-group-outline', route: 'AdminUsers' },
  { key: 'reports', label: 'Reports', icon: 'flag-outline', route: 'AdminReports' },
  { key: 'analytics', label: 'Analytics', icon: 'chart-bar', route: 'AdminAnalytics' },
  { key: 'settings', label: 'Settings', icon: 'cog-outline', route: 'AdminSettings' },
];

/**
 * Shared header + section nav for the admin suite (works on phone and web —
 * the tab row scrolls horizontally when it doesn't fit).
 */
export default function AdminLayout({
  title,
  active,
  children,
}: {
  title: string;
  active: string;
  children: React.ReactNode;
}) {
  const { colors, fontSize, spacing } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

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
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          {title}
        </Text>
        <MaterialCommunityIcons name="shield-check" size={20} color={colors.primary} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={[styles.navRow, { paddingHorizontal: spacing.md }]}
      >
        {NAV_ITEMS.map((item) => {
          const selected = item.key === active;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => {
                // All admin routes take no params; cast the union through
                // `never` to satisfy navigate's overload dispatch.
                navigation.navigate(item.route as never);
              }}
              style={[
                styles.navChip,
                {
                  backgroundColor: selected ? colors.primary : colors.gray100,
                  borderRadius: 8,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <MaterialCommunityIcons
                name={item.icon as any}
                size={15}
                color={selected ? colors.white : colors.textSecondary}
              />
              <Text
                style={{
                  color: selected ? colors.white : colors.textSecondary,
                  fontSize: fontSize.xs,
                  fontWeight: '600',
                  marginLeft: 6,
                }}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
      >
        {children}
      </ScrollView>
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
  navRow: { flexDirection: 'row', gap: 8, paddingVertical: 10 },
  navChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
});