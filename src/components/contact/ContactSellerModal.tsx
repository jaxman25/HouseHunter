import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { Property } from '../../types';
import Button from '../common/Button';
import { sendEmailInquiry } from '../../services/contactService';
import { formatPrice } from '../../utils/helpers';
import { CONTACT_EMAIL } from '../../utils/constants';

const MAX_MESSAGE_LENGTH = 1000;

interface ContactSellerModalProps {
  visible: boolean;
  onClose: () => void;
  property: Property;
}

type Phase = 'form' | 'sent' | 'error';

/** Compose and send an email inquiry to a seller (Resend via Cloud Function). */
export default function ContactSellerModal({
  visible,
  onClose,
  property,
}: ContactSellerModalProps) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();

  const [message, setMessage] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [errorText, setErrorText] = useState('');

  const emailVerified = user?.emailVerified === true;

  const handleClose = () => {
    setMessage('');
    setAgreed(false);
    setSending(false);
    setPhase('form');
    setErrorText('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!agreed) {
      setErrorText('Please accept the Terms of Service before sending');
      return;
    }
    setSending(true);
    setErrorText('');
    try {
      await sendEmailInquiry(property.id, message.trim());
      setPhase('sent');
    } catch (error: any) {
      const code: string = error?.code ?? '';
      if (code.includes('inquiry-limit')) {
        setErrorText("You've reached the daily inquiry limit (5). Please try again tomorrow.");
      } else if (code.includes('failed-precondition')) {
        setErrorText('Please verify your email address before contacting sellers.');
      } else if (code.includes('unavailable')) {
        setErrorText('The property is no longer available for inquiries.');
      } else {
        setErrorText('Your inquiry could not be sent. Please try again.');
      }
      setPhase('error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
            {phase === 'sent' ? 'Inquiry Sent' : 'Email Seller'}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {phase === 'sent' ? (
          <View style={styles.center}>
            <View style={[styles.successIcon, { backgroundColor: colors.success, borderRadius: 40 }]}>
              <MaterialCommunityIcons name="check" size={36} color={colors.white} />
            </View>
            <Text style={[styles.successTitle, { color: colors.text, fontSize: fontSize.xl }]}>
              Your inquiry was sent successfully!
            </Text>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
              <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '700' }} numberOfLines={2}>
                {property.title}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 }}>
                {formatPrice(property.price, property.listingType)} · {property.city}, {property.state}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 10 }} numberOfLines={3}>
                “{message.trim()}”
              </Text>
            </View>
            <View style={{ width: '100%', marginTop: spacing.xl }}>
              <Button title="Return to Listing" onPress={handleClose} />
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
            <View style={[styles.propertyCard, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
              <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '700' }} numberOfLines={2}>
                {property.title}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 }}>
                Listed by {property.userName}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
                {formatPrice(property.price, property.listingType)} · {property.city}, {property.state}
              </Text>
            </View>

            <Text style={[styles.label, { color: colors.text, fontSize: fontSize.sm }]}>
              Your message
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                  color: colors.text,
                  fontSize: fontSize.md,
                },
              ]}
              placeholder="Write your message to the seller..."
              placeholderTextColor={colors.textLight}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={6}
              maxLength={MAX_MESSAGE_LENGTH}
            />
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 4, alignSelf: 'flex-end' }}>
              {message.length}/{MAX_MESSAGE_LENGTH}
            </Text>

            {!emailVerified && (
              <View style={[styles.warning, { backgroundColor: '#FEF3C7', borderRadius: radius.md }]}>
                <MaterialCommunityIcons name="email-alert-outline" size={18} color="#D97706" />
                <Text style={{ color: '#92400E', fontSize: fontSize.xs, flex: 1, marginLeft: 8 }}>
                  Verify your email address to contact sellers. Need help? {CONTACT_EMAIL}
                </Text>
              </View>
            )}

            <View style={styles.termsRow}>
              <Switch
                value={agreed}
                onValueChange={setAgreed}
                trackColor={{ true: colors.primary, false: colors.gray300 }}
                accessibilityLabel="I agree to the Terms of Service"
              />
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, flex: 1, marginLeft: 10 }}>
                I agree to House Hunter&apos;s Terms of Service
              </Text>
            </View>

            {errorText ? (
              <Text style={{ color: colors.error, fontSize: fontSize.sm, marginTop: 8 }}>{errorText}</Text>
            ) : null}

            <View style={{ height: 16 }} />
            <Button
              title="Send Inquiry"
              onPress={handleSubmit}
              loading={sending}
              disabled={!emailVerified || message.trim().length < 20}
            />
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, textAlign: 'center', marginTop: 10 }}>
              Minimum 20 characters. Your email address will be shared with the seller.
            </Text>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontWeight: '700' },
  label: { fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: {
    minHeight: 140,
    padding: 12,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  propertyCard: { padding: 14 },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginTop: 12,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successIcon: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontWeight: '800',
    textAlign: 'center',
  },
  summaryCard: {
    width: '100%',
    padding: 14,
    marginTop: 20,
  },
});