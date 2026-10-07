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
import { RootStackParamList, DealStatus } from '../../types';
import { createDeal } from '../../services/dealService';
import { getAgentStats } from '../../services/statsService';
import { formatCurrencyAmount } from '../../services/currencyService';
import { useCurrencyContext } from '../../context/CurrencyContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CONTENT_MAX_WIDTH = 960;


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
 * form modal. Summary cards read one precomputed doc (`users/{uid}/stats/agent`)
 * written nightly and inflated incrementally on deal writes; no client-side
 * deal aggregation is performed on this screen.
 */
export default function AgentDashboardScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { currency } = useCurrencyContext();
  const fmt = useCallback((n: number) => formatCurrencyAmount(n, currency), [currency]);

  // The single precomputed agent stats doc — no client-side deal aggregation.
  const [agentStats, setAgentStats] = useState<{ ytdCommission: number; avgDealSize: number; closedCount: number; pipelineValue: number } | null>(null);
  // Initial-load + pull-to-refresh flags — the screen reads only the stats doc.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    const uid = user?.uid;
    if (!uid) return;
    try {
      const s = await getAgentStats(uid);
      setAgentStats(s);
    } catch (error) {
      console.error('Error loading agent stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
  }, [loadStats]);

  // ─── Metrics ──────────────────────────────────────────────────
  // Metrics come from the precomputed stats doc (written nightly and
  // incrementally on deal writes), so this screen performs exactly one read.
  const metrics = useMemo(() => {
    if (!agentStats) return null;
    return {
      ytdCommission: agentStats.ytdCommission,
      avgDealSize: agentStats.avgDealSize,
      closedCount: agentStats.closedCount,
      pipelineValue: agentStats.pipelineValue,
    };
  }, [agentStats]);

  // ─── Log-deal form ────────────────────────────────────────────
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

  const resetForm = () => {
    setFormPropertyId('');
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
      await loadStats();
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
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          data={[]}
          // Header-only list: summary cards live in ListHeaderComponent;
          // there are no row items to render.
          renderItem={() => null}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <>
              {/* Summary cards — from the single precomputed agent stats doc. */}
              <View style={styles.summaryRow}>
                {renderMetricCard('cash-multiple', money(metrics?.ytdCommission ?? 0, fmt), 'YTD Commission', colors.success)}
                {renderMetricCard('scale-balance', money(metrics?.avgDealSize ?? 0, fmt), 'Avg Deal', colors.info)}
                {renderMetricCard('check-circle', String(metrics?.closedCount ?? 0), 'Closed', colors.primary)}
                {renderMetricCard('clock-outline', money(metrics?.pipelineValue ?? 0, fmt), `Pipeline`, colors.warning)}
              </View>
            </>
          }
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
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>No listings found — create a listing first.</Text>
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
