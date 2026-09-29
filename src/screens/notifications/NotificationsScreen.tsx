import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList, AppNotification } from '../../types';
import EmptyState from '../../components/common/EmptyState';
import SwipeableNotificationRow from '../../components/notifications/SwipeableNotificationRow';
import {
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  restoreNotification,
} from '../../services/notificationService';
import {
  readNotificationFilter,
  writeNotificationFilter,
} from '../../services/notificationPrefsService';
import { useAuthContext } from '../../context/AuthContext';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { NOTIFICATIONS_COLLECTION } from '../../utils/constants';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { getTimeAgo } from '../../utils/helpers';
import { showToast } from '../../utils/ui/toast';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Per-type icon + tint + label for rows and filter chips. */
const TYPE_META: Record<
  AppNotification['type'],
  { icon: string; tint: 'primary' | 'warning' | 'error' | 'info' | 'success'; label: string }
> = {
  message: { icon: 'message-outline', tint: 'primary', label: 'Messages' },
  inquiry: { icon: 'email-outline', tint: 'info', label: 'Inquiries' },
  price_drop: { icon: 'trending-down', tint: 'success', label: 'Price drops' },
  new_listing: { icon: 'home-plus-outline', tint: 'primary', label: 'New listings' },
  favorite: { icon: 'heart-outline', tint: 'error', label: 'Favorites' },
  system: { icon: 'bell-outline', tint: 'warning', label: 'System' },
};

/** Filter chip values — 'all' first, then the app's notification types. */
type FilterKey = 'all' | AppNotification['type'];
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'message', label: 'Messages' },
  { key: 'inquiry', label: 'Inquiries' },
  { key: 'price_drop', label: 'Price drops' },
  { key: 'new_listing', label: 'New listings' },
  { key: 'favorite', label: 'Favorites' },
  { key: 'system', label: 'System' },
];

/**
 * Bucket a notification into a date-group header. Only four buckets — older
 * items collapse into "Earlier" so the list never grows unbounded headers.
 * Timestamps may be ISO strings (client) or Firestore Timestamp objects
 * (fresh server writes) — both are handled.
 */
