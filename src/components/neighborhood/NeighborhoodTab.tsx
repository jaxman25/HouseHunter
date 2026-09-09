import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { NeighborhoodData } from '../../types';
import { getNeighborhoodData } from '../../services/neighborhoodService';
import WalkScoreBadge from './WalkScoreBadge';
import SchoolRatings from './SchoolRatings';
import CrimeRateDisplay from './CrimeRateDisplay';
import CommuteTool from './CommuteTool';
import ValueTrendsChart from './ValueTrendsChart';
import NeighborhoodMap from './NeighborhoodMap';

interface NeighborhoodTabProps {
  city: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
}

export default function NeighborhoodTab({ city, state, zipCode, latitude, longitude }: NeighborhoodTabProps) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const [data, setData] = useState<NeighborhoodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadNeighborhoodData();
  }, [city, state, zipCode]);

  const loadNeighborhoodData = async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getNeighborhoodData(city, state, zipCode);
      setData(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textLight, fontSize: fontSize.sm }]}>
          Loading neighborhood data...
        </Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="map-marker-off" size={48} color={colors.gray300} />
        <Text style={[styles.emptyText, { color: colors.gray500, fontSize: fontSize.md }]}>
          Neighborhood data not available
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.gray400, fontSize: fontSize.xs }]}>
          Data may be available soon
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Walk Scores */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Walk Scores
        </Text>
        <View style={styles.scoresGrid}>
          <WalkScoreBadge score={data.walkScore} label="Walk Score" icon="walk" />
          <WalkScoreBadge score={data.transitScore} label="Transit Score" icon="bus" />
          <WalkScoreBadge score={data.bikeScore} label="Bike Score" icon="bike" />
        </View>
      </View>

      {/* Crime Rate */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Safety
        </Text>
        <CrimeRateDisplay rate={data.crimeRate} />
      </View>

      {/* Schools */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Schools
        </Text>
        <SchoolRatings schools={data.schools} />
      </View>

      {/* Commute Tool */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Commute Calculator
        </Text>
        <CommuteTool originLat={latitude} originLng={longitude} />
      </View>

      {/* Value Trends */}
      {data.propertyTrends.yearlyData.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
            Property Value Trends
          </Text>
          <ValueTrendsChart
            averagePrice={data.propertyTrends.averagePrice}
            yearOverYearChange={data.propertyTrends.yearOverYearChange}
            yearlyData={data.propertyTrends.yearlyData}
          />
        </View>
      )}

      {/* Map & Amenities */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Nearby Amenities
        </Text>
        <NeighborhoodMap
          latitude={latitude}
          longitude={longitude}
          amenities={data.amenities}
        />
      </View>

      {/* Demographics */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Demographics
        </Text>
        <View style={[styles.demographicsCard, { backgroundColor: colors.card, borderRadius: radius.md, borderColor: colors.border }]}>
          <View style={styles.demographicRow}>
            <MaterialCommunityIcons name="account-group" size={18} color={colors.primary} />
            <Text style={[styles.demoLabel, { color: colors.textSecondary, fontSize: fontSize.sm }]}>Population</Text>
            <Text style={[styles.demoValue, { color: colors.text, fontSize: fontSize.sm }]}>
              {data.population.toLocaleString()}
            </Text>
          </View>
          <View style={styles.demographicRow}>
            <MaterialCommunityIcons name="cash-multiple" size={18} color={colors.primary} />
            <Text style={[styles.demoLabel, { color: colors.textSecondary, fontSize: fontSize.sm }]}>Median Income</Text>
            <Text style={[styles.demoValue, { color: colors.text, fontSize: fontSize.sm }]}>
              ${data.medianIncome.toLocaleString()}
            </Text>
          </View>
          <View style={styles.demographicRow}>
            <MaterialCommunityIcons name="home" size={18} color={colors.primary} />
            <Text style={[styles.demoLabel, { color: colors.textSecondary, fontSize: fontSize.sm }]}>Median Home Value</Text>
            <Text style={[styles.demoValue, { color: colors.text, fontSize: fontSize.sm }]}>
              ${data.medianHomeValue.toLocaleString()}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 20 },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: { fontWeight: '500' },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: { fontWeight: '600' },
  emptySubtext: { fontWeight: '400' },
  section: { marginBottom: 20 },
  sectionTitle: { fontWeight: '700', marginBottom: 12 },
  scoresGrid: { gap: 8 },
  demographicsCard: { padding: 16, borderWidth: 1 },
  demographicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  demoLabel: { flex: 1 },
  demoValue: { fontWeight: '600' },
});
