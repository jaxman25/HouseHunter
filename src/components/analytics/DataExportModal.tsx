import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { requestDataExport } from '../../services/exportService';

interface DataExportModalProps {
  visible: boolean;
  onClose: () => void;
  onRequestSubmitted?: () => void;
}

const DATA_TYPES = [
  { label: 'Profile Information', icon: 'account' },
  { label: 'Property Listings', icon: 'home' },
  { label: 'Chat Messages', icon: 'message-text' },
  { label: 'Reviews & Ratings', icon: 'star' },
  { label: 'Tour History', icon: 'calendar' },
  { label: 'Saved Searches', icon: 'magnify' },
  { label: 'Notifications', icon: 'bell' },
  { label: 'Analytics Data', icon: 'chart-bar' },
];

export default function DataExportModal({ visible, onClose, onRequestSubmitted }: DataExportModalProps) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await requestDataExport(user.uid);
      Alert.alert(
        'Export Requested',
        'Your data export is being compiled. You will receive an email with a download link when it\'s ready. The file will be available for 7 days.',
      );
      onRequestSubmitted?.();
      onClose();
    } catch (error) {
      Alert.alert('Error', (error as Error).message || 'Failed to request export');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color={colors.gray500} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
            Request Data Export
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.content}>
          <View style={[styles.infoCard, { backgroundColor: colors.primaryLight, borderRadius: radius.md }]}>
            <MaterialCommunityIcons name="shield-check" size={24} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary, fontSize: fontSize.sm }]}>
              Under GDPR, you have the right to export your personal data. The export will include all data listed below.
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.md }]}>
            Included Data
          </Text>

          {DATA_TYPES.map((item, i) => (
            <View key={i} style={[styles.dataItem, { borderBottomColor: colors.gray200 }]}>
              <MaterialCommunityIcons name={item.icon as any} size={20} color={colors.primary} />
              <Text style={[styles.dataLabel, { color: colors.text, fontSize: fontSize.sm }]}>
                {item.label}
              </Text>
              <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
            </View>
          ))}

          <Text style={[styles.note, { color: colors.textLight, fontSize: fontSize.xs }]}>
            The export will be compiled as a ZIP file containing JSON files. A download link will be sent to your email. The file will auto-delete after 7 days.
          </Text>
        </View>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            onPress={handleRequest}
            disabled={loading}
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: loading ? 0.5 : 1 }]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={[styles.submitText, { color: colors.white, fontSize: fontSize.md }]}>
                Request Export
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontWeight: '700' },
  content: { flex: 1, padding: 16 },
  infoCard: {
    flexDirection: 'row',
    padding: 14,
    gap: 10,
    marginBottom: 20,
  },
  infoText: { flex: 1, lineHeight: 20 },
  sectionTitle: { fontWeight: '600', marginBottom: 12 },
  dataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  dataLabel: { flex: 1, fontWeight: '500' },
  note: {
    marginTop: 20,
    lineHeight: 18,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitText: { fontWeight: '700' },
});
