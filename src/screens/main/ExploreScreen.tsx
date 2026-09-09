import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { DocumentSnapshot } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { MainTabParamList, RootStackParamList, Property, PropertyFilter } from '../../types';
import PropertyCard from '../../components/property/PropertyCard';
import PropertyCardSkeleton from '../../components/common/PropertyCardSkeleton';
import FilterModal from '../../components/property/FilterModal';
import SaveSearchModal from '../../components/search/SaveSearchModal';
import EmptyState from '../../components/common/EmptyState';
import { getProperties } from '../../services/propertyService';
import {
  propertyFilterToSavedSearchFilters,
  filtersToPropertyFilter,
} from '../../services/savedSearchService';
import { useSavedSearches } from '../../hooks/useSavedSearches';
import { useDebouncedCallback } from '../../utils/performance/debounce';
import { useThrottledCallback } from '../../utils/performance/throttle';
import { useResponsive } from '../../hooks/useResponsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<MainTabParamList, 'ExploreTab'>;

export default function ExploreScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { isFavorite, toggleFavorite } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { create: createSavedSearch } = useSavedSearches();
  const [showSaveModal, setShowSaveModal] = useState(false);

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filter, setFilter] = useState<PropertyFilter>({
    sortBy: 'newest',
  });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const responsive = useResponsive();

  // Grid mode: real multi-column grid that reflows with the window. List mode
  // keeps a single full-width column (a FlatList row per property).
  const gridColumns = viewMode === 'grid' ? responsive.gridColumns() : 1;
  const gridCellWidth = responsive.gridCellWidth(gridColumns);

  const rows = useMemo(() => {
    const out: Property[][] = [];
    for (let i = 0; i < properties.length; i += gridColumns) {
      out.push(properties.slice(i, i + gridColumns));
    }
    return out;
  }, [properties, gridColumns]);

  const loadProperties = useCallback(async () => {
    try {
      const result = await getProperties(filter, 30);
      setProperties(result.properties);
      setLastDoc(result.lastDoc);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  // Filter changes trigger a reload, debounced 300ms so rapid filter/sort
  // taps coalesce into a single request.
  const debouncedLoad = useDebouncedCallback(loadProperties, 300);

  useEffect(() => {
    debouncedLoad();
  }, [filter, debouncedLoad]);

  // A saved search was run elsewhere (Saved Searches screen / Home chip):
  // apply its filters here, then clear the param so it doesn't re-apply.
  const savedFilterParam = route.params?.savedFilter;
  useEffect(() => {
    const apply = () => {
      if (!savedFilterParam) return;
      setFilter(filtersToPropertyFilter(savedFilterParam));
      navigation.setParams({ savedFilter: undefined });
    };
    apply();
  }, [savedFilterParam, navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProperties();
  };

  // Infinite scroll: fetch the next page using the last-document cursor.
  // Wrapped in a 500ms throttle so end-of-list events can't fire a storm.
  const loadMore = useCallback(async () => {
    if (loadingMore || !lastDoc) return;
    setLoadingMore(true);
    try {
      const result = await getProperties(filter, 30, lastDoc);
      setProperties((prev) => [...prev, ...result.properties]);
      setLastDoc(result.lastDoc);
    } catch (error) {
      console.error('Error loading more properties:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [filter, lastDoc, loadingMore]);

  const throttledLoadMore = useThrottledCallback(loadMore, 500);

  const handleFilterApply = (newFilter: PropertyFilter) => {
    setFilter(newFilter);
    setLoading(true);
  };

  const renderRow = ({ item }: { item: Property[] }) => (
    <View
      style={
        viewMode === 'grid'
          ? [styles.gridRow, { gap: spacing.md, marginBottom: spacing.md }]
          : undefined
      }
    >
      {item.map((property) => (
        <PropertyCard
          key={property.id}
          property={property}
          style={viewMode === 'grid' ? { width: gridCellWidth } : undefined}
          onPress={() => navigation.navigate('PropertyDetail', { propertyId: property.id })}
          onFavorite={() => toggleFavorite(property.id)}
          isFavorite={isFavorite(property.id)}
          variant={viewMode === 'grid' ? 'grid' : 'vertical'}
        />
      ))}
    </View>
  );

  const renderSkeleton = () => {
    if (viewMode !== 'grid') {
      return (
        <View>
          {[0, 1, 2, 3].map((i) => <PropertyCardSkeleton key={i} />)}
        </View>
      );
    }
    // Skeleton mirrors the grid rows so loading doesn't cause a jump.
    const skeletonRows: number[][] = [];
    for (let r = 0; r < 3; r++) {
      skeletonRows.push(Array.from({ length: gridColumns }, (_, c) => r * gridColumns + c));
    }
    return (
      <View>
        {skeletonRows.map((row) => (
          <View
            key={row[0]}
            style={[styles.gridRow, { gap: spacing.md, marginBottom: spacing.md }]}
          >
            {row.map((key) => (
              <PropertyCardSkeleton
                key={key}
                width={gridCellWidth}
                imageHeight={140}
              />
            ))}
          </View>
        ))}
      </View>
    );
  };

  const getActiveFilterCount = (): number => {
    let count = 0;
    if (filter.minPrice || filter.maxPrice) count++;
    if (filter.minBedrooms !== undefined) count++;
    if (filter.propertyType && filter.propertyType.length > 0) count++;
    if (filter.status) count++;
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
          {properties.length} properties found
        </Text>
      </View>

      {/* Property List */}
      <FlatList
        data={rows}
        renderItem={renderRow}
        keyExtractor={(item) => (item[0] ? item[0].id : 'row-empty')}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        onEndReached={throttledLoadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: spacing.lg }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? renderSkeleton() : (
            <EmptyState
              icon="home-search"
              title="No properties found"
              description="Try adjusting your filters, searching nearby areas, or exploring different property types"
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
        onSaveSearch={() => setShowSaveModal(true)}
      />

      {/* Save Search Modal */}
      <SaveSearchModal
        visible={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        filters={propertyFilterToSavedSearchFilters(filter)}
        onSave={async (input) => {
          await createSavedSearch(input);
        }}
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
  gridRow: {
    flexDirection: 'row',
  },
});
