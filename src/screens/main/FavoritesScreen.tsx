import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList, Property } from '../../types';
import PropertyCard from '../../components/property/PropertyCard';
import PropertyCardSkeleton from '../../components/common/PropertyCardSkeleton';
import EmptyState from '../../components/common/EmptyState';
import { getPropertiesByIds } from '../../services/propertyService';
import { useResponsive } from '../../hooks/useResponsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function FavoritesScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const { user, isFavorite, toggleFavorite } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [favorites, setFavorites] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const responsive = useResponsive();
  // 1 column on phones; 2 on tablets/desktop (frame-aware).
  const columns = responsive.gridColumns();
  const cellWidth = responsive.gridCellWidth(columns);

  const rows = useMemo(() => {
    const out: Property[][] = [];
    for (let i = 0; i < favorites.length; i += columns) {
      out.push(favorites.slice(i, i + columns));
    }
    return out;
  }, [favorites, columns]);

  const loadFavorites = useCallback(async () => {
    const favIds = user?.favorites || [];
    // getPropertiesByIds resolves [] immediately for empty input, so the
    // no-favorites case needs no synchronous setState here.
    try {
      const properties = await getPropertiesByIds(favIds);
      setFavorites(properties);
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.favorites]);

  useEffect(() => {
    // setState happens after the awaited service call, never synchronously
    // during the effect (see react-hooks/set-state-in-effect).
    const run = async () => {
      await loadFavorites();
    };
    void run();
  }, [loadFavorites]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFavorites();
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
          Saved
        </Text>
        {favorites.length > 0 && (
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
            {favorites.length} saved
          </Text>
        )}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => (item[0] ? item[0].id : 'row-empty')}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: columns > 1 ? 'row' : undefined,
              gap: columns > 1 ? spacing.md : undefined,
              marginBottom: columns > 1 ? spacing.md : undefined,
            }}
          >
            {item.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                style={columns > 1 ? { width: cellWidth, marginBottom: 0 } : undefined}
                onPress={() =>
                  navigation.navigate('PropertyDetail', { propertyId: property.id })
                }
                onFavorite={() => toggleFavorite(property.id)}
                isFavorite={isFavorite(property.id)}
              />
            ))}
          </View>
        )}
        contentContainerStyle={[
          styles.list,
          { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View>
              {[0, 1, 2].map((i) => <PropertyCardSkeleton key={i} />)}
            </View>
          ) : (
            <EmptyState
              icon="heart-outline"
              title="No saved properties"
              description="Tap the heart icon on any property to save it here for later"
              actionLabel="Explore Properties"
              onAction={() => navigation.navigate('ExploreTab' as any)}
            />
          )
        }
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
  list: {
    paddingBottom: 100,
  },
});
