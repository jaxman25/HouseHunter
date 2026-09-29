import React, { useCallback, useState } from 'react';
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
import {
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../../services/notificationService';
import { useAuthContext } from '../../context/AuthContext';
import { getTimeAgo } from '../../utils/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Per-type icon + tint for the list rows. */
const TYPE_META: Record<AppNotification['type'], { icon: string; tint: 'primary' | 'warning' | 'error' | 'info' | 'success' }> = {
  message: { icon: 'message-outline', tint: 'primary' },
  inquiry: { icon: 'email-outline', tint: 'info' },
  price_drop: { icon: 'trending-down', tint: 'success' },
  new_listing: { icon: 'home-plus-outline', tint: 'primary' },
  favorite: { icon: 'heart-outline', tint: 'error' },
  system: { icon: 'bell-outline', tint: 'warning' },
};

/**
 * In-app notification list (companion to push delivery).
 *
 * Cloud Functions write notification docs (tour prompts, review prompts,
 * price drops, saved-search matches…); this screen makes them visible in-app
 * — with or without a push token. Rows tint unread; tapping marks read and
 * routes via the same data payload the push-tap router uses
 * (AppNavigator.handleNotificationTap semantics: data.type + ids).
 */
export default function NotificationsScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAll = () => {
    if (unreadCount === 0) return;
    void markAllNotificationsAsRead(notifications).catch(() =>
      Alert.alert('Error', 'Could not mark notifications as read')
    );
  };

  const handlePress = (notification: AppNotification) => {
    if (!notification.read) {
      void markNotificationAsRead(notification.id).catch(() => {});
    }
    routeNotification(notification);
  };

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

  const renderItem = ({ item }: { item: AppNotification }) => {
    const meta = TYPE_META[item.type] ?? TYPE_META.system;
    const tint = colors[meta.tint] ?? colors.primary;
    return (
      <TouchableOpacity
        onPress={() => handlePress(item)}
        style={[
          styles.row,
          {
            backgroundColor: item.read ? colors.surface : colors.primaryLight,
            borderRadius: radius.lg,
            borderColor: colors.border,
          },
          shadow.sm,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}`}
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
                fontWeight: item.read ? '600' : '800',
                flex: 1,
              }}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {!item.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={3}>
            {item.body}
          </Text>
          <Text style={{ color: colors.textLight, fontSize: fontSize.xs, marginTop: 4 }}>
            {getTimeAgo(item.createdAt)}
          </Text>
        </View>
      </TouchableOpacity>
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

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60, gap: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => setRefreshing(true)}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="bell-off-outline"
              title="No notifications"
              description="Tour updates, review prompts, and price alerts will appear here"
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
});
