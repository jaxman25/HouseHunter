import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { getCommuteTime } from '../../services/neighborhoodService';

interface CommuteToolProps {
  originLat: number;
  originLng: number;
}

const MODES = [
  { key: 'driving', icon: 'car', label: 'Drive' },
  { key: 'transit', icon: 'bus', label: 'Transit' },
  { key: 'walking', icon: 'walk', label: 'Walk' },
  { key: 'bicycling', icon: 'bike', label: 'Bike' },
] as const;

type ModeKey = typeof MODES[number]['key'];

interface CommuteResult {
  duration: string;
  durationMinutes: number;
  distance: string;
}

export default function CommuteTool({ originLat, originLng }: CommuteToolProps) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const [address, setAddress] = useState('');
  const [mode, setMode] = useState<ModeKey>('driving');
  const [result, setResult] = useState<CommuteResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!address.trim()) return;
    setLoading(true);
    try {
      const commuteResult = await getCommuteTime(originLat, originLng, address, mode);
      setResult(commuteResult);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Enter work address..."
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.gray100, fontSize: fontSize.sm }]}
          placeholderTextColor={colors.gray400}
        />
        <TouchableOpacity
          onPress={handleSearch}
          disabled={loading || !address.trim()}
          style={[styles.searchBtn, { backgroundColor: colors.primary, opacity: loading || !address.trim() ? 0.5 : 1 }]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <MaterialCommunityIcons name="magnify" size={20} color={colors.white} />
          )}
        </TouchableOpacity>
      </View>

      {/* Mode Selection */}
      <View style={styles.modeRow}>
        {MODES.map((m) => {
          const isSelected = mode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              onPress={() => setMode(m.key)}
              style={[
                styles.modeChip,
                {
                  backgroundColor: isSelected ? colors.primary : colors.gray100,
                  borderRadius: radius.sm,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={m.icon as any}
                size={16}
                color={isSelected ? colors.white : colors.gray500}
              />
              <Text style={[styles.modeLabel, { color: isSelected ? colors.white : colors.textSecondary, fontSize: fontSize.xs }]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Result */}
      {result && (
        <View style={[styles.resultCard, { backgroundColor: colors.gray100, borderRadius: radius.md }]}>
          <View style={styles.resultRow}>
            <MaterialCommunityIcons name="clock-outline" size={20} color={colors.primary} />
            <Text style={[styles.resultValue, { color: colors.text, fontSize: fontSize.xl }]}>
              {result.duration}
            </Text>
          </View>
          <Text style={[styles.resultDistance, { color: colors.textLight, fontSize: fontSize.sm }]}>
            {result.distance} distance
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeLabel: { fontWeight: '600' },
  resultCard: { padding: 16, alignItems: 'center' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultValue: { fontWeight: '700' },
  resultDistance: { marginTop: 4 },
});
