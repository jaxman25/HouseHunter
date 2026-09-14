import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { LanguageCode, LanguageInfo, LANGUAGES } from '../types';
import { getSavedLanguage, saveLanguage, getLanguageInfo, getAllLanguages, isRTL as _isRTL } from '../services/languageService';

/**
 * Defensive guard — if the Metro web bundler produces a stale module where the
 * named export is undefined, fall back to a safe inline implementation so the
 * app doesn't crash at runtime.
 */
const isRTL: (code: LanguageCode) => boolean =
  typeof _isRTL === 'function' ? _isRTL : (code) => LANGUAGES[code]?.direction === 'rtl';

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => Promise<void>;
  languageInfo: LanguageInfo;
  isRTL: boolean;
  languages: { code: LanguageCode; info: LanguageInfo }[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [languageInfo, setLanguageInfo] = useState<LanguageInfo>(LANGUAGES.en);
  const [isRTLMode, setIsRTLMode] = useState(false);
  const [languages] = useState(() => getAllLanguages());

  // Load saved language on mount
  useEffect(() => {
    getSavedLanguage().then((saved) => {
      setLanguageState(saved);
      setLanguageInfo(getLanguageInfo(saved));
      setIsRTLMode(typeof isRTL === 'function' ? isRTL(saved) : false);
    });
  }, []);

  const setLanguage = useCallback(async (code: LanguageCode) => {
    setLanguageState(code);
    setLanguageInfo(getLanguageInfo(code));
    setIsRTLMode(typeof isRTL === 'function' ? isRTL(code) : false);
    await saveLanguage(code);
  }, []);

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        languageInfo,
        isRTL: isRTLMode,
        languages,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
