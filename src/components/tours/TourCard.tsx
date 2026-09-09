import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Tour } from '../../types';
import { formatDateTime, formatTime } from '../../utils/formatters';
import Badge from '../common/Badge';

interface TourCardProps {
  tour: Tour;
  onPress?: () => void;
  onConfirm?: () => void;
  onDecline?: () => void;
}

const STATUS_META: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
  pending: { label: 'Pending', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  completed: { label: 'Completed', variant: 'info' },
  canceled: { label: 'Canceled', variant: 'error' },
  no_show: { label: 'No Show', variant: 'error' },
  rescheduled: { label: 'Rescheduled', variant: 'info' },
};

export default function TourCard({ tour, onPress, onConfirm, onDecline }: TourCardProps) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const statusMeta = STATUS_META[tour.status] || STATUS_META.pending;
  const isUpcoming = new Date(tour.datetime) > new Date() && tour.status !== 'canceled';

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.card, borderRadius: radius.md, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="calendar-clock" size={20} color={colors.primary} />
          <Text style={[styles.dateText, { color: colors.text, fontSize: fontSize.sm }]}>
            {formatDateTime(tour.datetime)}
          </Text>
        </View>
        <Badge label={statusMeta.label} variant={statusMeta.variant} size="sm" />
      </View>

      <Text style={[styles.propertyTitle, { color: colors.text, fontSize: fontSize.md }]} numberOfLines={1}>
        {tour.propertyTitle}
      </Text>

      <View style={styles.infoRow}>
        <MaterialCommunityIcons name="account" size={14} color={colors.gray500} />
        <Text style={[styles.infoText, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
          {tour.attendees} attendee{tour.attendees > 1 ? 's' : ''} · {tour.duration} min
        </Text>
      </View>

      {tour.notes ? (
        <Text style={[styles.notes, { color: colors.textLight, fontSize: fontSize.xs }]} numberOfLines={2}>
          {tour.notes}
        </Text>
      ) : null}

      {isUpcoming && tour.status === 'pending' && (onConfirm || onDecline) && (
        <View style={styles.actions}>
          {onDecline && (
            <TouchableOpacity
              onPress={onDecline}
              style={[styles.actionBtn, { backgroundColor: colors.gray100 }]}
            >
              <Text style={[styles.declineText, { color: colors.gray600, fontSize: fontSize.sm }]}>Decline</Text>
            </TouchableOpacity>
          )}
          {onConfirm && (
            <TouchableOpacity
              onPress={onConfirm}
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.confirmText, { color: colors.white, fontSize: fontSize.sm }]}>Confirm</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
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
  dateText: {
    fontWeight: '600',
  },
  propertyTitle: {
    fontWeight: '700',
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  infoText: {},
  notes: {
    marginTop: 6,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  declineText: {
    fontWeight: '600',
  },
  confirmText: {
    fontWeight: '600',
  },
});
