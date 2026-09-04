import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { CONSENT_STORAGE_KEY } from '../../utils/constants';

type Consent = 'accepted' | 'declined' | null;

/**
 * Cookie / local-storage consent banner (web builds only — native apps do not
 * use cookies). The app only stores what it needs to function (session,
 * preferences, viewed-data cache); there are no advertising or cross-site
 * tracking cookies to decline, so the choice persists for transparency and
 * the essential storage stays.
 */
export default function CookieConsentBanner() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const [consent, setConsent] = useState<Consent>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
        if (!ignore && (stored === 'accepted' || stored === 'declined')) {
          setConsent(stored);
        }
      } catch {
        // Storage unavailable — show the banner this session only.
      } finally {
        if (!ignore) setLoaded(true);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  if (Platform.OS !== 'web' || !loaded || consent !== null) return null;

  const choose = (value: 'accepted' | 'declined') => {
    setConsent(value);
    AsyncStorage.setItem(CONSENT_STORAGE_KEY, value).catch(() => {
      // Non-fatal: choice just won't persist across sessions.
    });
  };

  return (
    <View style={[styles.wrap, { zIndex: 1000 }]} pointerEvents="box-none">
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderRadius: radius.xl,
            borderColor: colors.border,
          },
          shadow.lg,
        ]}
      >
        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.md }]}>
          Your privacy
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
          This site stores only what it needs to work — keeping you signed in,
          remembering this choice, and caching what you have viewed. We do not
          use advertising or cross-site tracking cookies. See the Privacy
          Policy in Settings for details.
        </Text>
        <View style={[styles.buttons, { marginTop: spacing.md }]}>
          <TouchableOpacity
            onPress={() => choose('accepted')}
            style={[
              styles.accept,
              { backgroundColor: colors.primary, borderRadius: radius.md },
            ]}
            accessibilityRole="button"
          >
            <Text style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: '700' }}>
              Accept
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => choose('declined')}
            style={[
              styles.decline,
              { backgroundColor: colors.gray100, borderRadius: radius.md },
            ]}
            accessibilityRole="button"
          >
            <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '600' }}>
              Decline
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    padding: 16,
    borderWidth: 0.5,
  },
  title: {
    fontWeight: '800',
  },
  body: {
    lineHeight: 19,
    marginTop: 4,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  accept: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  decline: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
