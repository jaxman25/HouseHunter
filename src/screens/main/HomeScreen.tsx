import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Dimensions,
} from 'react-native';
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
import Badge from '../../components/common/Badge';
import EmptyState from '../../components/common/EmptyState';
import { getProperties } from '../../services/propertyService';
import { PROPERTY_TYPES } from '../../config/theme';
import { formatPrice, getTimeAgo } from '../../utils/helpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

  const [featuredProperties, setFeaturedProperties] = useState<Property[]>([]);
  const [recentProperties, setRecentProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const loadProperties = useCallback(async () => {
    try {
      const [featured, recent] = await Promise.all([
        getProperties({ sortBy: 'popular', status: 'active' }, 10),
        getProperties(
          selectedCategory
            ? { propertyType: [selectedCategory as any], sortBy: 'newest' }
            : { sortBy: 'newest' },
          10
        ),
      ]);
      setFeaturedProperties(featured.properties);
      setRecentProperties(recent.properties);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    loadProperties();
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + spacing.md,
              paddingHorizontal: spacing.lg,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <Avatar uri={user?.photoURL} name={user?.displayName || 'User'} size={44} />
            <View style={{ marginLeft: spacing.md }}>
              <Text style={[styles.greeting, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
                {getGreeting()}
              </Text>
              <Text style={[styles.userName, { color: colors.text, fontSize: fontSize.xl }]}>
                {user?.displayName?.split(' ')[0] || 'User'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.notificationBtn, { backgroundColor: colors.gray100 }]}
            onPress={() => navigation.navigate('Conversations')}
          >
            <MaterialCommunityIcons name="message-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <TouchableOpacity
          style={[
            styles.searchBar,
            {
              marginHorizontal: spacing.lg,
              marginTop: spacing.lg,
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderColor: colors.border,
            },
            shadow.sm,
          ]}
          onPress={() => navigation.navigate('Search')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="magnify" size={22} color={colors.gray500} />
          <Text style={[styles.searchPlaceholder, { color: colors.gray400, fontSize: fontSize.md }]}>
            Search by city, address, or zip...
          </Text>
          <View style={[styles.filterIcon, { backgroundColor: colors.primaryLight }]}>
            <MaterialCommunityIcons name="tune-variant" size={18} color={colors.primary} />
          </View>
        </TouchableOpacity>

        {/* Categories */}
        <View style={{ marginTop: spacing.xl }}>
          <FlatList
            horizontal
            data={CATEGORIES}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg }}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.categoryItem,
                  {
                    backgroundColor:
                      selectedCategory === item.key ? colors.primary : colors.surface,
                    borderColor: selectedCategory === item.key ? colors.primary : colors.border,
                    borderRadius: radius.lg,
                  },
                  shadow.sm,
                ]}
                onPress={() =>
                  setSelectedCategory(
                    selectedCategory === item.key ? null : item.key
                  )
                }
              >
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={22}
                  color={selectedCategory === item.key ? colors.white : colors.primary}
                />
                <Text
                  style={[
                    styles.categoryLabel,
                    {
                      color: selectedCategory === item.key ? colors.white : colors.text,
                      fontSize: fontSize.xs,
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Featured Properties */}
        {(featuredProperties.length > 0 || loading) && (
          <View style={{ marginTop: spacing.xxl }}>
            <View style={[styles.sectionHeader, { paddingHorizontal: spacing.lg }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.xl }]}>
                Popular
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('ExploreTab' as any)}>
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
                  paddingHorizontal: spacing.lg,
                  paddingTop: spacing.md,
                }}
              >
                {[0, 1].map((i) => (
                  <PropertyCardSkeleton
                    key={i}
                    width={SCREEN_WIDTH * 0.72}
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
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
              }}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.featuredCard,
                    {
                      backgroundColor: colors.surface,
                      borderRadius: radius.xl,
                      width: SCREEN_WIDTH * 0.72,
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
                        { backgroundColor: colors.gray200, borderRadius: radius.xl },
                      ]}
                    >
                      <Image
                        source={{ uri: item.images?.[0] }}
                        style={[
                          styles.featuredImagePlaceholder,
                          { borderRadius: radius.xl },
                        ]}
                      />
                      <Badge
                        label={item.listingType === 'sale' ? 'For Sale' : 'For Rent'}
                        variant={item.listingType === 'sale' ? 'primary' : 'secondary'}
                        size="sm"
                        style={{ position: 'absolute', top: 12, left: 12 }}
                      />
                      <TouchableOpacity
                        style={styles.featuredHeart}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          toggleFavorite(item.id);
                        }}
                      >
                        <MaterialCommunityIcons
                          name={isFavorite(item.id) ? 'heart' : 'heart-outline'}
                          size={20}
                          color={isFavorite(item.id) ? colors.error : colors.white}
                        />
                      </TouchableOpacity>
                    </View>
                    <View style={{ padding: spacing.md }}>
                      <Text
                        style={[styles.featuredPrice, { color: colors.primary, fontSize: fontSize.xl }]}
                      >
                        {formatPrice(item.price, item.listingType)}
                      </Text>
                      <Text
                        style={[styles.featuredTitle, { color: colors.text, fontSize: fontSize.md }]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <View style={styles.featuredLocation}>
                        <MaterialCommunityIcons
                          name="map-marker-outline"
                          size={14}
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
                        <Text style={[styles.featuredFeatureText, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
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

        {/* Recent Listings */}
        <View style={{ marginTop: spacing.xxl, paddingHorizontal: spacing.lg }}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.xl }]}>
              New Listings
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('ExploreTab' as any)}>
              <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>
                See All
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          {loading ? (
            [0, 1, 2].map((i) => <PropertyCardSkeleton key={i} />)
          ) : recentProperties.length === 0 ? (
            <EmptyState
              icon="home-search"
              title="No listings yet"
              description="Be the first to list a property"
            />
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
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greeting: {},
  userName: {
    fontWeight: '700',
    marginTop: 1,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
  },
  searchPlaceholder: {
    flex: 1,
    marginLeft: 10,
  },
  filterIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryItem: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 10,
    borderWidth: 1,
    minWidth: 80,
  },
  categoryLabel: {
    fontWeight: '600',
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontWeight: '700',
  },
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
  featuredHeart: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredPrice: {
    fontWeight: '700',
  },
  featuredTitle: {
    fontWeight: '600',
    marginTop: 4,
  },
  featuredLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  featuredAddress: {
    marginLeft: 4,
    flex: 1,
  },
  featuredFeatures: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  featuredFeatureText: {
    fontWeight: '500',
  },
});
