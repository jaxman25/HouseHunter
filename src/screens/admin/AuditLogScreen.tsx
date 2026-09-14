/**
 * Audit Log Viewer — admin screen for monitoring security events.
 *
 * Displays entries from the `admin/auditLog` collection with:
 *   - Action filtering (login.failed, suspend_user, etc.)
 *   - Actor name resolution
 *   - Infinite scroll pagination
 *   - Color-coded action types for quick scanning
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import AdminGuard from '../../components/admin/AdminGuard';
import AdminLayout from '../../components/admin/AdminLayout';
import Button from '../../components/common/Button';
import {
  getAuditLog,
  resolveActorNames,
  AuditLogEntry,
} from '../../services/adminService';

/** Action categories for color coding. */
const ACTION_STYLES: Record<string, { color: string; icon: string }> = {
  'login.failed': { color: '#EF4444', icon: 'alert-circle-outline' },
  'login.success': { color: '#10B981', icon: 'check-circle-outline' },
  'suspend_user': { color: '#F59E0B', icon: 'block-helper' },
  'session.revoked': { color: '#8B5CF6', icon: 'key-variant' },
  'announcement': { color: '#3B82F6', icon: 'bullhorn-outline' },
  'resolve_report': { color: '#06B6D4', icon: 'flag-check' },
};

/** Default style for unknown actions. */
const DEFAULT_STYLE = { color: '#6B7280', icon: 'code-braces-box' };

function getActionStyle(action: string) {
  for (const [prefix, style] of Object.entries(ACTION_STYLES)) {
    if (action.startsWith(prefix)) return style;
  }
  return DEFAULT_STYLE;
}

/** Filter chips for common action categories. */
const ACTION_FILTERS = [
  { key: '', label: 'All' },
  { key: 'login', label: 'Login' },
  { key: 'session', label: 'Session' },
  { key: 'suspend', label: 'Suspension' },
  { key: 'resolve', label: 'Reports' },
  { key: 'announcement', label: 'Announcements' },
];

export default function AuditLogScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [actorNames, setActorNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState('');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAuditLog(
        { actionPrefix: activeFilter || undefined },
        50
      );
      setEntries(result.entries);
      setLastDoc(result.lastDoc);
      setHasMore(result.entries.length === 50);

      const uids = result.entries
        .map((e) => e.actorUid || e.uid)
        .filter(Boolean) as string[];
      if (uids.length > 0) {
        const names = await resolveActorNames(uids);
        setActorNames(names);
      }
    } catch (error) {
      console.error('Failed to load audit log:', error);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !lastDoc) return;
    setLoadingMore(true);
    try {
      const result = await getAuditLog(
        { actionPrefix: activeFilter || undefined },
        50,
        lastDoc
      );
      setEntries((prev) => [...prev, ...result.entries]);
      setLastDoc(result.lastDoc);
      setHasMore(result.entries.length === 50);
    } catch (error) {
      console.error('Failed to load more:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const formatDate = (timestamp: any): string => {
    if (!timestamp?.toDate) return '\u2014';
    const date = timestamp.toDate();
    return date.toLocaleString();
  };

  const getActorDisplay = (entry: AuditLogEntry): string => {
    const uid = entry.actorUid || entry.uid;
    if (!uid) return 'System';
    return actorNames.get(uid) || uid.slice(0, 8) + '\u2026';
  };

  return (
    <AdminGuard>
      <AdminLayout title="Audit Log" active="dashboard">
        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, marginBottom: spacing.md }}
        >
          {ACTION_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.key}
              onPress={() => setActiveFilter(filter.key)}
              style={[
                styles.filterChip,
                {
                  backgroundColor:
                    activeFilter === filter.key ? colors.primary : colors.gray100,
                  borderRadius: radius.sm,
                },
              ]}
            >
              <Text
                style={{
                  color: activeFilter === filter.key ? colors.white : colors.text,
                  fontSize: fontSize.xs,
                  fontWeight: '600',
                }}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Log entries */}
        {loading ? (
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
            Loading audit log...
          </Text>
        ) : entries.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
            <MaterialCommunityIcons name="text-search" size={32} color={colors.gray400} />
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 8 }}>
              No audit entries found
            </Text>
          </View>
        ) : (
          <>
            {entries.map((entry) => {
              const style = getActionStyle(entry.action);
              return (
                <View
                  key={entry.id}
                  style={[
                    styles.logEntry,
                    {
                      backgroundColor: colors.surface,
                      borderRadius: radius.md,
                      borderLeftColor: style.color,
                      borderLeftWidth: 3,
                    },
                  ]}
                >
                  <View style={styles.logHeader}>
                    <View style={styles.logAction}>
                      <MaterialCommunityIcons
                        name={style.icon as any}
                        size={16}
                        color={style.color}
                      />
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: fontSize.sm,
                          fontWeight: '700',
                          marginLeft: 6,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {entry.action}
                      </Text>
                    </View>
                    <Text style={{ color: colors.textLight, fontSize: fontSize.xs }}>
                      {formatDate(entry.createdAt)}
                    </Text>
                  </View>

                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 4 }}>
                    Actor: {getActorDisplay(entry)}
                  </Text>

                  {entry.ip && (
                    <Text style={{ color: colors.textLight, fontSize: fontSize.xs, marginTop: 2 }}>
                      IP: {entry.ip}
                    </Text>
                  )}

                  {entry.detail && Object.keys(entry.detail).length > 0 && (
                    <Text
                      style={{ color: colors.textLight, fontSize: fontSize.xs, marginTop: 4 }}
                      numberOfLines={2}
                    >
                      {JSON.stringify(entry.detail)}
                    </Text>
                  )}
                </View>
              );
            })}

            {hasMore && (
              <View style={{ marginTop: spacing.md }}>
                <Button
                  title={loadingMore ? 'Loading...' : 'Load More'}
                  onPress={loadMore}
                  variant="outline"
                  loading={loadingMore}
                />
              </View>
            )}
          </>
        )}
      </AdminLayout>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  logEntry: {
    padding: 12,
    marginBottom: 8,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logAction: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
});
