import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import {
  APP_NOTICE_CONFIG_PATH,
  NOTICE_DISMISSED_KEY,
  ADMIN_ANNOUNCEMENTS_COLLECTION,
} from '../../utils/constants';

interface AppNotice {
  /** When true (and body is set) the banner renders. */
  active?: boolean;
  /** Optional headline shown above the body. */
  title?: string;
  /** Message text (supports plain text; wrapped automatically). */
  body?: string;
  /**
   * Bump this when publishing a new notice so users who dismissed the old one
   * see the new message (dismissal is stored per version).
   */
  version?: number;
  /** Whether the user can dismiss it. Defaults to true. */
  dismissible?: boolean;
  /** Optional action button label (rendered when actionUrl is also set). */
  actionLabel?: string;
  /** Optional URL the action button opens (Linking.openURL). */
  actionUrl?: string;
}

/**
 * In-app notice banner (BREACH_NOTIFICATION.md §4.1 channel #1).
 *
 * Reads a single Firestore doc — `config/app_notice` — and renders a
 * dismissible top banner while `active && body`. Publishing a notice is a
 * one-line console write (Firebase console → Firestore → config/app_notice),
 * no app release or deploy needed, which is exactly the "tell active users
 * immediately" property a breach notice needs.
 *
 * Config doc shape:
 *   {
 *     active: true,
 *     title: "Security notice",          // optional
 *     body: "…",                          // required when active
 *     version: 2,                         // bump to force re-display
 *     dismissible: true,                  // optional, defaults true
 *     actionLabel: "Read the notice",     // optional — link button
 *     actionUrl: "https://…",             // optional — opened with Linking
 *   }
 *
 * The doc is public-read / console-write (see firestore.rules `/config`), so
 * this works on the auth screens too — before a user signs in.
 */
export default function NoticeBanner() {
  const { colors, fontSize, radius, shadow } = useTheme();
  const insets = useSafeAreaInsets();

  const [configNotice, setConfigNotice] = useState<AppNotice | null>(null);
  const [announcement, setAnnouncement] = useState<AppNotice | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<number | null>(null);

  // Operator notice (console/Admin-written config/app_notice — works signed-out).
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, APP_NOTICE_CONFIG_PATH),
      (docSnap) => {
        setConfigNotice(docSnap.exists() ? (docSnap.data() as AppNotice) : null);
      },
      () => {
        // Firestore unavailable (offline / not configured) — no banner.
        setConfigNotice(null);
      }
    );
    return unsubscribe;
  }, []);

  // Admin-authored announcements (admin/announcements, signed-in users only).
  // The most recent active announcement takes precedence over the config doc.
  useEffect(() => {
    const q = query(
      collection(db, ADMIN_ANNOUNCEMENTS_COLLECTION),
      where('active', '==', true),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const first = snap.docs[0];
        setAnnouncement(first ? (first.data() as AppNotice) : null);
      },
      () => {
        // Signed out or offline — announcements aren't readable; fall back to config.
        setAnnouncement(null);
      }
    );
    return unsubscribe;
  }, []);

  const notice = announcement ?? configNotice;

  useEffect(() => {
    if (!notice || notice.dismissible === false) return;
    let ignore = false;
    const version = notice.version ?? 0;
    AsyncStorage.getItem(`${NOTICE_DISMISSED_KEY}${version}`)
      .then((value) => {
        if (!ignore && value === '1') setDismissedVersion(version);
      })
      .catch(() => {
        // Storage unavailable — show the banner this session only.
      });
    return () => {
      ignore = true;
    };
  }, [notice]);

  if (!notice?.active || !notice?.body) return null;
  if (notice.dismissible !== false && dismissedVersion === (notice.version ?? 0)) {
    return null;
  }

  const dismiss = () => {
    const version = notice.version ?? 0;
    setDismissedVersion(version);
    AsyncStorage.setItem(`${NOTICE_DISMISSED_KEY}${version}`, '1').catch(() => {
      // Non-fatal: notice will re-show next session.
    });
  };

  const openAction = () => {
    if (!notice.actionUrl) return;
    Linking.openURL(notice.actionUrl).catch(() => {
      // No handler for the URL — keep the banner usable.
    });
  };

  return (
    <View
      style={[styles.wrap, { top: insets.top + 8, zIndex: 1001 }]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderColor: colors.primary,
          },
          shadow.md,
        ]}
      >
        <View style={[styles.accent, { backgroundColor: colors.primary }]} />
        <View style={styles.content}>
          {notice.title ? (
            <Text style={[styles.title, { color: colors.text, fontSize: fontSize.sm }]}>
              {notice.title}
            </Text>
          ) : null}
          <Text style={[styles.body, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
            {notice.body}
          </Text>
          {notice.actionLabel && notice.actionUrl ? (
            <TouchableOpacity
              onPress={openAction}
              style={[
                styles.action,
                { backgroundColor: colors.primary, borderRadius: radius.md, marginTop: 8 },
              ]}
              accessibilityRole="link"
            >
              <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '700' }}>
                {notice.actionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {notice.dismissible !== false ? (
          <TouchableOpacity
            onPress={dismiss}
            style={[styles.dismiss, { backgroundColor: colors.gray100, borderRadius: radius.round }]}
            accessibilityRole="button"
            accessibilityLabel="Dismiss notice"
          >
            <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '700' }}>
              ✕
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 720,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    overflow: 'hidden',
  },
  accent: {
    width: 4,
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 4,
  },
  title: {
    fontWeight: '800',
    marginBottom: 2,
  },
  body: {
    lineHeight: 16,
  },
  dismiss: {
    width: 26,
    height: 26,
    margin: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
});
