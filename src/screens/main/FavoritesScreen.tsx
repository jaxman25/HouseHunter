import React, { useState, useEffect, useCallback } from 'react';
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

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function FavoritesScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const { user, isFavorite, toggleFavorite } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [favorites, setFavorites] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFavorites = useCallback(async () => {
    const favIds = user?.favorites || [];
    if (favIds.length === 0) {
      setFavorites([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

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
    loadFavorites();
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
        data={favorites}
        renderItem={({ item }) => (
          <PropertyCard
            property={item}
            onPress={() =>
              navigation.navigate('PropertyDetail', { propertyId: item.id })
            }
            onFavorite={() => toggleFavorite(item.id)}
            isFavorite={isFavorite(item.id)}
          />
        )}
        keyExtractor={(item) => item.id}
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
