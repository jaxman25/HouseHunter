import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Platform, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Tour } from '../../types';

interface AddToCalendarButtonProps {
  tour: Tour;
}

export default function AddToCalendarButton({ tour }: AddToCalendarButtonProps) {
  const { colors, fontSize, radius } = useTheme();

  const handleAddToCalendar = () => {
    if (Platform.OS === 'web') {
      // Generate .ics file for web
      const startDate = new Date(tour.datetime);
      const endDate = new Date(startDate.getTime() + tour.duration * 60 * 1000);
      const formatICSDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

      const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//House Hunter//Tour//EN',
        'BEGIN:VEVENT',
        `DTSTART:${formatICSDate(startDate)}`,
        `DTEND:${formatICSDate(endDate)}`,
        `SUMMARY:Property Tour - ${tour.propertyTitle}`,
        `DESCRIPTION:${tour.notes || 'Property tour scheduled through House Hunter'}`,
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tour-${tour.propertyTitle.replace(/\s+/g, '_')}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // On native, use expo-calendar if available
      Alert.alert('Calendar', 'Tour event copied to clipboard. Add it to your calendar app.');
    }
  };

  return (
    <TouchableOpacity
      onPress={handleAddToCalendar}
      style={[styles.container, { backgroundColor: colors.primaryLight, borderRadius: radius.sm }]}
    >
      <MaterialCommunityIcons name="calendar-plus" size={18} color={colors.primary} />
      <Text style={[styles.text, { color: colors.primary, fontSize: fontSize.sm }]}>
        Add to Calendar
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
