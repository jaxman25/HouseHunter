import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList } from '../../types';
import Button from '../../components/common/Button';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import { submitUserReview, hasUserReviewedReviewer } from '../../services/userReviewService';

type Route = RouteProp<RootStackParamList, 'WriteUserReview'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const MIN_TEXT = 4;
const MAX_TEXT = 1000;

/**
 * "Rate your experience" — write a peer reputation review about another user
 * after a completed viewing or a substantive chat. Reached from the review
 * prompt notification or the profile screen.
 */
export default function WriteUserReviewScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuthContext();
  const insets = useSafeAreaInsets();
  const { revieweeId, revieweeName, tourId, propertyId } = route.params;

  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = rating >= 1 && text.trim().length >= MIN_TEXT && !submitting;

  const handleSubmit = async () => {
    if (!user) return;
    if (revieweeId === user.uid) {
      setError('You cannot review yourself.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const already = await hasUserReviewedReviewer(user.uid, revieweeId);
      if (already) {
        Alert.alert('Already reviewed', 'You have already rated this user.');
        navigation.goBack();
        return;
      }
      await submitUserReview({
        reviewerId: user.uid,
        revieweeId,
        rating,
        text: text.trim(),
        reviewerName: user.displayName || undefined,
        revieweeName,
        ...(tourId ? { tourId } : {}),
        ...(propertyId ? { propertyId } : {}),
      });
      Alert.alert('Thank you', 'Your rating has been submitted.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      console.error('submitUserReview failed:', err);
      setError('Could not submit your rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LoadingOverlay visible={submitting} />
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Rate Your Experience
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
          {revieweeName || 'The other party'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 }}>
          How was your interaction?
        </Text>

        {/* Star picker */}
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => setRating(star)}
              accessibilityRole="button"
              accessibilityLabel={`${star} star${star !== 1 ? 's' : ''}`}
              accessibilityState={{ selected: rating >= star }}
            >
              <MaterialCommunityIcons
                name={rating >= star ? 'star' : 'star-outline'}
                size={40}
                color={rating >= star ? colors.warning : colors.gray300}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Comment */}
        <Text style={[styles.label, { color: colors.text, fontSize: fontSize.sm }]}>
          Add a short comment (optional but helpful)
        </Text>
        <View
          style={[
            styles.textArea,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md },
          ]}
        >
          <TextInput
            multiline
            value={text}
            onChangeText={setText}
            maxLength={MAX_TEXT}
            placeholder="Responsive, punctual, honest…"
            placeholderTextColor={colors.textLight}
            style={{ color: colors.text, fontSize: fontSize.sm, minHeight: 100, textAlignVertical: 'top', padding: 12, flex: 1 }}
            accessibilityLabel="Review comment"
          />
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 4, textAlign: 'right' }}>
          {text.length}/{MAX_TEXT}
        </Text>

        {error ? (
          <Text style={{ color: colors.error, fontSize: fontSize.sm, marginTop: spacing.sm }}>{error}</Text>
        ) : null}

        <View style={{ marginTop: spacing.lg }}>
          <Button
            title="Submit Rating"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontWeight: '700', textAlign: 'center' },
  starRow: { flexDirection: 'row', gap: 6, marginTop: 18, marginBottom: 8 },
  label: { fontWeight: '600', marginTop: 16, marginBottom: 8 },
  textArea: { borderWidth: 1 },
});
