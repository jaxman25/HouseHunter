import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { createTour, isSlotAvailable, getAvailability } from '../../services/tourService';
import { getProperty } from '../../services/propertyService';

interface TourRequestModalProps {
  visible: boolean;
  propertyId: string;
  propertyTitle: string;
  sellerId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function TourRequestModal({
  visible,
  propertyId,
  propertyTitle,
  sellerId,
  onClose,
  onSuccess,
}: TourRequestModalProps) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();

  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [attendees, setAttendees] = useState('1');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);

  useEffect(() => {
    if (visible && sellerId) {
      loadAvailability();
    }
  }, [visible, sellerId]);

  const loadAvailability = async () => {
    try {
      const avail = await getAvailability(sellerId);
      if (avail) {
        generateTimeSlots(avail.startTime, avail.endTime);
      } else {
        generateTimeSlots('09:00', '17:00');
      }
    } catch {
      generateTimeSlots('09:00', '17:00');
    }
  };

  const generateTimeSlots = (start: string, end: string) => {
    const [startH, startM] = start.split(':').map(Number);
    const [endH] = end.split(':').map(Number);
    const slots: string[] = [];
    for (let h = startH; h < endH; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
      if (h + 0.5 < endH) slots.push(`${h.toString().padStart(2, '0')}:30`);
    }
    setAvailableSlots(slots);
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!selectedDate || !selectedTime) {
      Alert.alert('Missing Information', 'Please select a date and time');
      return;
    }

    const datetime = new Date(`${selectedDate}T${selectedTime}`);
    if (datetime <= new Date()) {
      Alert.alert('Invalid Date', 'Please select a future date and time');
      return;
    }

    setLoading(true);
    try {
      const property = await getProperty(propertyId);
      await createTour({
        propertyId,
        propertyTitle,
        propertyImage: property?.images?.[0] || '',
        buyerId: user.uid,
        buyerName: user.displayName,
        sellerId,
        sellerName: property?.userName || '',
        datetime: datetime.toISOString(),
        duration: 30,
        attendees: parseInt(attendees) || 1,
        notes: notes.trim(),
      });
      Alert.alert('Tour Requested', 'Your tour request has been sent to the seller.');
      onSuccess?.();
      onClose();
    } catch (error) {
      Alert.alert('Error', (error as Error).message || 'Failed to request tour');
    } finally {
      setLoading(false);
    }
  };

  // Generate next 14 days
  const dates = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i + 1);
    return date;
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color={colors.gray500} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
            Schedule a Tour
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.propertyLabel, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
            {propertyTitle}
          </Text>

          {/* Date Selection */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.md }]}>
              Select Date
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {dates.map((date) => {
                const dateStr = date.toISOString().slice(0, 10);
                const isSelected = selectedDate === dateStr;
                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                const dayNum = date.getDate();
                return (
                  <TouchableOpacity
                    key={dateStr}
                    onPress={() => setSelectedDate(dateStr)}
                    style={[
                      styles.dateChip,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.gray100,
                        borderRadius: radius.sm,
                      },
                    ]}
                  >
                    <Text style={[styles.dayName, { color: isSelected ? colors.white : colors.gray500, fontSize: fontSize.xs }]}>
                      {dayName}
                    </Text>
                    <Text style={[styles.dayNum, { color: isSelected ? colors.white : colors.text, fontSize: fontSize.lg }]}>
                      {dayNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Time Selection */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.md }]}>
              Select Time
            </Text>
            <View style={styles.timeGrid}>
              {availableSlots.map((slot) => {
                const isSelected = selectedTime === slot;
                const [h] = slot.split(':').map(Number);
                const display = h > 12 ? `${h - 12}:00 PM` : h === 12 ? '12:00 PM' : `${h}:00 AM`;
                return (
                  <TouchableOpacity
                    key={slot}
                    onPress={() => setSelectedTime(slot)}
                    style={[
                      styles.timeChip,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.gray100,
                        borderRadius: radius.sm,
                      },
                    ]}
                  >
                    <Text style={[styles.timeText, { color: isSelected ? colors.white : colors.text, fontSize: fontSize.xs }]}>
                      {display}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Attendees */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.md }]}>
              Number of Attendees
            </Text>
            <TextInput
              value={attendees}
              onChangeText={setAttendees}
              keyboardType="number-pad"
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.gray100, fontSize: fontSize.sm }]}
              placeholderTextColor={colors.gray400}
            />
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.md }]}>
              Notes (optional)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Any specific requests or questions..."
              multiline
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.gray100, fontSize: fontSize.sm }]}
              placeholderTextColor={colors.gray400}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading || !selectedDate || !selectedTime}
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: loading || !selectedDate || !selectedTime ? 0.5 : 1 }]}
          >
            <Text style={[styles.submitText, { color: colors.white, fontSize: fontSize.md }]}>
              {loading ? 'Requesting...' : 'Request Tour'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontWeight: '700' },
  content: { padding: 16, paddingBottom: 100 },
  propertyLabel: { marginBottom: 16, fontWeight: '500' },
  section: { marginBottom: 20 },
  sectionTitle: { fontWeight: '600', marginBottom: 10 },
  dateChip: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 8,
    minWidth: 56,
  },
  dayName: { fontWeight: '500', marginBottom: 2 },
  dayNum: { fontWeight: '700' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  timeText: { fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    borderTopWidth: 1,
    backgroundColor: 'white',
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitText: { fontWeight: '700' },
});
