import React, { useCallback, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList, Property, RecentlyViewedItem } from '../../types';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { useResponsive } from '../../hooks/useResponsive';
import PropertyCard from '../../components/property/PropertyCard';
import PropertyCardSkeleton from '../../components/common/PropertyCardSkeleton';
import EmptyState from '../../components/common/EmptyState';
import { confirmDialog } from '../../utils/ui/dialogs';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function toProperty(item: RecentlyViewedItem): Property {
  return {
    id: item.propertyId,
    title: item.title,
    description: '',
    price: item.price,
    listingType: item.listingType,
    propertyType: item.propertyType,
    status: item.status ?? 'active',
    address: '',
    city: item.city,
    state: item.state,
    zipCode: '',
    country: '',
    latitude: 0,
    longitude: 0,
    bedrooms: item.bedrooms,
    bathrooms: item.bathrooms,
    area: item.area,
    areaUnit: item.areaUnit,
    yearBuilt: 0,
    images: item.images ?? [],
    features: [],
    amenities: [],
    userId: '',
    userName: '',
    userPhoto: '',
    userPhone: '',
    views: 0,
    inquiries: 0,
    createdAt: item.viewedAt,
    updatedAt: item.viewedAt,
  };
}

export default function RecentlyViewedScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const { items, loading, refresh, clearAll } = useRecentlyViewed();
  const [refreshing, setRefreshing] = useState(false);

  const columns = responsive.gridColumns();
  const cellWidth = responsive.gridCellWidth(columns);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleClearAll = () => {
    confirmDialog(
      'Clear Recently Viewed',
      'This will remove all recently viewed properties from this device.',
      () => {
        void clearAll();
      },
      'Clear'
    );
  };

  const renderItem = ({ item }: { item: RecentlyViewedItem }) => (
    <PropertyCard
      property={toProperty(item)}
      variant="grid"
      onPress={() =>
        navigation.navigate('PropertyDetail', { propertyId: item.propertyId })
      }
      style={
        columns > 1
          ? { width: cellWidth, marginBottom: 0 }
          : { marginBottom: 0 }
      }
    />
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        {
          width: '100%',
          maxWidth: responsive.pageMaxWidth,
          alignSelf: 'center',
        },
      ]}
    >
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
          accessibilityLabel="Go back to the previous screen"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xxl }]}>
            Recently Viewed
          </Text>
          {items.length > 0 && (
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
              {items.length} {items.length === 1 ? 'property' : 'properties'}
            </Text>
          )}
        </View>
        {items.length > 0 && (
          <TouchableOpacity
            onPress={handleClearAll}
            accessibilityRole="button"
            accessibilityLabel="Clear all recently viewed properties"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text
              style={{ color: colors.error, fontSize: fontSize.sm, fontWeight: '600' }}
            >
              Clear All
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View
          style={{
            flexDirection: columns > 1 ? 'row' : undefined,
            flexWrap: columns > 1 ? 'wrap' : undefined,
            gap: columns > 1 ? spacing.md : undefined,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
          }}
        >
          {Array.from({ length: columns * 2 }, (_, i) => (
            <PropertyCardSkeleton
              key={i}
              width={columns > 1 ? cellWidth : undefined}
              style={columns > 1 ? { marginBottom: 0 } : undefined}
            />
          ))}
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="history"
          title="No recently viewed properties"
          description="Properties you visit will show up here."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.propertyId}
          renderItem={renderItem}
          numColumns={columns}
          key={`grid-${columns}`}
          columnWrapperStyle={
            columns > 1
              ? { gap: spacing.md, marginBottom: spacing.md }
              : undefined
          }
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
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
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    fontWeight: '800',
  },
});
