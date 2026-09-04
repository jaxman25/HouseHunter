import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList, Property } from '../../types';
import { getProperties } from '../../services/propertyService';
import { formatPrice } from '../../utils/helpers';
import { formatCurrencyCompact } from '../../utils/formatters';
import { useResponsive } from '../../hooks/useResponsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const USA_CENTER = { latitude: 39.8283, longitude: -98.5795 };

export default function MapScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();

  const [properties, setProperties] = useState<Property[]>([]);
  const [selected, setSelected] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await getProperties({ sortBy: 'newest' }, 50);
        setProperties(result.properties);
        if (result.properties.length > 0) {
          setSelected(result.properties[0]);
        }
      } catch (error) {
        console.error('Error loading properties:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const focus = selected ?? (properties.length > 0 ? properties[0] : null);

  const embedSrc = focus
    ? `https://www.google.com/maps?q=${focus.latitude},${focus.longitude}&z=13&output=embed`
    : `https://www.google.com/maps?q=${USA_CENTER.latitude},${USA_CENTER.longitude}&z=4&output=embed`;

  const openInMaps = () => {
    if (!focus) return;
    Linking.openURL(
      `https://www.google.com/maps?q=${focus.latitude},${focus.longitude}`
    );
  };

  return (
    <View style={styles.container}>
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
          {loading ? 'Loading…' : `${properties.length} properties`}
        </Text>
      </View>

      {/* Body: map beside the list on desktop, stacked on phones/tablets */}
      <View
        style={[
          styles.body,
          { flexDirection: responsive.isDesktop ? 'row' : 'column' },
        ]}
      >
        {/* Map */}
        <View
          style={[
            styles.mapPane,
            { backgroundColor: colors.gray200 },
            responsive.isDesktop ? styles.mapPaneDesktop : styles.mapPaneMobile,
          ]}
        >
          <iframe
            src={embedSrc}
            title="Property map"
            loading="lazy"
            allowFullScreen
            style={{ width: '100%', height: '100%', border: 0 }}
          />
          {focus && (
            <TouchableOpacity
              onPress={openInMaps}
              style={[
                styles.openBtn,
                { backgroundColor: colors.surface, borderRadius: radius.md },
                shadow.sm,
              ]}
            >
              <MaterialCommunityIcons name="open-in-new" size={16} color={colors.primary} />
              <Text
                style={{
                  color: colors.primary,
                  fontSize: fontSize.sm,
                  fontWeight: '600',
                  marginLeft: 6,
                }}
              >
                Open in Google Maps
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Property list */}
        <ScrollView
          style={[styles.list, responsive.isDesktop ? styles.listDesktop : null]}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {properties.length === 0 && !loading && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <MaterialCommunityIcons
                name="map-marker-off"
                size={40}
                color={colors.gray400}
              />
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: fontSize.md,
                  marginTop: 8,
                }}
              >
                No properties found
              </Text>
            </View>
          )}

          {properties.map((property) => {
            const isSelected = selected?.id === property.id;
            return (
              <TouchableOpacity
                key={property.id}
                onPress={() => setSelected(property)}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderRadius: radius.lg,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                  shadow.sm,
                ]}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.cardImage,
                    { backgroundColor: colors.gray200, borderRadius: radius.md },
                  ]}
                >
                  <Image
                    source={{ uri: property.images?.[0] }}
                    contentFit="cover"
                    style={[styles.cardImageContent, { borderRadius: radius.md }]}
                  />
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.cardPrice, { color: colors.primary, fontSize: fontSize.lg }]}>
                    {formatPrice(property.price, property.listingType)}
                  </Text>
                  <Text
                    style={[styles.cardTitle, { color: colors.text, fontSize: fontSize.md }]}
                    numberOfLines={1}
                  >
                    {property.title}
                  </Text>
                  <Text
                    style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {property.address}, {property.city}, {property.state}
                  </Text>
                  <View style={styles.cardFooter}>
                    <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
                      {formatCurrencyCompact(property.price)}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('PropertyDetail', {
                          propertyId: property.id,
                        })
                      }
                    >
                      <Text
                        style={{
                          color: colors.primary,
                          fontSize: fontSize.sm,
                          fontWeight: '700',
                        }}
                      >
                        View Details
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
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
    boxShadow: '0px 2px 4px rgba(0,0,0,0.1)',
  },
  headerTitle: {
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  mapPane: {
    position: 'relative',
  },
  mapPaneDesktop: {
    flex: 1,
  },
  mapPaneMobile: {
    height: 280,
  },
  openBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  list: {
    flex: 1,
  },
  listDesktop: {
    flex: 0,
    width: 380,
  },
  card: {
    flexDirection: 'row',
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardImage: {
    width: 90,
    height: 90,
    overflow: 'hidden',
  },
  cardImageContent: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E7EB',
  },
  cardBody: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  cardPrice: {
    fontWeight: '700',
  },
  cardTitle: {
    fontWeight: '600',
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
});
