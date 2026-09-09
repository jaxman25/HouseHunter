import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { RootStackParamList } from '../../types';
import { LanguageCode } from '../../services/languageService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function LanguageSettingsScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { language, setLanguage, languages } = useLanguage();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Brief loading state for smoothness
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleSelect = async (code: LanguageCode) => {
    await setLanguage(code);
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
          Language
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.description, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
          Choose your preferred language. The app interface will update to reflect your selection.
        </Text>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textLight, fontSize: fontSize.xs }]}>
              Loading...
            </Text>
          </View>
        )}

        {languages.map(({ code, info }) => {
          const isSelected = language === code;

          return (
            <TouchableOpacity
              key={code}
              style={[
                styles.languageCard,
                {
                  backgroundColor: isSelected ? colors.primaryLight : colors.card,
                  borderRadius: radius.md,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderWidth: isSelected ? 2 : 1,
                },
              ]}
              onPress={() => handleSelect(code)}
              activeOpacity={0.7}
            >
              <Text style={styles.flag}>{info.flag}</Text>
              <View style={styles.languageInfo}>
                <Text style={[styles.languageName, { color: colors.text, fontSize: fontSize.md, fontWeight: '600' }]}>
                  {info.name}
                </Text>
                <Text style={[styles.languageNative, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
                  {info.nativeName}
                </Text>
              </View>
              {isSelected && (
                <MaterialCommunityIcons name="check-circle" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
          );
        })}

        <Text style={[styles.note, { color: colors.textLight, fontSize: fontSize.xs }]}>
          Language preferences are saved locally on your device.
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
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  flag: { fontSize: 28 },
  languageInfo: { flex: 1 },
  languageName: {},
  languageNative: { marginTop: 2 },
  note: { marginTop: 16, lineHeight: 18 },
});
