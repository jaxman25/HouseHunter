import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: number;
  interactive?: boolean;
  onRatingChange?: (rating: number) => void;
  showValue?: boolean;
}

export default function StarRating({
  rating,
  maxStars = 5,
  size = 20,
  interactive = false,
  onRatingChange,
  showValue = false,
}: StarRatingProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {Array.from({ length: maxStars }, (_, i) => {
        const starValue = i + 1;
        const iconName =
          rating >= starValue
            ? 'star'
            : rating >= starValue - 0.5
            ? 'star-half-full'
            : 'star-outline';

        if (interactive) {
          return (
            <TouchableOpacity
              key={i}
              onPress={() => onRatingChange?.(starValue)}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${starValue} star${starValue > 1 ? 's' : ''}`}
            >
              <MaterialCommunityIcons
                name={iconName as any}
                size={size}
                color={colors.warning}
                style={styles.star}
              />
            </TouchableOpacity>
          );
        }

        return (
          <MaterialCommunityIcons
            key={i}
            name={iconName as any}
            size={size}
            color={colors.warning}
            style={styles.star}
          />
        );
      })}
      {showValue && rating > 0 && (
        <View style={[styles.valueBadge, { backgroundColor: colors.warning }]}>
          <MaterialCommunityIcons name="star" size={12} color={colors.white} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    marginRight: 2,
  },
  valueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
  },

});
