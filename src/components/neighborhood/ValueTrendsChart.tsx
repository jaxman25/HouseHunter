import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/formatters';

interface ValueTrendsChartProps {
  averagePrice: number;
  yearOverYearChange: number;
  yearlyData: { year: number; price: number }[];
}

export default function ValueTrendsChart({ averagePrice, yearOverYearChange, yearlyData }: ValueTrendsChartProps) {
  const { colors, fontSize, radius } = useTheme();

  const maxPrice = Math.max(...yearlyData.map((d) => d.price), 1);

  return (
    <View style={styles.container}>
      {/* Summary */}
      <View style={styles.summaryRow}>
        <View>
          <Text style={[styles.label, { color: colors.textLight, fontSize: fontSize.xs }]}>
            Average Home Value
          </Text>
          <Text style={[styles.price, { color: colors.text, fontSize: fontSize.xl }]}>
            {formatCurrency(averagePrice)}
          </Text>
        </View>
        <View style={styles.changeContainer}>
          <MaterialCommunityIcons
            name={yearOverYearChange >= 0 ? 'trending-up' : 'trending-down'}
            size={18}
            color={yearOverYearChange >= 0 ? colors.success : colors.error}
          />
          <Text
            style={[
              styles.change,
              { color: yearOverYearChange >= 0 ? colors.success : colors.error, fontSize: fontSize.sm },
            ]}
          >
            {yearOverYearChange >= 0 ? '+' : ''}{yearOverYearChange}%
          </Text>
        </View>
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        {yearlyData.map((data) => {
          const height = maxPrice > 0 ? (data.price / maxPrice) * 100 : 0;
          return (
            <View key={data.year} style={styles.barWrapper}>
              <Text style={[styles.barValue, { color: colors.textLight, fontSize: 10 }]}>
                ${(data.price / 1000).toFixed(0)}K
              </Text>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${height}%`,
                      backgroundColor: colors.primary,
                      borderRadius: 4,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.yearLabel, { color: colors.textLight, fontSize: 10 }]}>
                {data.year.toString().slice(2)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  label: { marginBottom: 2 },
  price: { fontWeight: '700' },
  changeContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  change: { fontWeight: '600' },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    gap: 4,
  },
  barWrapper: { flex: 1, alignItems: 'center' },
  barValue: { marginBottom: 4, fontWeight: '500' },
  barContainer: {
    width: '100%',
    height: 100,
    justifyContent: 'flex-end',
  },
  bar: { width: '100%' },
  yearLabel: { marginTop: 4 },
});
