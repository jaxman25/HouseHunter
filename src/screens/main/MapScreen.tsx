import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList, Property } from '../../types';
import { getProperties } from '../../services/propertyService';
import { formatPrice } from '../../utils/helpers';
import { formatCurrencyCompact } from '../../utils/formatters';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { formatCurrencyAmount } from '../../services/currencyService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function MapScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const { currency } = useCurrencyContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  /** Color-code markers by price range (in KES). */
  const getMarkerColor = (price: number): string => {
    if (price < 5_000_000) return '#00843D'; // Green: under KSh 5M
    if (price < 10_000_000) return '#F2A900'; // Yellow: KSh 5M-10M
    if (price < 20_000_000) return '#F97316'; // Orange: KSh 10M-20M
    return '#BB133E'; // Red: Over KSh 20M
  };

  /** Format price for marker display. */
  const formatMarkerPrice = (price: number): string => {
    return formatCurrencyAmount(price, currency, { compact: true });
  };

  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const result = await getProperties({ sortBy: 'newest' }, 50);
        if (!ignore) setProperties(result.properties);
      } catch (error) {
        if (!ignore) console.error('Error loading properties:', error);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const centerOnProperties = () => {
    if (properties.length === 0) return;

    const lats = properties.map((p) => p.latitude);
    const lngs = properties.map((p) => p.longitude);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    mapRef.current?.fitToCoordinates(
      [
        { latitude: minLat, longitude: minLng },
        { latitude: maxLat, longitude: maxLng },
      ],
      { edgePadding: { top: 100, right: 50, bottom: 200, left: 50 }, animated: true }
    );
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: -1.2921,
          longitude: 36.8219,
          latitudeDelta: 0.5,
          longitudeDelta: 0.5,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        onMapReady={() => {
          if (properties.length > 0) centerOnProperties();
        }}
      >
        {properties.map((property) => (
          <Marker
            key={property.id}
            coordinate={{
              latitude: property.latitude,
              longitude: property.longitude,
            }}
            onPress={() => setSelectedProperty(property)}
          >
            <View
              style={[
                styles.marker,
                {
                  backgroundColor:
                    selectedProperty?.id === property.id
                      ? colors.primary
                      : getMarkerColor(property.price),
                },
              ]}
            >
              <Text
                style={[
                  styles.markerText,
                  {
                    color: colors.white,
                    fontSize: fontSize.xs,
                  },
                ]}
              >
                {formatMarkerPrice(property.price)}
              </Text>
            </View>
            <View
              style={[
                styles.markerArrow,
                {
                  borderBottomColor:
                    selectedProperty?.id === property.id
                      ? colors.primary
                      : getMarkerColor(property.price),
                },
              ]}
            />
          </Marker>
        ))}
      </MapView>

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.xl }]}>
          Map View
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
          {properties.length} properties
        </Text>
      </View>

      {/* Map Controls */}
      <View style={[styles.mapControls, { right: spacing.md }]}>
        <TouchableOpacity
          style={[styles.mapControlBtn, { backgroundColor: colors.surface }]}
          onPress={() => mapRef.current?.animateToRegion({
            latitude: -1.2921,
            longitude: 36.8219,
            latitudeDelta: 0.5,
            longitudeDelta: 0.5,
          })}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mapControlBtn, { backgroundColor: colors.surface, marginTop: 8 }]}
          onPress={centerOnProperties}
        >
          <MaterialCommunityIcons name="home-map-marker" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Selected Property Card */}
      {selectedProperty && (
        <View
          pointerEvents="box-none"
          style={[
            styles.previewWrap,
            { paddingBottom: insets.bottom + 20 },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.propertyPreview,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.xl,
              },
              shadow.lg,
            ]}
            onPress={() =>
              navigation.navigate('PropertyDetail', {
                propertyId: selectedProperty.id,
              })
            }
            activeOpacity={0.85}
          >
            <View style={[styles.previewImage, { backgroundColor: colors.gray200, borderRadius: radius.lg }]}>
              <Image
                source={{ uri: selectedProperty.images?.[0] }}
                style={[styles.previewImageContent, { borderRadius: radius.lg }]}
              />
            </View>
            <View style={styles.previewContent}>
              <Text style={[styles.previewPrice, { color: colors.primary, fontSize: fontSize.lg }]}>
                {formatMarkerPrice(selectedProperty.price)}
                {selectedProperty.listingType === 'rent' ? '/mo' : ''}
              </Text>
              <Text
                style={[styles.previewTitle, { color: colors.text, fontSize: fontSize.md }]}
                numberOfLines={1}
              >
                {selectedProperty.title}
              </Text>
              <View style={styles.previewLocation}>
                <MaterialCommunityIcons
                  name="map-marker-outline"
                  size={12}
                  color={colors.textSecondary}
                />
                <Text
                  style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginLeft: 2 }}
                  numberOfLines={1}
                >
                  {selectedProperty.address}
                </Text>
              </View>
              <View style={styles.previewFeatures}>
                <Text style={[styles.previewFeature, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
                  {selectedProperty.bedrooms} Bed · {selectedProperty.bathrooms} Bath · {selectedProperty.area.toLocaleString()} sqft
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closePreview, { backgroundColor: colors.gray100 }]}
              onPress={() => setSelectedProperty(null)}
            >
              <MaterialCommunityIcons name="close" size={16} color={colors.gray500} />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    boxShadow: '0px 2px 4px rgba(0,0,0,0.1)',
  },
  headerTitle: {
    fontWeight: '700',
  },
  mapControls: {
    position: 'absolute',
    top: 100,
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 2px 4px rgba(0,0,0,0.1)',
  },
  marker: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    boxShadow: '0px 1px 4px rgba(0,0,0,0.15)',
  },
  markerText: {
    fontWeight: '700',
  },
  markerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    alignSelf: 'center',
  },
  previewWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  propertyPreview: {
    // Full width on phones (minus the wrap's padding), capped + centered on
    // larger screens so the sheet doesn't span the whole window.
    width: '100%',
    maxWidth: 600,
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
  },
  previewImage: {
    width: 80,
    height: 80,
    overflow: 'hidden',
  },
  previewImageContent: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E7EB',
  },
  previewContent: {
    flex: 1,
    marginLeft: 12,
  },
  previewPrice: {
    fontWeight: '700',
  },
  previewTitle: {
    fontWeight: '600',
    marginTop: 2,
  },
  previewLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  previewFeatures: {
    marginTop: 4,
  },
  previewFeature: {
    fontWeight: '500',
  },
  closePreview: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
