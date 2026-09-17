import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Switch,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import AdminGuard from '../../components/admin/AdminGuard';
import AdminLayout from '../../components/admin/AdminLayout';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { getUsers, suspendUser, unsuspendUser, logAudit, setVerified } from '../../services/adminService';
import { User } from '../../types';

const DURATIONS: { label: string; days: number | null }[] = [
  { label: '3 days', days: 3 },
  { label: '14 days', days: 14 },
  { label: 'Permanent', days: null },
];

export default function UsersManagementScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const { user: me } = useAuthContext();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [suspendTarget, setSuspendTarget] = useState<User | null>(null);
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState<number | null>(3);
  const [verifyTarget, setVerifyTarget] = useState<User | null>(null);
  const [verifyState, setVerifyState] = useState<boolean>(false);

  const load = async (query = '') => {
    setLoading(true);
    try {
      setUsers(await getUsers(query));
    } catch (error) {
      console.error('Users load failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    void run();
  }, []);

  const confirmSuspend = async () => {
    if (!suspendTarget || !me) return;
    try {
      await suspendUser(suspendTarget.uid, reason.trim() || 'Suspended by admin', duration, me.uid);
      setSuspendTarget(null);
      setReason('');
      await load(search);
    } catch (error) {
      console.error('Suspend failed:', error);
    }
  };

  const confirmUnsuspend = async (target: User) => {
    if (!me) return;
    try {
      await unsuspendUser(target.uid);
      await logAudit(me.uid, 'user.unsuspend', { targetUid: target.uid });
      await load(search);
    } catch (error) {
      console.error('Unsuspend failed:', error);
    }
  };

  return (
    <AdminGuard>
      <AdminLayout title="Users" active="users">
        <TextInput
          value={search}
          onChangeText={(text) => {
            setSearch(text);
            void load(text);
          }}
          placeholder="Search by name, email, or UID…"
          placeholderTextColor={colors.textLight}
          style={[
            styles.search,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
              color: colors.text,
              fontSize: fontSize.sm,
            },
          ]}
          autoCorrect={false}
        />

        {loading && users.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.lg }}>
            Loading users…
          </Text>
        ) : users.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.lg }}>
            No users found.
          </Text>
        ) : (
          users.map((u) => {
            const isSelf = u.uid === me?.uid;
            const isSuspended = u.suspended === true;
            return (
              <View
                key={u.uid}
                style={[
                  styles.userRow,
                  {
                    backgroundColor: colors.surface,
                    borderRadius: radius.lg,
                    borderColor: colors.border,
                  },
                  shadow.sm,
                ]}
              >
                <Avatar uri={u.photoURL} name={u.displayName} size={40} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '700' }} numberOfLines={1}>
                      {u.displayName || 'Unnamed'}
                    </Text>
                    {isSuspended && <Badge label="Suspended" variant="error" size="sm" />}
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }} numberOfLines={1}>
                    {u.email}
                  </Text>
                  <Text style={{ color: colors.textLight, fontSize: fontSize.xs }} numberOfLines={1}>
                    {u.uid} · role {u.role}
                  </Text>
                </View>
                <View style={styles.userActions}>
                  {isSelf ? (
                    <Text style={{ color: colors.textLight, fontSize: fontSize.xs }}>You</Text>
                  ) : isSuspended ? (
                    <TouchableOpacity
                      onPress={() => void confirmUnsuspend(u)}
                      style={[styles.miniBtn, { backgroundColor: colors.success }]}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '700' }}>
                        Unsuspend
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity
                        onPress={() => {
                          setVerifyTarget(u);
                          setVerifyState(u.verified ?? false);
                        }}
                        style={[styles.miniBtn, { backgroundColor: u.verified ? colors.gray400 : colors.info }]}
                        accessibilityRole="button"
                        accessibilityLabel={u.verified ? 'Toggle verified off' : 'Toggle verified on'}
                      >
                        <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '700' }}>
                          {u.verified ? 'Unverify' : 'Verify'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setSuspendTarget(u);
                          setReason('');
                        }}
                        style={[styles.miniBtn, { backgroundColor: colors.error }]}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '700' }}>
                          Suspend
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}

        <Modal visible={suspendTarget !== null} transparent animationType="fade" onRequestClose={() => setSuspendTarget(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '800' }}>
                Suspend user
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 }}>
                {suspendTarget?.displayName || suspendTarget?.email} — suspensions block new
                listings, messages, and inquiries while keeping their data readable (GDPR).
              </Text>
              <Text style={[styles.label, { color: colors.text, fontSize: fontSize.sm, marginTop: 16 }]}>
                Reason (shown to the user)
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. Repeated spam listings"
                placeholderTextColor={colors.textLight}
                style={[
                  styles.search,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    color: colors.text,
                    fontSize: fontSize.sm,
                  },
                ]}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {DURATIONS.map((d) => (
                  <TouchableOpacity
                    key={d.label}
                    onPress={() => setDuration(d.days)}
                    style={[
                      styles.durationChip,
                      {
                        backgroundColor: duration === d.days ? colors.primary : colors.gray100,
                        borderRadius: radius.round,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: duration === d.days }}
                  >
                    <Text
                      style={{
                        color: duration === d.days ? colors.white : colors.text,
                        fontSize: fontSize.xs,
                        fontWeight: '600',
                      }}
                    >
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                <View style={{ flex: 1 }}>
                  <Button title="Cancel" variant="ghost" onPress={() => setSuspendTarget(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Suspend" variant="danger" onPress={() => void confirmSuspend()} />
                </View>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={verifyTarget !== null} transparent animationType="fade" onRequestClose={() => setVerifyTarget(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '800' }}>
                Toggle listing verification
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 }}>
                {verifyTarget?.displayName || verifyTarget?.email} — verified listings show a shield badge on cards and the detail screen.
              </Text>
              {verifyTarget && verifyTarget.verified !== undefined && (
                <Text style={{ color: colors.textLight, fontSize: fontSize.xs, marginTop: 4 }}>
                  Currently verified: {verifyTarget.verified ? 'Yes' : 'No'}
                </Text>
              )}                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                <Text style={{ color: colors.text, fontSize: fontSize.sm }}>
                  {verifyTarget && verifyTarget.verified !== undefined
                    ? (verifyTarget.verified ? 'Currently verified — uncheck to remove' : 'Currently unverified — check to enable')
                    : 'Mark as verified'}
                </Text>
                <Switch
                  value={verifyState}
                  onValueChange={setVerifyState}
                  trackColor={{ false: colors.gray300, true: colors.primary }}
                  thumbColor={verifyState ? colors.white : colors.gray500}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                <View style={{ flex: 1 }}>
                  <Button title="Cancel" variant="ghost" onPress={() => setVerifyTarget(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={verifyState ? 'Confirm Verified' : 'Confirm Unverified'}
                    variant={verifyState ? 'secondary' : 'danger'}
                    onPress={async () => {
                      if (!verifyTarget || !me) return;
                      try {
                        await setVerified(verifyTarget.uid, verifyState);
                        await logAudit(me.uid, 'user.set_verified', { targetUid: verifyTarget.uid, verified: verifyState });
                        setVerifyTarget(null);
                        setVerifyState(false);
                        await load(search);
                      } catch (error: unknown) {
                        console.error('Verify toggle failed:', error);
                      }
                    }}
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </AdminLayout>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  search: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  userActions: {
    marginLeft: 8,
  },
  miniBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
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
    maxWidth: 440,
    padding: 20,
  },
  label: {
    fontWeight: '700',
    marginBottom: 6,
  },
  durationChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});