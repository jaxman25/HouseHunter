import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import {
  RootStackParamList,
  NotificationPrefs,
  NotificationFrequency,
  DEFAULT_NOTIFICATION_PREFS,
  SavedSearch,
} from '../../types';
import { USERS_COLLECTION } from '../../utils/constants';
import {
  getSavedSearches,
  toggleSavedSearchActive,
} from '../../services/savedSearchService';
import EmptyState from '../../components/common/EmptyState';
import { showToast } from '../../utils/ui/toast';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Notification type metadata for the per-type toggles section. */
const NOTIFICATION_TYPES: {
  key: keyof NotificationPrefs;
  label: string;
  icon: string;
}[] = [
  { key: 'message', label: 'Messages', icon: 'message-text' },
  { key: 'inquiry', label: 'Inquiries', icon: 'email-search-outline' },
  { key: 'price_drop', label: 'Price Drops', icon: 'chart-line-variant' },
  { key: 'new_listing', label: 'New Listings', icon: 'home-plus' },
  { key: 'favorite', label: 'Favorites', icon: 'heart-outline' },
];

/** Frequency options for the per-search segmented control. */
const FREQUENCIES: { value: NotificationFrequency; label: string }[] = [
  { value: 'instant', label: 'Instant' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'off', label: 'Off' },
];

