import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList, Property } from '../../types';
import PropertyImageGallery from '../../components/property/PropertyImageGallery';
import PropertyDetailSkeleton from '../../components/property/PropertyDetailSkeleton';
import PropertyMap from '../../components/common/PropertyMap';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { getProperty } from '../../services/propertyService';
import { getOrCreateConversation, sendMessage } from '../../services/chatService';
import { createNotification } from '../../services/notificationService';
import {
  formatPrice,
  formatBedrooms,
  formatBathrooms,
  formatArea,
  getPropertyTypeLabel,
  getTimeAgo,
} from '../../utils/helpers';
import { formatCurrency, formatViews, formatNumber } from '../../utils/formatters';
import { PROPERTY_FEATURES } from '../../config/theme';
import { useResponsive } from '../../hooks/useResponsive';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PropertyDetail'>;
type Route = RouteProp<RootStackParamList, 'PropertyDetail'>;

export default function PropertyDetailScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const { user, isFavorite, toggleFavorite } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();

  // Cap the page on large screens so images/content don't stretch; phones
  // keep the natural full width (maxWidth equals the window there).
  const detailWidth = responsive.isDesktop ? 1000 : responsive.width;
  // Gallery height scales with the column but stays touch-friendly on phones.
  const galleryHeight = Math.round(
    Math.min(Math.max(detailWidth * 0.42, 280), 460)
  );

  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [contacting, setContacting] = useState(false);

  const loadProperty = useCallback(async () => {
    try {
      const data = await getProperty(route.params.propertyId);
      setProperty(data);
    } catch (error) {
      console.error('Error loading property:', error);
      Alert.alert('Error', 'Failed to load property details');
    } finally {
      setLoading(false);
    }
  }, [route.params.propertyId]);

  useEffect(() => {
    loadProperty();
  }, [loadProperty]);

  const handleShare = async () => {
    if (!property) return;
    try {
      await Share.share({
        message: `Check out this property: ${property.title} - ${formatPrice(property.price, property.listingType)}\n\n${property.address}, ${property.city}, ${property.state}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleContact = async () => {
    if (!property || !user) return;
    if (property.userId === user.uid) {
      Alert.alert('Info', 'This is your listing');
      return;
    }
    setContacting(true);
    try {
      const conversationId = await getOrCreateConversation(
        user.uid,
        property.userId,
        property.id,
        property.title,
        property.images?.[0] || '',
        user.displayName,
        user.photoURL,
        property.userName,
        property.userPhoto
      );
      await sendMessage(
        conversationId,
        user.uid,
        `Hi, I'm interested in "${property.title}" listed at ${formatPrice(property.price, property.listingType)}. Is this still available?`,
        undefined,
        property.userId
      );
      await createNotification(
        property.userId,
        'New Message',
        `${user.displayName} is interested in your listing: ${property.title}`,
        'message',
        { conversationId, senderId: user.uid }
      );
      navigation.navigate('Chat', {
        conversationId,
        recipientId: property.userId,
        recipientName: property.userName,
      });
    } catch (error) {
      console.error('Error creating conversation:', error);
      Alert.alert('Error', 'Failed to start conversation');
    } finally {
      setContacting(false);
    }
  };

  const handleCall = () => {
    if (!property?.userPhone) {
      Alert.alert('No Phone', 'The seller has not provided a phone number.');
      return;
    }
    Linking.openURL(`tel:${property.userPhone}`);
  };

  if (loading) {
    return <PropertyDetailSkeleton />;
  }

  if (!property) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Property not found</Text>
      </View>
    );
  }

  const featureItems = PROPERTY_FEATURES.filter((f) =>
    property.features?.includes(f.key)
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        {
          width: '100%',
          maxWidth: detailWidth,
          alignSelf: 'center',
        },
      ]}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image Gallery */}
        <PropertyImageGallery images={property.images} height={galleryHeight} />

        {/* Back & Share Buttons */}
        <View
          style={[
            styles.imageOverlay,
            { paddingTop: insets.top + spacing.sm },
          ]}
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.overlayBtn, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.overlayRight}>
            <TouchableOpacity
              onPress={handleShare}
              style={[styles.overlayBtn, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
            >
              <MaterialCommunityIcons name="share-variant" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => toggleFavorite(property.id)}
              style={[styles.overlayBtn, { backgroundColor: 'rgba(0,0,0,0.4)', marginLeft: 8 }]}
            >
              <MaterialCommunityIcons
                name={isFavorite(property.id) ? 'heart' : 'heart-outline'}
                size={22}
                color={isFavorite(property.id) ? colors.error : '#fff'}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Property Content */}
        <View style={[styles.content, { backgroundColor: colors.background }]}>
          {/* Price & Status */}
          <View style={styles.priceSection}>
            <Text style={[styles.price, { color: colors.primary, fontSize: fontSize.xxxl }]}>
              {formatPrice(property.price, property.listingType)}
            </Text>
            <View style={styles.badgeRow}>
              <Badge
                label={property.listingType === 'sale' ? 'For Sale' : 'For Rent'}
                variant={property.listingType === 'sale' ? 'primary' : 'secondary'}
              />
              <Badge
                label={getPropertyTypeLabel(property.propertyType)}
                variant="info"
              />
            </View>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xxl }]}>
            {property.title}
          </Text>

          {/* Location */}
          <View style={styles.locationRow}>
            <MaterialCommunityIcons name="map-marker" size={18} color={colors.primary} />
            <Text style={[styles.location, { color: colors.textSecondary, fontSize: fontSize.md }]}>
              {property.address}, {property.city}, {property.state} {property.zipCode}
            </Text>
          </View>

          {/* Views & Time */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="eye-outline" size={16} color={colors.gray500} />
              <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
                {formatViews(property.views)}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="clock-outline" size={16} color={colors.gray500} />
              <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
                {getTimeAgo(property.createdAt)}
              </Text>
            </View>
          </View>

          {/* Key Features */}
          <View
            style={[
              styles.featuresCard,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.xl,
              },
              shadow.sm,
            ]}
          >
            <FeatureCard icon="bed-outline" label={formatBedrooms(property.bedrooms)} colors={colors} fontSize={fontSize} />
            <View style={[styles.featureDivider, { backgroundColor: colors.border }]} />
            <FeatureCard icon="bathtub-outline" label={formatBathrooms(property.bathrooms)} colors={colors} fontSize={fontSize} />
            <View style={[styles.featureDivider, { backgroundColor: colors.border }]} />
            <FeatureCard icon="resize" label={formatArea(property.area, property.areaUnit)} colors={colors} fontSize={fontSize} />
            <View style={[styles.featureDivider, { backgroundColor: colors.border }]} />
            <FeatureCard icon="calendar" label={`Built ${property.yearBuilt}`} colors={colors} fontSize={fontSize} />
          </View>

          {/* Description */}
          <Section title="Description" colors={colors} fontSize={fontSize} spacing={spacing}>
            <Text style={[styles.description, { color: colors.textSecondary, fontSize: fontSize.md, lineHeight: 24 }]}>
              {property.description}
            </Text>
          </Section>

          {/* Features & Amenities */}
          {featureItems.length > 0 && (
            <Section title="Features & Amenities" colors={colors} fontSize={fontSize} spacing={spacing}>
              <View style={styles.featureGrid}>
                {featureItems.map((feature) => (
                  <View
                    key={feature.key}
                    style={[
                      styles.featureChip,
                      {
                        backgroundColor: colors.primaryLight,
                        borderRadius: radius.md,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={feature.icon as any}
                      size={16}
                      color={colors.primary}
                    />
                    <Text
                      style={[
                        styles.featureChipText,
                        { color: colors.primary, fontSize: fontSize.sm },
                      ]}
                    >
                      {feature.label}
                    </Text>
                  </View>
                ))}
              </View>
            </Section>
          )}

          {/* Map Preview */}
          {property.latitude && property.longitude && (
            <Section title="Location" colors={colors} fontSize={fontSize} spacing={spacing}>
              <View style={[styles.mapContainer, { borderRadius: radius.lg, overflow: 'hidden' }]}>
                <PropertyMap
                  latitude={property.latitude}
                  longitude={property.longitude}
                  style={styles.map}
                />
              </View>
            </Section>
          )}

          {/* Seller Info */}
          <Section title="Listed by" colors={colors} fontSize={fontSize} spacing={spacing}>
            <TouchableOpacity
              style={[
                styles.sellerCard,
                {
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
              activeOpacity={0.7}
            >
              <Avatar uri={property.userPhoto} name={property.userName} size={50} />
              <View style={styles.sellerInfo}>
                <Text style={[styles.sellerName, { color: colors.text, fontSize: fontSize.lg }]}>
                  {property.userName}
                </Text>
                {property.userPhone ? (
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
                    {property.userPhone}
                  </Text>
                ) : null}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.gray400} />
            </TouchableOpacity>
          </Section>

          {/* Bottom Spacer */}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.surface,
            paddingBottom: insets.bottom + spacing.md,
            borderTopColor: colors.border,
          },
        ]}
      >
        <View style={styles.bottomPrice}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
            {property.listingType === 'rent' ? 'Monthly Rent' : 'Listed Price'}
          </Text>
          <Text style={[styles.bottomPriceText, { color: colors.primary, fontSize: fontSize.xl }]}>
            {formatPrice(property.price, property.listingType)}
          </Text>
        </View>
        <View style={styles.bottomActions}>
          <TouchableOpacity
            onPress={handleCall}
            style={[styles.callBtn, { backgroundColor: colors.gray100, borderRadius: radius.md }]}
          >
            <MaterialCommunityIcons name="phone" size={22} color={colors.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Button
              title="Contact Seller"
              onPress={handleContact}
              loading={contacting}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function Section({
  title,
  children,
  colors,
  fontSize,
  spacing,
}: {
  title: string;
  children: React.ReactNode;
  colors: any;
  fontSize: any;
  spacing: any;
}) {
  return (
    <View style={{ marginTop: spacing.xxl }}>
      <Text
        style={{
          color: colors.text,
          fontSize: fontSize.lg,
          fontWeight: '700',
          marginBottom: 12,
          paddingHorizontal: 4,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function FeatureCard({
  icon,
  label,
  colors,
  fontSize,
}: {
  icon: string;
  label: string;
  colors: any;
  fontSize: any;
}) {
  return (
    <View style={styles.featureCardItem}>
      <MaterialCommunityIcons name={icon as any} size={22} color={colors.primary} />
      <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '600', marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  overlayRight: {
    flexDirection: 'row',
  },
  overlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  priceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontWeight: '800',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  title: {
    fontWeight: '700',
    marginTop: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  location: {
    marginLeft: 4,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 20,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {},
  featuresCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    marginTop: 20,
  },
  featureCardItem: {
    alignItems: 'center',
  },
  featureDivider: {
    width: 1,
    height: '80%',
    alignSelf: 'center',
  },
  description: {},
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  featureChipText: {
    fontWeight: '600',
  },
  mapContainer: {
    height: 200,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  sellerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sellerName: {
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 0.5,
  },
  bottomPrice: {
    marginRight: 16,
  },
  bottomPriceText: {
    fontWeight: '800',
  },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  callBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
