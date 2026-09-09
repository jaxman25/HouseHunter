import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { SavedSearch } from '../../types';
import Badge from '../common/Badge';
import { summarizeFilters } from '../../services/savedSearchService';

interface SavedSearchCardProps {
  search: SavedSearch;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (active: boolean) => void;
}

/** One saved search: name, criteria summary, new-match badge, quick actions. */
export default function SavedSearchCard({
  search,
  onRun,
  onEdit,
  onDelete,
  onToggleActive,
}: SavedSearchCardProps) {
  const { colors, fontSize, radius, shadow } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderColor: search.isActive ? 'transparent' : colors.border,
        },
        shadow.sm,
      ]}
    >
      <TouchableOpacity
        onPress={onRun}
        style={styles.main}
        accessibilityRole="button"
        accessibilityLabel={`Run saved search ${search.name}`}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: colors.text, fontSize: fontSize.lg }]} numberOfLines={1}>
            {search.name}
          </Text>
          {search.newMatchCount > 0 && (
            <Badge count={search.newMatchCount} variant="error" />
          )}
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 }} numberOfLines={2}>
          {summarizeFilters(search.filters)}
        </Text>
        <View style={styles.metaRow}>
          <MaterialCommunityIcons
            name="bell-outline"
            size={14}
            color={search.isActive ? colors.primary : colors.textLight}
          />
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginLeft: 4 }}>
            {search.isActive ? search.notificationFrequency : 'Paused'}
            {search.matchCount > 0 ? ` · ${search.matchCount} matches` : ''}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => onToggleActive(search.isActive)}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={search.isActive ? 'Pause notifications' : 'Resume notifications'}
        >
          <MaterialCommunityIcons
            name={search.isActive ? 'bell-off-outline' : 'bell-ring-outline'}
            size={18}
            color={colors.textSecondary}
          />
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginLeft: 4 }}>
            {search.isActive ? 'Pause' : 'Resume'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onEdit} style={styles.action} accessibilityRole="button" accessibilityLabel="Edit saved search">
          <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginLeft: 4 }}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDelete}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel="Delete saved search"
        >
          <MaterialCommunityIcons name="delete-outline" size={18} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  main: {
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRightWidth: 0.5,
  },
});