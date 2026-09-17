import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { PriceHistoryEntry } from '../../types';
import { formatPrice } from '../../utils/helpers';
import { format } from 'date-fns';

interface PriceHistoryChartProps {
  entries: PriceHistoryEntry[];
  listingType: 'sale' | 'rent';
}

const CHART_HEIGHT = 120;
const DOT_SIZE = 6;
const PADDING_HORIZONTAL = 12;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 20;

export default function PriceHistoryChart({
  entries,
  listingType,
}: PriceHistoryChartProps) {
  const { colors, fontSize, radius } = useTheme();

  if (entries.length < 2) return null;

  const prices = entries.map((e) => e.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  // Chart drawing area (inside padding)
  const chartWidth = 280; // Will stretch to fill container
  const drawHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const getX = (index: number) => {
    if (entries.length === 1) return chartWidth / 2;
    return PADDING_HORIZONTAL + (index / (entries.length - 1)) * (chartWidth - 2 * PADDING_HORIZONTAL);
  };

  const getY = (price: number) => {
    const normalized = (price - minPrice) / priceRange;
    return PADDING_TOP + drawHeight - normalized * drawHeight;
  };

  return (
    <View style={styles.container}>
      <View style={styles.chartRow}>
        {/* Y-axis labels */}
        <View style={styles.yAxis}>
          <Text style={[styles.axisLabel, { color: colors.textSecondary, fontSize: 9 }]}>
            {formatPrice(maxPrice, listingType)}
          </Text>
          <Text style={[styles.axisLabel, { color: colors.textSecondary, fontSize: 9 }]}>
            {formatPrice(minPrice, listingType)}
          </Text>
        </View>

        {/* Chart area */}
        <View style={styles.chartArea}>
          <View style={[styles.chart, { height: CHART_HEIGHT }]}>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <View
                key={ratio}
                style={[
                  styles.gridLine,
                  {
                    top: PADDING_TOP + drawHeight - ratio * drawHeight,
                    backgroundColor: colors.gray200,
                  },
                ]}
              />
            ))}

            {/* Line segments between points */}
            {entries.map((entry, i) => {
              if (i === 0) return null;
              const x1 = getX(i - 1);
              const y1 = getY(entries[i - 1].price);
              const x2 = getX(i);
              const y2 = getY(entry.price);
              const dx = x2 - x1;
              const dy = y2 - y1;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx);

              return (
                <View
                  key={`line-${i}`}
                  style={[
                    styles.line,
                    {
                      left: x1,
                      top: y1,
                      width: length,
                      height: 2,
                      backgroundColor: colors.primary,
                      transform: [{ rotate: `${angle}rad` }],
                      transformOrigin: '0 0',
                    },
                  ]}
                />
              );
            })}

            {/* Data points */}
            {entries.map((entry, i) => {
              const x = getX(i);
              const y = getY(entry.price);
              return (
                <View
                  key={entry.id}
                  style={[
                    styles.dot,
                    {
                      left: x - DOT_SIZE / 2,
                      top: y - DOT_SIZE / 2,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              );
            })}
          </View>

          {/* X-axis labels (first, middle, last) */}
          <View style={styles.xAxis}>
            {[0, Math.floor(entries.length / 2), entries.length - 1].map((i) => {
              const entry = entries[i];
              if (!entry) return null;
              const dateStr = entry.changedAt
                ? format(new Date(entry.changedAt), 'MMM d')
                : '';
              return (
                <Text
                  key={i}
                  style={[styles.axisLabel, { color: colors.textSecondary, fontSize: 9 }]}
                >
                  {dateStr}
                </Text>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  yAxis: {
    justifyContent: 'space-between',
    height: CHART_HEIGHT,
    paddingTop: PADDING_TOP,
    paddingBottom: PADDING_BOTTOM,
    width: 55,
    alignItems: 'flex-end',
    paddingRight: 6,
  },
  chartArea: {
    flex: 1,
  },
  chart: {
    position: 'relative',
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    opacity: 0.5,
  },
  line: {
    position: 'absolute',
    borderRadius: 1,
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: PADDING_HORIZONTAL,
    marginTop: 2,
  },
  axisLabel: {
    fontWeight: '500',
  },
});
