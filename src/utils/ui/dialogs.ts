import { Alert, Platform } from 'react-native';

/**
 * Cross-platform dialogs.
 *
 * react-native-web does NOT implement `Alert` (Alert.alert is a no-op), so
 * any flow that depends on an alert — especially destructive confirmations
 * like Delete Account — silently does nothing on the web build. These helpers
 * route to the native `Alert` on iOS/Android and to the browser's
 * `window.confirm`/`window.alert` on web.
 */

/** Informational alert. On web this maps to window.alert. */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/**
 * Confirmation dialog with Cancel/OK. `onConfirm` runs only when the user
 * confirms. On web this maps to the synchronous `window.confirm` (the
 * browser blocks while it is open, which matches native behavior closely
 * enough for destructive actions).
 */
export function confirmDialog(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel = 'OK'
): void {
  if (Platform.OS === 'web') {
    const confirmed = window.confirm(`${title}\n\n${message}`);
    if (confirmed) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}