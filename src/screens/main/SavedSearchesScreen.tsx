import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList, SavedSearch } from '../../types';
import { useSavedSearches } from '../../hooks/useSavedSearches';
import SaveSearchModal from '../../components/search/SaveSearchModal';
import SavedSearchCard from '../../components/search/SavedSearchCard';
import EmptyState from '../../components/common/EmptyState';
import PropertyCardSkeleton from '../../components/common/PropertyCardSkeleton';
import { confirmDialog } from '../../utils/ui/dialogs';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SavedSearchesScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { searches, loading, refresh, create, update, remove, toggleActive, run } =
    useSavedSearches();
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<SavedSearch | null>(null);

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
      // Apply the search's filters on the Explore tab.
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
        data={searches}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => (
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
        )}
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
              description="Save your first search to get notified of new listings"
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