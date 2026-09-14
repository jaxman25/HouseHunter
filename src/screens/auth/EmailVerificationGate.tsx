/**
 * Email Verification Gate
 *
 * Shown after registration when the user's email has not yet been verified.
 * Renders a centered card with:
 *   - The user's email address
 *   - A "Send Verification Email" button (rate-limited)
 *   - A "I've verified — check now" button
 *   - A "Use a different email" / sign-out link
 *
 * This component is rendered by AppNavigator in place of the main app when
 * `user.emailVerified` is false (or undefined for older accounts).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import LoadingOverlay from '../../components/common/LoadingOverlay';

/** Minimum seconds between verification-email sends (anti-spam). */
const RESEND_COOLDOWN_SECONDS = 60;

/** How often to poll for email verification status (ms). */
const POLL_INTERVAL_MS = 5_000;

export default function EmailVerificationGate() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user, firebaseUser, logout } = useAuthContext();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verified, setVerified] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Cooldown timer ───────────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      return;
    }
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Poll for verification ────────────────────────────────────────
  const checkVerification = useCallback(async () => {
    try {
      const { isEmailVerified } = await import('../../services/authService');
      const result = await isEmailVerified();
      if (result) setVerified(true);
    } catch {
      // Silently ignore — user can tap the button again.
    }
  }, []);

  useEffect(() => {
    pollRef.current = setInterval(checkVerification, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkVerification]);

  // ─── Send verification email ──────────────────────────────────────
  const handleSendVerification = async () => {
    setLoading(true);
    try {
      const { sendVerificationEmail } = await import('../../services/authService');
      await sendVerificationEmail();
      setCooldown(RESEND_COOLDOWN_SECONDS);
      Alert.alert(
        'Verification Sent',
        'Check your inbox and tap the verification link. The app will automatically detect when you\'re verified.'
      );
    } catch (error: any) {
      const message =
        error?.code === 'auth/too-many-requests'
          ? 'Too many requests. Please wait a few minutes before trying again.'
          : 'Could not send verification email. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Sign out ─────────────────────────────────────────────────────
  const handleSignOut = async () => {
    try {
      await logout();
    } catch {
      // Logout is best-effort.
    }
  };

  if (verified) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <LoadingOverlay visible />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LoadingOverlay visible={loading} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 60, paddingHorizontal: spacing.xl },
          { width: '100%', maxWidth: 480, alignSelf: 'center' },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Icon */}
        <View style={styles.iconSection}>
          <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight, borderRadius: 28 }]}>
            <MaterialCommunityIcons name="email-check-outline" size={48} color={colors.primary} />
          </View>
        </View>

        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xxl }]}>
          Verify Your Email
        </Text>

        <Text style={[styles.message, { color: colors.textSecondary, fontSize: fontSize.md }]}>
          We sent a verification link to
        </Text>
        <Text style={[styles.email, { color: colors.text, fontSize: fontSize.md }]}>
          {firebaseUser?.email ?? user?.email ?? 'your email address'}
        </Text>
        <Text style={[styles.hint, { color: colors.textLight, fontSize: fontSize.sm }]}>
          Tap the link in the email to verify your account. You can also
          refresh this screen after verifying.
        </Text>

        {/* Resend button */}
        <View style={{ marginTop: spacing.xl }}>
          <Button
            title={
              cooldown > 0
                ? `Resend in ${cooldown}s`
                : 'Send Verification Email'
            }
            onPress={handleSendVerification}
            loading={loading}
            disabled={cooldown > 0}
          />
        </View>

        {/* Check verification */}
        <View style={{ marginTop: spacing.md }}>
          <Button
            title="I've Verified — Check Now"
            onPress={checkVerification}
            variant="outline"
          />
        </View>

        {/* Sign out */}
        <TouchableOpacity onPress={handleSignOut} style={{ marginTop: spacing.xl, alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
            Use a different email?{' '}
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Sign Out</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconSection: { alignItems: 'center', marginBottom: 24 },
  iconContainer: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  message: { textAlign: 'center', lineHeight: 24 },
  email: { textAlign: 'center', fontWeight: '700', marginTop: 4 },
  hint: { textAlign: 'center', marginTop: 12, lineHeight: 20 },
});
