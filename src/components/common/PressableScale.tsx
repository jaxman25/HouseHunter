import React, { useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

interface PressableScaleProps extends PressableProps {
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
}

export default function PressableScale({
  scaleTo = 0.97,
  style,
  children,
  onPressIn,
  onPressOut,
  ...props
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      speed: 40,
      bounciness: 0,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={style}
        onPressIn={(event) => {
          onPressIn?.(event);
          animateTo(scaleTo);
        }}
        onPressOut={(event) => {
          onPressOut?.(event);
          animateTo(1);
        }}
        {...props}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}