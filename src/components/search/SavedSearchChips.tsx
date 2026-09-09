import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';
import { useSavedSearches } from '../../hooks/useSavedSearches';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Top 3 saved searches as one-tap chips on the home screen. */
export default function SavedSearchChips() {
  const { colors, fontSize, spacing } = useTheme();
  const navigation = useNavigation<Nav>();
  const { searches, run } = useSavedSearches();

  const top = searches.slice(0, 3);
  if (top.length === 0) return null;

  const handleRun = async (searchId: string) => {
    const search = searches.find((s) => s.id === searchId);
    if (!search) return;
    try {
      await run(search);
    } catch (error) {
      console.warn('Failed to run saved search:', error);
    }
    navigation.navigate('MainTabs', {
      screen: 'ExploreTab',
      params: { savedFilter: search.filters },
    } as never);
  };

  return (
    <View style={{ marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
      <View style={styles.row}>
        {top.map((search) => (
          <TouchableOpacity
            key={search.id}
            style={[
              styles.chip,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 20,
              },
            ]}
            onPress={() => void handleRun(search.id)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Run saved search ${search.name}`}
          >
            <MaterialCommunityIcons name="bookmark" size={13} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: fontSize.xs, fontWeight: '600', marginLeft: 4 }} numberOfLines={1}>
              {search.name}
            </Text>
            {search.newMatchCount > 0 && (
              <View style={[styles.count, { backgroundColor: colors.error, borderRadius: 9 }]}>
                <Text style={{ color: colors.white, fontSize: 10, fontWeight: '700' }}>
                  {search.newMatchCount > 99 ? '99+' : search.newMatchCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => navigation.navigate('SavedSearches')}
          style={{ paddingHorizontal: 4, paddingVertical: 6 }}
          accessibilityRole="button"
          accessibilityLabel="See all saved searches"
        >
          <Text style={{ color: colors.primary, fontSize: fontSize.xs, fontWeight: '600' }}>
            See all
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    maxWidth: 200,
  },
  count: {
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    paddingHorizontal: 4,
  },
});