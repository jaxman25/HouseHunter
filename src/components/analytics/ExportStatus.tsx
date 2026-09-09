import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { DataExport } from '../../types';
import { formatDateTime } from '../../utils/formatters';

interface ExportStatusProps {
  exportData: DataExport;
}

const STATUS_CONFIG = {
  pending: { icon: 'clock-outline', color: '#B45309', label: 'Pending' },
  processing: { icon: 'progress-clock', color: '#1D4ED8', label: 'Processing' },
  ready: { icon: 'check-circle', color: '#047857', label: 'Ready' },
  failed: { icon: 'alert-circle', color: '#B91C1C', label: 'Failed' },
  expired: { icon: 'clock-remove', color: '#717680', label: 'Expired' },
};

export default function ExportStatus({ exportData }: ExportStatusProps) {
  const { colors, fontSize, radius } = useTheme();
  const config = STATUS_CONFIG[exportData.status];

  const handleDownload = async () => {
    if (exportData.fileUrl) {
      await Linking.openURL(exportData.fileUrl);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1 }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name={config.icon as any} size={24} color={config.color} />
        <View style={styles.info}>
          <Text style={[styles.status, { color: config.color, fontSize: fontSize.sm, fontWeight: '600' }]}>
            {config.label}
          </Text>
          <Text style={[styles.date, { color: colors.textLight, fontSize: fontSize.xs }]}>
            Requested {formatDateTime(exportData.createdAt)}
          </Text>
        </View>
      </View>

      {exportData.status === 'ready' && exportData.fileUrl && (
        <TouchableOpacity onPress={handleDownload} style={[styles.downloadBtn, { backgroundColor: colors.primary }]}>
          <MaterialCommunityIcons name="download" size={18} color={colors.white} />
          <Text style={[styles.downloadText, { color: colors.white, fontSize: fontSize.sm }]}>
            Download
          </Text>
        </TouchableOpacity>
      )}

      {exportData.status === 'ready' && exportData.expiresAt && (
        <Text style={[styles.expiry, { color: colors.textLight, fontSize: fontSize.xs }]}>
          Expires {formatDateTime(exportData.expiresAt)}
        </Text>
      )}

      {exportData.error && (
        <Text style={[styles.error, { color: colors.error, fontSize: fontSize.xs }]}>
          {exportData.error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1 },
  status: {},
  date: { marginTop: 2 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  downloadText: { fontWeight: '600' },
  expiry: { marginTop: 8, textAlign: 'center' },
  error: { marginTop: 8 },
});
