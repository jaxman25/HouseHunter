import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { SavedSearch } from '../../types';
import { getSavedSearches } from '../../services/savedSearchService';
import { summarizeFilters } from '../../services/savedSearchService';

interface MapSavedSearchOverlayProps {
  /** Currently active saved search id, or null when showing all properties. */
  activeSearchId: string | null;
  /** Fired when the user picks a saved search to apply to the map. */
  onSelect: (search: SavedSearch) => void;
  /** Fired when the user turns off the "show only" toggle. */
  onClear: () => void;
}

/**
 * Floating overlay for MapScreen listing the user's saved searches as chips.
 * Selecting one reports it to the parent (which filters the markers) and
 * shows a "Show only [name] results" toggle bar while it is active.
 */
export default function MapSavedSearchOverlay({
  activeSearchId,
  onSelect,
  onClear,
}: MapSavedSearchOverlayProps) {
  const { colors, fontSize, radius, shadow } = useTheme();
  const { user } = useAuthContext();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setSearches([]);
      setLoading(false);
      return;
    }
    let ignore = false;
    getSavedSearches(user.uid)
      .then((list) => {
        if (!ignore) setSearches(list);
      })
      .catch(() => {
        // Non-critical: chips just stay hidden on failure.
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [user?.uid]);

  const active = searches.find((s) => s.id === activeSearchId) ?? null;

  // Signed-out users and users without saved searches see nothing.
  if (!user || (!loading && searches.length === 0)) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {/* Active-search toggle bar */}
      {active && (
        <View
          style={[
            styles.activeBar,
            { backgroundColor: colors.primary, borderRadius: radius.round },
            shadow.sm,
          ]}
        >
          <MaterialCommunityIcons name="bookmark" size={14} color={colors.white} />
          <Text
            style={[styles.activeText, { color: colors.white, fontSize: fontSize.xs }]}
            numberOfLines={1}
          >
            Show only “{active.name}” results
          </Text>
          <Switch
            value={true}
            onValueChange={onClear}
            trackColor={{ true: 'rgba(255,255,255,0.5)', false: 'transparent' }}
            thumbColor={colors.white}
            style={styles.switch}
            accessibilityLabel={`Stop filtering by ${active.name}`}
          />
          <TouchableOpacity
            onPress={onClear}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Clear saved search filter"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="close" size={16} color={colors.white} />
          </TouchableOpacity>
        </View>
      )}

      {/* Saved search chips */}
      {searches.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          pointerEvents="box-none"
        >
          {searches.map((search) => {
            const isActive = search.id === activeSearchId;
            return (
              <TouchableOpacity
                key={search.id}
                onPress={() => (isActive ? onClear() : onSelect(search))}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isActive ? colors.primary : colors.surface,
                    borderColor: isActive ? colors.primary : colors.border,
                    borderRadius: radius.round,
                  },
                  shadow.sm,
                ]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Filter map by saved search ${search.name}`}
              >
                <MaterialCommunityIcons
                  name={isActive ? 'bookmark' : 'bookmark-outline'}
                  size={13}
                  color={isActive ? colors.white : colors.primary}
                />
                <Text
                  style={[
                    styles.chipText,
                    {
                      color: isActive ? colors.white : colors.text,
                      fontSize: fontSize.xs,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {search.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Screen-reader hint for the active search's criteria */}
      {active && (
        <Text style={styles.srOnly} accessibilityLabel={`Filters: ${summarizeFilters(active.filters)}`}>
          {summarizeFilters(active.filters)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 104,
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    zIndex: 5,
  },
  activeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  activeText: {
    fontWeight: '600',
    flex: 1,
    marginHorizontal: 8,
  },
  switch: {
    transform: [{ scale: 0.75 }],
  },
  closeBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    maxWidth: 220,
  },
  chipText: {
    fontWeight: '600',
    marginLeft: 5,
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
