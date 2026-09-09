import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { RootStackParamList } from '../../types';
import { CurrencyCode } from '../../services/currencyService';
import { CURRENCIES, getExchangeRates } from '../../services/currencyService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CURRENCY_OPTIONS: { code: CurrencyCode; flag: string }[] = [
  { code: 'KES', flag: '🇰🇪' },
  { code: 'USD', flag: '🇺🇸' },
  { code: 'EUR', flag: '🇪🇺' },
  { code: 'GBP', flag: '🇬🇧' },
  { code: 'TZS', flag: '🇹🇿' },
  { code: 'UGX', flag: '🇺🇬' },
];

export default function CurrencySettingsScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { currency: selectedCurrency, setCurrency } = useCurrencyContext();

  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getExchangeRates()
      .then(setRates)
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (code: CurrencyCode) => {
    await setCurrency(code);
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
          Currency
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.description, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
          Choose your preferred display currency. All property prices will be converted automatically using live exchange rates.
        </Text>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textLight, fontSize: fontSize.xs }]}>
              Loading exchange rates...
            </Text>
          </View>
        )}

        {CURRENCY_OPTIONS.map(({ code, flag }) => {
          const info = CURRENCIES[code];
          const isSelected = selectedCurrency === code;
          const rate = rates?.[code];

          return (
            <TouchableOpacity
              key={code}
              style={[
                styles.currencyCard,
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
              <Text style={styles.flag}>{flag}</Text>
              <View style={styles.currencyInfo}>
                <Text style={[styles.currencyName, { color: colors.text, fontSize: fontSize.md, fontWeight: '600' }]}>
                  {info.name}
                </Text>
                <Text style={[styles.currencySymbol, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
                  {info.symbol} · {info.code}
                </Text>
              </View>
              {rate !== undefined && (
                <Text style={[styles.rate, { color: colors.textLight, fontSize: fontSize.xs }]}>
                  1 KES = {rate < 1 ? rate.toFixed(4) : rate.toFixed(2)} {info.code}
                </Text>
              )}
              {isSelected && (
                <MaterialCommunityIcons name="check-circle" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
          );
        })}

        <Text style={[styles.note, { color: colors.textLight, fontSize: fontSize.xs }]}>
          Exchange rates are updated daily. Prices shown are approximate and may vary slightly at the time of transaction.
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
  currencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  flag: { fontSize: 28 },
  currencyInfo: { flex: 1 },
  currencyName: {},
  currencySymbol: { marginTop: 2 },
  rate: { marginRight: 8 },
  note: { marginTop: 16, lineHeight: 18 },
});
