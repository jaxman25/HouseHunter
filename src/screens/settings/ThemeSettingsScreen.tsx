import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';
import { ThemeMode } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ThemeOption {
  mode: ThemeMode;
  icon: string;
  label: string;
  description: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    mode: 'light',
    icon: 'white-balance-sunny',
    label: 'Light',
    description: 'Use light mode always',
  },
  {
    mode: 'dark',
    icon: 'moon-waning-dark',
    label: 'Dark',
    description: 'Use dark mode always',
  },
  {
    mode: 'system',
    icon: 'theme-light-dark',
    label: 'System',
    description: 'Follow system settings',
  },
];

export default function ThemeSettingsScreen() {
  const { colors, fontSize, spacing, radius, themeMode, setThemeMode } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Brief loading state for smoothness
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleSelect = async (mode: ThemeMode) => {
    await setThemeMode(mode);
    navigation.goBack();
  };

  const renderThemeOption = (option: ThemeOption) => {
    const isSelected = themeMode === option.mode;

    return (
      <TouchableOpacity
        key={option.mode}
        style={[
          styles.themeCard,
          {
            backgroundColor: isSelected ? colors.primaryLight : colors.card,
            borderRadius: radius.md,
            borderColor: isSelected ? colors.primary : colors.border,
            borderWidth: isSelected ? 2 : 1,
          },
        ]}
        onPress={() => handleSelect(option.mode)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconWrap, { backgroundColor: (colors.primary + '12') }]}>
          <MaterialCommunityIcons
            name={option.icon as any}
            size={24}
            color={isSelected ? colors.primary : colors.textSecondary}
          />
        </View>
        <View style={styles.optionContent}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: fontSize.md, fontWeight: '600' }]}>
            {option.label}
          </Text>
          <Text style={[styles.optionDescription, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
            {option.description}
          </Text>
        </View>
        {isSelected && (
          <MaterialCommunityIcons name="check-circle" size={22} color={colors.primary} />
        )}
      </TouchableOpacity>
    );
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
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Theme
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.description, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
          Choose your preferred theme. You can always switch between light and dark mode.
        </Text>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textLight, fontSize: fontSize.xs }]}>
              Loading...
            </Text>
          </View>
        )}

        {THEME_OPTIONS.map(renderThemeOption)}

        <View style={[styles.previewCard, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
          <Text style={[styles.previewTitle, { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' }]}>
            Preview
          </Text>
          <View style={[styles.previewContent, { backgroundColor: colors.gray100, borderRadius: radius.md }]}>
            <View style={[styles.previewRow, { backgroundColor: colors.surface, borderRadius: radius.sm }]}>
              <View style={[styles.previewBox, { backgroundColor: colors.primary + '20', borderRadius: radius.sm }]} />
              <View style={[styles.previewBox, { backgroundColor: colors.secondary + '20', borderRadius: radius.sm }]} />
              <View style={[styles.previewBox, { backgroundColor: colors.accent + '20', borderRadius: radius.sm }]} />
            </View>
            <View style={[styles.previewRow, { marginTop: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.sm }]}>
              <View style={[styles.previewBox, { backgroundColor: colors.primary + '20', borderRadius: radius.sm }]} />
              <View style={[styles.previewBox, { backgroundColor: colors.secondary + '20', borderRadius: radius.sm }]} />
            </View>
          </View>
        </View>

        <Text style={[styles.note, { color: colors.textLight, fontSize: fontSize.xs }]}>
          Theme preferences are saved locally on your device.
        </Text>
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
  description: { marginBottom: 16, lineHeight: 20 },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  loadingText: {},
  themeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionContent: { flex: 1 },
  optionLabel: {},
  optionDescription: { marginTop: 2 },
  previewCard: {
    padding: 16,
    marginTop: 20,
    marginBottom: 20,
  },
  previewTitle: {
    marginBottom: 12,
  },
  previewContent: {
    padding: 12,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 8,
  },
  previewBox: {
    width: 40,
    height: 40,
  },
  note: { lineHeight: 18 },
});
