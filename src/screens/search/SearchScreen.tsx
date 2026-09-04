import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList, Property } from '../../types';
import PropertyCard from '../../components/property/PropertyCard';
import EmptyState from '../../components/common/EmptyState';
import { searchProperties } from '../../services/propertyService';
import { useDebouncedCallback } from '../../utils/performance/debounce';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const RECENT_SEARCHES_KEY = '@recent_searches';

export default function SearchScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { isFavorite, toggleFavorite } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Property[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  React.useEffect(() => {
    loadRecentSearches();
    inputRef.current?.focus();
  }, []);

  const loadRecentSearches = async () => {
    try {
      const data = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      if (data) setRecentSearches(JSON.parse(data));
    } catch {}
  };

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
            placeholderTextColor={colors.gray400}
            value={query}
            onChangeText={handleQueryChange}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setHasSearched(false); }}>
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.gray400} />
            </TouchableOpacity>
          )}
        </View>
      </View>

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
          data={results}
          keyExtractor={(item) => item.id}
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
            <PropertyCard
              property={item}
              onPress={() => {
                Keyboard.dismiss();
                navigation.navigate('PropertyDetail', { propertyId: item.id });
              }}
              onFavorite={() => toggleFavorite(item.id)}
              isFavorite={isFavorite(item.id)}
            />
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
});
