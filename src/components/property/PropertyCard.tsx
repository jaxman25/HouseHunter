import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import PressableScale from '../common/PressableScale';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Property } from '../../types';
import { formatBedrooms, formatBathrooms, formatArea } from '../../utils/helpers';
import PriceDisplay from '../common/PriceDisplay';
import StatusBadge from '../common/StatusBadge';
import { shareProperty } from '../../utils/share';

/** Statuses where the listing is no longer available to new buyers. */
const UNAVAILABLE_STATUSES: Property['status'][] = ['sold', 'rented', 'inactive'];

interface PropertyCardProps {
  property: Property;
  onPress: () => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
  variant?: 'vertical' | 'horizontal' | 'grid';
  /** Overrides the outer container (width/margins) for grid layouts. */
  style?: StyleProp<ViewStyle>;
}

export default function PropertyCard({
  property,
  onPress,
  onFavorite,
  isFavorite = false,
  variant = 'vertical',
  style,
}: PropertyCardProps) {
  const { colors, radius, fontSize, spacing, shadow } = useTheme();
  const isUnavailable = UNAVAILABLE_STATUSES.includes(property.status);

  /* ────────── Grid Card ────────── */
  if (variant === 'grid') {
    return (
      <PressableScale
        style={[
          styles.gridCard,
          {
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
          },
          shadow.sm,
          style,
        ]}
        onPress={onPress}
      >
        <View>
          <Image
            source={property.images?.[0] ? { uri: property.images[0] } : undefined}
            style={[
              styles.gridImage,
              { borderRadius: radius.lg, opacity: isUnavailable ? 0.55 : 1 },
            ]}
            contentFit="cover"
          />
          {/* Badges */}
          <View style={styles.gridOverlay}>
            <View style={styles.gridBadges}>
              <View
                style={[
                  styles.miniBadge,
                  {
                    backgroundColor: property.listingType === 'sale' ? colors.primary : colors.secondary,
                    borderRadius: radius.round,
                  },
                ]}
              >
                <Text style={[styles.miniBadgeText, { color: colors.white, fontSize: 10 }]}>
                  {property.listingType === 'sale' ? 'Sale' : 'Rent'}
                </Text>
              </View>
              <StatusBadge status={property.status} size="sm" />
            </View>
          </View>
          {/* Share */}
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              void shareProperty(property);
            }}
            style={[styles.shareButton]}
            accessibilityRole="button"
            accessibilityLabel={`Share ${property.title}`}
          >
            <MaterialCommunityIcons name="share-variant" size={13} color={colors.white} />
          </TouchableOpacity>
          {/* Favorite */}
          {onFavorite && (
            <TouchableOpacity
              onPress={onFavorite}
              style={[styles.heartButton, { backgroundColor: 'rgba(255,255,255,0.92)' }]}
              accessibilityRole="button"
              accessibilityLabel={`${isFavorite ? 'Remove' : 'Add'} ${property.title} ${isFavorite ? 'from' : 'to'} favorites`}
            >
              <MaterialCommunityIcons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={15}
                color={isFavorite ? colors.error : colors.gray500}
              />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.gridContent}>
          <PriceDisplay
            amount={property.price}
            listingType={property.listingType}
            fontSize={fontSize.md}
          />
          <Text
            style={[styles.gridTitle, { color: colors.text, fontSize: fontSize.sm }]}
            numberOfLines={1}
          >
            {property.title}
          </Text>
          <View style={styles.gridLocation}>
            <MaterialCommunityIcons
              name="map-marker-outline"
              size={11}
              color={colors.textSecondary}
            />
            <Text
              style={[styles.gridLocationText, { color: colors.textSecondary, fontSize: fontSize.xs }]}
              numberOfLines={1}
            >
              {property.city}, {property.state}
            </Text>
          </View>
          <Text
            style={[styles.gridStats, { color: colors.gray500, fontSize: fontSize.xs }]}
            numberOfLines={1}
          >
            {formatBedrooms(property.bedrooms)} · {formatBathrooms(property.bathrooms)} ·{' '}
            {formatArea(property.area, property.areaUnit)}
          </Text>
        </View>
      </PressableScale>
    );
  }

  /* ────────── Horizontal Card ────────── */
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
          shadow.sm,
          style,
        ]}
        onPress={onPress}
      >
        <Image
          source={property.images?.[0] ? { uri: property.images[0] } : undefined}
          style={[
            styles.horizontalImage,
            { borderRadius: radius.lg, opacity: isUnavailable ? 0.55 : 1 },
          ]}
          contentFit="cover"
        />
        <View style={styles.horizontalOverlay}>
          <View
            style={[
              styles.miniBadge,
              {
                backgroundColor: property.listingType === 'sale' ? colors.primary : colors.secondary,
                borderRadius: radius.round,
              },
            ]}
          >
            <Text style={[styles.miniBadgeText, { color: colors.white, fontSize: 10 }]}>
              {property.listingType === 'sale' ? 'Sale' : 'Rent'}
            </Text>
          </View>
          <StatusBadge status={property.status} size="sm" style={{ marginTop: 3 }} />
        </View>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            void shareProperty(property);
          }}
          style={[styles.shareButton]}
          accessibilityRole="button"
          accessibilityLabel={`Share ${property.title}`}
        >
          <MaterialCommunityIcons name="share-variant" size={13} color={colors.white} />
        </TouchableOpacity>
        <View style={styles.horizontalContent}>
          <View style={styles.priceRow}>
            <PriceDisplay
              amount={property.price}
              listingType={property.listingType}
              fontSize={fontSize.lg}
            />
            {onFavorite && (
              <TouchableOpacity
                onPress={onFavorite}
                style={styles.heartBtn}
                accessibilityRole="button"
                accessibilityLabel={`${isFavorite ? 'Remove' : 'Add'} ${property.title} ${isFavorite ? 'from' : 'to'} favorites`}
              >
                <MaterialCommunityIcons
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={20}
                  color={isFavorite ? colors.error : colors.gray500}
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
              size={13}
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
          <View style={[styles.featuresRow, { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }]}>
            <FeatureItem icon="bed-outline" text={formatBedrooms(property.bedrooms)} colors={colors} fontSize={fontSize} />
            <FeatureItem icon="bathtub-outline" text={formatBathrooms(property.bathrooms)} colors={colors} fontSize={fontSize} />
            <FeatureItem icon="resize" text={formatArea(property.area, property.areaUnit)} colors={colors} fontSize={fontSize} />
          </View>
        </View>
      </PressableScale>
    );
  }

  /* ────────── Vertical Card (default) ────────── */
  return (
    <PressableScale
      style={[
        styles.verticalCard,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
        },
        shadow.md,
        style,
      ]}
      onPress={onPress}
    >
      <View>
        <Image
          source={property.images?.[0] ? { uri: property.images[0] } : undefined}
          style={[
            styles.verticalImage,
            { borderRadius: radius.lg, opacity: isUnavailable ? 0.55 : 1 },
          ]}
          contentFit="cover"
        />
        {/* Listing Type Badge */}
        <View style={styles.verticalOverlay}>
          <View
            style={[
              styles.miniBadge,
              {
                backgroundColor: property.listingType === 'sale' ? colors.primary : colors.secondary,
                borderRadius: radius.round,
              },
            ]}
          >
            <Text style={[styles.miniBadgeText, { color: colors.white, fontSize: 10 }]}>
              {property.listingType === 'sale' ? 'For Sale' : 'For Rent'}
            </Text>
          </View>
          <StatusBadge status={property.status} size="sm" style={{ marginTop: 3 }} />
        </View>
        {/* Share */}
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            void shareProperty(property);
          }}
          style={[styles.shareButton]}
          accessibilityRole="button"
          accessibilityLabel={`Share ${property.title}`}
        >
          <MaterialCommunityIcons name="share-variant" size={13} color={colors.white} />
        </TouchableOpacity>
        {/* Favorite */}
        {onFavorite && (
          <TouchableOpacity
            onPress={onFavorite}
            style={[styles.heartButton, { backgroundColor: colors.surface }]}
            accessibilityRole="button"
            accessibilityLabel={`${isFavorite ? 'Remove' : 'Add'} ${property.title} ${isFavorite ? 'from' : 'to'} favorites`}
          >
            <MaterialCommunityIcons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={18}
              color={isFavorite ? colors.error : colors.gray500}
            />
          </TouchableOpacity>
        )}
      </View>
      <View style={[styles.verticalContent, { padding: spacing.md }]}>
        <PriceDisplay
          amount={property.price}
          listingType={property.listingType}
          fontSize={fontSize.xl}
        />
        <Text
          style={[styles.title, { color: colors.text, fontSize: fontSize.lg, marginTop: 4 }]}
          numberOfLines={1}
        >
          {property.title}
        </Text>
        <View style={styles.locationRow}>
          <MaterialCommunityIcons
            name="map-marker-outline"
            size={13}
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
        size={14}
        color={colors.gray400}
      />
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: fontSize.xs,
          marginLeft: 3,
          fontWeight: '500',
        }}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ── Grid ── */
  gridCard: {
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    aspectRatio: 1.3,
    backgroundColor: '#E5E7EB',
  },
  gridContent: {
    padding: 10,
  },
  gridTitle: {
    fontWeight: '600',
    marginTop: 2,
  },
  gridLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 2,
  },
  gridLocationText: {
    flex: 1,
  },
  gridStats: {
    marginTop: 5,
    fontWeight: '500',
  },
  gridOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  gridBadges: {
    gap: 3,
  },
  /* ── Vertical ── */
  verticalCard: {
    marginBottom: 14,
    overflow: 'hidden',
  },
  verticalImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#E5E7EB',
  },
  verticalContent: {},
  verticalOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  /* ── Horizontal ── */
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
  horizontalOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  /* ── Common ── */
  shareButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 1px 4px rgba(0,0,0,0.15)',
  },
  miniBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  miniBadgeText: {
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  featuresRow: {
    flexDirection: 'row',
    gap: 14,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
