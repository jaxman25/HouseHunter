import React from 'react';
import { DimensionValue, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import Skeleton from './Skeleton';

interface PropertyCardSkeletonProps {
  width?: DimensionValue;
  imageHeight?: number;
  style?: StyleProp<ViewStyle>;
}

export default function PropertyCardSkeleton({
  width = '100%',
  imageHeight = 200,
  style,
}: PropertyCardSkeletonProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      style={[
        {
          width,
          marginBottom: 16,
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Skeleton width="100%" height={imageHeight} radius={0} />
      <View style={{ padding: spacing.md }}>
        <Skeleton width={120} height={20} radius={6} style={{ marginBottom: 8 }} />
        <Skeleton width="80%" height={15} radius={6} style={{ marginBottom: 8 }} />
        <Skeleton width="55%" height={13} radius={6} />
      </View>
    </View>
  );
}