import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import PressableScale from '../common/PressableScale';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Property } from '../../types';
import { formatPrice, formatBedrooms, formatBathrooms, formatArea, getTimeAgo } from '../../utils/helpers';
import Badge from '../common/Badge';

interface PropertyCardProps {
  property: Property;
  onPress: () => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
  variant?: 'vertical' | 'horizontal';
}

export default function PropertyCard({
  property,
  onPress,
  onFavorite,
  isFavorite = false,
  variant = 'vertical',
}: PropertyCardProps) {
  const { colors, radius, fontSize, spacing, shadow } = useTheme();

  if (variant === 'horizontal') {
    return (
      <PressableScale
        style={[
          styles.horizontalCard,
          {
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderColor: colors.border,
          },
          shadow.md,
        ]}
        onPress={onPress}
      >
        <Image
          source={{ uri: property.images?.[0] || 'https://via.placeholder.com/120x120' }}
          style={[styles.horizontalImage, { borderRadius: radius.lg }]}
        />
        <View style={styles.horizontalContent}>
          <View style={styles.priceRow}>
            <Text
              style={[styles.price, { color: colors.primary, fontSize: fontSize.lg }]}
            >
              {formatPrice(property.price, property.listingType)}
            </Text>
            {onFavorite && (
              <TouchableOpacity onPress={onFavorite} style={styles.heartBtn}>
                <MaterialCommunityIcons
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={22}
                  color={isFavorite ? colors.error : colors.gray400}
                />
              </TouchableOpacity>
            )}
          </View>
          <Text
            style={[styles.title, { color: colors.text, fontSize: fontSize.md }]}
            numberOfLines={1}
          >
            {property.title}
          </Text>
          <View style={styles.locationRow}>
            <MaterialCommunityIcons
              name="map-marker-outline"
              size={14}
              color={colors.textSecondary}
            />
            <Text
              style={[
                styles.location,
                { color: colors.textSecondary, fontSize: fontSize.xs },
              ]}
              numberOfLines={1}
            >
              {property.address}, {property.city}
            </Text>
          </View>
          <View style={styles.features}>
            <Text style={[styles.featureText, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
              {formatBedrooms(property.bedrooms)} · {formatBathrooms(property.bathrooms)} · {formatArea(property.area, property.areaUnit)}
            </Text>
          </View>
        </View>
      </PressableScale>
    );
  }

  return (
    <PressableScale
      style={[
        styles.verticalCard,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
        },
        shadow.md,
      ]}
      onPress={onPress}
    >
      <View>
        <Image
          source={{ uri: property.images?.[0] || 'https://via.placeholder.com/300x200' }}
          style={[styles.verticalImage, { borderRadius: radius.lg }]}
        />
        <View style={styles.imageOverlay}>
          <Badge
            label={property.listingType === 'sale' ? 'For Sale' : 'For Rent'}
            variant={property.listingType === 'sale' ? 'primary' : 'secondary'}
          />
        </View>
        {onFavorite && (
          <TouchableOpacity
            onPress={onFavorite}
            style={[styles.heartButton, { backgroundColor: colors.surface }]}
          >
            <MaterialCommunityIcons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={isFavorite ? colors.error : colors.gray500}
            />
          </TouchableOpacity>
        )}
      </View>
      <View style={[styles.verticalContent, { padding: spacing.md }]}>
        <Text
          style={[styles.price, { color: colors.primary, fontSize: fontSize.xl }]}
        >
          {formatPrice(property.price, property.listingType)}
        </Text>
        <Text
          style={[styles.title, { color: colors.text, fontSize: fontSize.lg, marginTop: 4 }]}
          numberOfLines={1}
        >
          {property.title}
        </Text>
        <View style={styles.locationRow}>
          <MaterialCommunityIcons
            name="map-marker-outline"
            size={14}
            color={colors.textSecondary}
          />
          <Text
            style={[
              styles.location,
              { color: colors.textSecondary, fontSize: fontSize.xs },
            ]}
            numberOfLines={1}
          >
            {property.city}, {property.state}
          </Text>
        </View>
        <View style={[styles.featuresRow, { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }]}>
          <FeatureItem
            icon="bed-outline"
            text={formatBedrooms(property.bedrooms)}
            colors={colors}
            fontSize={fontSize}
          />
          <FeatureItem
            icon="bathtub-outline"
            text={formatBathrooms(property.bathrooms)}
            colors={colors}
            fontSize={fontSize}
          />
          <FeatureItem
            icon="resize"
            text={formatArea(property.area, property.areaUnit)}
            colors={colors}
            fontSize={fontSize}
          />
        </View>
      </View>
    </PressableScale>
  );
}

function FeatureItem({
  icon,
  text,
  colors,
  fontSize,
}: {
  icon: string;
  text: string;
  colors: any;
  fontSize: any;
}) {
  return (
    <View style={styles.featureItem}>
      <MaterialCommunityIcons
        name={icon as any}
        size={16}
        color={colors.textSecondary}
      />
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: fontSize.xs,
          marginLeft: 4,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Vertical card
  verticalCard: {
    marginBottom: 16,
    overflow: 'hidden',
  },
  verticalImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#E5E7EB',
  },
  verticalContent: {},
  // Horizontal card
  horizontalCard: {
    flexDirection: 'row',
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  horizontalImage: {
    width: 120,
    height: 120,
    backgroundColor: '#E5E7EB',
  },
  horizontalContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  // Common
  imageOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  heartButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 1px 4px rgba(0,0,0,0.1)',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: {
    fontWeight: '700',
  },
  heartBtn: {
    padding: 4,
  },
  title: {
    fontWeight: '600',
    marginTop: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  location: {
    marginLeft: 4,
    flex: 1,
  },
  features: {
    marginTop: 6,
  },
  featuresRow: {
    flexDirection: 'row',
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    fontWeight: '500',
  },
});
