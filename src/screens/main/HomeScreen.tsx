import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { DocumentSnapshot } from 'firebase/firestore';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList, Property, PropertyFilter } from '../../types';
import PropertyCard from '../../components/property/PropertyCard';
import PropertyCardSkeleton from '../../components/common/PropertyCardSkeleton';
import Avatar from '../../components/common/Avatar';
import EmptyState from '../../components/common/EmptyState';
import RecentlyViewedSection from '../../components/home/RecentlyViewedSection';
import SavedSearchChips from '../../components/search/SavedSearchChips';
import { getProperties } from '../../services/propertyService';
import { useResponsive } from '../../hooks/useResponsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATEGORIES = [
  { key: 'house', label: 'House', icon: 'home' },
  { key: 'apartment', label: 'Apartment', icon: 'office-building' },
  { key: 'condo', label: 'Condo', icon: 'domain' },
  { key: 'townhouse', label: 'Townhouse', icon: 'home-variant' },
  { key: 'land', label: 'Land', icon: 'terrain' },
  { key: 'commercial', label: 'Commercial', icon: 'factory' },
];

export default function HomeScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const { user, isFavorite, toggleFavorite } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();

  const featuredCardWidth = Math.min(
    Math.max(responsive.contentWidth * 0.72, 250),
    340
  );
  const recentColumns = responsive.gridColumns();
  const recentCellWidth = responsive.gridCellWidth(recentColumns);

  const [featuredProperties, setFeaturedProperties] = useState<Property[]>([]);
  const [recentProperties, setRecentProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [recentLastDoc, setRecentLastDoc] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const recentFilter = useCallback<() => PropertyFilter>(
    () =>
      selectedCategory
        ? { propertyType: [selectedCategory as any], sortBy: 'newest' }
        : { sortBy: 'newest' },
    [selectedCategory]
  );

  const loadProperties = useCallback(async () => {
    try {
      const [featured, recent] = await Promise.all([
        getProperties({ sortBy: 'popular', status: 'active' }, 10),
        getProperties(recentFilter(), 10),
      ]);
      setFeaturedProperties(featured.properties);
      setRecentProperties(recent.properties);
      setRecentLastDoc(recent.lastDoc);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [recentFilter]);

  const loadMoreRecent = useCallback(async () => {
    if (loadingMore || !recentLastDoc) return;
    setLoadingMore(true);
    try {
      const result = await getProperties(recentFilter(), 10, recentLastDoc);
      setRecentProperties((prev) => [...prev, ...result.properties]);
      setRecentLastDoc(result.lastDoc);
    } catch (error) {
      console.error('Error loading more properties:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, recentLastDoc, recentFilter]);

  useEffect(() => {
    const run = async () => {
      await loadProperties();
    };
    void run();
  }, [loadProperties]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProperties();
  };

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getSubtitle = (): string => {
    const role = user?.role;
    if (role === 'seller' || role === 'agent') return 'Manage your listings and find new opportunities';
    return 'Find your next property.';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* ─── Header ─── */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + spacing.md,
              paddingHorizontal: spacing.xl,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <Avatar uri={user?.photoURL} name={user?.displayName || 'User'} size={46} />
            <View style={{ marginLeft: spacing.md }}>
              <Text style={[styles.greetingText, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
                {getGreeting()}, {user?.displayName?.split(' ')[0] || 'there'}
              </Text>
              <Text style={[styles.subtitleText, { color: colors.gray400, fontSize: fontSize.xs }]}>
                {getSubtitle()}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.notificationBtn, { backgroundColor: colors.gray100 }]}
            onPress={() => navigation.navigate('Conversations')}
            accessibilityRole="button"
            accessibilityLabel="Messages"
          >
            <MaterialCommunityIcons name="message-outline" size={21} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* ─── Search Bar ─── */}
        <TouchableOpacity
          style={[
            styles.searchBar,
            {
              marginHorizontal: spacing.xl,
              marginTop: spacing.lg,
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderColor: colors.border,
              borderWidth: 1,
            },
            shadow.sm,
            Platform.OS === 'web' ? styles.searchBarWeb : undefined,
          ]}
          onPress={() => navigation.navigate('Search')}
          activeOpacity={0.8}
        >
          <View style={[styles.searchIconWrap, { backgroundColor: colors.primaryLight }]}>
            <MaterialCommunityIcons name="magnify" size={18} color={colors.primary} />
          </View>
          <View style={styles.searchTextWrap}>
            <Text style={[styles.searchTitle, { color: colors.text, fontSize: fontSize.md }]}>
              Search properties
            </Text>
            <Text style={[styles.searchSubtitle, { color: colors.textLight, fontSize: fontSize.xs }]}>
              Search by city, address, or location
            </Text>
          </View>
          <View style={[styles.filterBtn, { backgroundColor: colors.primaryLight, borderRadius: radius.sm }]}>
            <MaterialCommunityIcons name="tune-variant" size={18} color={colors.primary} />
          </View>
        </TouchableOpacity>

        {/* ─── Property Categories ─── */}
        <View style={{ marginTop: spacing.xxl }}>
          <View style={[styles.sectionRow, { paddingHorizontal: spacing.xl, marginBottom: spacing.md }]}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
              Property Types
            </Text>
          </View>
          <FlatList
            horizontal
            data={CATEGORIES}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.xl }}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => {
              const isActive = selectedCategory === item.key;
              return (
                <TouchableOpacity
                  style={[
                    styles.categoryItem,
                    {
                      backgroundColor: isActive ? colors.primary : colors.surface,
                      borderColor: isActive ? colors.primary : colors.border,
                      borderRadius: radius.lg,
                    },
                    shadow.sm,
                  ]}
                  onPress={() => setSelectedCategory(isActive ? null : item.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <View
                    style={[
                      styles.categoryIconWrap,
                      {
                        backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : colors.primaryLight,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={item.icon as any}
                      size={20}
                      color={isActive ? colors.white : colors.primary}
                    />
                  </View>
                  <Text
                    style={[
                      styles.categoryLabel,
                      {
                        color: isActive ? colors.white : colors.text,
                        fontSize: fontSize.xs,
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* ─── Saved Search Chips ─── */}
        <SavedSearchChips />

        {/* ─── Recently Viewed ─── */}
        <RecentlyViewedSection />

        {/* ─── Featured / Popular Properties ─── */}
        {(featuredProperties.length > 0 || loading) && (
          <View style={{ marginTop: spacing.xxl }}>
            <View style={[styles.sectionRow, { paddingHorizontal: spacing.xl }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
                Popular
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('ExploreTab' as any)}
                style={[styles.seeAllBtn, { backgroundColor: colors.primaryLight, borderRadius: radius.round }]}
              >
                <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>
                  See All
                </Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <View
                style={{
                  flexDirection: 'row',
                  gap: spacing.md,
                  paddingHorizontal: spacing.xl,
                  paddingTop: spacing.md,
                }}
              >
                {[0, 1].map((i) => (
                  <PropertyCardSkeleton
                    key={i}
                    width={featuredCardWidth}
                    imageHeight={160}
                  />
                ))}
              </View>
            ) : (
              <FlatList
                horizontal
                data={featuredProperties}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: spacing.xl,
                  paddingTop: spacing.md,
                }}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.featuredCard,
                      {
                        backgroundColor: colors.surface,
                        borderRadius: radius.lg,
                        width: featuredCardWidth,
                        marginRight: spacing.md,
                      },
                      shadow.md,
                    ]}
                    onPress={() =>
                      navigation.navigate('PropertyDetail', { propertyId: item.id })
                    }
                    activeOpacity={0.85}
                  >
                    <View>
                      <View
                        style={[
                          styles.featuredImage,
                          { backgroundColor: colors.gray200, borderRadius: radius.lg },
                        ]}
                      >
                        <Image
                          source={{ uri: item.images?.[0] }}
                          style={[
                            styles.featuredImagePlaceholder,
                            { borderRadius: radius.lg },
                          ]}
                          contentFit="cover"
                        />
                        {/* Listing Type Badge */}
                        <View style={styles.featuredBaderWrap}>
                          <View
                            style={[
                              styles.featuredBadge,
                              {
                                backgroundColor:
                                  item.listingType === 'sale' ? colors.primary : colors.secondary,
                                borderRadius: radius.round,
                              },
                            ]}
                          >
                            <Text style={[styles.featuredBadgeText, { color: colors.white, fontSize: fontSize.xs }]}>
                              {item.listingType === 'sale' ? 'For Sale' : 'For Rent'}
                            </Text>
                          </View>
                        </View>
                        {/* Favorite */}
                        <TouchableOpacity
                          style={styles.featuredHeart}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            toggleFavorite(item.id);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`${isFavorite(item.id) ? 'Remove' : 'Add'} ${item.title} ${isFavorite(item.id) ? 'from' : 'to'} favorites`}
                        >
                          <MaterialCommunityIcons
                            name={isFavorite(item.id) ? 'heart' : 'heart-outline'}
                            size={18}
                            color={isFavorite(item.id) ? colors.error : colors.white}
                          />
                        </TouchableOpacity>
                      </View>
                      <View style={{ padding: spacing.md }}>
                        <View style={styles.featuredPriceRow}>
                          <Text
                            style={[styles.featuredPrice, { color: colors.primary, fontSize: fontSize.xl }]}
                          >
                            {item.listingType === 'rent' ? 'KSh' : 'KSh'}{' '}
                            {item.price.toLocaleString()}{item.listingType === 'rent' ? '/mo' : ''}
                          </Text>
                        </View>
                        <Text
                          style={[styles.featuredTitle, { color: colors.text, fontSize: fontSize.md }]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        <View style={styles.featuredLocation}>
                          <MaterialCommunityIcons
                            name="map-marker-outline"
                            size={13}
                            color={colors.textSecondary}
                          />
                          <Text
                            style={[styles.featuredAddress, { color: colors.textSecondary, fontSize: fontSize.xs }]}
                            numberOfLines={1}
                          >
                            {item.city}, {item.state}
                          </Text>
                        </View>
                        <View style={[styles.featuredFeatures, { borderTopColor: colors.border }]}>
                          <Text style={[styles.featuredFeatureText, { color: colors.gray500, fontSize: fontSize.xs }]}>
                            {item.bedrooms} Bed · {item.bathrooms} Bath · {item.area.toLocaleString()} sqft
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* ─── New Listings ─── */}
        <View style={{ marginTop: spacing.xxl, paddingHorizontal: spacing.xl }}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
              New Listings
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('ExploreTab' as any)}
              style={[styles.seeAllBtn, { backgroundColor: colors.primaryLight, borderRadius: radius.round }]}
            >
              <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>
                See All
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={{
            paddingHorizontal: spacing.xl,
            marginTop: spacing.md,
            flexDirection: recentColumns > 1 ? 'row' : undefined,
            flexWrap: recentColumns > 1 ? 'wrap' : undefined,
            columnGap: recentColumns > 1 ? spacing.md : undefined,
            rowGap: recentColumns > 1 ? spacing.md : undefined,
          }}
        >
          {loading ? (
            recentColumns > 1 ? (
              Array.from({ length: recentColumns * 2 }, (_, i) => (
                <PropertyCardSkeleton
                  key={i}
                  width={recentCellWidth}
                  style={{ marginBottom: 0 }}
                />
              ))
            ) : (
              [0, 1, 2].map((i) => <PropertyCardSkeleton key={i} />)
            )
          ) : recentProperties.length === 0 ? (
            <View style={{ width: '100%' }}>
              <EmptyState
                icon="home-search"
                title="No properties yet"
                description="New properties will appear here as sellers and agents add listings."
              />
            </View>
          ) : (
            recentProperties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                onPress={() =>
                  navigation.navigate('PropertyDetail', { propertyId: property.id })
                }
                onFavorite={() => toggleFavorite(property.id)}
                isFavorite={isFavorite(property.id)}
                style={
                  recentColumns > 1
                    ? { width: recentCellWidth, marginBottom: 0 }
                    : undefined
                }
              />
            ))
          )}
        </View>

        {/* ─── Load More ─── */}
        {!loading && recentLastDoc && (
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
            <TouchableOpacity
              style={[
                styles.loadMoreBtn,
                {
                  backgroundColor: colors.primaryLight,
                  borderRadius: radius.round,
                },
              ]}
              onPress={loadMoreRecent}
              activeOpacity={0.8}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <MaterialCommunityIcons name="chevron-down" size={18} color={colors.primaryDark} />
                  <Text
                    style={{
                      color: colors.primaryDark,
                      fontSize: fontSize.md,
                      fontWeight: '700',
                      marginLeft: 4,
                    }}
                  >
                    Load More
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingText: {
    fontWeight: '600',
  },
  subtitleText: {
    marginTop: 1,
    fontWeight: '400',
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* ── Search ── */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchBarWeb: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
  },
  searchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  searchTitle: {
    fontWeight: '600',
  },
  searchSubtitle: {
    marginTop: 1,
  },
  filterBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* ── Sections ── */
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontWeight: '700',
  },
  seeAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  /* ── Categories ── */
  categoryItem: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 10,
    borderWidth: 1,
    minWidth: 84,
  },
  categoryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  categoryLabel: {
    fontWeight: '600',
  },
  /* ── Featured Card ── */
  featuredCard: {
    overflow: 'hidden',
  },
  featuredImage: {
    height: 160,
    overflow: 'hidden',
  },
  featuredImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E7EB',
  },
  featuredBaderWrap: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  featuredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  featuredBadgeText: {
    fontWeight: '700',
  },
  featuredHeart: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  featuredPrice: {
    fontWeight: '700',
  },
  featuredTitle: {
    fontWeight: '600',
    marginTop: 2,
  },
  featuredLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  featuredAddress: {
    marginLeft: 3,
    flex: 1,
  },
  featuredFeatures: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  featuredFeatureText: {
    fontWeight: '500',
  },
  /* ── Load More ── */
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
});
