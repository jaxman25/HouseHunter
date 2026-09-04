import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList, Property } from '../../types';
import PropertyCard from '../../components/property/PropertyCard';
import PropertyCardSkeleton from '../../components/common/PropertyCardSkeleton';
import EmptyState from '../../components/common/EmptyState';
import Badge from '../../components/common/Badge';
import { getUserProperties, deleteProperty } from '../../services/propertyService';
import { useResponsive } from '../../hooks/useResponsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Content column cap (matches the screen container's maxWidth). */
const CONTENT_MAX_WIDTH = 960;

export default function MyListingsScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const responsive = useResponsive();
  // Grid mirrors Favorites: 1 column on phones, 2 on tablets, 3 on desktop.
  // Cell widths are computed against the capped column (not the full window)
  // so rows tile edge-to-edge inside the centered container.
  const contentWidth = Math.min(responsive.width, CONTENT_MAX_WIDTH);
  const columns = responsive.isDesktop ? 3 : responsive.isTablet ? 2 : 1;
  const cellWidth = columns > 1
    ? Math.floor(
        (contentWidth - spacing.lg * 2 - spacing.md * (columns - 1)) / columns
      )
    : 0;

  const rows = useMemo(() => {
    const out: Property[][] = [];
    for (let i = 0; i < properties.length; i += columns) {
      out.push(properties.slice(i, i + columns));
    }
    return out;
  }, [properties, columns]);

  const loadProperties = useCallback(async () => {
    const uid = user?.uid;
    if (!uid) return;
    try {
      const result = await getUserProperties(uid);
      setProperties(result);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    // setState happens after the awaited service call, never synchronously
    // during the effect (see react-hooks/set-state-in-effect).
    const run = async () => {
      await loadProperties();
    };
    void run();
  }, [loadProperties]);

  const handleDelete = (property: Property) => {
    Alert.alert(
      'Delete Listing',
      `Are you sure you want to delete "${property.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProperty(property.id);
              setProperties((prev) => prev.filter((p) => p.id !== property.id));
            } catch {
              Alert.alert('Error', 'Failed to delete listing');
            }
          },
        },
      ]
    );
  };

  const renderCell = (property: Property) => (
    <View
      key={property.id}
      style={columns > 1 ? { width: cellWidth } : undefined}
    >
      <PropertyCard
        property={property}
        style={columns > 1 ? { width: cellWidth, marginBottom: 0 } : undefined}
        onPress={() => navigation.navigate('PropertyDetail', { propertyId: property.id })}
      />
      <View style={styles.actions}>
        <Badge
          label={property.status.charAt(0).toUpperCase() + property.status.slice(1)}
          variant={property.status === 'active' ? 'success' : property.status === 'pending' ? 'warning' : 'info'}
        />
        <View style={styles.actionBtns}>
          <TouchableOpacity
            onPress={() => navigation.navigate('EditProperty', { property })}
            style={[styles.actionBtn, { backgroundColor: colors.primaryLight }]}
          >
            <MaterialCommunityIcons name="pencil" size={16} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(property)}
            style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]}
          >
            <MaterialCommunityIcons name="delete-outline" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderSkeleton = () => {
    if (columns === 1) {
      return (
        <View>
          {[0, 1, 2].map((i) => <PropertyCardSkeleton key={i} />)}
        </View>
      );
    }
    // Mirror the final grid rows so loading doesn't cause a layout jump.
    const skeletonRows: number[][] = [];
    for (let r = 0; r < 2; r++) {
      skeletonRows.push(Array.from({ length: columns }, (_, c) => r * columns + c));
    }
    return (
      <View>
        {skeletonRows.map((row) => (
          <View
            key={row[0]}
            style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}
          >
            {row.map((key) => (
              <PropertyCardSkeleton
                key={key}
                width={cellWidth}
                imageHeight={140}
                style={{ marginBottom: 0 }}
              />
            ))}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
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
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.xl }]}>
          My Listings
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('AddProperty')}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <MaterialCommunityIcons name="plus" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => (item[0] ? item[0].id : 'row-empty')}
        contentContainerStyle={[styles.list, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProperties(); }} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <View
            style={
              columns > 1
                ? { flexDirection: 'row', gap: spacing.md }
                : undefined
            }
          >
            {item.map(renderCell)}
          </View>
        )}
        ListEmptyComponent={
          loading ? renderSkeleton() : (
            <EmptyState
              icon="home-plus"
              title="No listings yet"
              description="Create your first property listing"
              actionLabel="List Property"
              onAction={() => navigation.navigate('AddProperty')}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontWeight: '700' },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 100 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: -8, marginBottom: 16 },
  actionBtns: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
