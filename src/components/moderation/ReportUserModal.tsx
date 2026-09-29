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
  { key: 'inappropriate', label: 'Inappropriate behavior' },
  { key: 'scam', label: 'Scam or fraud' },
  { key: 'other', label: 'Other' },
];

/**
 * Report a user to moderators (prompt4 #7) — writes a `type: 'user'` report
 * to admin_reports (propertyId '' + reportedUserId; see firestore.rules).
 * Mirrors ReportListingModal's flow and visual language.
 */
export default function ReportUserModal({
  visible,
  onClose,
  reportedUserId,
  reportedUserName,
}: {
  visible: boolean;
  onClose: () => void;
  reportedUserId: string;
  reportedUserName: string;
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
        type: 'user',
        propertyId: '',
        reportedUserId,
        reportedUserName: reportedUserName || undefined,
        reporterId: user.uid,
        reason,
        details: details.trim() || undefined,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (error) {
      console.error('User report submission failed:', error);
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
                Thank you. Our moderation team will review this user.
              </Text>
              <View style={{ marginTop: spacing.xl }}>
                <Button title="Close" onPress={close} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.headerRow}>
                <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '800' }}>
                  Report {reportedUserName}
                </Text>
                <TouchableOpacity onPress={close} accessibilityRole="button" accessibilityLabel="Close">
                  <MaterialCommunityIcons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r.key}
                  onPress={() => setReason(r.key)}
                  style={[
                    styles.reasonRow,
                    {
                      borderColor: reason === r.key ? colors.primary : colors.border,
                      backgroundColor: reason === r.key ? colors.primaryLight : colors.surface,
                      borderRadius: radius.md,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: reason === r.key }}
                >
                  <MaterialCommunityIcons
                    name={reason === r.key ? 'radiobox-marked' : 'radiobox-blank'}
                    size={18}
                    color={reason === r.key ? colors.primary : colors.gray400}
                  />
                  <Text style={{ color: colors.text, fontSize: fontSize.sm, marginLeft: 8 }}>{r.label}</Text>
                </TouchableOpacity>
              ))}

              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="Additional details (optional)"
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={3}
                style={[
                  styles.detailsInput,
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
                <Button title="Submit report" onPress={() => void submit()} loading={sending} />
              </View>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  detailsInput: {
    borderWidth: 1,
    padding: 12,
    minHeight: 70,
    textAlignVertical: 'top',
    marginTop: 4,
  },
  doneIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
});
