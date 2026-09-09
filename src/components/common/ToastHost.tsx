import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { setToastListener } from '../../utils/ui/toast';

const TOAST_DURATION_MS = 2600;

/** Renders transient toasts emitted by utils/ui/toast.ts. Mount once in App. */
export default function ToastHost() {
  const { colors, fontSize, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setToastListener((msg) => {
      setMessage(msg);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
    });
    return () => {
      setToastListener(null);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!message) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.host, { top: insets.top + 56 }]}
    >
      <View
        style={[
          styles.pill,
          { backgroundColor: colors.text, borderRadius: radius.round },
        ]}
      >
        <Text style={[styles.text, { color: colors.background, fontSize: fontSize.sm }]}>
          {message}
        </Text>
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
  },
});