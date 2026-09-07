/* eslint-disable react-hooks/refs -- intentional: keep a single Animated.Value
   alive for the component's lifetime (standard react-native pattern). */
import React, { useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  StyleSheet,
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
        accessibilityRole={props.accessibilityRole ?? 'button'}
        style={((state) => {
          // `hovered` is provided by react-native-web at runtime; the core RN
          // types omit it, so widen the callback state here.
          const hovered = (state as PressableStateCallbackType & { hovered?: boolean }).hovered;
          return [
            style,
            // Desktop web: lift the card slightly on hover (translateY + shadow).
            Platform.OS === 'web' && hovered ? styles.webHover : null,
          ];
        }) as (state: PressableStateCallbackType) => StyleProp<ViewStyle>}
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

const styles = StyleSheet.create({
  webHover: {
    transform: [{ translateY: -3 }],
    boxShadow: '0px 8px 20px rgba(0,0,0,0.12)',
  },
});