import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { setToastListener, showToast } from '../../utils/ui/toast';

const TOAST_DURATION_MS = 2600;
/** Actionable toasts linger longer so the action is actually tappable. */
const ACTION_TOAST_DURATION_MS = 6000;

interface ActiveToast {
  message: string;
  action?: { label: string; onPress: () => void };
}

interface QueuedToast extends ActiveToast {
  id: number;
}

/**
 * Renders transient toasts emitted by utils/ui/toast.ts. Mount once in App.
 *
 * Toasts are QUEUED, not replaced: rapid-fire `showToast` calls (e.g. two
 * quick swipe-deletes, each offering Undo) each get their full display
 * window. The previous single-slot behavior let a later toast silently
 * cancel an earlier Undo offer, leaving the first notification deleted with
 * no restore path.
 *
 * Model: `queue` is the single source of truth and the displayed toast is
 * simply the head of the queue. Auto-dismiss (and manual dismissal) drop the
 * head, which promotes the next toast — no separate "current" state, no
 * setState-in-effect cascades.
 */
export default function ToastHost() {
  const { colors, fontSize, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<QueuedToast[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    setToastListener((payload) => {
      if (!payload) {
        // Explicit clear (none of our call sites use it, but the emitter
        // supports it): drop everything.
        setQueue([]);
        return;
      }
      setQueue((q) => [...q, { ...payload, id: nextId.current++ }]);
    });
    return () => setToastListener(null);
  }, []);

  const current = queue[0] ?? null;

  // Auto-dismiss the displayed toast after its duration. Re-arms per toast —
  // appending to the queue keeps the head's identity stable, so the timer
  // isn't reset by incoming toasts.
  useEffect(() => {
    if (current === null) return;
    const headId = current.id;
    const timer = setTimeout(() => {
      // Only drop the head if it's still the toast this timer was armed for.
      setQueue((q) => (q.length > 0 && q[0].id === headId ? q.slice(1) : q));
    }, current.action ? ACTION_TOAST_DURATION_MS : TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  const handleAction = () => {
    // Drop the head; the next queued toast (if any) becomes visible.
    setQueue((q) => q.slice(1));
    current.action?.onPress();
  };

  return (
    <View
      key={current.id}
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
          {current.message}
        </Text>
        {current.action && (
          <TouchableOpacity
            onPress={handleAction}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={current.action.label}
            style={styles.actionBtn}
          >
            <Text
              style={{
                color: colors.primary,
                fontSize: fontSize.sm,
                fontWeight: '800',
              }}
            >
              {current.action.label}
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

// Re-exported so existing importers of showToast keep working if they happen
// to import from here; the source of truth remains utils/ui/toast.
export { showToast };
