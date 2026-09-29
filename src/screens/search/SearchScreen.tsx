import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { RootStackParamList, Property } from '../../types';
import PropertyCard from '../../components/property/PropertyCard';
import EmptyState from '../../components/common/EmptyState';
import { searchProperties, getProperties } from '../../services/propertyService';
import { parseSearchQuery, ParsedSearchFilters } from '../../services/aiAssistantService';
import {
  parsedToPropertyFilter,
  filtersToChips,
  removeChipFromFilters,
  isFilterEmpty,
  FilterChip,
} from '../../services/aiSearchMapping';
import { useDebouncedCallback } from '../../utils/performance/debounce';
import { useResponsive } from '../../hooks/useResponsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const RECENT_SEARCHES_KEY = '@recent_searches';

export default function SearchScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { isFavorite, toggleFavorite } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  // Web shortcut (prompt4 #8): `/` focuses the search input. No-op native.
  useKeyboardShortcuts({ focusSearchRef: inputRef });

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Property[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // ── AI natural-language search ──
  // Flow: parse → show "Interpreted as: [chips]" → confirm → filtered query.
  // Any parse failure falls back to the plain full-text search below.
  const { user } = useAuthContext();
  const [aiParsing, setAiParsing] = useState(false);
  const [pendingFilters, setPendingFilters] = useState<ParsedSearchFilters | null>(null);
  const [aiChips, setAiChips] = useState<FilterChip[]>([]);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const handleAiSearch = async () => {
    const text = query.trim();
    if (!text || aiParsing) return;
    if (!user) {
      setAiNotice('Sign in to search with AI.');
      return;
    }
    Keyboard.dismiss();
    setAiParsing(true);
    setAiNotice(null);
    setPendingFilters(null);
    setAiChips([]);
    try {
      const parsed = await parseSearchQuery(text);
      if (parsed.ok && parsed.filters) {
        setPendingFilters(parsed.filters);
        setAiChips(filtersToChips(parsed.filters));
      } else {
        // Parse fallback: run the query as plain full-text search.
        await handleSearch(text);
      }
    } catch (error) {
      console.error('AI search parse failed:', error);
      // Transport-level failure (offline / not deployed) → text search.
      await handleSearch(text);
    } finally {
      setAiParsing(false);
    }
  };

  const runAiFilters = async (filters: ParsedSearchFilters, term: string) => {
    const filter = parsedToPropertyFilter(filters);
    if (isFilterEmpty(filter)) {
      await handleSearch(term);
      return;
    }
    setLoading(true);
    setHasSearched(true);
    setPendingFilters(null);
    try {
      const { properties } = await getProperties(filter, 30);
      setResults(properties);
      saveRecentSearch(term.trim());
    } catch (error) {
      console.error('AI filtered search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeAiChip = (key: string) => {
    if (!pendingFilters) return;
    const next = removeChipFromFilters(pendingFilters, key);
    const chips = filtersToChips(next);
    setAiChips(chips);
    if (chips.length === 0) {
      setPendingFilters(null);
      return;
    }
    setPendingFilters(next);
  };

  const responsive = useResponsive();
  // Results: 1 column on phones; 2 on tablets/desktop (frame-aware).
  const columns = responsive.gridColumns();
  const cellWidth = responsive.gridCellWidth(columns);

  const rows = useMemo(() => {
    const out: Property[][] = [];
    for (let i = 0; i < results.length; i += columns) {
      out.push(results.slice(i, i + columns));
    }
    return out;
  }, [results, columns]);

  React.useEffect(() => {
    // Runs once on mount — recent searches read AsyncStorage, not render state.
    let ignore = false;
    (async () => {
      try {
        const data = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
        if (data && !ignore) setRecentSearches(JSON.parse(data));
      } catch {}
    })();
    inputRef.current?.focus();
    return () => {
      ignore = true;
    };
  }, []);

  const saveRecentSearch = async (term: string) => {
    const updated = [term, ...recentSearches.filter((s) => s !== term)].slice(0, 10);
    setRecentSearches(updated);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const handleSearch = useDebouncedCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setLoading(true);
    setHasSearched(true);
    try {
      const searchResults = await searchProperties(term);
      setResults(searchResults);
      saveRecentSearch(term.trim());
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, 300);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    // Typing cancels any pending AI interpretation.
    setPendingFilters(null);
    setAiChips([]);
    setAiNotice(null);
    handleSearch(text);
  };

  const clearRecentSearches = async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>

        <View
          style={[
            styles.searchInputContainer,
            {
              backgroundColor: colors.gray100,
              borderRadius: radius.round,
            },
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={20} color={colors.gray500} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: colors.text, fontSize: fontSize.md }]}
            placeholder="Search properties, cities, addresses..."
            placeholderTextColor={colors.textLight}
            accessibilityLabel="Search properties, cities, addresses"
            value={query}
            onChangeText={handleQueryChange}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (query.trim()) handleSearch(query.trim());
            }}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => { setQuery(''); setResults([]); setHasSearched(false); setPendingFilters(null); setAiChips([]); setAiNotice(null); }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.gray500} />
            </TouchableOpacity>
          )}
        </View>

        {/* AI natural-language search */}
        <TouchableOpacity
          onPress={handleAiSearch}
          disabled={aiParsing || !query.trim()}
          style={[styles.aiBtn, { backgroundColor: colors.primaryLight, opacity: aiParsing || !query.trim() ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Search with AI"
          accessibilityHint="Parses your sentence into filters"
        >
          {aiParsing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MaterialCommunityIcons name="auto-fix" size={20} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* AI notice (sign-in prompt etc.) */}
      {aiNotice && (
        <View style={[styles.aiNotice, { backgroundColor: colors.warning + '18', borderRadius: radius.md }]}>
          <MaterialCommunityIcons name="information-outline" size={16} color={colors.warning} />
          <Text style={{ color: colors.text, fontSize: fontSize.xs, flex: 1, marginLeft: 6 }}>
            {aiNotice}
          </Text>
          <TouchableOpacity onPress={() => setAiNotice(null)} accessibilityLabel="Dismiss">
            <MaterialCommunityIcons name="close" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* "Interpreted as: [chips]" confirmation before running the AI search */}
      {pendingFilters && (
        <View style={[styles.aiPanel, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginBottom: 8 }}>
            Interpreted as:
          </Text>
          <View style={styles.aiChipRow}>
            {aiChips.map((chip) => (
              <View
                key={chip.key}
                style={[styles.aiChip, { backgroundColor: colors.primaryLight, borderRadius: radius.round }]}
              >
                <Text style={{ color: colors.primary, fontSize: fontSize.xs, fontWeight: '600' }}>
                  {chip.label}
                </Text>
                <TouchableOpacity
                  onPress={() => removeAiChip(chip.key)}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${chip.label} filter`}
                >
                  <MaterialCommunityIcons name="close-circle" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
          <View style={styles.aiPanelActions}>
            <TouchableOpacity
              onPress={() => { setPendingFilters(null); setAiChips([]); }}
              accessibilityRole="button"
              accessibilityLabel="Discard AI filters"
            >
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => runAiFilters(pendingFilters, query)}
              disabled={loading}
              style={[styles.aiRunBtn, { backgroundColor: colors.primary, borderRadius: radius.round, opacity: loading ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Run this AI search"
            >
              <Text style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: '700' }}>
                Run search
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Content */}
      {!hasSearched && recentSearches.length > 0 ? (
        <View style={{ padding: spacing.xl }}>
          <View style={styles.recentHeader}>
            <Text style={[styles.recentTitle, { color: colors.text, fontSize: fontSize.lg }]}>
              Recent Searches
            </Text>
            <TouchableOpacity onPress={clearRecentSearches}>
              <Text style={{ color: colors.primary, fontSize: fontSize.sm }}>Clear All</Text>
            </TouchableOpacity>
          </View>
          {recentSearches.map((term, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.recentItem, { borderBottomColor: colors.border }]}
              onPress={() => {
                setQuery(term);
                handleSearch(term);
              }}
            >
              <MaterialCommunityIcons name="history" size={18} color={colors.gray400} />
              <Text style={[styles.recentText, { color: colors.text, fontSize: fontSize.md, marginLeft: 12 }]}>
                {term}
              </Text>
              <MaterialCommunityIcons name="arrow-top-right" size={16} color={colors.gray400} />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => (item[0] ? item[0].id : 'row-empty')}
          contentContainerStyle={[styles.results, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            hasSearched && results.length > 0 ? (
              <Text style={[styles.resultCount, { color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: 12 }]}>
                {results.length} result{results.length !== 1 ? 's' : ''} found
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: columns > 1 ? 'row' : undefined,
                gap: columns > 1 ? spacing.md : undefined,
                marginBottom: columns > 1 ? spacing.md : undefined,
              }}
            >
              {item.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  style={columns > 1 ? { width: cellWidth, marginBottom: 0 } : undefined}
                  onPress={() => {
                    Keyboard.dismiss();
                    navigation.navigate('PropertyDetail', { propertyId: property.id });
                  }}
                  onFavorite={() => toggleFavorite(property.id)}
                  isFavorite={isFavorite(property.id)}
                />
              ))}
            </View>
          )}
          ListEmptyComponent={
            hasSearched && !loading ? (
              <EmptyState
                icon="magnify-close"
                title="No results found"
                description="Try different keywords or check spelling"
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5, gap: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  searchInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 42, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 8 },
  results: { paddingBottom: 100 },
  resultCount: { fontWeight: '500' },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  recentTitle: { fontWeight: '700' },
  recentItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5 },
  recentText: { flex: 1 },
  aiBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  aiNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 8,
    gap: 4,
  },
  aiPanel: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  aiChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 5,
    gap: 4,
  },
  aiPanelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  aiRunBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
