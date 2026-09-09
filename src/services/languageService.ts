/**
 * Language service — language preference management and translations.
 *
 * Default language is English. Language preferences are persisted in AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LanguageCode, LANGUAGES } from '../types';

const STORAGE_KEY = '@househunter/language';

/** Default language */
const DEFAULT_LANGUAGE: LanguageCode = 'en';

/**
 * Get the saved language preference.
 */
export async function getSavedLanguage(): Promise<LanguageCode> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && saved in LANGUAGES) {
      return saved as LanguageCode;
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Save language preference.
 */
export async function saveLanguage(code: LanguageCode): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, code);
}

/**
 * Get language info by code.
 */
export function getLanguageInfo(code: LanguageCode) {
  return LANGUAGES[code];
}

/**
 * Get all available languages.
 */
export function getAllLanguages(): { code: LanguageCode; info: LanguageInfo }[] {
  return (Object.keys(LANGUAGES) as LanguageCode[]).map((code) => ({
    code,
    info: LANGUAGES[code],
  }));
}

/**
 * Check if a language is RTL (right-to-left).
 */
export function isRTL(code: LanguageCode): boolean {
  return LANGUAGES[code]?.direction === 'rtl';
}
