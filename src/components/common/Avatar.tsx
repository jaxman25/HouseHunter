import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../context/ThemeContext';
import { getInitials } from '../../utils/helpers';

interface AvatarProps {
  uri?: string;
  name: string;
  size?: number;
  style?: ViewStyle;
  online?: boolean;
}

export default function Avatar({ uri, name, size = 44, style, online }: AvatarProps) {
  const { colors } = useTheme();
  const initials = getInitials(name);

  return (
    <View style={[{ width: size, height: size }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[
            styles.image,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
          ]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: colors.primary,
            },
          ]}
        >
          <Text
            style={[
              styles.initials,
              {
                color: colors.white,
                fontSize: size * 0.38,
              },
            ]}
          >
            {initials}
          </Text>
        </View>
      )}
      {online !== undefined && (
        <View
          style={[
            styles.onlineIndicator,
            {
              backgroundColor: online ? colors.success : colors.gray400,
              width: size * 0.28,
              height: size * 0.28,
              borderRadius: size * 0.14,
              borderWidth: 2,
              borderColor: colors.surface,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#E5E7EB',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '700',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
});
