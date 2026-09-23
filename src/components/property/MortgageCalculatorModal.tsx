import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { Property } from '../../types';
import Button from '../common/Button';
import { calculateMortgage, MortgageBreakdown } from '../../utils/mortgage';
import { formatCurrencyAmount } from '../../services/currencyService';

interface MortgageCalculatorModalProps {
  visible: boolean;
  onClose: () => void;
  property: Property;
}

/**
 * "What will this home really cost?" calculator, opened from the property
 * detail screen. Pure client-side math (see src/utils/mortgage.ts) — price
 * prefilled from the listing, no backend involved.
 */
export default function MortgageCalculatorModal({
  visible,
  onClose,
  property,
}: MortgageCalculatorModalProps) {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const { user } = useAuthContext();
  const { currency } = useCurrencyContext();

  const fmt = (n: number) => formatCurrencyAmount(Math.round(n), currency);

  const [downPercent, setDownPercent] = useState('20');
  const [rate, setRate] = useState('6.5');
  const [termYears, setTermYears] = useState('30');

  // Reset toward sensible defaults each time the modal is (re)opened.
  useEffect(() => {
    if (visible) {
      setDownPercent('20');
      setRate('6.5');
      setTermYears('30');
    }
  }, [visible]);

  const down = parseFloat(downPercent) || 0;
  const rateNum = parseFloat(rate) || 0;
  const term = parseInt(termYears, 10) || 0;

  const isSale = property.listingType === 'sale';
  const principalBase = isSale ? property.price : property.price * 12;

  const breakdown: MortgageBreakdown = useMemo(
    () =>
      calculateMortgage({
        price: principalBase,
        downPaymentPercent: down,
        annualRatePercent: rateNum,
        termYears: term,
      }),
    [principalBase, down, rateNum, term]
  );

  const resultRows: { label: string; value: string; emphasis?: boolean }[] = [
    { label: 'Loan amount', value: fmt(breakdown.loanAmount) },
    { label: 'Monthly payment', value: `${fmt(breakdown.monthlyPayment)}/mo`, emphasis: true },
    { label: 'Total interest', value: fmt(breakdown.totalInterest) },
    { label: 'Total cost', value: fmt(breakdown.totalCost) },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
            accessibilityRole="button"
            accessibilityLabel="Close mortgage calculator"
          >
            <MaterialCommunityIcons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
            Mortgage Calculator
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Price summary */}
          <View style={[styles.priceCard, { backgroundColor: colors.surface, borderRadius: radius.lg }, shadow.sm]}>
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
              {property.title}
            </Text>
            <Text style={{ color: colors.primary, fontSize: fontSize.xxl, fontWeight: '800', marginTop: 4 }}>
              {fmt(property.price)}
              {!isSale ? '/mo' : ''}
            </Text>
            {!isSale && (
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }}>
                Rent shown as annualized {fmt(principalBase)} for estimating a purchase
              </Text>
            )}
          </View>

          {/* Inputs */}
          <View style={styles.inputs}>
            <LabeledInput
              label="Down payment (%)"
              value={downPercent}
              onChangeText={setDownPercent}
              keyboardType="decimal-pad"
              colors={colors}
              fontSize={fontSize}
              radius={radius}
            />
            <LabeledInput
              label="Interest rate (%)"
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              colors={colors}
              fontSize={fontSize}
              radius={radius}
            />
            <LabeledInput
              label="Term (years)"
              value={termYears}
              onChangeText={setTermYears}
              keyboardType="number-pad"
              colors={colors}
              fontSize={fontSize}
              radius={radius}
            />
          </View>

          {/* Quick term chips */}
          <View style={styles.termChips}>
            {[15, 20, 30].map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTermYears(String(t))}
                style={[
                  styles.termChip,
                  {
                    backgroundColor: term === t ? colors.primary : colors.gray100,
                    borderRadius: radius.round,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Set term to ${t} years`}
              >
                <Text
                  style={{
                    color: term === t ? colors.white : colors.text,
                    fontSize: fontSize.sm,
                    fontWeight: '600',
                  }}
                >
                  {t} yr
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Results */}
          <View style={[styles.resultCard, { backgroundColor: colors.surface, borderRadius: radius.lg }, shadow.sm]}>
            {resultRows.map((row, i) => (
              <View
                key={row.label}
                style={[
                  styles.resultRow,
                  i < resultRows.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                ]}
              >
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>{row.label}</Text>
                <Text
                  style={{
                    color: row.emphasis ? colors.primary : colors.text,
                    fontSize: row.emphasis ? fontSize.xl : fontSize.md,
                    fontWeight: row.emphasis ? '800' : '600',
                  }}
                >
                  {row.value}
                </Text>
              </View>
            ))}
          </View>

          <Text style={{ color: colors.textLight, fontSize: fontSize.xs, marginTop: spacing.md }}>
            Estimates only — principal & interest. Taxes, insurance and fees not included.
            {user ? '' : ''}
          </Text>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <Button title="Done" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  keyboardType,
  colors,
  fontSize,
  radius,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType: 'decimal-pad' | 'number-pad';
  colors: any;
  fontSize: any;
  radius: any;
}) {
  return (
    <View style={{ flex: 1, minWidth: 140 }}>
      <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginBottom: 6, fontWeight: '600' }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.gray100,
            borderColor: colors.border,
            borderRadius: radius.md,
            fontSize: fontSize.md,
          },
        ]}
        placeholderTextColor={colors.gray400}
        accessibilityLabel={label}
      />
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
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  priceCard: { padding: 16 },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  termChips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  termChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resultCard: {
    marginTop: 16,
    paddingVertical: 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  footer: {
    padding: 16,
    borderTopWidth: 0.5,
  },
});
