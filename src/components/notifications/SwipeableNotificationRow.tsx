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
 * Each action fires at most once per gesture: a button tap and a full-swipe
 * can both fire in quick succession, so the guard dedupes them — but it is
 * RE-ARMED on close so subsequent gestures on the same row work (a
 * set-once guard would permanently disable the toggle after one use).
 *
 * Delete removes the row entirely (parent mutates data). Toggle leaves the
 * row mounted, so we close it explicitly after firing for a Mail-like feel.
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
  const swipeableRef = useRef<Swipeable>(null);
  // Guard state: which action fired during the CURRENT gesture. Null once
  // the Swipeable settles (close) so the next gesture can fire again.
  const pendingActionRef = useRef<'dismiss' | 'toggle' | null>(null);

  const fire = (action: 'dismiss' | 'toggle') => {
    if (pendingActionRef.current) return; // button press + full-swipe both fire
    pendingActionRef.current = action;
    if (action === 'dismiss') onDismiss();
    else {
      onToggleRead();
      // Row stays mounted after a toggle — close the revealed action so the
      // content is fully visible again.
      swipeableRef.current?.close();
    }
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
          onPress={() => fire('dismiss')}
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
          onPress={() => fire('toggle')}
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
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        renderLeftActions={renderLeftActions}
        rightThreshold={40}
        leftThreshold={40}
        overshootRight={false}
        overshootLeft={false}
        friction={2}
        onSwipeableOpen={(direction) => {
          // Full swipe past the threshold triggers the action directly.
          fire(direction === 'right' ? 'dismiss' : 'toggle');
        }}
        onSwipeableClose={() => {
          // Gesture settled — re-arm the per-gesture dedupe guard.
          pendingActionRef.current = null;
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
