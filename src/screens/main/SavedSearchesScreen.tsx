import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList, SavedSearch } from '../../types';
import { useSavedSearches } from '../../hooks/useSavedSearches';
import SaveSearchModal from '../../components/search/SaveSearchModal';
import SavedSearchCard from '../../components/search/SavedSearchCard';
import EmptyState from '../../components/common/EmptyState';
import PropertyCardSkeleton from '../../components/common/PropertyCardSkeleton';
import { confirmDialog, showAlert } from '../../utils/ui/dialogs';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type SavedSearchesRouteProp = RouteProp<RootStackParamList, 'SavedSearches'>;

export default function SavedSearchesScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<SavedSearchesRouteProp>();
  const insets = useSafeAreaInsets();
  const { searches, loading, refresh, create, update, remove, toggleActive, run } =
    useSavedSearches();
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<SavedSearch | null>(null);

  // Highlight state: the savedSearchId to highlight (from route param or notification tap).
  const highlightId = route.params?.savedSearchId;
  const flatListRef = useRef<FlatList<SavedSearch>>(null);
  const highlightAnim = useRef(new Animated.Value(0)).current;

  // When searches load and highlightId is set, scroll to and animate the card.
  useEffect(() => {
    if (!highlightId || loading || searches.length === 0) return;

    const index = searches.findIndex((s) => s.id === highlightId);
    if (index === -1) {
      // Saved search not found (deleted or stale). Show a non-blocking toast.
      if (Platform.OS === 'web') {
        showAlert('Saved search not found', 'This search may have been deleted.');
      } else {
        // Use a brief toast-like alert for native
        showAlert('Saved search not found', 'This search may have been deleted.');
      }
      return;
    }

    // Scroll to the card after a brief delay to ensure FlatList has rendered.
    const scrollTimer = setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });

      // Animate highlight: fade in border + subtle background pulse, then fade out.
      highlightAnim.setValue(0);
      Animated.sequence([
        Animated.timing(highlightAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.delay(2000),
        Animated.timing(highlightAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }),
      ]).start();
    }, 300);

    return () => clearTimeout(scrollTimer);
  }, [highlightId, loading, searches, highlightAnim]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleRun = useCallback(
    async (search: SavedSearch) => {
      try {
        await run(search);
      } catch (error) {
        console.warn('Failed to run saved search:', error);
      }
      navigation.navigate('MainTabs', {
        screen: 'ExploreTab',
        params: { savedFilter: search.filters },
      } as never);
    },
    [run, navigation]
  );

  const handleDelete = (search: SavedSearch) => {
    confirmDialog(
      'Delete Saved Search',
      `Delete "${search.name}"? This cannot be undone.`,
      () => {
        void remove(search.id);
      },
      'Delete'
    );
  };

  // Interpolate highlight border color and background opacity from the animation value.
  const highlightBorderColor = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', colors.primary],
  });
  const highlightBgOpacity = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.08],
  });

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        { width: '100%', maxWidth: 720, alignSelf: 'center' },
      ]}
    >
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
          accessibilityLabel="Go back to the previous screen"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xxl }]}>
          Saved Searches
        </Text>
        <TouchableOpacity
          onPress={() => {
            setEditing(null);
            setModalVisible(true);
          }}
          style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: radius.round }]}
          accessibilityRole="button"
          accessibilityLabel="Create a new saved search"
        >
          <MaterialCommunityIcons name="plus" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={searches}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => {
          const isHighlighted = item.id === highlightId;
          return (
            <Animated.View
              style={
                isHighlighted
                  ? {
                      borderColor: highlightBorderColor,
                      borderWidth: 2,
                      borderRadius: radius.lg,
                      backgroundColor: highlightBgOpacity.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['transparent', colors.primaryLight],
                      }),
                    }
                  : undefined
              }
            >
              <SavedSearchCard
                search={item}
                onRun={() => void handleRun(item)}
                onEdit={() => {
                  setEditing(item);
                  setModalVisible(true);
                }}
                onDelete={() => handleDelete(item)}
                onToggleActive={(active) => void toggleActive(item.id, active)}
              />
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View>
              {[0, 1, 2].map((i) => (
                <PropertyCardSkeleton key={i} imageHeight={90} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="bookmark-multiple-outline"
              title="No saved searches yet"
              description="Save your filters to quickly search again later."
              actionLabel="Create Saved Search"
              onAction={() => {
                setEditing(null);
                setModalVisible(true);
              }}
            />
          )
        }
      />

      <SaveSearchModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        existing={editing}
        filters={editing?.filters ?? {}}
        onSave={async (input) => {
          if (editing) {
            await update(editing.id, input);
          } else {
            await create(input);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontWeight: '800' },
  addBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
