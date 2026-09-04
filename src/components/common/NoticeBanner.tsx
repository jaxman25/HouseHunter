import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { APP_NOTICE_CONFIG_PATH, NOTICE_DISMISSED_KEY } from '../../utils/constants';

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
 *   }
 *
 * The doc is public-read / console-write (see firestore.rules `/config`), so
 * this works on the auth screens too — before a user signs in.
 */
export default function NoticeBanner() {
  const { colors, fontSize, radius, shadow } = useTheme();
  const insets = useSafeAreaInsets();

  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, APP_NOTICE_CONFIG_PATH),
      (docSnap) => {
        if (docSnap.exists()) {
          setNotice(docSnap.data() as AppNotice);
        } else {
          setNotice(null);
        }
      },
      () => {
        // Firestore unavailable (offline / not configured) — no banner.
        setNotice(null);
      }
    );
    return unsubscribe;
  }, []);

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
});
