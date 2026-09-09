import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList, Tour } from '../../types';
import { useAuthContext } from '../../context/AuthContext';
import { getTour, updateTourStatus, rescheduleTour } from '../../services/tourService';
import { formatDateTime } from '../../utils/formatters';
import AddToCalendarButton from '../../components/tours/AddToCalendarButton';
import Badge from '../../components/common/Badge';

type RouteProps = RouteProp<RootStackParamList, 'TourDetails'>;

const STATUS_META: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
  pending: { label: 'Pending', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  completed: { label: 'Completed', variant: 'info' },
  canceled: { label: 'Canceled', variant: 'error' },
  no_show: { label: 'No Show', variant: 'error' },
  rescheduled: { label: 'Rescheduled', variant: 'info' },
};

export default function TourDetailsScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProps>();
  const { tourId } = route.params;
  const { user } = useAuthContext();
  const insets = useSafeAreaInsets();

  const [tour, setTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTour();
  }, [tourId]);

  const loadTour = async () => {
    setLoading(true);
    try {
      const data = await getTour(tourId);
      setTour(data);
    } catch {
      Alert.alert('Error', 'Failed to load tour details');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    Alert.alert('Cancel Tour', 'Are you sure you want to cancel this tour?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateTourStatus(tourId, 'canceled', user?.uid);
            loadTour();
          } catch {
            Alert.alert('Error', 'Failed to cancel tour');
          }
        },
      },
    ]);
  };

  const handleMarkComplete = async () => {
    try {
      await updateTourStatus(tourId, 'completed');
      loadTour();
    } catch {
      Alert.alert('Error', 'Failed to mark as complete');
    }
  };

  const handleNoShow = async () => {
    Alert.alert('Mark No-Show', 'Mark this tour as a no-show?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          try {
            await updateTourStatus(tourId, 'no_show');
            loadTour();
          } catch {
            Alert.alert('Error', 'Failed to mark as no-show');
          }
        },
      },
    ]);
  };

  if (loading || !tour) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.gray500 }}>Loading...</Text>
      </View>
    );
  }

  const statusMeta = STATUS_META[tour.status] || STATUS_META.pending;
  const isUpcoming = new Date(tour.datetime) > new Date();
  const isSeller = user?.uid === tour.sellerId;

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
          Tour Details
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status */}
        <View style={styles.statusRow}>
          <Badge label={statusMeta.label} variant={statusMeta.variant} size="md" />
        </View>

        {/* Property */}
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={[styles.propertyTitle, { color: colors.text, fontSize: fontSize.lg }]}>
            {tour.propertyTitle}
          </Text>
        </View>

        {/* Details */}
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1 }]}>
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="calendar" size={20} color={colors.primary} />
            <View>
              <Text style={[styles.detailLabel, { color: colors.textLight, fontSize: fontSize.xs }]}>Date & Time</Text>
              <Text style={[styles.detailValue, { color: colors.text, fontSize: fontSize.md }]}>{formatDateTime(tour.datetime)}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="clock-outline" size={20} color={colors.primary} />
            <View>
              <Text style={[styles.detailLabel, { color: colors.textLight, fontSize: fontSize.xs }]}>Duration</Text>
              <Text style={[styles.detailValue, { color: colors.text, fontSize: fontSize.md }]}>{tour.duration} minutes</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="account-group" size={20} color={colors.primary} />
            <View>
              <Text style={[styles.detailLabel, { color: colors.textLight, fontSize: fontSize.xs }]}>Attendees</Text>
              <Text style={[styles.detailValue, { color: colors.text, fontSize: fontSize.md }]}>{tour.attendees}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="account" size={20} color={colors.primary} />
            <View>
              <Text style={[styles.detailLabel, { color: colors.textLight, fontSize: fontSize.xs }]}>
                {isSeller ? 'Buyer' : 'Seller'}
              </Text>
              <Text style={[styles.detailValue, { color: colors.text, fontSize: fontSize.md }]}>
                {isSeller ? tour.buyerName : tour.sellerName}
              </Text>
            </View>
          </View>
        </View>

        {tour.notes ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.notesLabel, { color: colors.textLight, fontSize: fontSize.xs }]}>Notes</Text>
            <Text style={[styles.notesText, { color: colors.text, fontSize: fontSize.sm }]}>{tour.notes}</Text>
          </View>
        ) : null}

        {/* Add to Calendar */}
        {isUpcoming && tour.status !== 'canceled' && (
          <AddToCalendarButton tour={tour} />
        )}

        {/* Actions */}
        {isUpcoming && tour.status !== 'canceled' && (
          <View style={styles.actions}>
            {isSeller && tour.status === 'pending' && (
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await updateTourStatus(tourId, 'confirmed');
                    loadTour();
                  } catch {
                    Alert.alert('Error', 'Failed to confirm');
                  }
                }}
                style={[styles.actionBtn, { backgroundColor: colors.success }]}
              >
                <Text style={[styles.actionText, { color: colors.white, fontSize: fontSize.md }]}>Confirm</Text>
              </TouchableOpacity>
            )}
            {isSeller && (tour.status === 'pending' || tour.status === 'confirmed') && (
              <>
                <TouchableOpacity onPress={handleMarkComplete} style={[styles.actionBtn, { backgroundColor: colors.info }]}>
                  <Text style={[styles.actionText, { color: colors.white, fontSize: fontSize.md }]}>Complete</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleNoShow} style={[styles.actionBtn, { backgroundColor: colors.warning }]}>
                  <Text style={[styles.actionText, { color: colors.white, fontSize: fontSize.md }]}>No Show</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={handleCancel} style={[styles.actionBtn, { backgroundColor: colors.error }]}>
              <Text style={[styles.actionText, { color: colors.white, fontSize: fontSize.md }]}>Cancel Tour</Text>
            </TouchableOpacity>
          </View>
        )}
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
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  statusRow: { alignItems: 'flex-start' },
  card: { padding: 16 },
  propertyTitle: { fontWeight: '700' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  detailLabel: { marginBottom: 2 },
  detailValue: { fontWeight: '600' },
  notesLabel: { marginBottom: 4 },
  notesText: { lineHeight: 20 },
  actions: { gap: 10, marginTop: 8 },
  actionBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  actionText: { fontWeight: '700' },
});
