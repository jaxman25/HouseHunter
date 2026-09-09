import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import Input from '../common/Input';
import Button from '../common/Button';
import { NotificationFrequency, SavedSearch, SavedSearchFilters } from '../../types';
import { summarizeFilters } from '../../services/savedSearchService';

interface SaveSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (input: {
    name: string;
    filters: SavedSearchFilters;
    notificationFrequency: NotificationFrequency;
  }) => Promise<void> | void;
  filters: SavedSearchFilters;
  /** When editing, the existing search (its name/frequency are pre-filled). */
  existing?: SavedSearch | null;
}

const FREQUENCIES: { value: NotificationFrequency; label: string; hint: string }[] = [
  { value: 'instant', label: 'Instant', hint: 'As soon as a match appears' },
  { value: 'daily', label: 'Daily', hint: 'Once a day digest' },
  { value: 'weekly', label: 'Weekly', hint: 'Once a week digest' },
];

/** Create (or edit) a saved search from the current filter criteria. */
export default function SaveSearchModal({
  visible,
  onClose,
  onSave,
  filters,
  existing,
}: SaveSearchModalProps) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const [name, setName] = useState(existing?.name ?? '');
  const [frequency, setFrequency] = useState<NotificationFrequency>(
    existing?.notificationFrequency ?? 'instant'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Re-seed form state when the modal opens for a different search. The
  // effect only runs when the target search changes, never while the user is
  // typing (existing.* is immutable while the modal is open).
  React.useEffect(() => {
    const seed = () => {
      if (!visible) return;
      setName(existing?.name ?? '');
      setFrequency(existing?.notificationFrequency ?? 'instant');
      setError('');
    };
    seed();
  }, [visible, existing?.id, existing?.name, existing?.notificationFrequency]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your search a name');
      return;
    }
    if (trimmed.length > 60) {
      setError('Name must be under 60 characters');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ name: trimmed, filters, notificationFrequency: frequency });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the search');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
            {existing ? 'Edit Search' : 'Save Search'}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Input
            label="Search name"
            placeholder="e.g., Downtown 2BR under $500k"
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (error) setError('');
            }}
            error={error || undefined}
            maxLength={60}
          />

          {/* Filters summary */}
          <Text style={[styles.label, { color: colors.text, fontSize: fontSize.sm }]}>What you&apos;re saving</Text>
          <View style={[styles.summary, { backgroundColor: colors.surface, borderRadius: radius.md, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="tune-variant" size={18} color={colors.primary} />
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, flex: 1, marginLeft: 8 }}>
              {summarizeFilters(filters)}
            </Text>
          </View>

          {/* Frequency */}
          <Text style={[styles.label, { color: colors.text, fontSize: fontSize.sm }]}>Notify me about new matches</Text>
          <View style={styles.freqRow}>
            {FREQUENCIES.map((f) => (
              <TouchableOpacity
                key={f.value}
                style={[
                  styles.freqBtn,
                  {
                    backgroundColor: frequency === f.value ? colors.primary : colors.surface,
                    borderColor: frequency === f.value ? colors.primary : colors.border,
                    borderRadius: radius.md,
                  },
                ]}
                onPress={() => setFrequency(f.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: frequency === f.value }}
              >
                <Text style={{ color: frequency === f.value ? colors.white : colors.text, fontSize: fontSize.sm, fontWeight: '600' }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 8 }}>
            {FREQUENCIES.find((f) => f.value === frequency)?.hint}
          </Text>

          <View style={{ height: 24 }} />
          <Button
            title={existing ? 'Save Changes' : 'Save Search'}
            onPress={handleSave}
            loading={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontWeight: '700' },
  label: { fontWeight: '600', marginBottom: 8, marginTop: 16 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
  },
  freqRow: { flexDirection: 'row', gap: 8 },
  freqBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },
});