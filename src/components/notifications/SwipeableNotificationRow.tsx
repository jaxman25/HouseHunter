import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { RectButton, Swipeable } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

/**
 * Swipe-to-dismiss wrapper for notification rows.
 *
 * Left swipe reveals a Delete action. Two ways to dismiss:
 *   1. Tap the revealed Delete button (rect button), or
 *   2. Keep dragging past ~80px — `onSwipeableOpen` fires on full-swipe and
 *      triggers dismissal Mail-style, no extra tap needed.
 *
 * Either path calls `onDismiss` exactly once; the parent removes the row
 * from its data so no manual close animation is required.
 */
export default function SwipeableNotificationRow({
  onDismiss,
  children,
}: {
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const { colors, fontSize, radius } = useTheme();
  const dismissedRef = useRef(false);

  const dismiss = () => {
    if (dismissedRef.current) return; // button press + full-swipe can both fire
    dismissedRef.current = true;
    onDismiss();
  };

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    // Slide the action into place proportionally to the drag distance.
    const translateX = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [0, 80],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.actionWrap, { transform: [{ translateX }] }]}>
        <RectButton
          style={[styles.deleteAction, { backgroundColor: colors.error, borderRadius: radius.lg }]}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Delete notification"
        >
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.white} />
          <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '700', marginTop: 2 }}>
            Delete
          </Text>
        </RectButton>
      </Animated.View>
    );
  };

  return (
    <View style={styles.clipWrap}>
      <Swipeable
        renderRightActions={renderRightActions}
        rightThreshold={40}
        overshootRight={false}
        friction={2}
        onSwipeableOpen={(direction) => {
          // Full swipe past the threshold = dismiss (right swipe only).
          if (direction === 'right') dismiss();
        }}
      >
        {children}
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  clipWrap: {
    overflow: 'hidden',
  },
  actionWrap: {
    justifyContent: 'center',
    marginLeft: 8,
  },
  deleteAction: {
    width: 64,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
