import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Review } from '../../types';
import { getFlaggedReviews, removeReview } from '../../services/reviewService';
import ReviewCard from '../../components/reviews/ReviewCard';
import AdminLayout from '../../components/admin/AdminLayout';

export default function ReviewModerationScreen() {
  const { colors, fontSize } = useTheme();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFlaggedReviews();
      setReviews(data);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleRemove = (reviewId: string) => {
    Alert.alert('Remove Review', 'Are you sure you want to remove this review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeReview(reviewId);
            setReviews((prev) => prev.filter((r) => r.id !== reviewId));
            Alert.alert('Removed', 'Review has been removed');
          } catch {
            Alert.alert('Error', 'Failed to remove review');
          }
        },
      },
    ]);
  };

  return (
    <AdminLayout title="Review Moderation" active="reports">
      {loading ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.gray500, fontSize: fontSize.md }]}>
            Loading...
          </Text>
        </View>
      ) : reviews.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="check-circle" size={48} color={colors.success} />
          <Text style={[styles.emptyText, { color: colors.gray500, fontSize: fontSize.md }]}>
            No flagged reviews
          </Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View>
              <ReviewCard review={item} isSeller />
              <TouchableOpacity
                onPress={() => handleRemove(item.id)}
                style={[styles.removeBtn, { backgroundColor: colors.error + '15' }]}
              >
                <MaterialCommunityIcons name="delete" size={16} color={colors.error} />
                <Text style={[styles.removeText, { color: colors.error, fontSize: fontSize.sm }]}>
                  Remove Review
                </Text>
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: { fontWeight: '500' },
  listContent: { paddingBottom: 20 },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  removeText: { fontWeight: '600' },
});
