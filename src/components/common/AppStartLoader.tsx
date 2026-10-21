import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

/**
 * App-start screen: the brand mark on the launch background.
 *
 * Shown between the native splash screen (`expo-splash-screen`, configured in
 * `app.json`) and the first navigator frame — i.e. while `AuthContext`
 * resolves the existing session. The background is fixed to the launch colour
 * instead of taking it from the theme, so the native splash cross-fades into
 * this screen instead of flashing a light frame for dark-theme users.
 *
 * Web renders the animated SVG directly (the browser runs its CSS
 * animations). Native uses the matching PNG frame because React Native image
 * views cannot run SVG/CSS animations; the native splash is static too, so
 * the hand-off stays seamless.
 */
const LAUNCH_BACKGROUND = '#061023'; // keep in sync with app.json splash/adaptiveIcon

// Web uses the same /loader-anime.svg file as the static boot splash in
// public/index.html, so the hand-off is instant and the SVG stays animated.
// Native image views cannot run SVG/CSS animations, so they use the matching
// PNG frame (the native splash is static too).
const SPLASH_ART = Platform.OS === 'web'
  ? { uri: '/loader-anime.svg' }
  : require('../../../assets/loader-anime.png');

export default function AppStartLoader() {
  return (
    <View style={styles.screen}>
      <Image
        source={SPLASH_ART}
        style={styles.mark}
        contentFit="contain"
        accessible={false}
      />
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
  /** Keeps the logo inside the card at the same visual size as the splash. */
  mark: {
    width: '84%',
    maxWidth: 280,
    aspectRatio: 1,
  },
});
