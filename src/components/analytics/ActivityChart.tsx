import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface ActivityChartProps {
  data: { date: string; count: number }[];
  title?: string;
}

export default function ActivityChart({ data, title = 'Activity' }: ActivityChartProps) {
  const { colors, fontSize } = useTheme();

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const last7 = data.slice(0, 7).reverse();

  return (
    <View style={styles.container}>
      {title && (
        <Text style={[styles.titleText, { color: colors.text, fontSize: fontSize.md }]}>
          {title}
        </Text>
      )}
      <View style={styles.chart}>
        {last7.map((item, i) => {
          const height = maxCount > 0 ? (item.count / maxCount) * 80 : 0;
          const dayName = new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' });
          return (
            <View key={i} style={styles.barWrapper}>
              <Text style={[styles.count, { color: colors.textLight, fontSize: 10 }]}>
                {item.count}
              </Text>
              <View style={[styles.barTrack, { backgroundColor: colors.gray100 }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(height, 2),
                      backgroundColor: colors.primary,
                      borderRadius: 4,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.dayLabel, { color: colors.textLight, fontSize: 10 }]}>
                {dayName}
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
  titleText: {
    fontWeight: '600',
    marginBottom: 12,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
    gap: 4,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  count: {
    marginBottom: 4,
    fontWeight: '500',
  },
  barTrack: {
    width: '100%',
    height: 80,
    justifyContent: 'flex-end',
    borderRadius: 4,
  },
  bar: {
    width: '100%',
  },
  dayLabel: {
    marginTop: 4,
  },
});
