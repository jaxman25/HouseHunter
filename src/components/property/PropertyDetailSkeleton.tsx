import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import Skeleton from '../common/Skeleton';

export default function PropertyDetailSkeleton() {
  const { spacing } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      {/* Gallery */}
      <Skeleton width="100%" height={320} radius={0} />

      {/* Content */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        {/* Price + badges */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Skeleton width={150} height={30} radius={8} />
          <Skeleton width={90} height={26} radius={13} />
        </View>

        {/* Title */}
        <Skeleton width="75%" height={22} radius={6} style={{ marginTop: spacing.md }} />

        {/* Location */}
        <Skeleton width="60%" height={16} radius={6} style={{ marginTop: spacing.sm }} />

        {/* Feature cards */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            marginTop: spacing.xxl,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ alignItems: 'center' }}>
              <Skeleton width={56} height={56} radius={16} />
              <Skeleton width={64} height={13} radius={6} style={{ marginTop: 8 }} />
            </View>
          ))}
        </View>

        {/* Description */}
        <Skeleton width="35%" height={20} radius={6} style={{ marginTop: spacing.xxl }} />
        <Skeleton width="100%" height={14} radius={6} style={{ marginTop: spacing.md }} />
        <Skeleton width="95%" height={14} radius={6} style={{ marginTop: 8 }} />
        <Skeleton width="88%" height={14} radius={6} style={{ marginTop: 8 }} />

        {/* Seller */}
        <Skeleton width="30%" height={20} radius={6} style={{ marginTop: spacing.xxl }} />
        <Skeleton width="100%" height={74} radius={16} style={{ marginTop: spacing.md }} />
      </View>
    </View>
  );
}