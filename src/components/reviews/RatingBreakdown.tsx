import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { ReviewRatingBreakdown } from '../../types';

interface RatingBreakdownProps {
  rating: ReviewRatingBreakdown;
}

export default function RatingBreakdown({ rating }: RatingBreakdownProps) {
  const { colors, fontSize } = useTheme();

  const maxCount = Math.max(...Object.values(rating.breakdown), 1);

  return (
    <View style={styles.container}>
      {/* Average */}
      <View style={styles.averageSection}>
        <Text style={[styles.averageNumber, { color: colors.text, fontSize: fontSize.xxxl }]}>
          {rating.averageRating > 0 ? rating.averageRating.toFixed(1) : '—'}
        </Text>
        <View style={styles.stars}>
          {Array.from({ length: 5 }, (_, i) => (
            <MaterialCommunityIcons
              key={i}
              name={i < Math.round(rating.averageRating) ? 'star' : 'star-outline'}
              size={18}
              color={colors.warning}
            />
          ))}
        </View>
        <Text style={[styles.totalText, { color: colors.textLight, fontSize: fontSize.xs }]}>
          {rating.totalReviews} review{rating.totalReviews !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Breakdown */}
      <View style={styles.breakdownSection}>
        {[5, 4, 3, 2, 1].map((star) => {
          const count = rating.breakdown[star] || 0;
          const percentage = rating.totalReviews > 0 ? (count / maxCount) * 100 : 0;

          return (
            <View key={star} style={styles.barRow}>
              <Text style={[styles.barLabel, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
                {star}
              </Text>
              <MaterialCommunityIcons name="star" size={14} color={colors.warning} />
              <View style={[styles.barTrack, { backgroundColor: colors.gray200 }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: colors.warning,
                      width: `${percentage}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barCount, { color: colors.textLight, fontSize: fontSize.xs }]}>
                {count}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 20,
  },
  averageSection: {
    alignItems: 'center',
    minWidth: 80,
  },
  averageNumber: {
    fontWeight: '700',
  },
  stars: {
    flexDirection: 'row',
    marginTop: 4,
  },
  totalText: {
    marginTop: 4,
  },
  breakdownSection: {
    flex: 1,
    gap: 6,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barLabel: {
    width: 12,
    textAlign: 'right',
    fontWeight: '600',
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barCount: {
    width: 24,
    textAlign: 'right',
  },
});
