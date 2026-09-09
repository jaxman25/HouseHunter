import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

interface WalkScoreBadgeProps {
  score: number;
  label: string;
  icon: string;
}

function getScoreColor(score: number): string {
  if (score >= 70) return '#047857'; // green
  if (score >= 50) return '#B45309'; // orange
  return '#B91C1C'; // red
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'Walker\'s Paradise';
  if (score >= 70) return 'Very Walkable';
  if (score >= 50) return 'Somewhat Walkable';
  if (score >= 25) return 'Car-Dependent';
  return 'Almost All Errands Require a Car';
}

export default function WalkScoreBadge({ score, label, icon }: WalkScoreBadgeProps) {
  const { colors, fontSize } = useTheme();
  const scoreColor = getScoreColor(score);

  return (
    <View style={[styles.container, { backgroundColor: colors.gray100, borderRadius: 12 }]}>
      <View style={[styles.scoreCircle, { backgroundColor: scoreColor }]}>
        <Text style={[styles.scoreNumber, { color: colors.white, fontSize: fontSize.xl }]}>
          {score}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.label, { color: colors.text, fontSize: fontSize.sm }]}>
          {label}
        </Text>
        <Text style={[styles.description, { color: colors.textLight, fontSize: fontSize.xs }]}>
          {getScoreLabel(score)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  scoreCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  label: {
    fontWeight: '600',
    marginBottom: 2,
  },
  description: {
    lineHeight: 16,
  },
});
