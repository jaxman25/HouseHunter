import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import StarRating from './StarRating';
import { createReview } from '../../services/reviewService';

interface ReviewFormProps {
  propertyId: string;
  sellerId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function ReviewForm({ propertyId, sellerId, onSuccess, onCancel }: ReviewFormProps) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pros, setPros] = useState<string[]>(['']);
  const [cons, setCons] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);

  const addPro = () => setPros([...pros, '']);
  const addCon = () => setCons([...cons, '']);
  const updatePro = (index: number, value: string) => {
    const updated = [...pros];
    updated[index] = value;
    setPros(updated);
  };
  const updateCon = (index: number, value: string) => {
    const updated = [...cons];
    updated[index] = value;
    setCons(updated);
  };
  const removePro = (index: number) => setPros(pros.filter((_, i) => i !== index));
  const removeCon = (index: number) => setCons(cons.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!user) return;
    if (rating === 0) {
      Alert.alert('Rating Required', 'Please select a star rating');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Title Required', 'Please add a review title');
      return;
    }
    if (!content.trim()) {
      Alert.alert('Content Required', 'Please write your review');
      return;
    }

    setLoading(true);
    try {
      await createReview({
        propertyId,
        sellerId,
        buyerId: user.uid,
        rating,
        title: title.trim(),
        content: content.trim(),
        pros: pros.filter((p) => p.trim()),
        cons: cons.filter((c) => c.trim()),
        isVerifiedPurchase: true,
      });
      Alert.alert('Review Submitted', 'Your review has been posted successfully.');
      onSuccess?.();
    } catch (error) {
      Alert.alert('Error', 'Failed to submit review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xl }]}>
            Write a Review
          </Text>
          <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close" size={24} color={colors.gray500} />
          </TouchableOpacity>
        </View>

        {/* Star Rating */}
        <View style={styles.ratingSection}>
          <Text style={[styles.label, { color: colors.text, fontSize: fontSize.md }]}>
            Your Rating
          </Text>
          <StarRating
            rating={rating}
            size={36}
            interactive
            onRatingChange={setRating}
          />
          {rating > 0 && (
            <Text style={[styles.ratingText, { color: colors.warning, fontSize: fontSize.sm }]}>
              {rating === 1 ? 'Poor' : rating === 2 ? 'Fair' : rating === 3 ? 'Good' : rating === 4 ? 'Very Good' : 'Excellent'}
            </Text>
          )}
        </View>

        {/* Title */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text, fontSize: fontSize.md }]}>
            Review Title
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Summarize your experience"
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.gray100, fontSize: fontSize.sm }]}
            placeholderTextColor={colors.gray400}
            maxLength={100}
          />
        </View>

        {/* Content */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text, fontSize: fontSize.md }]}>
            Your Review
          </Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Share your experience with this property and seller..."
            multiline
            numberOfLines={5}
            style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.gray100, fontSize: fontSize.sm }]}
            placeholderTextColor={colors.gray400}
          />
        </View>

        {/* Pros */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text, fontSize: fontSize.md }]}>
            Pros
          </Text>
          {pros.map((pro, i) => (
            <View key={`pro-${i}`} style={styles.listItem}>
              <MaterialCommunityIcons name="plus-circle" size={20} color={colors.success} />
              <TextInput
                value={pro}
                onChangeText={(v) => updatePro(i, v)}
                placeholder="Add a positive point"
                style={[styles.listInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.gray100, fontSize: fontSize.sm }]}
                placeholderTextColor={colors.gray400}
              />
              {pros.length > 1 && (
                <TouchableOpacity onPress={() => removePro(i)}>
                  <MaterialCommunityIcons name="close-circle" size={20} color={colors.gray400} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity onPress={addPro} style={styles.addItem}>
            <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
            <Text style={[styles.addItemText, { color: colors.primary, fontSize: fontSize.sm }]}>Add Pro</Text>
          </TouchableOpacity>
        </View>

        {/* Cons */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text, fontSize: fontSize.md }]}>
            Cons
          </Text>
          {cons.map((con, i) => (
            <View key={`con-${i}`} style={styles.listItem}>
              <MaterialCommunityIcons name="minus-circle" size={20} color={colors.error} />
              <TextInput
                value={con}
                onChangeText={(v) => updateCon(i, v)}
                placeholder="Add a negative point"
                style={[styles.listInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.gray100, fontSize: fontSize.sm }]}
                placeholderTextColor={colors.gray400}
              />
              {cons.length > 1 && (
                <TouchableOpacity onPress={() => removeCon(i)}>
                  <MaterialCommunityIcons name="close-circle" size={20} color={colors.gray400} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity onPress={addCon} style={styles.addItem}>
            <MaterialCommunityIcons name="plus" size={16} color={colors.error} />
            <Text style={[styles.addItemText, { color: colors.error, fontSize: fontSize.sm }]}>Add Con</Text>
          </TouchableOpacity>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading || rating === 0}
          style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: loading || rating === 0 ? 0.5 : 1 }]}
        >
          <Text style={[styles.submitText, { color: colors.white, fontSize: fontSize.md }]}>
            {loading ? 'Submitting...' : 'Submit Review'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontWeight: '700',
  },
  ratingSection: {
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  ratingText: {
    marginTop: 4,
    fontWeight: '600',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  listInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  addItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  addItemText: {
    fontWeight: '600',
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitText: {
    fontWeight: '700',
  },
});
