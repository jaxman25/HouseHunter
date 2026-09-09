import React, { useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList, RecentlyViewedItem } from '../../types';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { useResponsive } from '../../hooks/useResponsive';
import PropertyCardSkeleton from '../common/PropertyCardSkeleton';
import { formatPrice } from '../../utils/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * \"Recently Viewed\" row for the home screen — a horizontal strip of compact
 * cards fed from local AsyncStorage. Refreshes whenever the screen regains
 * focus (e.g. returning from a property detail page). Non-critical: the
 * whole feature degrades to nothing on any failure.
 */
export default function RecentlyViewedSection() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const responsive = useResponsive();
  const { items, loading, refresh } = useRecentlyViewed();

  // Refresh when the tab regains focus so a freshly viewed property appears
  // immediately after navigating back from its detail page.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const cardWidth = Math.min(
    Math.max(responsive.contentWidth * 0.44, 150),
    200
  );

  if (loading) {
    return (
      <View style={{ marginTop: spacing.xxl }}>
        <View style={[styles.sectionHeader, { paddingHorizontal: spacing.lg }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.xl }]}>
            Recently Viewed
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.md,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
          }}
        >
          {[0, 1].map((i) => (
            <PropertyCardSkeleton key={i} width={cardWidth} imageHeight={110} />
          ))}
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View
        style={[
          styles.empty,
          {
            marginHorizontal: spacing.lg,
            marginTop: spacing.xxl,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
          },
        ]}
      >
        <MaterialCommunityIcons
          name="history"
          size={22}
          color={colors.textSecondary}
        />
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginLeft: 8, flex: 1 }}>
          Start exploring to see your recently viewed properties
        </Text>
      </View>
    );
  }

  return (
    <View style={{ marginTop: spacing.xxl }}>
      <View style={[styles.sectionHeader, { paddingHorizontal: spacing.lg }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.xl }]}>
          Recently Viewed
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('RecentlyViewed')}
          accessibilityRole="button"
          accessibilityLabel="See all recently viewed properties"
        >
          <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>
            See All
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        horizontal
        data={items}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.propertyId}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
        renderItem={({ item }) => (
          <RecentlyViewedCard
            item={item}
            width={cardWidth}
            onPress={() =>
              navigation.navigate('PropertyDetail', { propertyId: item.propertyId })
            }
          />
        )}
      />
    </View>
  );
}

function RecentlyViewedCard({
  item,
  width,
  onPress,
}: {
  item: RecentlyViewedItem;
  width: number;
  onPress: () => void;
}) {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();

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
      accessibilityLabel={`View ${item.title}`}
    >
      <Image
        source={item.images?.[0] ? { uri: item.images[0] } : undefined}
        style={[styles.cardImage, { backgroundColor: colors.gray200, borderRadius: radius.lg }]}
        contentFit="cover"
      />
      <View style={{ padding: 10 }}>
        <Text style={[styles.price, { color: colors.primary, fontSize: fontSize.md }]} numberOfLines={1}>
          {formatPrice(item.price, item.listingType)}
        </Text>
        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.sm }]} numberOfLines={1}>
          {item.title}
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
            {item.city}
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
  sectionTitle: {
    fontWeight: '700',
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
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