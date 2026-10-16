import React from 'react';
import { StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTheme } from '../../context/ThemeContext';

interface VideoWalkthroughProps {
  uri: string;
  /** Pixel height of the player (width is always 100%). */
  height?: number;
}

/**
 * Video walkthrough player — native build (expo-video).
 *
 * The browser build resolves `VideoWalkthrough.web.tsx` instead (a plain
 * `<video>` element), so this file can use the player hook unconditionally at
 * the top level and import expo-video statically.
 *
 * Renders inside a rounded container that matches the image gallery.
 */
export default function VideoWalkthrough({ uri, height = 220 }: VideoWalkthroughProps) {
  const { colors, radius } = useTheme();

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  return (
    <View
      style={[
        styles.wrap,
        { borderRadius: radius.lg, backgroundColor: colors.black, height, overflow: 'hidden' },
      ]}
    >
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
});
