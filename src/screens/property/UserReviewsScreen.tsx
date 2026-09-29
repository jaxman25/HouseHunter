import React, { useCallback, useEffect, useState } from 'react';
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
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useAdmin } from '../../hooks/useAdmin';
import { RootStackParamList, UserReview } from '../../types';
import EmptyState from '../../components/common/EmptyState';
import { getUserReviews, UserRatingSummary, getUserRating, deleteUserReview } from '../../services/userReviewService';

type Route = RouteProp<RootStackParamList, 'UserReviews'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Public list of peer reviews about a user (their reputation), with the
 * aggregate avg/count at the top. Reached from AgentProfileScreen and
 * profile surfaces.
 */
export default function UserReviewsScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { userId, userName } = route.params;
  const { isAdmin } = useAdmin();

  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [summary, setSummary] = useState<UserRatingSummary>({ averageRating: 0, totalReviews: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, rating] = await Promise.all([getUserReviews(userId, 50), getUserRating(userId)]);
      setReviews(list);
      setSummary(rating);
    } catch (error) {
      console.error('Error loading user reviews:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  const handleDelete = useCallback(
    (review: UserReview) => {
      Alert.alert(
        'Delete review',
        'Remove this review permanently? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void deleteUserReview(review.id)
                .then(() => void load())
                .catch(() => Alert.alert('Error', 'Failed to delete review'));
            },
          },
        ]
      );
    },
    [load]
  );

  // Initial load runs once per userId (load is stable per id). setTimeout(0)
  // keeps the setState calls out of the synchronous effect pass.
  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
  }, [load]);

  const renderItem = ({ item }: { item: UserReview }) => (
    <View style={[styles.reviewCard, { backgroundColor: colors.surface, borderRadius: radius.lg }, shadow.sm]}>
      <View style={styles.reviewHeader}>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((s) => (
            <MaterialCommunityIcons
              key={s}
              name={item.rating >= s ? 'star' : 'star-outline'}
              size={16}
              color={item.rating >= s ? colors.warning : colors.gray300}
            />
          ))}
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
      {item.text ? (
        <Text style={{ color: colors.text, fontSize: fontSize.sm, lineHeight: 20, marginTop: 6 }}>
          {item.text}
        </Text>
      ) : null}
      <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 8 }}>
        — {item.reviewerName || 'Anonymous'}
      </Text>
      {isAdmin && (
        <TouchableOpacity
          onPress={() => handleDelete(item)}
          style={[styles.adminDeleteBtn, { backgroundColor: colors.errorSurface, borderRadius: radius.sm }]}
          accessibilityRole="button"
          accessibilityLabel="Delete this review"
        >
          <MaterialCommunityIcons name="delete-outline" size={14} color={colors.errorText} />
          <Text style={{ color: colors.errorText, fontSize: fontSize.xs, fontWeight: '600', marginLeft: 4 }}>
            Delete (admin)
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

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
          {userName ? `${userName}'s Reviews` : 'Reputation'}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={reviews}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radius.xl }, shadow.sm]}>
            <Text style={{ color: colors.text, fontSize: fontSize.xxxl, fontWeight: '800' }}>
              {summary.totalReviews > 0 ? summary.averageRating.toFixed(1) : '—'}
            </Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((s) => (
                <MaterialCommunityIcons
                  key={s}
                  name={
                    summary.totalReviews > 0 && summary.averageRating >= s - 0.5 ? 'star' : 'star-outline'
                  }
                  size={18}
                  color={summary.totalReviews > 0 && summary.averageRating >= s - 0.5 ? colors.warning : colors.gray300}
                />
              ))}
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 }}>
              {summary.totalReviews} review{summary.totalReviews !== 1 ? 's' : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="star-outline"
              title="No reviews yet"
              description="Ratings appear after completed interactions"
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
  summaryCard: { alignItems: 'center', padding: 20, marginBottom: 16 },
  stars: { flexDirection: 'row', gap: 2 },
  reviewCard: { padding: 14, marginBottom: 12 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  adminDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 8,
  },
});
