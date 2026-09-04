import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

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
  scrollEnabled = false,
}: PropertyMapProps) {
  const { colors } = useTheme();

  return (
    <MapView
      style={style}
      provider={PROVIDER_GOOGLE}
      initialRegion={{
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
      scrollEnabled={scrollEnabled}
    >
      <Marker
        coordinate={{
          latitude,
          longitude,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primary,
            elevation: 3,
          }}
        >
          <MaterialCommunityIcons name="home" size={16} color={colors.white} />
        </View>
      </Marker>
    </MapView>
  );
}