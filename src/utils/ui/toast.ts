/**
 * Minimal toast emitter.
 *
 * The app has no toast library; `showToast` notifies the single mounted
 * `ToastHost` component (src/components/common/ToastHost.tsx), which renders
 * a transient pill. Used for lightweight feedback like "link copied" on web.
 */
type ToastListener = (message: string | null) => void;

let listener: ToastListener | null = null;

/** Mount-time registration — called once by ToastHost. */
export function setToastListener(fn: ToastListener | null): void {
  listener = fn;
}

/** Show a transient toast. Safe to call before ToastHost mounts (no-op). */
export function showToast(message: string): void {
  listener?.(message);
}