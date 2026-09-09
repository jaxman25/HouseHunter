import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { db } from '../../config/firebase';
import { ADMIN_REPORTS_COLLECTION } from '../../utils/constants';
import Button from '../common/Button';
import { ReportReason } from '../../types';

const REASONS: { key: ReportReason; label: string }[] = [
  { key: 'inappropriate', label: 'Inappropriate' },
  { key: 'scam', label: 'Scam or fraud' },
  { key: 'duplicate', label: 'Duplicate listing' },
  { key: 'other', label: 'Other' },
];

/** Report a listing to moderators (admin/reports — see firestore.rules). */
export default function ReportListingModal({
  visible,
  onClose,
  propertyId,
}: {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
}) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();
  const [reason, setReason] = useState<ReportReason>('inappropriate');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!user) return;
    setSending(true);
    try {
      await addDoc(collection(db, ADMIN_REPORTS_COLLECTION), {
        propertyId,
        reporterId: user.uid,
        reason,
        details: details.trim() || undefined,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (error) {
      console.error('Report submission failed:', error);
    } finally {
      setSending(false);
    }
  };

  const close = () => {
    onClose();
    // Reset after the modal hides so it reopens fresh.
    setTimeout(() => {
      setReason('inappropriate');
      setDetails('');
      setDone(false);
    }, 200);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
          {done ? (
            <>
              <View style={[styles.doneIcon, { backgroundColor: colors.success, borderRadius: 36 }]}>
                <MaterialCommunityIcons name="check" size={28} color={colors.white} />
              </View>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '800', textAlign: 'center' }}>
                Report submitted
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center', marginTop: 6 }}>
                Thank you. Our moderation team will review this listing.
              </Text>
              <View style={{ marginTop: spacing.xl }}>
                <Button title="Close" onPress={close} />
              </View>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '800' }}>
                  Report listing
                </Text>
                <TouchableOpacity onPress={close} accessibilityRole="button" accessibilityLabel="Close">
                  <MaterialCommunityIcons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 6 }}>
                Why are you reporting this listing?
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {REASONS.map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    onPress={() => setReason(r.key)}
                    style={[
                      styles.reasonChip,
                      {
                        backgroundColor: reason === r.key ? colors.primary : colors.gray100,
                        borderRadius: radius.round,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: reason === r.key }}
                  >
                    <Text
                      style={{
                        color: reason === r.key ? colors.white : colors.text,
                        fontSize: fontSize.xs,
                        fontWeight: '600',
                      }}
                    >
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="Details (optional) — what should we know?"
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={4}
                maxLength={500}
                style={[
                  styles.details,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    color: colors.text,
                    fontSize: fontSize.sm,
                  },
                ]}
              />
              <View style={{ marginTop: spacing.lg }}>
                <Button title="Submit report" onPress={() => void submit()} loading={sending} variant="danger" />
              </View>
              <Text style={{ color: colors.textLight, fontSize: fontSize.xs, textAlign: 'center', marginTop: 10 }}>
                Reports are confidential — the seller will not see who reported.
              </Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    padding: 20,
  },
  reasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  details: {
    minHeight: 90,
    padding: 12,
    borderWidth: 1,
    marginTop: 14,
    textAlignVertical: 'top',
  },
  doneIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
});