import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import {
  getNeighborhoodInsights,
  NeighborhoodInsights,
} from '../../services/neighborhoodService';
import Skeleton from '../common/Skeleton';

interface NeighborhoodInsightsSectionProps {
  latitude: number;
  longitude: number;
}

function scoreColor(score: number, palette: { success: string; warning: string; error: string; gray400: string }): string {
  if (score >= 70) return palette.success;
  if (score >= 40) return palette.warning;
  return palette.error;
}

/**
 * "Neighborhood Insights" — walk/transit scores + nearby schools fetched from
 * the free OpenStreetMap Overpass API (cached in Firestore by lat/lng).
 * Shows a skeleton while loading and renders nothing when the API fails, so
 * the detail page never shows an empty broken section.
 */
export default function NeighborhoodInsightsSection({
  latitude,
  longitude,
}: NeighborhoodInsightsSectionProps) {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const [insights, setInsights] = useState<NeighborhoodInsights | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'hidden'>('loading');

  useEffect(() => {
    let ignore = false;
    setState('loading');
    getNeighborhoodInsights(latitude, longitude)
      .then((result) => {
        if (ignore) return;
        if (result) {
          setInsights(result);
          setState('ready');
        } else {
          setState('hidden');
        }
      })
      .catch(() => {
        if (!ignore) setState('hidden');
      });
    return () => {
      ignore = true;
    };
  }, [latitude, longitude]);

  if (state === 'hidden') return null;

  if (state === 'loading') {
    return (
      <View style={styles.wrap}>
        <Skeleton width={'100%'} height={120} radius={16} />
      </View>
    );
  }

  if (!insights) return null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderRadius: radius.lg },
        shadow.sm,
      ]}
    >
      {/* Scores */}
      <View style={styles.scoresRow}>
        <ScoreBadge
          icon="walk"
          label="Walk"
          score={insights.walkScore}
          colors={colors}
          fontSize={fontSize}
          scoreColor={scoreColor(insights.walkScore, colors)}
        />
        <ScoreBadge
          icon="bus"
          label="Transit"
          score={insights.transitScore}
          colors={colors}
          fontSize={fontSize}
          scoreColor={scoreColor(insights.transitScore, colors)}
        />
        <View style={styles.schoolsSummary}>
          <MaterialCommunityIcons name="school-outline" size={22} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '700' }}>
            {insights.schools.length}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>schools nearby</Text>
        </View>
      </View>

      {/* Schools */}
      {insights.schools.length > 0 && (
        <View style={[styles.schools, { borderTopColor: colors.border }]}>
          {insights.schools.slice(0, 3).map((school, i) => (
            <View key={`${school.name}-${i}`} style={styles.schoolRow}>
              <MaterialCommunityIcons name="school" size={15} color={colors.textSecondary} />
              <Text style={{ color: colors.text, fontSize: fontSize.sm, flex: 1, marginLeft: 8 }} numberOfLines={1}>
                {school.name}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
                {school.distanceMiles} mi
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Attribution + heuristic note */}
      <Text style={[styles.attribution, { color: colors.textLight, fontSize: fontSize.xs }]}>
        Estimates from OpenStreetMap
      </Text>
    </View>
  );
}

function ScoreBadge({
  icon,
  label,
  score,
  colors,
  fontSize,
  scoreColor,
}: {
  icon: string;
  label: string;
  score: number;
  colors: any;
  fontSize: any;
  scoreColor: string;
}) {
  return (
    <View style={styles.scoreBadge}>
      <MaterialCommunityIcons name={icon as any} size={20} color={scoreColor} />
      <Text style={{ color: scoreColor, fontSize: fontSize.xl, fontWeight: '800' }}>{score}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 4 },
  card: {
    padding: 16,
  },
  scoresRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreBadge: {
    alignItems: 'center',
    width: 84,
    gap: 2,
  },
  schoolsSummary: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  schools: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 0.5,
    gap: 8,
  },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attribution: {
    marginTop: 10,
  },
});
