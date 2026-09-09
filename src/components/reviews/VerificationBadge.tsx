import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

interface VerificationBadgeProps {
  verified: boolean;
}

export default function VerificationBadge({ verified }: VerificationBadgeProps) {
  const { colors, fontSize } = useTheme();

  if (!verified) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.success + '15' }]}>
      <MaterialCommunityIcons name="check-decagram" size={14} color={colors.success} />
      <Text style={[styles.text, { color: colors.success, fontSize: fontSize.xs }]}>
        Verified Purchase
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  text: {
    marginLeft: 4,
    fontWeight: '600',
  },
});
