import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { SchoolInfo } from '../../types';

interface SchoolRatingsProps {
  schools: {
    elementary: SchoolInfo[];
    middle: SchoolInfo[];
    high: SchoolInfo[];
  };
}

function getRatingColor(rating: number): string {
  if (rating >= 8) return '#047857';
  if (rating >= 6) return '#B45309';
  return '#B91C1C';
}

function SchoolItem({ school }: { school: SchoolInfo }) {
  const { colors, fontSize } = useTheme();
  const color = getRatingColor(school.rating);

  return (
    <View style={[styles.schoolItem, { borderBottomColor: colors.gray200 }]}>
      <View style={styles.schoolInfo}>
        <Text style={[styles.schoolName, { color: colors.text, fontSize: fontSize.sm }]} numberOfLines={1}>
          {school.name}
        </Text>
        <Text style={[styles.schoolMeta, { color: colors.textLight, fontSize: fontSize.xs }]}>
          {school.distance.toFixed(1)} mi · {school.type === 'public' ? 'Public' : 'Private'}
        </Text>
      </View>
      <View style={[styles.ratingBadge, { backgroundColor: color }]}>
        <Text style={[styles.ratingText, { color: colors.white, fontSize: fontSize.xs }]}>{school.rating}</Text>
      </View>
    </View>
  );
}

export default function SchoolRatings({ schools }: SchoolRatingsProps) {
  const { colors, fontSize } = useTheme();

  const renderCategory = (title: string, icon: string, items: SchoolInfo[]) => (
    <View style={styles.category}>
      <View style={styles.categoryHeader}>
        <MaterialCommunityIcons name={icon as any} size={18} color={colors.primary} />
        <Text style={[styles.categoryTitle, { color: colors.text, fontSize: fontSize.sm }]}>
          {title}
        </Text>
      </View>
      {items.length > 0 ? (
        items.slice(0, 3).map((school, i) => (
          <SchoolItem key={`${school.name}-${i}`} school={school} />
        ))
      ) : (
        <Text style={[styles.noData, { color: colors.textLight, fontSize: fontSize.xs }]}>
          No data available
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {renderCategory('Elementary Schools', 'school', schools.elementary)}
      {renderCategory('Middle Schools', 'school', schools.middle)}
      {renderCategory('High Schools', 'school', schools.high)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  category: {},
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  categoryTitle: { fontWeight: '600' },
  schoolItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  schoolInfo: { flex: 1, marginRight: 8 },
  schoolName: { fontWeight: '500', marginBottom: 2 },
  schoolMeta: {},
  ratingBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingText: { fontWeight: '700' },
  noData: { fontStyle: 'italic' },
});
