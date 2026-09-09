import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';
import { useAuthContext } from '../../context/AuthContext';
import { useExport } from '../../hooks/useExport';
import ExportStatus from '../../components/analytics/ExportStatus';
import DataExportModal from '../../components/analytics/DataExportModal';

export default function DataExportScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuthContext();
  const insets = useSafeAreaInsets();

  const { exports, loading, refresh } = useExport(user?.uid || '');
  const [showExportModal, setShowExportModal] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.gray100 }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Data Export
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: colors.primaryLight, borderRadius: 12 }]}>
          <MaterialCommunityIcons name="shield-check" size={24} color={colors.primary} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, { color: colors.primary, fontSize: fontSize.md, fontWeight: '600' }]}>
              GDPR Data Export
            </Text>
            <Text style={[styles.infoText, { color: colors.primary, fontSize: fontSize.xs, lineHeight: 18 }]}>
              Under the General Data Protection Regulation (GDPR), you have the right to export all your personal data from House Hunter.
            </Text>
          </View>
        </View>

        {/* Request Button */}
        <TouchableOpacity
          onPress={() => setShowExportModal(true)}
          style={[styles.requestBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
        >
          <MaterialCommunityIcons name="download" size={20} color={colors.white} />
          <Text style={[styles.requestText, { color: colors.white, fontSize: fontSize.md }]}>
            Request New Export
          </Text>
        </TouchableOpacity>

        {/* Export History */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fontSize.lg }]}>
            Export History
          </Text>

          {loading ? (
            <Text style={[styles.loadingText, { color: colors.gray500, fontSize: fontSize.sm }]}>
              Loading...
            </Text>
          ) : exports.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="file-document-outline" size={48} color={colors.gray300} />
              <Text style={[styles.emptyText, { color: colors.gray500, fontSize: fontSize.md }]}>
                No exports yet
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.gray400, fontSize: fontSize.xs }]}>
                Request your first data export above
              </Text>
            </View>
          ) : (
            exports.map((exp) => (
              <ExportStatus key={exp.id} exportData={exp} />
            ))
          )}
        </View>
      </ScrollView>

      <DataExportModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        onRequestSubmitted={() => {
          setShowExportModal(false);
          refresh();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  infoCard: {
    flexDirection: 'row',
    padding: 14,
    gap: 10,
    marginBottom: 16,
  },
  infoContent: { flex: 1 },
  infoTitle: { marginBottom: 4 },
  infoText: {},
  requestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    marginBottom: 24,
  },
  requestText: { fontWeight: '700' },
  section: {},
  sectionTitle: { fontWeight: '700', marginBottom: 12 },
  loadingText: { textAlign: 'center', marginTop: 20 },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: { fontWeight: '500' },
  emptySubtext: { fontWeight: '400' },
});
