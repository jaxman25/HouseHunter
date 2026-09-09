import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
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
import StatusBadge from '../../components/common/StatusBadge';
import ArchiveBadge from '../../components/property/ArchiveBadge';
import ExpirationCountdown from '../../components/property/ExpirationCountdown';
import { getUserProperties, deleteProperty, updateProperty } from '../../services/propertyService';
import { archiveProperty, restoreProperty } from '../../services/archiveService';
import { confirmDialog } from '../../utils/ui/dialogs';
import { useResponsive } from '../../hooks/useResponsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Content column cap (matches the screen container's maxWidth). */
const CONTENT_MAX_WIDTH = 960;

export default function MyListingsScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusTab, setStatusTab] = useState<'all' | Property['status'] | 'archived'>('all');
  // Listing whose inline quick-status menu is expanded.
  const [expandedStatusId, setExpandedStatusId] = useState<string | null>(null);

  const responsive = useResponsive();
  // Grid mirrors Favorites: 1 column on phones, 2 on tablets/desktop.
  // Cell widths are computed against the capped content column (frame-aware
  // on web, capped at 960 on native tablets) so rows tile edge-to-edge
  // inside the centered container.
  const contentWidth = Math.min(responsive.contentWidth, CONTENT_MAX_WIDTH);
  const columns = responsive.gridColumns();
  const cellWidth = columns > 1
    ? Math.floor(
        (contentWidth - spacing.lg * 2 - spacing.md * (columns - 1)) / columns
      )
    : 0;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: properties.length,
      archived: properties.filter((p) => p.archived).length,
    };
    for (const p of properties) {
      counts[p.status] = (counts[p.status] || 0) + 1;
    }
    return counts;
  }, [properties]);

  const visibleProperties = useMemo(() => {
    if (statusTab === 'all') return properties;
    if (statusTab === 'archived') return properties.filter((p) => p.archived);
    return properties.filter((p) => p.status === statusTab);
  }, [properties, statusTab]);

  const rows = useMemo(() => {
    const out: Property[][] = [];
    for (let i = 0; i < visibleProperties.length; i += columns) {
      out.push(visibleProperties.slice(i, i + columns));
    }
    return out;
  }, [visibleProperties, columns]);

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

  const applyStatusChange = async (property: Property, next: Property['status']) => {
    if (next === property.status) return;
    const previous = property.status;
    // Optimistic update; revert if the write fails (e.g. offline/denied).
    setProperties((prev) =>
      prev.map((p) => (p.id === property.id ? { ...p, status: next } : p))
    );
    setExpandedStatusId(null);
    try {
      const data: Partial<Property> = { status: next };
      if (next === 'sold' && previous !== 'sold') {
        data.soldDate = new Date().toISOString();
      }
      if (next === 'pending' && previous !== 'pending') {
        data.pendingDate = new Date().toISOString();
      }
      await updateProperty(property.id, data);
    } catch (error) {
      console.error('Status update failed:', error);
      setProperties((prev) =>
        prev.map((p) => (p.id === property.id ? { ...p, status: previous } : p))
      );
      Alert.alert('Error', "Couldn't update the status. Please try again.");
    }
  };

  const handleQuickStatus = (property: Property, next: Property['status']) => {
    if (next === 'sold' && next !== property.status) {
      confirmDialog(
        'Mark as Sold',
        'Marking this listing as Sold will notify interested buyers that it is no longer available.',
        () => {
          void applyStatusChange(property, next);
        },
        'Mark as Sold'
      );
      return;
    }
    void applyStatusChange(property, next);
  };

  const handleArchive = (property: Property) => {
    confirmDialog(
      'Archive Listing',
      `Archive "${property.title}"? It will be hidden from search and moved to your Archived tab.`,
      async () => {
        try {
          await archiveProperty(property.id, 'manual');
          setProperties((prev) =>
            prev.map((p) =>
              p.id === property.id
                ? { ...p, archived: true, status: 'inactive', archivedAt: new Date().toISOString() }
                : p
            )
          );
        } catch (error) {
          console.error('Archive failed:', error);
          Alert.alert('Error', 'Failed to archive listing');
        }
      },
      'Archive'
    );
  };

  const handleRestore = (property: Property) => {
    confirmDialog(
      'Restore Listing',
      `Restore "${property.title}" to Active? It will be visible in search again.`,
      async () => {
        try {
          await restoreProperty(property.id);
          setProperties((prev) =>
            prev.map((p) => (p.id === property.id ? { ...p, archived: false, status: 'active' } : p))
          );
        } catch (error) {
          console.error('Restore failed:', error);
          Alert.alert('Error', 'Failed to restore listing');
        }
      },
      'Restore'
    );
  };

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
        style={[
          columns > 1 ? { width: cellWidth, marginBottom: 0 } : undefined,
          property.archived ? { opacity: 0.6 } : undefined,
        ]}
        onPress={() => navigation.navigate('PropertyDetail', { propertyId: property.id })}
      />
      {property.archived ? (
        <View style={styles.actions}>
          <View>
            <ArchiveBadge />
            <ExpirationCountdown property={property} />
          </View>
          <View style={styles.actionBtns}>
            <TouchableOpacity
              onPress={() => handleRestore(property)}
              style={[styles.actionBtn, { backgroundColor: colors.primaryLight }]}
              accessibilityRole="button"
              accessibilityLabel={`Restore ${property.title}`}
            >
              <MaterialCommunityIcons name="restore" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('EditProperty', { property })}
              style={[styles.actionBtn, { backgroundColor: colors.gray100 }]}
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
      ) : (
        <View style={styles.actions}>
          <View>
            <TouchableOpacity
              onPress={() =>
                setExpandedStatusId((prev) => (prev === property.id ? null : property.id))
              }
              style={styles.statusTrigger}
              accessibilityRole="button"
              accessibilityLabel={`Change status for ${property.title} (currently ${property.status})`}
            >
              <StatusBadge status={property.status} />
              <MaterialCommunityIcons
                name="chevron-down"
                size={14}
                color={colors.textSecondary}
                style={{ marginLeft: 2 }}
              />
            </TouchableOpacity>
            <ExpirationCountdown property={property} />
          </View>
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
      )}
      {expandedStatusId === property.id && !property.archived && (
        <View style={[styles.statusMenu, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
          {(['active', 'pending', 'sold', 'inactive'] as Property['status'][]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[
                styles.statusMenuChip,
                {
                  backgroundColor: property.status === s ? colors.primary : colors.gray100,
                  borderRadius: radius.round,
                },
              ]}
              onPress={() => handleQuickStatus(property, s)}
              accessibilityRole="button"
              accessibilityState={{ selected: property.status === s }}
            >
              <Text
                style={{
                  color: property.status === s ? colors.white : colors.text,
                  fontSize: fontSize.xs,
                  fontWeight: '600',
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
          {property.status !== 'active' && (
            <TouchableOpacity
              onPress={() => {
                setExpandedStatusId(null);
                handleArchive(property);
              }}
              style={[styles.statusMenuChip, { backgroundColor: '#FEE2E2', borderRadius: radius.round }]}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.error, fontSize: fontSize.xs, fontWeight: '600' }}>
                Archive
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
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

      {/* Status filter tabs with counts */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {(['all', 'active', 'pending', 'sold', 'inactive', 'archived'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabChip,
                {
                  backgroundColor: statusTab === tab ? colors.primary : colors.gray100,
                  borderRadius: radius.round,
                },
              ]}
              onPress={() => setStatusTab(tab)}
              accessibilityRole="button"
              accessibilityState={{ selected: statusTab === tab }}
            >
              <Text
                style={{
                  color: statusTab === tab ? colors.white : colors.text,
                  fontSize: fontSize.sm,
                  fontWeight: '600',
                }}
              >
                {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
              <Text
                style={{
                  color: statusTab === tab ? colors.white : colors.textSecondary,
                  fontSize: fontSize.xs,
                  fontWeight: '700',
                  marginLeft: 4,
                }}
              >
                {statusCounts[tab] || 0}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
            statusTab === 'archived' ? (
              <EmptyState
                icon="archive-outline"
                title="No archived properties"
                description="Sold and closed listings appear here after archiving"
              />
            ) : (
              <EmptyState
                icon="home-plus"
                title="No listings yet"
                description="Create your first property listing"
                actionLabel="List Property"
                onAction={() => navigation.navigate('AddProperty')}
              />
            )
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
  tabBar: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 0.5 },
  tabChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: -8, marginBottom: 16 },
  statusTrigger: { flexDirection: 'row', alignItems: 'center' },
  actionBtns: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusMenu: { flexDirection: 'row', gap: 6, padding: 8, marginTop: -8, marginBottom: 16, flexWrap: 'wrap' },
  statusMenuChip: { paddingHorizontal: 12, paddingVertical: 6 },
});
