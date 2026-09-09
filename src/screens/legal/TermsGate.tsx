import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import { acceptTerms } from '../../services/authService';
import {
  APP_NAME,
  CONTACT_EMAIL,
  TERMS_EFFECTIVE_DATE,
  TERMS_VERSION,
} from '../../utils/constants';

interface TermsGateProps {
  userId: string;
}

/**
 * Post-login consent gate. Accounts created before versioned terms existed,
 * or through flows with no checkbox (social sign-in), land here until the
 * user explicitly accepts the current Terms of Service. Acceptance is stored
 * on the user document (`termsAcceptedVersion`); the real-time profile
 * subscription then flips this screen away automatically.
 */
export default function TermsGate({ userId }: TermsGateProps) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { refreshUser } = useAuthContext();
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  const handleAccept = async () => {
    if (accepting) return;
    setAccepting(true);
    setAcceptError('');
    try {
      await acceptTerms(userId);
      // The AuthContext profile snapshot updates and AppNavigator swaps to
      // the main stack. Re-fetch as well so the flip doesn't depend solely
      // on the snapshot arriving (acceptTerms invalidates the profile
      // cache, so this read is fresh).
      await refreshUser();
    } catch (error: any) {
      // Show the failure inline: `Alert.alert` is a no-op on the web build,
      // so an invisible catch here previously left users stuck on this gate
      // with no explanation (see src/utils/ui/dialogs.ts).
      console.error('Accept terms error:', error);
      const code: string = error?.code ?? error?.name ?? '';
      let message = 'Could not save your acceptance. Please try again.';
      if (code.includes('permission-denied') || code.includes('unauthenticated')) {
        message =
          'We could not save your acceptance. Please contact ' +
          CONTACT_EMAIL +
          ' for help.';
      } else if (code.includes('CircuitOpen') || code.includes('deadline') || code.includes('unavailable')) {
        message = 'The service is temporarily busy. Please wait a moment and try again.';
      }
      setAcceptError(message);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        { width: '100%', maxWidth: 720, alignSelf: 'center' },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.xxl }}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight, borderRadius: radius.round }]}>
          <Text style={{ color: colors.primary, fontSize: 34, fontWeight: '800' }}>{APP_NAME}</Text>
        </View>

        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xxl }]}>
          Welcome to {APP_NAME}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fontSize.md }]}>
          Please review and accept our Terms of Service (effective{' '}
          {TERMS_EFFECTIVE_DATE}, version {TERMS_VERSION}) to continue.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.xl }]}>
          <View style={styles.block}>
            <Text style={[styles.h2, { color: colors.text, fontSize: fontSize.lg }]}>
              What you agree to
            </Text>
            <Text style={[styles.li, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              {'\u2022  '}You are at least 18 and responsible for your account and its activity.
            </Text>
            <Text style={[styles.li, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              {'\u2022  '}You will post accurate listings and only content you have rights to.
            </Text>
            <Text style={[styles.li, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              {'\u2022  '}No fraud, impersonation, scraping, or illegal use of the service.
            </Text>
            <Text style={[styles.li, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              {'\u2022  '}{APP_NAME} is a platform between users and is not a party to your
              transactions.
            </Text>
            <Text style={[styles.li, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              {'\u2022  '}Any future paid feature will show its price and ask for a clear,
              separate confirmation before charging you.
            </Text>
            <Text style={[styles.li, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              {'\u2022  '}The service is provided \u201cas is\u201d with limited liability as
              described in the full Terms.
            </Text>
          </View>

          <View style={[styles.block, { borderTopColor: colors.border, borderTopWidth: 0.5, paddingTop: 16 }]}>
            <Text style={[styles.h2, { color: colors.text, fontSize: fontSize.lg }]}>
              Privacy summary
            </Text>
            <Text style={[styles.li, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              {'\u2022  '}We collect only what the app needs: your account info, listings,
              messages, and error-reporting data. We never sell your data.
            </Text>
            <Text style={[styles.li, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              {'\u2022  '}You can delete everything at any time: Settings {'\u2192'} Delete Account.
            </Text>
            <Text style={[styles.li, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              {'\u2022  '}Full details are in the Privacy Policy, viewable in Settings after
              you sign in.
            </Text>
          </View>
        </View>

        {acceptError ? (
          <View
            style={[
              styles.errorBanner,
              {
                backgroundColor: '#FEF2F2',
                borderRadius: radius.md,
                marginTop: spacing.xl,
              },
            ]}
            accessibilityRole="alert"
          >
            <Text style={{ color: colors.error, fontSize: fontSize.sm, lineHeight: 20 }}>
              {acceptError}
            </Text>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xl }}>
          <Button
            title="I Accept the Terms of Service"
            onPress={handleAccept}
            loading={accepting}
            disabled={accepting}
          />
          {accepting && (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ marginTop: spacing.md }}
            />
          )}
        </View>

        <Text style={[styles.contact, { color: colors.textLight, fontSize: fontSize.xs }]}>
          Questions? {CONTACT_EMAIL}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  iconWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 24,
  },
  card: {
    padding: 20,
  },
  block: {
    borderTopWidth: 0,
  },
  h2: {
    fontWeight: '700',
    marginBottom: 10,
  },
  li: {
    lineHeight: 22,
    marginBottom: 8,
  },
  errorBanner: {
    padding: 12,
  },
  contact: {
    textAlign: 'center',
    marginTop: 24,
  },
});
