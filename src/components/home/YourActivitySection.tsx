import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList, Property, RecentlyViewedItem } from '../../types';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { useAuthContext } from '../../context/AuthContext';
import { getPropertiesByIds } from '../../services/propertyService';
import { useResponsive } from '../../hooks/useResponsive';
import PropertyCardSkeleton from '../common/PropertyCardSkeleton';
import { formatPrice } from '../../utils/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TabKey = 'viewed' | 'favorites';

/**
 * "Your Activity" (prompt4 #6) — merges Recently Viewed and Favorites into
 * one horizontal strip with two tabs, reducing home-screen vertical space.
 * The Viewed tab reuses the local AsyncStorage history; Favorites resolves
 * the user's favorite ids through getPropertiesByIds (cached for the
 * session, refreshed on focus). Hidden when both tabs have nothing.
 */
export default function YourActivitySection() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const responsive = useResponsive();
  const { user } = useAuthContext();
  const { items, refresh } = useRecentlyViewed();

  const [tab, setTab] = useState<TabKey>('viewed');
  const [favorites, setFavorites] = useState<Property[]>([]);
  const [favLoading, setFavLoading] = useState(false);

  const loadFavorites = useCallback(async () => {
    const ids = user?.favorites ?? [];
    if (ids.length === 0) {
      setFavorites([]);
      return;
    }
    setFavLoading(true);
    try {
      // Preserve the user's favorites order.
      const byId = new Map((await getPropertiesByIds(ids)).map((p) => [p.id, p]));
      setFavorites(ids.map((id) => byId.get(id)).filter((p): p is Property => Boolean(p)));
    } catch {
      // Non-critical section — keep whatever we had.
    } finally {
      setFavLoading(false);
    }
  }, [user?.favorites]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void loadFavorites();
    }, [refresh, loadFavorites])
  );

  // Recent items count toward the tab badge; favorites ids come from the
  // auth profile so the count is live even before properties resolve.
  const viewedCount = items.length;
  const favCount = user?.favorites?.length ?? 0;
  const hasContent = viewedCount > 0 || favCount > 0;
  if (!hasContent) return null;

  const cardWidth = Math.min(Math.max(responsive.contentWidth * 0.44, 150), 200);

  const data: (RecentlyViewedItem | Property)[] =
    tab === 'viewed' ? items : favorites;

  return (
    <View style={{ marginTop: spacing.xxl }}>
      <View style={[styles.sectionHeader, { paddingHorizontal: spacing.xl }]}>
        <View style={styles.tabRow}>
          <TouchableOpacity
            onPress={() => setTab('viewed')}
            style={[
              styles.tabChip,
              {
                backgroundColor: tab === 'viewed' ? colors.primary : colors.gray100,
                borderRadius: radius.round,
              },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'viewed' }}
          >
            <Text
              style={{
                color: tab === 'viewed' ? colors.white : colors.text,
                fontSize: fontSize.sm,
                fontWeight: '600',
              }}
            >
              Viewed{viewedCount > 0 ? ` (${viewedCount})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('favorites')}
            style={[
              styles.tabChip,
              {
                backgroundColor: tab === 'favorites' ? colors.primary : colors.gray100,
                borderRadius: radius.round,
              },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'favorites' }}
          >
            <Text
              style={{
                color: tab === 'favorites' ? colors.white : colors.text,
                fontSize: fontSize.sm,
                fontWeight: '600',
              }}
            >
              Favorites{favCount > 0 ? ` (${favCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => {
            if (tab === 'viewed') navigation.navigate('RecentlyViewed');
            else navigation.navigate('MainTabs', { screen: 'FavoritesTab' } as never);
          }}
          style={[styles.seeAllBtn, { backgroundColor: colors.primaryLight, borderRadius: radius.round }]}
          accessibilityRole="button"
          accessibilityLabel={tab === 'viewed' ? 'See all recently viewed properties' : 'See all favorite properties'}
        >
          <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>
            See All
          </Text>
        </TouchableOpacity>
      </View>

      {(tab === 'viewed' ? items.length > 0 : favorites.length > 0) ? (
        <FlatList
          horizontal
          data={data}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => ('propertyId' in item ? item.propertyId : item.id)}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}
          renderItem={({ item }) => (
            <ActivityCard
              item={item}
              width={cardWidth}
              onPress={() =>
                navigation.navigate('PropertyDetail', {
                  propertyId: 'propertyId' in item ? item.propertyId : item.id,
                })
              }
            />
          )}
        />
      ) : (
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
          {favLoading && tab === 'favorites' ? (
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              {[0, 1].map((i) => (
                <PropertyCardSkeleton key={i} width={cardWidth} imageHeight={110} />
              ))}
            </View>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
              {tab === 'viewed'
                ? 'Properties you view will appear here.'
                : 'Tap the heart on a listing to save it here.'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

/** Compact card shared by both tabs; tolerates the two item shapes. */
function ActivityCard({
  item,
  width,
  onPress,
}: {
  item: RecentlyViewedItem | Property;
  width: number;
  onPress: () => void;
}) {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const title = item.title;
  const city = item.city;
  const images = item.images;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          width,
          marginRight: spacing.md,
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
        },
        shadow.sm,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`View ${title}`}
    >
      <Image
        source={images?.[0] ? { uri: images[0] } : undefined}
        style={[styles.cardImage, { backgroundColor: colors.gray200, borderRadius: radius.lg }]}
        contentFit="cover"
      />
      <View style={{ padding: 10 }}>
        <Text style={[styles.price, { color: colors.primary, fontSize: fontSize.sm }]} numberOfLines={1}>
          {formatPrice(item.price, item.listingType)}
        </Text>
        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.sm }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.locationRow}>
          <MaterialCommunityIcons
            name="map-marker-outline"
            size={11}
            color={colors.textSecondary}
          />
          <Text
            style={[styles.location, { color: colors.textSecondary, fontSize: fontSize.xs }]}
            numberOfLines={1}
          >
            {city}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  seeAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  card: {
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 110,
  },
  price: {
    fontWeight: '700',
  },
  title: {
    fontWeight: '600',
    marginTop: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 2,
  },
  location: {
    flex: 1,
  },
});
