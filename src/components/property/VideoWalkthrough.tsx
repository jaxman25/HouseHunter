import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface VideoWalkthroughProps {
  uri: string;
  /** Pixel height of the player (width is always 100%). */
  height?: number;
}

/**
 * Video walkthrough player.
 *  - Native: expo-video `VideoView` (SDK 57's player; expo-av is deprecated).
 *  - Web: plain <video> element (expo-video has no web implementation).
 * Both render inside a rounded container that matches the image gallery.
 */
export default function VideoWalkthrough({ uri, height = 220 }: VideoWalkthroughProps) {
  const { colors, radius } = useTheme();

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.wrap, { borderRadius: radius.lg, backgroundColor: colors.black, height }]}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- walkthrough footage has no speech track */}
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

  // Native: lazy-require so web bundles never pull in expo-video native code.
  const { VideoView, useVideoPlayer } = require('expo-video') as typeof import('expo-video');

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  return (
    <View style={[styles.wrap, { borderRadius: radius.lg, backgroundColor: colors.black, height, overflow: 'hidden' }]}>
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
