import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { NeighborhoodData } from '../../types';

interface NeighborhoodMapProps {
  latitude: number;
  longitude: number;
  amenities: NeighborhoodData['amenities'];
}

const AMENITY_ITEMS = [
  { key: 'restaurants', icon: 'silverware-fork-knife', label: 'Restaurants' },
  { key: 'shopping', icon: 'shopping', label: 'Shopping' },
  { key: 'parks', icon: 'tree', label: 'Parks' },
  { key: 'gyms', icon: 'dumbbell', label: 'Gyms' },
  { key: 'transitStops', icon: 'bus', label: 'Transit' },
  { key: 'hospitals', icon: 'hospital-building', label: 'Hospitals' },
] as const;

export default function NeighborhoodMap({ latitude, longitude, amenities }: NeighborhoodMapProps) {
  const { colors, fontSize, radius } = useTheme();

  return (
    <View style={[styles.container, { borderRadius: radius.md }]}>
      {/* Map placeholder */}
      <View style={[styles.mapPlaceholder, { backgroundColor: colors.gray100 }]}>
        <MaterialCommunityIcons name="map" size={32} color={colors.gray300} />
        <Text style={[styles.mapText, { color: colors.gray400, fontSize: fontSize.sm }]}>
          Map View
        </Text>
        <Text style={[styles.coords, { color: colors.gray500, fontSize: fontSize.xs }]}>
          {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </Text>
      </View>

      {/* Amenities Grid */}
      <View style={[styles.amenitiesGrid, { backgroundColor: colors.card }]}>
        {AMENITY_ITEMS.map((item) => {
          const count = amenities[item.key as keyof typeof amenities] || 0;
          return (
            <View key={item.key} style={[styles.amenityItem, { borderBottomColor: colors.gray200 }]}>
              <MaterialCommunityIcons name={item.icon as any} size={18} color={colors.primary} />
              <View style={styles.amenityInfo}>
                <Text style={[styles.amenityCount, { color: colors.text, fontSize: fontSize.md }]}>
                  {count}
                </Text>
                <Text style={[styles.amenityLabel, { color: colors.textLight, fontSize: fontSize.xs }]}>
                  {item.label}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  mapPlaceholder: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  mapText: { fontWeight: '500' },
  coords: { fontWeight: '500' },
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 0,
  },
  amenityItem: {
    width: '33.33%',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  amenityInfo: { alignItems: 'center', marginTop: 4 },
  amenityCount: { fontWeight: '700' },
  amenityLabel: { marginTop: 1 },
});
