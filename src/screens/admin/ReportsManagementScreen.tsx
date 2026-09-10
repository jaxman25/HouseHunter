import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getDoc, doc } from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { db } from '../../config/firebase';
import AdminGuard from '../../components/admin/AdminGuard';
import AdminLayout from '../../components/admin/AdminLayout';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import { getReports, resolveReport } from '../../services/adminService';
import { Report, ReportStatus } from '../../types';
import { PROPERTIES_COLLECTION } from '../../utils/constants';
import { getTimeAgo } from '../../utils/helpers';

const STATUS_TABS: (ReportStatus | 'all')[] = ['all', 'pending', 'dismissed', 'resolved'];

const REASON_COLOR: Record<string, string> = {
  scam: '#FEE2E2',
  inappropriate: '#FEF3C7',
  duplicate: '#DBEAFE',
  other: '#E5E7EB',
};

export default function ReportsManagementScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const { user: me } = useAuthContext();
  const [reports, setReports] = useState<Report[]>([]);
  const [tab, setTab] = useState<ReportStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Report | null>(null);
  const [propertyTitle, setPropertyTitle] = useState('');
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  const load = async (status: ReportStatus | 'all') => {
    setLoading(true);
    try {
      setReports(await getReports(status));
    } catch (error) {
      console.error('Reports load failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      await load('pending');
    };
    void run();
  }, []);

  const openDetail = async (report: Report) => {
    setSelected(report);
    setNote('');
    setPropertyTitle('');
    try {
      const snap = await getDoc(doc(db, PROPERTIES_COLLECTION, report.propertyId));
      setPropertyTitle(snap.exists() ? (snap.data().title as string) : 'Listing no longer exists');
    } catch {
      setPropertyTitle('Listing no longer exists');
    }
  };

  const act = async (action: 'dismiss' | 'resolve' | 'delete') => {
    if (!selected || !me) return;
    setActing(true);
    try {
      await resolveReport(selected.id, action, note, me.uid);
      setSelected(null);
      await load(tab);
    } catch (error) {
      console.error('Report action failed:', error);
    } finally {
      setActing(false);
    }
  };

  return (
    <AdminGuard>
      <AdminLayout title="Reports" active="reports">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {STATUS_TABS.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => {
                setTab(s);
                void load(s);
              }}
              style={[
                styles.tabChip,
                {
                  backgroundColor: tab === s ? colors.primary : colors.gray100,
                  borderRadius: radius.round,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === s }}
            >
              <Text
                style={{
                  color: tab === s ? colors.white : colors.text,
                  fontSize: fontSize.xs,
                  fontWeight: '600',
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && reports.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.lg }}>
            Loading reports…
          </Text>
        ) : reports.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.lg }}>
            No reports in this state.
          </Text>
        ) : (
          reports.map((report) => (
            <TouchableOpacity
              key={report.id}
              onPress={() => void openDetail(report)}
              style={[
                styles.reportRow,
                {
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  borderColor: colors.border,
                },
                shadow.sm,
              ]}
              accessibilityRole="button"
            >
              <View style={[styles.reasonIcon, { backgroundColor: REASON_COLOR[report.reason] ?? colors.gray100, borderRadius: radius.round }]}>
                <MaterialCommunityIcons name="flag" size={16} color={colors.error} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '700', textTransform: 'capitalize' }}>
                    {report.reason}
                  </Text>
                  <Badge label={report.status} variant={report.status === 'pending' ? 'warning' : report.status === 'resolved' ? 'success' : 'neutral'} size="sm" />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={1}>
                  Property {report.propertyId.slice(0, 8)}… · reported by user {report.reporterId.slice(0, 8)}…
                </Text>
                <Text style={{ color: colors.textLight, fontSize: fontSize.xs, marginTop: 2 }}>
                  {getTimeAgo(report.createdAt)}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.gray400} />
            </TouchableOpacity>
          ))
        )}

        <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '800', textTransform: 'capitalize' }}>
                  {selected?.reason} report
                </Text>
                <TouchableOpacity onPress={() => setSelected(null)} accessibilityRole="button" accessibilityLabel="Close">
                  <MaterialCommunityIcons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 8 }}>
                {propertyTitle}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 4 }}>
                Property ID: {selected?.propertyId} · Reporter: user {selected?.reporterId.slice(0, 10)}…
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Resolution note (optional)"
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={3}
                style={[
                  styles.noteInput,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    color: colors.text,
                    fontSize: fontSize.sm,
                  },
                ]}
              />
              <View style={{ marginTop: 16, gap: 8 }}>
                <Button
                  title="Dismiss report"
                  variant="ghost"
                  onPress={() => void act('dismiss')}
                  disabled={acting}
                />
                <Button
                  title="Resolve (keep listing)"
                  variant="secondary"
                  onPress={() => void act('resolve')}
                  disabled={acting}
                />
                <Button
                  title="Delete listing"
                  variant="danger"
                  onPress={() => void act('delete')}
                  disabled={acting}
                />
              </View>
            </View>
          </View>
        </Modal>
      </AdminLayout>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  reasonIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    padding: 20,
  },
  noteInput: {
    padding: 12,
    borderWidth: 1,
    marginTop: 14,
    textAlignVertical: 'top',
    minHeight: 80,
  },
});