function toDateGroup(createdAt: AppNotification['createdAt']): 'Today' | 'Yesterday' | 'This week' | 'Earlier' {
  const ms =
    typeof createdAt === 'string'
      ? new Date(createdAt).getTime()
      : typeof (createdAt as { toMillis?: () => number })?.toMillis === 'function'
        ? (createdAt as { toMillis: () => number }).toMillis()
        : NaN;

  if (!Number.isFinite(ms)) return 'Earlier';
  const d = new Date(ms);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const t = d.getTime();

  if (t >= startOfToday.getTime()) return 'Today';
  if (t >= startOfToday.getTime() - dayMs) return 'Yesterday';
  if (t >= startOfToday.getTime() - 7 * dayMs) return 'This week';
  return 'Earlier';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier'] as const;

/**
 * In-app notification list (companion to push delivery).
 *
 * Cloud Functions write notification docs (tour prompts, review prompts,
 * price drops, saved-search matches…); this screen makes them visible in-app
 * — with or without a push token. Rows tint unread; tapping marks read and
 * routes via the same data payload the push-tap router uses
 * (AppNavigator.handleNotificationTap semantics: data.type + ids).
 *
 * Organization: per-type filter chips (unread count per type on the chip) and
 * date-grouped sections (Today / Yesterday / This week / Earlier) within the
 * filtered list.
 */
export default function NotificationsScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  // Restore the last-selected chip once per mount (per-device preference).
  // Guarded against stale/unknown values by the FILTERS membership check.
  useEffect(() => {
    let ignore = false;
    readNotificationFilter()
      .then((saved) => {
        if (!ignore && FILTERS.some((f) => f.key === saved)) {
          setFilter(saved as FilterKey);
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const changeFilter = useCallback((next: FilterKey) => {
    setFilter(next);
    void writeNotificationFilter(next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setNotifications([]);
        setLoading(false);
        return;
      }
      // Live subscription keeps the list + unread states fresh while the
      // screen is focused; unsubscribes on blur.
      const unsubscribe = subscribeToNotifications(user.uid, (items) => {
        setNotifications(items);
        setLoading(false);
        setRefreshing(false);
      });
      return unsubscribe;
    }, [user])
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  /** Unread count per type — powers the chips so filters show value upfront. */
  const unreadByType = useMemo(() => {
    const map = {} as Record<AppNotification['type'], number>;
    for (const n of notifications) {
      if (!n.read) map[n.type] = (map[n.type] ?? 0) + 1;
    }
    return map;
  }, [notifications]);

  /**
   * Filtered + date-grouped rows. The FlatList data is a mixed array of
   * group headers and notification rows; `type` discriminates them.
   */
  const listData = useMemo(() => {
    const filtered =
      filter === 'all' ? notifications : notifications.filter((n) => n.type === filter);

    const buckets = new Map<string, AppNotification[]>();
    for (const n of filtered) {
      const group = toDateGroup(n.createdAt);
      const list = buckets.get(group) ?? [];
      list.push(n);
      buckets.set(group, list);
    }

    type Row =
      | { kind: 'header'; key: string; label: string; count: number }
      | { kind: 'item'; key: string; item: AppNotification };

    const rows: Row[] = [];
    for (const group of GROUP_ORDER) {
      const items = buckets.get(group);
      if (!items || items.length === 0) continue;
      rows.push({ kind: 'header', key: `h-${group}`, label: group, count: items.length });
      for (const item of items) {
        rows.push({ kind: 'item', key: item.id, item });
      }
    }
    return rows;
  }, [notifications, filter]);

  const handleMarkAll = () => {
    if (unreadCount === 0) return;
    // Scope "mark all read" to the active filter so the user can triage one
    // type at a time (e.g. clear all price drops without touching messages).
    const targets = filter === 'all' ? notifications : notifications.filter((n) => n.type === filter);
    void markAllNotificationsAsRead(targets).catch(() =>
      Alert.alert('Error', 'Could not mark notifications as read')
    );
  };

  /** Toggle one row's read state (right-swipe action); optimistic update. */
  const handleToggleRead = useCallback((notification: AppNotification) => {
    const next = !notification.read;
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, read: next } : n))
    );
    markNotificationAsRead(notification.id)
      .then(() => {
        if (!next) {
          // markNotificationAsRead only writes `read: true`; for unread we
          // must clear the flag explicitly.
          return updateDoc(doc(db, NOTIFICATIONS_COLLECTION, notification.id), {
            read: false,
          });
        }
        return undefined;
      })
      .catch(() => {
        // Revert on failure.
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, read: notification.read } : n
          )
        );
        showToast('Could not update notification');
      });
  }, []);

  const handlePress = (notification: AppNotification) => {
    if (!notification.read) {
      void markNotificationAsRead(notification.id).catch(() => {});
    }
    routeNotification(notification);
  };

  /**
   * Swipe-to-dismiss: delete optimistically (the live subscription would
   * otherwise re-add the row), then offer a 6s undo window. Undo recreates
   * the doc server-side with the original fields; the live subscription
   * re-inserts it (new id, same content) when the write lands.
   */
  const handleDismiss = useCallback((notification: AppNotification) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    deleteNotification(notification.id).catch(() => {
      showToast('Could not delete notification');
    });
    showToast('Notification deleted', {
      label: 'Undo',
      onPress: () => {
        restoreNotification(notification).catch(() =>
          showToast('Could not restore notification')
        );
      },
    });
  }, []);

  /**
   * Mirrors AppNavigator's push-tap routing so in-app taps behave the same.
   * Kept local (rather than shared) because the navigator version also
   * handles queued cold-start taps and marking push copies read.
   */
  const routeNotification = (notification: AppNotification) => {
    const data = notification.data ?? {};
    switch (data.type) {
      case 'user_review': {
        if (data.revieweeId) {
          navigation.navigate('WriteUserReview', {
            revieweeId: data.revieweeId,
            revieweeName: data.revieweeName,
            tourId: data.tourId,
            propertyId: data.propertyId,
          });
          return;
        }
        break;
      }
      case 'new_listing': {
        if (data.savedSearchId) {
          navigation.navigate('SavedSearches', { savedSearchId: data.savedSearchId });
          return;
        }
        break;
      }
      case 'price_drop':
      case 'favorite': {
        if (data.propertyId) {
          navigation.navigate('PropertyDetail', { propertyId: data.propertyId });
          return;
        }
        break;
      }
      case 'message':
        navigation.navigate('Conversations');
        return;
      default:
        break;
    }
    // No specific destination — Tours/tour prompts are the common system case.
    if (data.type === 'tour' || data.tourId) {
      navigation.navigate('Tours');
      return;
    }
    navigation.navigate('MainTabs');
  };

  /** Revealed by the pull-to-mark-all strip (left actions of the Swipeable). */
  const renderPullActions = () => (
    <RectButton
      style={[styles.pullActionFill, { backgroundColor: colors.success, borderRadius: radius.md }]}
      onPress={handleMarkAll}
      accessibilityRole="button"
      accessibilityLabel="Mark all as read"
    >
      <MaterialCommunityIcons name="check-all" size={18} color={colors.white} />
    </RectButton>
  );

  const renderItem = ({ item }: { item: (typeof listData)[number] }) => {
    if (item.kind === 'header') {
      return (
        <View style={styles.groupHeader}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700' }}>
            {item.label}
          </Text>
          <View style={[styles.groupCountWrap, { backgroundColor: colors.gray100, borderRadius: radius.round }]}>
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600' }}>
              {item.count}
            </Text>
          </View>
        </View>
      );
    }

    const notification = item.item;
    const meta = TYPE_META[notification.type] ?? TYPE_META.system;
    const tint = colors[meta.tint] ?? colors.primary;
    return (
      <SwipeableNotificationRow
        onDismiss={() => handleDismiss(notification)}
        onToggleRead={() => handleToggleRead(notification)}
        isRead={notification.read}
      >
        <TouchableOpacity
          onPress={() => handlePress(notification)}
          style={[
            styles.row,
            {
              backgroundColor: notification.read ? colors.surface : colors.primaryLight,
              borderRadius: radius.lg,
              borderColor: colors.border,
            },
            shadow.sm,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${notification.title}. ${notification.body}`}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.surface, borderRadius: radius.round }]}>
            <MaterialCommunityIcons name={meta.icon as any} size={20} color={tint} />
          </View>
          <View style={styles.content}>
            <View style={styles.titleRow}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fontSize.sm,
                  fontWeight: notification.read ? '600' : '800',
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {notification.title}
              </Text>
              {!notification.read && (
                <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
              )}
            </View>
            <Text
              style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }}
              numberOfLines={3}
            >
              {notification.body}
            </Text>
            <Text style={{ color: colors.textLight, fontSize: fontSize.xs, marginTop: 4 }}>
              {getTimeAgo(notification.createdAt)}
            </Text>
          </View>
        </TouchableOpacity>
      </SwipeableNotificationRow>
    );
  };

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
          Notifications
        </Text>
        <TouchableOpacity
          onPress={handleMarkAll}
          disabled={unreadCount === 0}
          style={[styles.markAllBtn, { backgroundColor: colors.gray100, borderRadius: radius.round }]}
          accessibilityRole="button"
          accessibilityLabel="Mark all as read"
        >
          <Text
            style={{
              color: unreadCount > 0 ? colors.primary : colors.gray400,
              fontSize: fontSize.xs,
              fontWeight: '600',
            }}
          >
            Mark all read
          </Text>
        </TouchableOpacity>
      </View>

      {/* Per-type filter chips (unread count per type on the chip) */}
      <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={(f) => f.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}
          renderItem={({ item: f }) => {
            const active = filter === f.key;
            const typeUnread =
              f.key !== 'all' ? unreadByType[f.key as AppNotification['type']] ?? 0 : 0;
            return (
              <TouchableOpacity
                onPress={() => changeFilter(f.key)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.gray100,
                    borderRadius: radius.round,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter notifications: ${f.label}`}
              >
                <Text
                  style={{
                    color: active ? colors.white : colors.text,
                    fontSize: fontSize.xs,
                    fontWeight: '600',
                  }}
                >
                  {f.label}
                </Text>
                {typeUnread > 0 && (
                  <View
                    style={[
                      styles.chipBadge,
                      {
                        backgroundColor: active ? colors.white : colors.primary,
                        borderRadius: radius.round,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? colors.primary : colors.white,
                        fontSize: 9,
                        fontWeight: '800',
                      }}
                    >
                      {typeUnread}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60, gap: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => setRefreshing(true)}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          unreadCount > 0 ? (
            // Pull-to-mark-all: drag the strip down past ~56px (or tap it) to
            // mark everything in the current filter as read.
            <View style={styles.pullWrap}>
              <Swipeable
                renderLeftActions={renderPullActions}
                leftThreshold={56}
                overshootLeft={false}
                friction={3}
                onSwipeableOpen={(direction) => {
                  if (direction === 'left') handleMarkAll();
                }}
              >
                <TouchableOpacity
                  onPress={handleMarkAll}
                  activeOpacity={0.7}
                  style={[
                    styles.pullStrip,
                    {
                      backgroundColor: colors.primaryLight,
                      borderRadius: radius.md,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark all ${filter === 'all' ? '' : TYPE_META[filter as AppNotification['type']]?.label.toLowerCase() + ' '}notifications as read`}
                >
                  <MaterialCommunityIcons
                    name="check-all"
                    size={16}
                    color={colors.primary}
                  />
                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: fontSize.xs,
                      fontWeight: '700',
                      marginLeft: 6,
                    }}
                  >
                    Pull down or tap to mark {unreadCount} as read
                  </Text>
                </TouchableOpacity>
              </Swipeable>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="bell-off-outline"
              title={filter === 'all' ? 'No notifications' : `No ${TYPE_META[filter as AppNotification['type']]?.label.toLowerCase() ?? 'notifications'}`}
              description={
                filter === 'all'
                  ? 'Tour updates, review prompts, and price alerts will appear here'
                  : 'New items in this category will appear here'
              }
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontWeight: '700', textAlign: 'center' },
  markAllBtn: { paddingHorizontal: 10, paddingVertical: 5 },
  filterBar: {
    borderBottomWidth: 0.5,
    paddingVertical: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    gap: 6,
  },
  chipBadge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  groupCountWrap: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  row: {
    flexDirection: 'row',
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pullWrap: {
    marginBottom: 4,
  },
  pullStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  pullActionFill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 0,
  },
});
