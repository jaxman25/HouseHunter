import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList, Property, PropertyFilter } from '../../types';
import PropertyCard from '../../components/property/PropertyCard';
import PropertyCardSkeleton from '../../components/common/PropertyCardSkeleton';
import FilterModal from '../../components/property/FilterModal';
import EmptyState from '../../components/common/EmptyState';
import { getProperties } from '../../services/propertyService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ExploreScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const { isFavorite, toggleFavorite } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filter, setFilter] = useState<PropertyFilter>({
    sortBy: 'newest',
  });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const loadProperties = useCallback(async () => {
    try {
      const result = await getProperties(filter, 30);
      setProperties(result.properties);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProperties();
  };

  const handleFilterApply = (newFilter: PropertyFilter) => {
    setFilter(newFilter);
    setLoading(true);
  };

  const renderProperty = ({ item }: { item: Property }) => (
    <PropertyCard
      property={item}
      onPress={() => navigation.navigate('PropertyDetail', { propertyId: item.id })}
      onFavorite={() => toggleFavorite(item.id)}
      isFavorite={isFavorite(item.id)}
      variant={viewMode === 'grid' ? 'horizontal' : 'vertical'}
    />
  );

  const getActiveFilterCount = (): number => {
    let count = 0;
    if (filter.minPrice || filter.maxPrice) count++;
    if (filter.minBedrooms !== undefined) count++;
    if (filter.propertyType && filter.propertyType.length > 0) count++;
    if (filter.sortBy && filter.sortBy !== 'newest') count++;
    return count;
  };

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
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.xxl }]}>
          Explore
        </Text>
        <View style={styles.headerActions}>
          {/* View Mode Toggle */}
          <View style={[styles.viewToggle, { backgroundColor: colors.gray100, borderRadius: radius.md }]}>
            <TouchableOpacity
              onPress={() => setViewMode('list')}
              style={[
                styles.viewToggleBtn,
                {
                  backgroundColor: viewMode === 'list' ? colors.primary : 'transparent',
                  borderRadius: radius.md,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="view-list"
                size={18}
                color={viewMode === 'list' ? colors.white : colors.gray500}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('grid')}
              style={[
                styles.viewToggleBtn,
                {
                  backgroundColor: viewMode === 'grid' ? colors.primary : 'transparent',
                  borderRadius: radius.md,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="view-grid"
                size={18}
                color={viewMode === 'grid' ? colors.white : colors.gray500}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Filter Bar */}
      <View style={[styles.filterBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.filterBtn,
            {
              backgroundColor: getActiveFilterCount() > 0 ? colors.primary : colors.gray100,
              borderRadius: radius.round,
            },
          ]}
          onPress={() => setShowFilters(true)}
        >
          <MaterialCommunityIcons
            name="tune-variant"
            size={18}
            color={getActiveFilterCount() > 0 ? colors.white : colors.text}
          />
          <Text
            style={{
              color: getActiveFilterCount() > 0 ? colors.white : colors.text,
              fontSize: fontSize.sm,
              fontWeight: '600',
              marginLeft: 6,
            }}
          >
            Filters{getActiveFilterCount() > 0 ? ` (${getActiveFilterCount()})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sortBtn, { borderRadius: radius.round, borderColor: colors.border }]}
          onPress={() =>
            setFilter((prev) => ({
              ...prev,
              sortBy:
                prev.sortBy === 'newest'
                  ? 'price_asc'
                  : prev.sortBy === 'price_asc'
                  ? 'price_desc'
                  : prev.sortBy === 'price_desc'
                  ? 'popular'
                  : 'newest',
            }))
          }
        >
          <MaterialCommunityIcons name="sort" size={18} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: fontSize.sm, marginLeft: 4 }}>
            {filter.sortBy === 'newest'
              ? 'Newest'
              : filter.sortBy === 'price_asc'
              ? 'Price ↑'
              : filter.sortBy === 'price_desc'
              ? 'Price ↓'
              : 'Popular'}
          </Text>
        </TouchableOpacity>

        <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
          {properties.length} found
        </Text>
      </View>

      {/* Property List */}
      <FlatList
        data={properties}
        renderItem={renderProperty}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          loading ? (
            <View>
              {[0, 1, 2, 3].map((i) => <PropertyCardSkeleton key={i} />)}
            </View>
          ) : (
            <EmptyState
              icon="home-search"
              title="No properties found"
              description="Try adjusting your filters to see more results"
              actionLabel="Reset Filters"
              onAction={() => setFilter({ sortBy: 'newest' })}
            />
          )
        }
      />

      {/* Filter Modal */}
      <FilterModal
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        onApply={handleFilterApply}
        currentFilter={filter}
      />
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewToggle: {
    flexDirection: 'row',
    padding: 2,
  },
  viewToggleBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 0.5,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
});
