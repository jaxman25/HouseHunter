import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { LanguageCode, LanguageInfo, LANGUAGES } from '../types';
import { getSavedLanguage, saveLanguage, getLanguageInfo, getAllLanguages, isRTL } from '../services/languageService';

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
      setIsRTLMode(isRTL(saved));
    });
  }, []);

  const setLanguage = useCallback(async (code: LanguageCode) => {
    setLanguageState(code);
    setLanguageInfo(getLanguageInfo(code));
    setIsRTLMode(isRTL(code));
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
