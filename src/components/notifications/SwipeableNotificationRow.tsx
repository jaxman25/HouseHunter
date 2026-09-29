import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { RectButton, Swipeable } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

/**
 * Swipe-actions wrapper for notification rows.
 *
 *   • Swipe LEFT  → Delete (tap the button or drag past ~80px, Mail-style).
 *   • Swipe RIGHT → Mark read/unread (tap the button or drag past ~80px).
 *
 * Each action fires `onDismiss`/`onToggleRead` exactly once per gesture; the
 * parent mutates its data, so no manual close animation is required here.
 */
export default function SwipeableNotificationRow({
  onDismiss,
  onToggleRead,
  isRead,
  children,
}: {
  onDismiss: () => void;
  onToggleRead: () => void;
  isRead: boolean;
  children: React.ReactNode;
}) {
  const { colors, fontSize, radius } = useTheme();
  const dismissedRef = useRef(false);
  const toggledRef = useRef(false);

  const dismiss = () => {
    if (dismissedRef.current) return; // button press + full-swipe can both fire
    dismissedRef.current = true;
    onDismiss();
  };

  const toggleRead = () => {
    if (toggledRef.current) return;
    toggledRef.current = true;
    onToggleRead();
  };

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
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

  const renderLeftActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const translateX = dragX.interpolate({
      inputRange: [0, 80],
      outputRange: [-80, 0],
      extrapolate: 'clamp',
    });
    const label = isRead ? 'Unread' : 'Read';
    const icon = isRead ? 'email-mark-as-unread' : 'email-check-outline';
    return (
      <Animated.View style={[styles.actionWrapLeft, { transform: [{ translateX }] }]}>
        <RectButton
          style={[
            styles.readAction,
            { backgroundColor: colors.success, borderRadius: radius.lg },
          ]}
          onPress={toggleRead}
          accessibilityRole="button"
          accessibilityLabel={`${label} notification`}
        >
          <MaterialCommunityIcons name={icon as any} size={18} color={colors.white} />
          <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '700', marginTop: 2 }}>
            {label}
          </Text>
        </RectButton>
      </Animated.View>
    );
  };

  return (
    <View style={styles.clipWrap}>
      <Swipeable
        renderRightActions={renderRightActions}
        renderLeftActions={renderLeftActions}
        rightThreshold={40}
        leftThreshold={40}
        overshootRight={false}
        overshootLeft={false}
        friction={2}
        onSwipeableOpen={(direction) => {
          // Full swipe past the threshold triggers the action directly.
          if (direction === 'right') dismiss();
          else toggleRead();
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
  actionWrapLeft: {
    justifyContent: 'center',
    marginRight: 8,
    alignItems: 'flex-end',
  },
  deleteAction: {
    width: 64,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readAction: {
    width: 64,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
