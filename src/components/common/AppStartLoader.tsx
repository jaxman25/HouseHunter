import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

/**
 * App-start screen: the brand mark on the launch background.
 *
 * Shown between the native splash screen (`expo-splash-screen`, configured in
 * `app.json`) and the first navigator frame — i.e. while `AuthContext`
 * resolves the existing session. The background is fixed to the launch colour
 * instead of taking it from the theme, so the native splash cross-fades into
 * this screen instead of flashing a light frame for dark-theme users.
 */
const LAUNCH_BACKGROUND = '#061023'; // keep in sync with app.json splash/adaptiveIcon

export default function AppStartLoader() {
  return (
    <View style={styles.screen}>
      <Image
        source={require('../../../assets/loader.png')}
        style={styles.mark}
        resizeMode="contain"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />
      <ActivityIndicator size="large" color="#FFFFFF" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LAUNCH_BACKGROUND,
  },
  /** Matches the splash image width configured in app.json (220). */
  mark: {
    width: 220,
    height: 220,
  },
  spinner: {
    marginTop: 24,
  },
});
