import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import AdminGuard from '../../components/admin/AdminGuard';
import AdminLayout from '../../components/admin/AdminLayout';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import {
  createAnnouncement,
  getAnnouncements,
  updateAnnouncement,
  logAudit,
} from '../../services/adminService';
import { Announcement } from '../../types';
import { getTimeAgo } from '../../utils/helpers';

export default function SystemSettingsScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const { user: me } = useAuthContext();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setAnnouncements(await getAnnouncements());
    } catch (error) {
      console.error('Announcements load failed:', error);
    }
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    void run();
  }, []);

  const publish = async () => {
    if (!body.trim() || !me) return;
    setSaving(true);
    try {
      await createAnnouncement({ title: title.trim() || undefined, body: body.trim(), active });
      await logAudit(me.uid, 'announcement.create', { title: title.trim(), active });
      setTitle('');
      setBody('');
      setActive(true);
      await load();
    } catch (error) {
      console.error('Announcement publish failed:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (announcement: Announcement) => {
    if (!me) return;
    try {
      await updateAnnouncement(announcement.id, { active: !announcement.active });
      await logAudit(me.uid, 'announcement.toggle', {
        id: announcement.id,
        active: !announcement.active,
      });
      await load();
    } catch (error) {
      console.error('Announcement toggle failed:', error);
    }
  };

  return (
    <AdminGuard>
      <AdminLayout title="Settings" active="settings">
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Publish announcement
        </Text>
        <View style={[styles.formCard, { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.border }, shadow.sm]}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Headline (optional)"
            placeholderTextColor={colors.textLight}
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderRadius: radius.md,
                color: colors.text,
                fontSize: fontSize.sm,
              },
            ]}
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Announcement text — shown as a banner to all signed-in users"
            placeholderTextColor={colors.textLight}
            multiline
            numberOfLines={4}
            style={[
              styles.input,
              styles.bodyInput,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderRadius: radius.md,
                color: colors.text,
                fontSize: fontSize.sm,
              },
            ]}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
            <Switch
              value={active}
              onValueChange={setActive}
              trackColor={{ true: colors.primary, false: colors.gray300 }}
              accessibilityLabel="Active immediately"
            />
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginLeft: 10 }}>
              Active immediately
            </Text>
          </View>
          <View style={{ marginTop: 14 }}>
            <Button title="Publish" onPress={() => void publish()} loading={saving} disabled={!body.trim()} />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg, marginTop: spacing.xl }]}>
          Published
        </Text>
        {announcements.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>No announcements yet.</Text>
        ) : (
          announcements.map((a) => (
            <View
              key={a.id}
              style={[
                styles.announcementRow,
                {
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  borderColor: colors.border,
                  opacity: a.active ? 1 : 0.6,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {a.title ? (
                    <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '700' }} numberOfLines={1}>
                      {a.title}
                    </Text>
                  ) : null}
                  <Badge label={a.active ? 'Active' : 'Paused'} variant={a.active ? 'success' : 'neutral'} size="sm" />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 4 }} numberOfLines={2}>
                  {a.body}
                </Text>
                <Text style={{ color: colors.textLight, fontSize: fontSize.xs, marginTop: 4 }}>
                  {getTimeAgo(a.createdAt)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => void toggle(a)}
                style={[styles.toggleBtn, { backgroundColor: a.active ? colors.gray100 : colors.primaryLight, borderRadius: radius.md }]}
                accessibilityRole="button"
                accessibilityLabel={`${a.active ? 'Pause' : 'Activate'} announcement`}
              >
                <MaterialCommunityIcons
                  name={a.active ? 'pause' : 'play'}
                  size={16}
                  color={a.active ? colors.textSecondary : colors.primary}
                />
              </TouchableOpacity>
            </View>
          ))
        )}
      </AdminLayout>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontWeight: '800',
    marginBottom: 12,
  },
  formCard: {
    padding: 16,
    borderWidth: 1,
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  bodyInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  announcementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  toggleBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
});