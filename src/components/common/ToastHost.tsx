import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { setToastListener } from '../../utils/ui/toast';

const TOAST_DURATION_MS = 2600;
/** Actionable toasts linger longer so the action is actually tappable. */
const ACTION_TOAST_DURATION_MS = 6000;

interface ActiveToast {
  message: string;
  action?: { label: string; onPress: () => void };
}

/** Renders transient toasts emitted by utils/ui/toast.ts. Mount once in App. */
export default function ToastHost() {
  const { colors, fontSize, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setToastListener((payload) => {
      if (!payload) {
        setToast(null);
        return;
      }
      setToast(payload);
      if (timer.current) clearTimeout(timer.current);
      const duration = payload.action
        ? ACTION_TOAST_DURATION_MS
        : TOAST_DURATION_MS;
      timer.current = setTimeout(() => setToast(null), duration);
    });
    return () => {
      setToastListener(null);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!toast) return null;

  const handleAction = () => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
    toast.action?.onPress();
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { top: insets.top + 56 }]}
    >
      <View
        style={[
          styles.pill,
          { backgroundColor: colors.text, borderRadius: radius.round },
        ]}
      >
        <Text style={[styles.text, { color: colors.background, fontSize: fontSize.sm }]}>
          {toast.message}
        </Text>
        {toast.action && (
          <TouchableOpacity
            onPress={handleAction}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            style={styles.actionBtn}
          >
            <Text
              style={{
                color: colors.primary,
                fontSize: fontSize.sm,
                fontWeight: '800',
              }}
            >
              {toast.action.label}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  actionBtn: {},
});
