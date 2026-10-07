import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList, Property, User } from '../../types';
import Avatar from '../../components/common/Avatar';
import PropertyCard from '../../components/property/PropertyCard';
import PropertyCardSkeleton from '../../components/common/PropertyCardSkeleton';
import VerificationBadge from '../../components/reviews/VerificationBadge';
import Skeleton from '../../components/common/Skeleton';
import { getUserProfileCached } from '../../services/authService';
import { getUserProperties } from '../../services/propertyService';
import { getUserRatingCached, UserRatingSummary } from '../../services/userReviewService';
import { useResponsive } from '../../hooks/useResponsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'AgentProfile'>;

/** Rating fields are maintained by the updateRatings Cloud Function (not on the User type). */
type AgentUser = User & { averageRating?: number; totalReviews?: number };

export default function AgentProfileScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const agentId = route.params.agentId;

  const [agent, setAgent] = useState<AgentUser | null>(null);
  const [listings, setListings] = useState<Property[]>([]);
  const [rating, setRating] = useState<UserRatingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const [profile, properties, peerRating] = await Promise.all([
        // Cached reads (profile 15 min, rating 5 min, user-tagged) — repeat
        // mounts within the windows issue zero Firestore reads.
        getUserProfileCached(agentId),
        getUserProperties(agentId).catch(() => [] as Property[]),
        getUserRatingCached(agentId).catch(() => null),
      ]);
      if (!profile) {
        setNotFound(true);
      } else {
        setAgent(profile as AgentUser);
        // Public profile shows the agent's active book only.
        setListings(properties.filter((p) => p.status === 'active' && !p.archived));
        setRating(peerRating);
      }
    } catch (error) {
      console.warn('Failed to load agent profile:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Response-time badge: average across listings the sellerResponseTracking
  // Cloud Function has stats for; gated on enough conversations to be meaningful.
  const withStats = listings.filter(
    (p) => p.avgResponseMinutes != null && p.conversationCount != null
  );
  const totalConversations = withStats.reduce((sum, p) => sum + (p.conversationCount ?? 0), 0);
  const avgResponse =
    withStats.length > 0
      ? Math.round(
          withStats.reduce((sum, p) => sum + (p.avgResponseMinutes ?? 0), 0) / withStats.length
        )
      : null;
  const verifiedListingCount = listings.filter((p) => p.verified).length;

  const gridCols = responsive.gridColumns();
  const cellWidth = responsive.gridCellWidth(gridCols);

  const renderHeader = () => (
    <>
      {/* Identity card */}
      <View
        style={[
          styles.identityCard,
          { backgroundColor: colors.surface, borderRadius: radius.xl },
          shadow.sm,
        ]}
      >
        <Avatar uri={agent?.photoURL} name={agent?.displayName || 'Agent'} size={84} />
        <View style={styles.identityInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.text, fontSize: fontSize.xl }]} numberOfLines={1}>
              {agent?.displayName || 'Agent'}
            </Text>
            {agent?.verified ? <VerificationBadge verified label="Verified" /> : null}
          </View>
          <View style={[styles.roleBadge, { backgroundColor: colors.primaryLight, borderRadius: radius.round }]}>
            <MaterialCommunityIcons name="badge-account-outline" size={13} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: fontSize.xs, fontWeight: '700', marginLeft: 4 }}>
              Real Estate Agent
            </Text>
          </View>
          {agent?.bio ? (
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.sm, lineHeight: 20 }}>
              {agent.bio}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Stats row */}
      <View
        style={[
          styles.statsRow,
          { backgroundColor: colors.surface, borderRadius: radius.xl },
          shadow.sm,
        ]}
      >
        <Stat
          label="Active listings"
          value={String(listings.length)}
          colors={colors}
          fontSize={fontSize}
        />
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <Stat
          label="Responds in"
          value={avgResponse != null && totalConversations >= 3 ? `~${Math.max(1, Math.round(avgResponse / 60))}h` : '—'}
          colors={colors}
          fontSize={fontSize}
        />
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <TouchableOpacity
          style={styles.statWrap}
          onPress={() => navigation.navigate('UserReviews', { userId: agentId, userName: agent?.displayName })}
          disabled={!rating?.totalReviews}
          accessibilityRole="button"
          accessibilityLabel="View peer reviews"
        >
          <Stat
            label="Rating"
            value={
              rating?.totalReviews
                ? `★ ${(rating.averageRating ?? 0).toFixed(1)}`
                : agent?.totalReviews && agent.totalReviews > 0
                  ? `★ ${(agent.averageRating ?? 0).toFixed(1)}`
                  : '—'
            }
            colors={colors}
            fontSize={fontSize}
          />
        </TouchableOpacity>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <Stat
          label="Verified"
          value={String(verifiedListingCount)}
          colors={colors}
          fontSize={fontSize}
        />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg, paddingHorizontal: spacing.xl, marginTop: spacing.xl }]}>
        Active Listings
      </Text>
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Agent Profile
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={{ padding: spacing.xl, gap: spacing.md }}>
          <Skeleton width="100%" height={140} radius={radius.xl} />
          <Skeleton width="100%" height={80} radius={radius.xl} />
          <View style={styles.skeletonGrid}>
            {[0, 1].map((i) => (
              <PropertyCardSkeleton key={i} width={cellWidth} imageHeight={120} />
            ))}
          </View>
        </View>
      ) : notFound || !agent ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="account-question-outline" size={48} color={colors.gray300} />
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.md, marginTop: 12 }}>
            Agent not found
          </Text>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          numColumns={gridCols}
          columnWrapperStyle={gridCols > 1 ? { gap: spacing.md, paddingHorizontal: spacing.xl } : undefined}
          contentContainerStyle={{ paddingBottom: 60 }}
          ListHeaderComponent={renderHeader}
          renderItem={({ item }) => (
            <PropertyCard
              property={item}
              onPress={() => navigation.navigate('PropertyDetail', { propertyId: item.id })}
              variant="grid"
              style={[{ width: cellWidth }, gridCols === 1 && { marginHorizontal: spacing.xl, marginBottom: spacing.md }]}
            />
          )}
          ListEmptyComponent={
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: 24 }}>
              No active listings right now
            </Text>
          }
        />
      )}
    </View>
  );
}

function Stat({
  label,
  value,
  colors,
  fontSize,
}: {
  label: string;
  value: string;
  colors: any;
  fontSize: any;
}) {
  return (
    <View style={styles.statItem}>
      <Text style={{ color: colors.primary, fontSize: fontSize.md, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statWrap: { alignItems: 'center' },
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
  identityCard: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
  },
  identityInfo: {
    flex: 1,
    marginLeft: 14,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontWeight: '800',
    flexShrink: 1,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 28,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 12,
  },
  skeletonGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
});
