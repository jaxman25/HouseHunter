import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';

interface PropertyMapProps {
  latitude: number;
  longitude: number;
  style?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
}

export default function PropertyMap({
  latitude,
  longitude,
  style,
}: PropertyMapProps) {
  // Google Maps embed without an API key
  const src = `https://www.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`;

  return (
    <View style={style}>
      <iframe
        src={src}
        title="Property location map"
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer"
        style={{ width: '100%', height: '100%', border: 0 }}
      />
    </View>
  );
}