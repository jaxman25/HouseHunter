import React from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEscapeKey } from '../../hooks/useKeyboardShortcuts';
import { useTheme } from '../../context/ThemeContext';

/**
 * "?" help overlay (prompt4 #8) — lists the web keyboard shortcuts.
 * Web-only; toggled by the `?` / Escape keys (see useKeyboardShortcuts).
 */
export default function KeyboardShortcutsHelp({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors, fontSize, radius } = useTheme();
  useEscapeKey(onClose, visible && Platform.OS === 'web');

  if (Platform.OS !== 'web' || !visible) return null;

  const shortcuts: { keys: string; label: string }[] = [
    { keys: '/', label: 'Focus the search box' },
    { keys: 'F', label: 'Open filters (browse screen)' },
    { keys: 'Esc', label: 'Close modals & this overlay' },
    { keys: '?', label: 'Show this help' },
  ];

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={styles.backdrop}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel="Close keyboard shortcuts help"
    >
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg }]}
        // Stop the backdrop press from firing when clicking the card.
        onStartShouldSetResponder={() => true}
      >
        <View style={styles.headerRow}>
          <MaterialCommunityIcons name="keyboard" size={20} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '800', marginLeft: 8 }}>
            Keyboard Shortcuts
          </Text>
        </View>
        {shortcuts.map((s) => (
          <View key={s.keys} style={styles.row}>
            <View
              style={[
                styles.keyCap,
                { backgroundColor: colors.gray100, borderColor: colors.border, borderRadius: radius.sm },
              ]}
            >
              <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '700' }}>{s.keys}</Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, flex: 1 }}>{s.label}</Text>
          </View>
        ))}
        <Text style={{ color: colors.textLight, fontSize: fontSize.xs, marginTop: 10 }}>
          Press Esc or click anywhere to close.
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  card: {
    width: 320,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 12,
  },
  keyCap: {
    minWidth: 40,
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
  },
});
