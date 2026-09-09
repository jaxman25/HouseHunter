import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Review } from '../../types';
import StarRating from './StarRating';
import VerificationBadge from './VerificationBadge';
import { respondToReview, flagReview } from '../../services/reviewService';
import { useAuthContext } from '../../context/AuthContext';
import { getTimeAgo } from '../../utils/helpers';

interface ReviewCardProps {
  review: Review;
  isSeller?: boolean;
  onFlagged?: () => void;
  onResponseAdded?: () => void;
}

export default function ReviewCard({ review, isSeller = false, onFlagged, onResponseAdded }: ReviewCardProps) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();
  const [showResponseInput, setShowResponseInput] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRespond = async () => {
    if (!user || !responseText.trim()) return;
    setLoading(true);
    try {
      await respondToReview(review.id, user.uid, responseText.trim());
      setResponseText('');
      setShowResponseInput(false);
      onResponseAdded?.();
    } catch (error) {
      Alert.alert('Error', 'Failed to post response');
    } finally {
      setLoading(false);
    }
  };

  const handleFlag = () => {
    if (!user) return;
    Alert.alert('Report Review', 'Are you sure you want to report this review as inappropriate?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: async () => {
          try {
            await flagReview(review.id, user.uid);
            onFlagged?.();
            Alert.alert('Reported', 'This review has been flagged for moderation.');
          } catch {
            Alert.alert('Error', 'Failed to report review');
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderRadius: radius.md, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <StarRating rating={review.rating} size={16} />
          <Text style={[styles.date, { color: colors.textLight, fontSize: fontSize.xs }]}>
            {getTimeAgo(review.createdAt)}
          </Text>
        </View>
        <VerificationBadge verified={review.isVerifiedPurchase} />
      </View>

      {/* Title */}
      <Text style={[styles.title, { color: colors.text, fontSize: fontSize.md }]}>
        {review.title}
      </Text>

      {/* Content */}
      <Text style={[styles.content, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
        {review.content}
      </Text>

      {/* Pros & Cons */}
      {(review.pros.length > 0 || review.cons.length > 0) && (
        <View style={styles.prosCons}>
          {review.pros.map((pro, i) => (
            <View key={`pro-${i}`} style={styles.proConItem}>
              <MaterialCommunityIcons name="check-circle" size={14} color={colors.success} />
              <Text style={[styles.proConText, { color: colors.textSecondary, fontSize: fontSize.xs }]}>{pro}</Text>
            </View>
          ))}
          {review.cons.map((con, i) => (
            <View key={`con-${i}`} style={styles.proConItem}>
              <MaterialCommunityIcons name="close-circle" size={14} color={colors.error} />
              <Text style={[styles.proConText, { color: colors.textSecondary, fontSize: fontSize.xs }]}>{con}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Seller Response */}
      {review.sellerResponse && (
        <View style={[styles.responseContainer, { backgroundColor: colors.gray100, borderRadius: radius.sm }]}>
          <View style={styles.responseHeader}>
            <MaterialCommunityIcons name="reply" size={14} color={colors.primary} />
            <Text style={[styles.responseLabel, { color: colors.primary, fontSize: fontSize.xs }]}>
              Seller Response
            </Text>
          </View>
          <Text style={[styles.responseText, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
            {review.sellerResponse.content}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {isSeller && !review.sellerResponse && user?.uid === review.sellerId && (
          <TouchableOpacity
            onPress={() => setShowResponseInput(!showResponseInput)}
            style={[styles.actionBtn, { backgroundColor: colors.primaryLight }]}
          >
            <Text style={[styles.actionText, { color: colors.primary, fontSize: fontSize.xs }]}>
              Reply
            </Text>
          </TouchableOpacity>
        )}
        {!isSeller && user && user.uid !== review.buyerId && (
          <TouchableOpacity onPress={handleFlag} style={[styles.actionBtn, { backgroundColor: colors.gray100 }]}>
            <MaterialCommunityIcons name="flag-outline" size={12} color={colors.gray500} />
            <Text style={[styles.actionText, { color: colors.gray500, fontSize: fontSize.xs }]}>
              Report
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Response Input */}
      {showResponseInput && (
        <View style={styles.responseInputContainer}>
          <TextInput
            value={responseText}
            onChangeText={setResponseText}
            placeholder="Write your response..."
            multiline
            style={[styles.responseInput, { color: colors.text, borderColor: colors.border, fontSize: fontSize.sm }]}
            placeholderTextColor={colors.gray400}
          />
          <View style={styles.responseInputActions}>
            <TouchableOpacity onPress={() => setShowResponseInput(false)}>
              <Text style={[styles.cancelText, { color: colors.gray500, fontSize: fontSize.sm }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRespond}
              disabled={loading || !responseText.trim()}
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: loading || !responseText.trim() ? 0.5 : 1 }]}
            >
              <Text style={[styles.submitText, { color: colors.white, fontSize: fontSize.sm }]}>
                {loading ? 'Posting...' : 'Post Reply'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  date: {},
  title: {
    fontWeight: '700',
    marginBottom: 4,
  },
  content: {
    lineHeight: 20,
    marginBottom: 8,
  },
  prosCons: {
    gap: 4,
    marginBottom: 8,
  },
  proConItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  proConText: {
    flex: 1,
  },
  responseContainer: {
    padding: 12,
    marginTop: 8,
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  responseLabel: {
    fontWeight: '600',
  },
  responseText: {
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  actionText: {
    fontWeight: '600',
  },
  responseInputContainer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
  },
  responseInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  responseInputActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelText: {
    fontWeight: '600',
  },
  submitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  submitText: {
    fontWeight: '600',
  },
});
