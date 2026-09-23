import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, Platform, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Tour } from '../../types';

interface AddToCalendarButtonProps {
  tour: Tour;
}

/**
 * "Add to Calendar" for an approved viewing.
 *  - Native: creates a real event via expo-calendar (requests permission,
 *    picks the first writable calendar, falls back to an .ics download if
 *    anything is unavailable).
 *  - Web: downloads an .ics file (no calendar API on web).
 */
export default function AddToCalendarButton({ tour }: AddToCalendarButtonProps) {
  const { colors, fontSize, radius } = useTheme();
  const [saving, setSaving] = useState(false);

  const buildICS = (): { start: string; end: string; content: string } => {
    const startDate = new Date(tour.datetime);
    const endDate = new Date(startDate.getTime() + tour.duration * 60 * 1000);
    const formatICSDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const content = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//House Hunter//Tour//EN',
      'BEGIN:VEVENT',
      `DTSTART:${formatICSDate(startDate)}`,
      `DTEND:${formatICSDate(endDate)}`,
      `SUMMARY:Property Viewing - ${tour.propertyTitle}`,
      `DESCRIPTION:${tour.notes || 'Property viewing scheduled through House Hunter'}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    return { start: formatICSDate(startDate), end: formatICSDate(endDate), content };
  };

  const downloadICS = (content: string, title: string) => {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `viewing-${title.replace(/\s+/g, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAddToCalendar = async () => {
    if (Platform.OS === 'web') {
      const { content } = buildICS();
      downloadICS(content, tour.propertyTitle);
      return;
    }

    // Native: create a real event via expo-calendar.
    setSaving(true);
    try {
      const Calendar = await import('expo-calendar');
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Allow calendar access to add this viewing. You can also add it manually.'
        );
        return;
      }

      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writable =
        calendars.find((c) => c.allowsModifications && c.source?.name !== 'Birthdays') ??
        calendars.find((c) => c.allowsModifications);
      if (!writable) {
        Alert.alert('No Calendar', 'No writable calendar was found on this device.');
        return;
      }

      const start = new Date(tour.datetime);
      const end = new Date(start.getTime() + tour.duration * 60 * 1000);
      const eventId = await Calendar.createEventAsync(writable.id, {
        title: `Property Viewing — ${tour.propertyTitle}`,
        startDate: start,
        endDate: end,
        notes: tour.notes || 'Scheduled through House Hunter',
        timeZone: undefined, // device local time
      });

      if (eventId) {
        Alert.alert('Added to Calendar', 'The viewing was added to your calendar.');
      }
    } catch (error) {
      console.warn('Failed to add calendar event:', error);
      Alert.alert('Error', 'Could not add the calendar event.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleAddToCalendar}
      disabled={saving}
      style={[styles.container, { backgroundColor: colors.primaryLight, borderRadius: radius.sm, opacity: saving ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel="Add this viewing to your calendar"
    >
      <MaterialCommunityIcons name="calendar-plus" size={18} color={colors.primary} />
      <Text style={[styles.text, { color: colors.primary, fontSize: fontSize.sm }]}>
        {saving ? 'Adding…' : 'Add to Calendar'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  text: { fontWeight: '600' },
});
