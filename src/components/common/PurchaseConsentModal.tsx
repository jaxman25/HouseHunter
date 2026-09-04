import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import Button from './Button';
import { APP_NAME, CONTACT_EMAIL } from '../../utils/constants';

interface ChargeLine {
  label: string;
  value: string;
}

interface PurchaseConsentModalProps {
  visible: boolean;
  /** What the user is buying (e.g. "Featured listing for 30 days"). */
  title: string;
  /** Exact amount including currency symbol (e.g. "$29.00"). */
  amount: string;
  /** e.g. "One-time" | "Monthly, cancel anytime". */
  billing: string;
  /** Itemized summary shown before the amount. */
  lines?: ChargeLine[];
  onConfirm: () => void;
  onClose: () => void;
  confirming?: boolean;
  confirmLabel?: string;
}

/**
 * Payment consent gate. Used by any future paid feature so charging a user
 * always shows: what they are buying, an itemized price, the exact amount in
 * the confirm button, and a way to cancel. Consent is the confirm tap — no
 * hidden charges, no pre-checked boxes. See docs/PAYMENT_CONSENT.md.
 */
export default function PurchaseConsentModal({
  visible,
  title,
  amount,
  billing,
  lines = [],
  onConfirm,
  onClose,
  confirming = false,
  confirmLabel = 'Authorize',
}: PurchaseConsentModalProps) {
  const { colors, fontSize, spacing, radius } = useTheme();

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={confirming ? undefined : onClose}
        accessibilityRole="button"
        accessibilityLabel="Close payment summary"
      />
      <View style={styles.centerWrap} pointerEvents="box-none">
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.xl,
              borderColor: colors.border,
            },
          ]}
        >
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.text, fontSize: fontSize.lg }]}>
                {title}
              </Text>
              <TouchableOpacity onPress={onClose} disabled={confirming} accessibilityRole="button">
                <Text style={{ color: colors.gray400, fontSize: 22, fontWeight: '700' }}>{'\u00d7'}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: spacing.lg }}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
                Summary
              </Text>
              {lines.map((line) => (
                <View key={line.label} style={[styles.line, { borderBottomColor: colors.border }]}>
                  <Text style={{ color: colors.text, fontSize: fontSize.sm, flex: 1 }}>
                    {line.label}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
                    {line.value}
                  </Text>
                </View>
              ))}
              <View style={[styles.line, { borderBottomColor: colors.border }]}>
                <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '700', flex: 1 }}>
                  Total ({billing})
                </Text>
                <Text style={{ color: colors.primary, fontSize: fontSize.md, fontWeight: '800' }}>
                  {amount}
                </Text>
              </View>

              <Text style={[styles.consent, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
                {'By tapping \u201c' +
                  confirmLabel +
                  ' ' +
                  amount +
                  '\u201d you authorize ' +
                  APP_NAME +
                  ' to charge ' +
                  amount +
                  ' as described above. You will receive a receipt by email and can cancel a subscription or request a refund as described at the point of purchase. Questions: ' +
                  CONTACT_EMAIL +
                  '.'}
              </Text>

              <View style={{ marginTop: spacing.lg }}>
                <Button
                  title={`${confirmLabel} ${amount}`}
                  onPress={onConfirm}
                  loading={confirming}
                />
              </View>
              <TouchableOpacity
                onPress={onClose}
                disabled={confirming}
                style={{ alignSelf: 'center', padding: 8, marginTop: 8 }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  centerWrap: {
    width: '100%',
    maxWidth: 460,
    paddingHorizontal: 16,
  },
  card: {
    borderWidth: 0.5,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  title: {
    fontWeight: '800',
    flex: 1,
    paddingRight: 8,
  },
  summaryLabel: {
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  consent: {
    lineHeight: 17,
    marginTop: 14,
  },
});
