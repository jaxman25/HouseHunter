import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Property } from '../../types';
import { getExpirationDate, daysUntil } from '../../services/archiveService';

/**
 * \"Archives in X days\" countdown for sold/pending/inactive listings.
 * Renders nothing for listings that aren't auto-archive candidates.
 */
export default function ExpirationCountdown({
  property,
}: {
  property: Property;
}) {
  const { colors, fontSize } = useTheme();
  const expiration = getExpirationDate(property);
  if (!expiration) return null;

  const days = daysUntil(expiration);
  const overdue = days < 0;
  const today = days === 0;

  const label = overdue
    ? 'Archive overdue'
    : today
      ? 'Archives today'
      : `Archives in ${days} day${days === 1 ? '' : 's'}`;

  return (
    <View style={styles.row}>
      <MaterialCommunityIcons
        name="archive-clock-outline"
        size={13}
        color={overdue ? colors.error : colors.textSecondary}
      />
      <Text
        style={{
          color: overdue ? colors.error : colors.textSecondary,
          fontSize: fontSize.xs,
          fontWeight: '600',
          marginLeft: 4,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});