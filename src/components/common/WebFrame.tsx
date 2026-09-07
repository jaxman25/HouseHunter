import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';

/**
 * Web-only "phone frame" container.
 *
 * On desktop web the app renders inside a centered 480px column with a gray
 * (#f0f0f0) backdrop, a subtle border, and a soft shadow — the classic
 * "mobile app in a browser frame" look. On mobile web the viewport is already
 * ≤ 480px wide, so the frame fills the screen and the chrome never shows.
 * On native platforms this component is a transparent pass-through (native
 * tablets/desktops keep their own full-width layouts).
 *
 * Mount it around the entire signed-in UI (navigator + overlays) in App.tsx.
 */
export default function WebFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;

  return (
    <View style={styles.backdrop}>
      <View style={styles.frame}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E0E0E0',
    boxShadow: '0 0 24px rgba(0,0,0,0.15)',
    overflow: 'hidden',
  },
});