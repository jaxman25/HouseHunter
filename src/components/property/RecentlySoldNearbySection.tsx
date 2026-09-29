import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList, Property } from '../../types';
import PropertyCard from './PropertyCard';
import { getRecentlySoldNearby } from '../../services/propertyService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * "Recently Sold Nearby" (prompt4 #2) — up to 3 sold/rented listings within
 * ~1km of the property being viewed, shown below Similar Listings. Reuses
 * PropertyCard: sold/rented listings already render their Sold/Rented
 * StatusBadge overlay and the unavailable dim. Hidden entirely when there
 * is nothing nearby.
 */
export default function RecentlySoldNearbySection({ property }: { property: Property }) {
  const { colors, fontSize, spacing } = useTheme();
  const navigation = useNavigation<Nav>();
  const [sold, setSold] = useState<Property[]>([]);

  useEffect(() => {
    let ignore = false;
    getRecentlySoldNearby(property, 3)
      .then((results) => {
        if (!ignore) setSold(results);
      })
      .catch(() => {
        // Non-critical section — silently hide on failure.
        if (!ignore) setSold([]);
      });
    return () => {
      ignore = true;
    };
  }, [property.id]);

  if (sold.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.text, fontSize: fontSize.lg }]}>
        Recently Sold Nearby
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }}>
        What similar homes in {property.city} went for
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 4, gap: spacing.md, paddingTop: spacing.md }}
      >
        {sold.map((item) => (
          <PropertyCard
            key={item.id}
            property={item}
            onPress={() => navigation.navigate('PropertyDetail', { propertyId: item.id })}
            variant="grid"
            style={{ width: 160 }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  title: {
    fontWeight: '700',
  },
});
