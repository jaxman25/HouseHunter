import React from 'react';
import { View, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export default function LoadingOverlay({ visible }: LoadingOverlayProps) {
  const { colors } = useTheme();

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    padding: 30,
    borderRadius: 16,
    boxShadow: '0px 2px 8px rgba(0,0,0,0.15)',
  },
});
