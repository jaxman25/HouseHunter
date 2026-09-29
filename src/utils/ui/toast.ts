/**
 * Minimal toast emitter.
 *
 * The app has no toast library; `showToast` notifies the single mounted
 * `ToastHost` component (src/components/common/ToastHost.tsx), which renders
 * a transient pill. Used for lightweight feedback like "link copied" on web.
 *
 * `showToast(message, action?)` renders an actionable pill (e.g. Undo) with
 * a longer auto-dismiss so there's time to tap it. Backwards compatible —
 * single-argument calls behave exactly as before.
 */

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastPayload {
  message: string;
  action?: ToastAction;
}

type ToastListener = (payload: ToastPayload | null) => void;

let listener: ToastListener | null = null;

/** Mount-time registration — called once by ToastHost. */
export function setToastListener(fn: ToastListener | null): void {
  listener = fn;
}

function emit(message: string, action?: ToastAction): void {
  listener?.({ message, action });
}

/** Show a transient toast. Safe to call before ToastHost mounts (no-op). */
export function showToast(message: string, action?: ToastAction): void {
  emit(message, action);
}
