import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface VideoWalkthroughProps {
  uri: string;
  /** Pixel height of the player (width is always 100%). */
  height?: number;
}

/**
 * Video walkthrough player — web build.
 *
 * expo-video has no web implementation, so the browser build renders a plain
 * <video> element. Native builds resolve `VideoWalkthrough.tsx` (expo-video).
 *
 * Both render inside a rounded container that matches the image gallery.
 */
export default function VideoWalkthrough({ uri, height = 220 }: VideoWalkthroughProps) {
  const { colors, radius } = useTheme();

  return (
    <View style={[styles.wrap, { borderRadius: radius.lg, backgroundColor: colors.black, height }]}>
      <video
        src={uri}
        controls
        playsInline
        preload="metadata"
        style={{ width: '100%', height: '100%', borderRadius: radius.lg, objectFit: 'contain', display: 'block' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
});
