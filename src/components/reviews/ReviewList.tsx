import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Review } from '../../types';
import ReviewCard from './ReviewCard';

interface ReviewListProps {
  reviews: Review[];
  isSeller?: boolean;
  emptyMessage?: string;
  onRefresh?: () => void;
  onFlagged?: () => void;
  onResponseAdded?: () => void;
}

export default function ReviewList({
  reviews,
  isSeller = false,
  emptyMessage = 'No reviews yet',
  onRefresh,
  onFlagged,
  onResponseAdded,
}: ReviewListProps) {
  const { colors, fontSize, spacing } = useTheme();

  if (reviews.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="star-outline" size={48} color={colors.gray300} />
        <Text style={[styles.emptyText, { color: colors.gray500, fontSize: fontSize.md }]}>
          {emptyMessage}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={reviews}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ReviewCard
          review={item}
          isSeller={isSeller}
          onFlagged={onFlagged}
          onResponseAdded={onResponseAdded}
        />
      )}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 20,
  },
});
