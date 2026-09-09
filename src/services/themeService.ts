/**
 * Theme service — theme mode preference management.
 *
 * Supports 'light', 'dark', and 'system' modes. Preferences are persisted
 * in AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeMode } from '../types';

const STORAGE_KEY = '@househunter/theme';

/** Default theme mode */
const DEFAULT_THEME: ThemeMode = 'system';

/**
 * Get the saved theme preference.
 */
export async function getSavedTheme(): Promise<ThemeMode> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && (saved === 'light' || saved === 'dark' || saved === 'system')) {
      return saved as ThemeMode;
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_THEME;
}

/**
 * Save theme preference.
 */
export async function saveTheme(mode: ThemeMode): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, mode);
}

// getSystemTheme is not used directly; ThemeContext uses Appearance directly.
