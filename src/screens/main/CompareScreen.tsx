import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';
import { useCompare } from '../../hooks/useCompare';
import { CompareItem, daysOnMarket } from '../../services/compareService';
import { formatPrice, getPropertyTypeLabel } from '../../utils/helpers';
import { confirmDialog } from '../../utils/ui/dialogs';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import Skeleton from '../../components/common/Skeleton';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface RowDef {
  label: string;
  value: (item: CompareItem) => string;
  /** Highlight the "best" cell? Simple heuristics per row. */
  best?: (items: CompareItem[]) => string | null;
}

const ROWS: RowDef[] = [
  { label: 'Price', value: (i) => formatPrice(i.price, i.listingType) },
  { label: 'Type', value: (i) => getPropertyTypeLabel(i.propertyType) },
  { label: 'Beds', value: (i) => String(i.bedrooms), best: (all) => maxBy(all, (i) => i.bedrooms) },
  { label: 'Baths', value: (i) => String(i.bathrooms), best: (all) => maxBy(all, (i) => i.bathrooms) },
  { label: 'Area', value: (i) => `${i.area.toLocaleString()} ${i.areaUnit === 'sqft' ? 'sq ft' : 'sq m'}`, best: (all) => maxBy(all, (i) => i.area) },
  { label: 'Year built', value: (i) => String(i.yearBuilt || '—'), best: (all) => maxBy(all, (i) => i.yearBuilt) },
  { label: 'Days on market', value: (i) => `${daysOnMarket(i.createdAt)}d`, best: (all) => minBy(all, (i) => daysOnMarket(i.createdAt)) },
  { label: 'Status', value: () => '' }, // rendered via StatusBadge
  { label: 'Features', value: (i) => (i.features.length > 0 ? i.features.length.toString() : '0'), best: (all) => maxBy(all, (i) => i.features.length) },
];

function maxBy(items: CompareItem[], get: (i: CompareItem) => number): string | null {
  if (items.length < 2) return null;
  const values = items.map(get);
  const max = Math.max(...values);
  if (values.filter((v) => v === max).length > 1) return null; // tie — no highlight
  const winner = items[values.indexOf(max)];
  return winner.propertyId;
}

function minBy(items: CompareItem[], get: (i: CompareItem) => number): string | null {
  if (items.length < 2) return null;
  const values = items.map(get);
  const min = Math.min(...values);
  if (values.filter((v) => v === min).length > 1) return null;
  const winner = items[values.indexOf(min)];
  return winner.propertyId;
}

