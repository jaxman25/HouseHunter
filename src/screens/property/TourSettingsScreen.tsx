import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, TextInput, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';
import { useAuthContext } from '../../context/AuthContext';
import { useSellerAvailability } from '../../hooks/useTours';
import { setAvailability } from '../../services/tourService';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TourSettingsScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuthContext();
  const insets = useSafeAreaInsets();

  const { availability, loading, refresh } = useSellerAvailability(user?.uid || '');

  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [maxTours, setMaxTours] = useState('3');
  const [bufferMinutes, setBufferMinutes] = useState('30');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (availability) {
      setSelectedDays(availability.daysOfWeek);
      setStartTime(availability.startTime);
      setEndTime(availability.endTime);
      setMaxTours(String(availability.maxToursPerDay));
      setBufferMinutes(String(availability.bufferMinutes));
    }
  }, [availability]);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSave = async () => {
    if (!user) return;
    if (selectedDays.length === 0) {
      Alert.alert('Error', 'Please select at least one day');
      return;
    }
    setSaving(true);
    try {
      await setAvailability({
        sellerId: user.uid,
        daysOfWeek: selectedDays,
        startTime,
        endTime,
        maxToursPerDay: parseInt(maxTours) || 3,
        bufferMinutes: parseInt(bufferMinutes) || 30,
      });
      Alert.alert('Saved', 'Your availability settings have been saved');
      refresh();
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

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
          Tour Settings
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Days */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.md }]}>
            Available Days
          </Text>
          <View style={styles.daysRow}>
            {DAYS.map((day, i) => {
              const selected = selectedDays.includes(i);
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => toggleDay(i)}
                  style={[
                    styles.dayChip,
                    {
                      backgroundColor: selected ? colors.primary : colors.gray100,
                      borderRadius: radius.sm,
                    },
                  ]}
                >
                  <Text style={[styles.dayText, { color: selected ? colors.white : colors.textSecondary, fontSize: fontSize.xs }]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Time Range */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.md }]}>
            Time Range
          </Text>
          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <Text style={[styles.timeLabel, { color: colors.textLight, fontSize: fontSize.xs }]}>Start</Text>
              <TextInput
                value={startTime}
                onChangeText={setStartTime}
                placeholder="09:00"
                style={[styles.timeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.gray100, fontSize: fontSize.md }]}
                placeholderTextColor={colors.gray400}
              />
            </View>
            <Text style={[styles.timeSeparator, { color: colors.gray400 }]}>to</Text>
            <View style={styles.timeField}>
              <Text style={[styles.timeLabel, { color: colors.textLight, fontSize: fontSize.xs }]}>End</Text>
              <TextInput
                value={endTime}
                onChangeText={setEndTime}
                placeholder="17:00"
                style={[styles.timeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.gray100, fontSize: fontSize.md }]}
                placeholderTextColor={colors.gray400}
              />
            </View>
          </View>
        </View>

        {/* Max Tours */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.md }]}>
            Max Tours Per Day
          </Text>
          <TextInput
            value={maxTours}
            onChangeText={setMaxTours}
            keyboardType="number-pad"
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.gray100, fontSize: fontSize.md }]}
            placeholderTextColor={colors.gray400}
          />
        </View>

        {/* Buffer Time */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.md }]}>
            Buffer Time (minutes)
          </Text>
          <TextInput
            value={bufferMinutes}
            onChangeText={setBufferMinutes}
            keyboardType="number-pad"
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.gray100, fontSize: fontSize.md }]}
            placeholderTextColor={colors.gray400}
          />
        </View>

        {/* Save */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.5 : 1 }]}
        >
          <Text style={[styles.saveText, { color: colors.white, fontSize: fontSize.md }]}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Text>
        </TouchableOpacity>
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
  content: { padding: 16, paddingBottom: 40, gap: 20 },
  section: {},
  sectionTitle: { fontWeight: '600', marginBottom: 10 },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 10, minWidth: 48, alignItems: 'center' },
  dayText: { fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  timeField: { flex: 1 },
  timeLabel: { marginBottom: 4 },
  timeInput: { borderWidth: 1, borderRadius: 8, padding: 12, textAlign: 'center' },
  timeSeparator: { paddingBottom: 12, fontSize: 15 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12 },
  saveBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveText: { fontWeight: '700' },
});