export default function NotificationPreferencesScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const uid = user?.uid;

  // ─── Local state ──────────────────────────────────────────────
  const [notificationsPaused, setNotificationsPaused] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [searchLoading, setSearchLoading] = useState(true);

  // Track the previous value for optimistic revert.
  const [prevPaused, setPrevPaused] = useState(false);
  const [prevPrefs, setPrevPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);

  // ─── Real-time subscription to user doc ───────────────────────
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, USERS_COLLECTION, uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const paused = data.notificationsPaused ?? false;
      const p = (data.notificationPrefs as NotificationPrefs | undefined) ?? DEFAULT_NOTIFICATION_PREFS;
      setPrevPaused(paused);
      setPrevPrefs(p);
      setNotificationsPaused(paused);
      setPrefs(p);
    });
    return unsub;
  }, [uid]);

  // ─── Load saved searches ──────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getSavedSearches(uid)
      .then((s) => { if (!cancelled) setSearches(s); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [uid]);

  // ─── Optimistic writes with revert ────────────────────────────
  const writeUserField = useCallback(
    async (field: string, value: unknown) => {
      if (!uid) return;
      await updateDoc(doc(db, USERS_COLLECTION, uid), {
        [field]: value,
        updatedAt: serverTimestamp(),
      });
    },
    [uid]
  );

  const handleTogglePause = useCallback(
    async (next: boolean) => {
      setPrevPaused(notificationsPaused);
      setNotificationsPaused(next);
      try {
        await writeUserField('notificationsPaused', next);
      } catch {
        setNotificationsPaused(prevPaused);
        showToast('Failed to update. Please try again.');
      }
    },
    [notificationsPaused, prevPaused, writeUserField]
  );

  const handleTogglePref = useCallback(
    async (key: keyof NotificationPrefs, next: boolean) => {
      if (key === 'system') return; // system is always true
      const updated = { ...prefs, [key]: next };
      setPrevPrefs(prefs);
      setPrefs(updated);
      try {
        await writeUserField('notificationPrefs', updated);
      } catch {
        setPrefs(prevPrefs);
        showToast('Failed to update. Please try again.');
      }
    },
    [prefs, prevPrefs, writeUserField]
  );

  const handleFrequencyChange = useCallback(
    async (searchId: string, frequency: NotificationFrequency) => {
      // Optimistic update: update local list immediately.
      setSearches((prev) =>
        prev.map((s) =>
          s.id === searchId ? { ...s, notificationFrequency: frequency } : s
        )
      );
      try {
        await updateDoc(doc(db, USERS_COLLECTION, uid!, 'savedSearches', searchId), {
          notificationFrequency: frequency,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Revert: refetch the correct value from Firestore.
        setSearches((prev) =>
          prev.map((s) =>
            s.id === searchId
              ? { ...s, notificationFrequency: searches.find((x) => x.id === searchId)?.notificationFrequency ?? frequency }
              : s
          )
        );
        showToast('Failed to update frequency. Please try again.');
      }
    },
    [uid, searches]
  );

  const handleToggleSearchActive = useCallback(
    async (searchId: string, isActive: boolean) => {
      setSearches((prev) =>
        prev.map((s) => (s.id === searchId ? { ...s, isActive } : s))
      );
      try {
        await toggleSavedSearchActive(uid!, searchId, isActive);
      } catch {
        setSearches((prev) =>
          prev.map((s) =>
            s.id === searchId
              ? { ...s, isActive: !isActive }
              : s
          )
        );
        showToast('Failed to update. Please try again.');
      }
    },
    [uid]
  );

  // ─── Derived state ────────────────────────────────────────────
  const isPaused = notificationsPaused;
  const sectionOpacity = isPaused ? 0.4 : 1;

  // ─── Render ───────────────────────────────────────────────────
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        { width: '100%', maxWidth: 720, alignSelf: 'center' },
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
          Notifications
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* ── Section 1: Global Pause ─────────────────────────── */}
        <View style={{ marginTop: spacing.lg }}>
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.textSecondary, fontSize: fontSize.xs, marginHorizontal: spacing.xl, marginBottom: spacing.sm },
            ]}
          >
            GLOBAL
          </Text>
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.surface, marginHorizontal: spacing.lg, borderRadius: radius.xl },
            ]}
          >
            <View style={styles.settingItem}>
              <View style={[styles.settingIcon, { backgroundColor: colors.warning + '12' }]}>
                <MaterialCommunityIcons name="bell-off-outline" size={20} color={colors.warning} />
              </View>
              <View style={styles.settingContent}>
                <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
                  Pause all notifications
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }}>
                  Temporarily stop all notifications
                </Text>
              </View>
              <Switch
                value={notificationsPaused}
                onValueChange={handleTogglePause}
                trackColor={{ false: colors.gray300, true: colors.primary + '40' }}
                thumbColor={notificationsPaused ? colors.primary : colors.gray400}
              />
            </View>
          </View>
        </View>

        {/* ── Section 2: Notification Types ────────────────────── */}
        <View style={{ marginTop: spacing.lg, opacity: sectionOpacity }}>
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.textSecondary, fontSize: fontSize.xs, marginHorizontal: spacing.xl, marginBottom: spacing.sm },
            ]}
          >
            NOTIFICATION TYPES
          </Text>
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.surface, marginHorizontal: spacing.lg, borderRadius: radius.xl },
            ]}
          >
            {NOTIFICATION_TYPES.map((item, index) => (
              <View
                key={item.key}
                style={[
                  styles.settingItem,
                  {
                    borderBottomWidth: index < NOTIFICATION_TYPES.length - 1 ? 0.5 : 0,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.settingIcon, { backgroundColor: colors.primary + '12' }]}>
                  <MaterialCommunityIcons name={item.icon as any} size={20} color={colors.primary} />
                </View>
                <View style={styles.settingContent}>
                  <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
                    {item.label}
                  </Text>
                </View>
                <Switch
                  value={prefs[item.key]}
                  onValueChange={(val) => void handleTogglePref(item.key, val)}
                  trackColor={{ false: colors.gray300, true: colors.primary + '40' }}
                  thumbColor={prefs[item.key] ? colors.primary : colors.gray400}
                  disabled={isPaused}
                />
              </View>
            ))}
            {/* System — always on */}
            <View style={[styles.settingItem, { borderBottomWidth: 0 }]}>
              <View style={[styles.settingIcon, { backgroundColor: colors.info + '12' }]}>
                <MaterialCommunityIcons name="information-outline" size={20} color={colors.info} />
              </View>
              <View style={styles.settingContent}>
                <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
                  System
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }}>
                  Always on
                </Text>
              </View>
              <Switch
                value={true}
                onValueChange={() => {}}
                trackColor={{ false: colors.gray300, true: colors.info + '40' }}
                thumbColor={colors.info}
                disabled
              />
            </View>
          </View>
        </View>

        {/* ── Section 3: Saved Searches ────────────────────────── */}
        <View style={{ marginTop: spacing.lg, opacity: sectionOpacity }}>
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.textSecondary, fontSize: fontSize.xs, marginHorizontal: spacing.xl, marginBottom: spacing.sm },
            ]}
          >
            SAVED SEARCHES
          </Text>
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.surface, marginHorizontal: spacing.lg, borderRadius: radius.xl },
            ]}
          >
            {searchLoading ? (
              <View style={{ padding: spacing.xl, alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>Loading…</Text>
              </View>
            ) : searches.length === 0 ? (
              <EmptyState
                icon="bookmark-multiple-outline"
                title="You have no saved searches"
                description="Save your search filters to get notified of new matches."
                actionLabel="Explore Listings"
                onAction={() =>
                  navigation.navigate('MainTabs', {
                    screen: 'ExploreTab',
                    params: undefined,
                  } as never)
                }
              />
            ) : (
              searches.map((search, index) => (
                <View
                  key={search.id}
                  style={[
                    styles.searchRow,
                    {
                      borderBottomWidth: index < searches.length - 1 ? 0.5 : 0,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  {/* Search name + isActive toggle */}
                  <View style={styles.searchHeader}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: fontSize.md,
                          fontWeight: '600',
                        }}
                        numberOfLines={1}
                      >
                        {search.name}
                      </Text>
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: fontSize.xs,
                          marginTop: 2,
                        }}
                        numberOfLines={1}
                      >
                        {search.matchCount} match{search.matchCount !== 1 ? 'es' : ''}
                      </Text>
                    </View>
                    <Switch
                      value={search.isActive}
                      onValueChange={(val) => void handleToggleSearchActive(search.id, val)}
                      trackColor={{ false: colors.gray300, true: colors.primary + '40' }}
                      thumbColor={search.isActive ? colors.primary : colors.gray400}
                      disabled={isPaused}
                    />
                  </View>

                  {/* Frequency segmented control */}
                  <View style={styles.frequencyRow}>
                    {FREQUENCIES.map((freq) => {
                      const selected = search.notificationFrequency === freq.value;
                      return (
                        <TouchableOpacity
                          key={freq.value}
                          style={[
                            styles.freqChip,
                            {
                              backgroundColor: selected ? colors.primary : colors.gray100,
                              borderRadius: radius.round,
                            },
                          ]}
                          onPress={() => void handleFrequencyChange(search.id, freq.value)}
                          disabled={isPaused}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Set ${search.name} frequency to ${freq.label}`}
                        >
                          <Text
                            style={{
                              color: selected ? colors.white : colors.text,
                              fontSize: fontSize.xs,
                              fontWeight: '600',
                            }}
                          >
                            {freq.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontWeight: '700' },
  sectionTitle: { fontWeight: '700', letterSpacing: 0.5 },
  sectionCard: { paddingVertical: 4 },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingContent: { flex: 1 },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  freqChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
