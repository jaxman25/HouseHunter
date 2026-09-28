import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList, Deal, DealStatus } from '../../types';
import EmptyState from '../../components/common/EmptyState';
import {
  getAgentDeals,
  createDeal,
  updateDeal,
  computeDealMetrics,
  dealCommission,
} from '../../services/dealService';
import { getUserProperties } from '../../services/propertyService';
import { formatCurrencyAmount } from '../../services/currencyService';
import { useCurrencyContext } from '../../context/CurrencyContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CONTENT_MAX_WIDTH = 960;

type SortKey = 'closedAt' | 'value' | 'commission';

const STATUS_META: Record<DealStatus, { label: string; color: string }> = {
  pipeline: { label: 'Pipeline', color: 'info' },
  closed: { label: 'Closed', color: 'success' },
  lost: { label: 'Lost', color: 'error' },
};

function money(n: number, fmt: (v: number) => string): string {
  return fmt(Math.round(n));
}

/**
 * Agent Commission Dashboard — mirrors SellerPerformanceScreen's structure:
 * summary metric cards, sortable rows, pull-to-refresh, plus a "Log deal"
 * form modal. Metrics are computed client-side from the agent's own deals
 * (YTD commission, avg deal size, closed count, pipeline value).
 */
export default function AgentDashboardScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { currency } = useCurrencyContext();
  const fmt = useCallback((n: number) => formatCurrencyAmount(n, currency), [currency]);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [properties, setProperties] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('closedAt');
  // "Now" is sampled when deals load (never during render) so YTD windows
  // stay a pure function of state.
  const [now, setNow] = useState<Date>(new Date());

  // Log-deal form modal state.
  const [formVisible, setFormVisible] = useState(false);
  const [formPropertyId, setFormPropertyId] = useState('');
  const [formBuyerName, setFormBuyerName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formRate, setFormRate] = useState('2.5');
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formStatus, setFormStatus] = useState<DealStatus>('closed');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const uid = user?.uid;
    if (!uid) return;
    try {
      const [agentDeals, ownProps] = await Promise.all([
        getAgentDeals(uid),
        getUserProperties(uid).catch(() => []),
      ]);
      setDeals(agentDeals);
      setProperties(ownProps.map((p) => ({ id: p.id, title: p.title })));
      setNow(new Date());
    } catch (error) {
      console.error('Error loading deals:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
  }, [load]);

  // ─── Metrics ──────────────────────────────────────────────────
  const metrics = useMemo(() => computeDealMetrics(deals, now), [deals, now]);

  const sorted = useMemo(() => {
    const copy = [...deals];
    switch (sortBy) {
      case 'value':
        return copy.sort((a, b) => b.salePrice - a.salePrice);
      case 'commission':
        return copy.sort((a, b) => dealCommission(b) - dealCommission(a));
      case 'closedAt':
      default:
        return copy.sort(
          (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()
        );
    }
  }, [deals, sortBy]);

  // ─── Log-deal form ────────────────────────────────────────────
  const resetForm = () => {
    setFormPropertyId(properties[0]?.id ?? '');
    setFormBuyerName('');
    setFormPrice('');
    setFormRate('2.5');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormStatus('closed');
    setFormNotes('');
    setFormError('');
  };

  const openForm = () => {
    resetForm();
    setFormVisible(true);
  };

  const handleStatusChange = (deal: Deal, next: DealStatus) => {
    if (deal.status === next) return;
    setDeals((prev) =>
      prev.map((d) => (d.id === deal.id ? { ...d, status: next } : d))
    );
    updateDeal(deal.id, { status: next }).catch((error) => {
      console.error('Deal status update failed:', error);
      // Revert on failure.
      setDeals((prev) =>
        prev.map((d) => (d.id === deal.id ? { ...d, status: deal.status } : d))
      );
    });
  };

  const handleSubmit = async () => {
    const price = parseFloat(formPrice);
    const rate = parseFloat(formRate);
    if (!formPropertyId) {
      setFormError('Select one of your listings.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setFormError('Enter a valid sale price.');
      return;
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setFormError('Commission rate must be 0–100%.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formDate) || isNaN(new Date(formDate).getTime())) {
      setFormError('Enter a valid date (YYYY-MM-DD).');
      return;
    }
    if (!user) return;

    setSubmitting(true);
    setFormError('');
    try {
      await createDeal({
        agentId: user.uid,
        propertyId: formPropertyId,
        buyerName: formBuyerName.trim() || undefined,
        salePrice: price,
        commissionRate: rate,
        closedAt: new Date(formDate).toISOString(),
        status: formStatus,
        notes: formNotes.trim() || undefined,
      });
      setFormVisible(false);
      await load();
    } catch (error) {
      console.error('createDeal failed:', error);
      setFormError('Could not save the deal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render helpers ───────────────────────────────────────────
  const renderMetricCard = (
    icon: string,
    value: string,
    label: string,
    accentColor: string
  ) => (
    <View
      style={[
        styles.metricCard,
        { backgroundColor: colors.surface, borderRadius: radius.xl, width: (Math.min(400, 400) - spacing.lg * 2 - spacing.md * 3) / 4 },
      ]}
    >
      <View style={[styles.metricIcon, { backgroundColor: accentColor + '12' }]}>
        <MaterialCommunityIcons name={icon as never} size={18} color={accentColor} />
      </View>
      <Text style={[styles.metricValue, { color: colors.text, fontSize: fontSize.lg }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
        {label}
      </Text>
    </View>
  );

  const renderDealRow = ({ item }: { item: Deal }) => {
    const meta = STATUS_META[item.status];
    const metaColor =
      meta.color === 'success' ? colors.success : meta.color === 'error' ? colors.error : colors.info;

    return (
      <View
        style={[
          styles.dealRow,
          { backgroundColor: colors.surface, borderRadius: radius.lg },
          shadow.sm,
        ]}
      >
        <View style={styles.dealContent}>
          <View style={styles.dealTitleRow}>
            <Text style={[styles.dealTitle, { color: colors.text, fontSize: fontSize.md }]} numberOfLines={1}>
              {properties.find((p) => p.id === item.propertyId)?.title ?? 'Listing'}
            </Text>
            <View style={[styles.statusChip, { backgroundColor: metaColor + '18', borderRadius: radius.round }]}>
              <Text style={{ color: metaColor, fontSize: fontSize.xs, fontWeight: '700' }}>{meta.label}</Text>
            </View>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }}>
            {item.buyerName ? `${item.buyerName} · ` : ''}
            {new Date(item.closedAt).toLocaleDateString()} · {item.commissionRate}%
          </Text>
          {item.status !== 'closed' && (
            <View style={styles.statusActions}>
              {(Object.keys(STATUS_META) as DealStatus[])
                .filter((s) => s !== item.status)
                .map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => handleStatusChange(item, s)}
                    style={[styles.statusActionBtn, { borderColor: colors.border, borderRadius: radius.round }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark deal as ${STATUS_META[s].label}`}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
                      → {STATUS_META[s].label}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
          )}
        </View>

        <View style={styles.dealPriceCol}>
          <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '700' }}>
            {money(item.salePrice, fmt)}
          </Text>
          <Text style={{ color: colors.success, fontSize: fontSize.xs, fontWeight: '600' }}>
            {item.status === 'pipeline' ? 'est. ' : ''}
            {money(dealCommission(item), fmt)}
          </Text>
        </View>
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
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.xl }]}>
          Deals & Commission
        </Text>
        <TouchableOpacity
          onPress={openForm}
          style={[styles.backBtn, { backgroundColor: colors.primaryLight }]}
          accessibilityRole="button"
          accessibilityLabel="Log a deal"
        >
          <MaterialCommunityIcons name="plus" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>Loading deals…</Text>
        </View>
      ) : deals.length === 0 ? (
        <EmptyState
          icon="handshake-outline"
          title="No deals logged"
          description="Log closed and pending deals to track your commission."
          actionLabel="Log Your First Deal"
          onAction={openForm}
        />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <>
              {/* Summary cards */}
              <View style={styles.summaryRow}>
                {renderMetricCard('cash-multiple', money(metrics.ytdCommission, fmt), 'YTD Commission', colors.success)}
                {renderMetricCard('scale-balance', money(metrics.avgDealSize, fmt), 'Avg Deal', colors.info)}
                {renderMetricCard('check-circle', String(metrics.closedCount), 'Closed', colors.primary)}
                {renderMetricCard('clock-outline', money(metrics.pipelineValue, fmt), `Pipeline (${metrics.pipelineCount})`, colors.warning)}
              </View>

              {/* Sort chips */}
              <View style={[styles.sortRow, { marginTop: spacing.lg, marginBottom: spacing.md }]}>
                {(
                  [
                    { key: 'closedAt', label: 'Newest' },
                    { key: 'value', label: 'Deal Size' },
                    { key: 'commission', label: 'Commission' },
                  ] as { key: SortKey; label: string }[]
                ).map((opt) => {
                  const selected = sortBy === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.sortChip,
                        {
                          backgroundColor: selected ? colors.primary : colors.gray100,
                          borderRadius: radius.round,
                        },
                      ]}
                      onPress={() => setSortBy(opt.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={{
                          color: selected ? colors.white : colors.text,
                          fontSize: fontSize.sm,
                          fontWeight: '600',
                        }}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          }
          renderItem={renderDealRow}
        />
      )}

      {/* Log-deal modal */}
      <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFormVisible(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setFormVisible(false)}
              style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
              accessibilityRole="button"
              accessibilityLabel="Close deal form"
            >
              <MaterialCommunityIcons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>Log Deal</Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={{ padding: spacing.xl }}>
            <Text style={[styles.fieldLabel, { color: colors.text, fontSize: fontSize.sm }]}>Listing</Text>
            <View style={styles.propertyChips}>
              {properties.length === 0 && (
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
                  No listings found — create a listing first.
                </Text>
              )}
              {properties.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.propertyChip,
                    {
                      backgroundColor: formPropertyId === p.id ? colors.primary : colors.surface,
                      borderColor: formPropertyId === p.id ? colors.primary : colors.border,
                      borderRadius: radius.round,
                    },
                  ]}
                  onPress={() => setFormPropertyId(p.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: formPropertyId === p.id }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: formPropertyId === p.id ? colors.white : colors.text, fontSize: fontSize.xs, maxWidth: 200 }}
                  >
                    {p.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.text, fontSize: fontSize.sm }]}>Buyer name (optional)</Text>
            <TextInput
              value={formBuyerName}
              onChangeText={setFormBuyerName}
              placeholder="e.g. Jane Doe"
              placeholderTextColor={colors.textLight}
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontSize: fontSize.sm }]}
              accessibilityLabel="Buyer name"
            />

            <View style={styles.halfRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.text, fontSize: fontSize.sm }]}>Sale price</Text>
                <TextInput
                  value={formPrice}
                  onChangeText={setFormPrice}
                  keyboardType="numeric"
                  placeholder="400000"
                  placeholderTextColor={colors.textLight}
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontSize: fontSize.sm }]}
                  accessibilityLabel="Sale price"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.text, fontSize: fontSize.sm }]}>Rate (%)</Text>
                <TextInput
                  value={formRate}
                  onChangeText={setFormRate}
                  keyboardType="decimal-pad"
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontSize: fontSize.sm }]}
                  accessibilityLabel="Commission rate percent"
                />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.text, fontSize: fontSize.sm }]}>Close date (YYYY-MM-DD)</Text>
            <TextInput
              value={formDate}
              onChangeText={setFormDate}
              placeholder="2026-09-15"
              placeholderTextColor={colors.textLight}
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontSize: fontSize.sm }]}
              accessibilityLabel="Close date"
            />

            <Text style={[styles.fieldLabel, { color: colors.text, fontSize: fontSize.sm }]}>Status</Text>
            <View style={styles.propertyChips}>
              {(Object.keys(STATUS_META) as DealStatus[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.propertyChip,
                    {
                      backgroundColor: formStatus === s ? colors.primary : colors.surface,
                      borderColor: formStatus === s ? colors.primary : colors.border,
                      borderRadius: radius.round,
                    },
                  ]}
                  onPress={() => setFormStatus(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: formStatus === s }}
                >
                  <Text style={{ color: formStatus === s ? colors.white : colors.text, fontSize: fontSize.xs }}>
                    {STATUS_META[s].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.text, fontSize: fontSize.sm }]}>Notes (optional)</Text>
            <TextInput
              value={formNotes}
              onChangeText={setFormNotes}
              multiline
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontSize: fontSize.sm, minHeight: 70, textAlignVertical: 'top' }]}
              accessibilityLabel="Deal notes"
            />

            {formError ? (
              <Text style={{ color: colors.error, fontSize: fontSize.sm, marginTop: spacing.sm }}>{formError}</Text>
            ) : null}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={[styles.submitBtn, { backgroundColor: colors.primary, borderRadius: radius.md, opacity: submitting ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Save deal"
            >
              <Text style={{ color: colors.white, fontSize: fontSize.md, fontWeight: '700' }}>
                {submitting ? 'Saving…' : 'Save Deal'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontWeight: '700' },
  centered: { alignItems: 'center', paddingVertical: 60 },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    padding: 12,
    alignItems: 'center',
    flexGrow: 1,
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  metricValue: { fontWeight: '700' },
  metricLabel: { marginTop: 2, fontWeight: '500', textAlign: 'center' },
  sortRow: { flexDirection: 'row', gap: 8 },
  sortChip: { paddingHorizontal: 14, paddingVertical: 8 },
  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 10,
  },
  dealContent: { flex: 1 },
  dealTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dealTitle: { fontWeight: '600', flex: 1 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 2 },
  statusActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  statusActionBtn: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 0.5 },
  dealPriceCol: { alignItems: 'flex-end', marginLeft: 12, gap: 2 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  fieldLabel: { fontWeight: '600', marginTop: 16, marginBottom: 8 },
  propertyChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  propertyChip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, maxWidth: '100%' },
  textInput: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  halfRow: { flexDirection: 'row' },
  submitBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 24 },
});