export default function CompareScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { items, loading, remove, clear } = useCompare();

  const handleClearAll = useCallback(() => {
    confirmDialog('Clear Comparison', 'Remove all properties from the comparison?', () => {
      void clear();
    }, 'Clear');
  }, [clear]);

  const handleRemove = useCallback(
    (item: CompareItem) => {
      void remove(item.propertyId);
    },
    [remove]
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <CompareHeader title="Compare" onBack={() => navigation.goBack()} onClear={undefined} colors={colors} fontSize={fontSize} insets={insets} />
        <View style={{ padding: spacing.xl, gap: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={72} radius={radius.lg} />
          ))}
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <CompareHeader title="Compare" onBack={() => navigation.goBack()} onClear={undefined} colors={colors} fontSize={fontSize} insets={insets} />
        <EmptyState
          icon="compare-horizontal"
          title="Nothing to compare yet"
          description="Tap the scale icon on any property card to add it here (up to 4)."
          actionLabel="Explore Properties"
          onAction={() => navigation.navigate('MainTabs', { screen: 'ExploreTab' } as never)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CompareHeader
        title={`Compare (${items.length})`}
        onBack={() => navigation.goBack()}
        onClear={handleClearAll}
        colors={colors}
        fontSize={fontSize}
        insets={insets}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Property header cards */}
          <View style={styles.headerRow}>
            {/* Corner cell */}
            <View style={[styles.cornerCell, { width: COLUMN_WIDTH }]} />
            {items.map((item) => (
              <View
                key={item.propertyId}
                style={[
                  styles.cardColumn,
                  { width: COLUMN_WIDTH, backgroundColor: colors.surface, borderRadius: radius.lg },
                  shadow.sm,
                ]}
              >
                <View style={[styles.cardImageWrap, { borderRadius: radius.md, backgroundColor: colors.gray200 }]}>
                  <Image
                    source={item.images[0] ? { uri: item.images[0] } : undefined}
                    style={styles.cardImage}
                    contentFit="cover"
                  />
                  <TouchableOpacity
                    onPress={() => handleRemove(item)}
                    style={[styles.removeBtn, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.title} from comparison`}
                  >
                    <MaterialCommunityIcons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.cardTitle, { color: colors.text, fontSize: fontSize.sm }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }} numberOfLines={1}>
                  {item.city}, {item.state}
                </Text>
              </View>
            ))}
          </View>

          {/* Spec rows */}
          <View style={[styles.rowsCard, { backgroundColor: colors.surface, borderRadius: radius.lg }, shadow.sm]}>
            {ROWS.map((row, rowIndex) => (
              <View
                key={row.label}
                style={[
                  styles.row,
                  rowIndex < ROWS.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                ]}
              >
                <View style={[styles.rowLabel, { width: COLUMN_WIDTH }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600' }}>
                    {row.label}
                  </Text>
                </View>
                {items.map((item) => {
                  const isBest = row.best ? row.best(items) === item.propertyId : false;
                  return (
                    <View key={item.propertyId} style={[styles.rowCell, { width: COLUMN_WIDTH }]}>
                      {row.label === 'Status' ? (
                        <StatusBadge status={item.status} size="sm" />
                      ) : (
                        <Text
                          style={{
                            color: isBest ? colors.success : colors.text,
                            fontSize: fontSize.sm,
                            fontWeight: isBest ? '700' : '500',
                          }}
                          numberOfLines={1}
                        >
                          {row.value(item)}
                          {isBest ? ' ★' : ''}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
            {/* Features detail row (text list) */}
            <View style={styles.row}>
              <View style={[styles.rowLabel, { width: COLUMN_WIDTH }]}>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600' }}>
                  Feature list
                </Text>
              </View>
              {items.map((item) => (
                <View key={item.propertyId} style={[styles.rowCell, { width: COLUMN_WIDTH }]}>
                  <Text style={{ color: colors.text, fontSize: fontSize.xs }} numberOfLines={4}>
                    {item.features.length > 0
                      ? item.features.map((f) => f.replace(/_/g, ' ')).join(', ')
                      : '—'}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Navigate row */}
          <View style={styles.openRow}>
            <View style={{ width: COLUMN_WIDTH }} />
            {items.map((item) => (
              <TouchableOpacity
                key={item.propertyId}
                onPress={() => navigation.navigate('PropertyDetail', { propertyId: item.propertyId })}
                style={[styles.openBtn, { backgroundColor: colors.primaryLight, borderRadius: radius.md, width: COLUMN_WIDTH }]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
              >
                <Text style={{ color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' }}>
                  View
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const COLUMN_WIDTH = 150;

function CompareHeader({
  title,
  onBack,
  onClear,
  colors,
  fontSize,
  insets,
}: {
  title: string;
  onBack: () => void;
  onClear?: () => void;
  colors: any;
  fontSize: any;
  insets: { top: number };
}) {
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 8,
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <TouchableOpacity
        onPress={onBack}
        style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>{title}</Text>
      {onClear ? (
        <TouchableOpacity
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear comparison"
        >
          <MaterialCommunityIcons name="delete-sweep-outline" size={22} color={colors.error} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 36 }} />
      )}
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
  headerTitle: { fontWeight: '700' },
  headerRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  cornerCell: {},
  cardColumn: {
    padding: 10,
    gap: 4,
  },
  cardImageWrap: {
    height: 84,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontWeight: '600',
    marginTop: 4,
  },
  rowsCard: {
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  rowLabel: {
    paddingLeft: 12,
  },
  rowCell: {
    paddingHorizontal: 4,
  },
  openRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  openBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
});
