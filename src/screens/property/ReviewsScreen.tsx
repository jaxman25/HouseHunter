import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';
import { usePropertyReviews } from '../../hooks/useReviews';
import ReviewList from '../../components/reviews/ReviewList';
import RatingBreakdown from '../../components/reviews/RatingBreakdown';
import { useSellerRating } from '../../hooks/useReviews';

type RouteProps = RouteProp<RootStackParamList, 'Reviews'>;

export default function ReviewsScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProps>();
  const { propertyId } = route.params;
  const insets = useSafeAreaInsets();

  const { reviews, loading } = usePropertyReviews(propertyId);
  // Get sellerId from first review
  const sellerId = reviews.length > 0 ? reviews[0].sellerId : '';
  const { rating } = useSellerRating(sellerId);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.gray100 }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Reviews
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Rating Summary */}
        <View style={[styles.ratingCard, { backgroundColor: colors.card, borderRadius: 12, borderColor: colors.border, borderWidth: 1 }]}>
          <RatingBreakdown rating={rating} />
        </View>

        {/* Reviews List */}
        <ReviewList
          reviews={reviews}
          emptyMessage="No reviews yet"
          onRefresh={() => {}}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  ratingCard: { padding: 16, marginBottom: 16 },
});
