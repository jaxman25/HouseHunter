import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect, useCallback } from 'react';
import { Platform, useWindowDimensions, Appearance } from 'react-native';
import { LIGHT_COLORS, DARK_COLORS, SPACING, RADIUS, FONT_SIZE, SHADOW, getColorsForMode } from '../config/theme';
import { ThemeColors, ThemeMode } from '../types';
import { getSavedTheme, saveTheme, getSystemTheme } from '../services/themeService';

interface ThemeContextType {
  colors: ThemeColors;
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  fontSize: typeof FONT_SIZE;
  shadow: typeof SHADOW;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: LIGHT_COLORS,
  spacing: SPACING,
  radius: RADIUS,
  fontSize: FONT_SIZE,
  shadow: SHADOW,
  themeMode: 'light',
  setThemeMode: async () => {},
  isDark: false,
});

/** Scale factor for desktop web typography (see spec: fonts ~1.1x on desktop). */
const WEB_DESKTOP_FONT_SCALE = 1.1;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [isDark, setIsDark] = useState(false);

  // Load saved theme preference on mount
  useEffect(() => {
    getSavedTheme().then((saved) => {
      setThemeModeState(saved);
      updateIsDark(saved);
    });
  }, []);

  const updateIsDark = useCallback((mode: ThemeMode) => {
    if (mode === 'dark') {
      setIsDark(true);
    } else if (mode === 'light') {
      setIsDark(false);
    } else {
      // System mode - check actual system appearance
      setIsDark(Appearance.colorScheme === 'dark');
    }
  }, []);

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (themeMode !== 'system') return;

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setIsDark(colorScheme === 'dark');
    });

    return () => subscription.remove();
  }, [themeMode]);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await saveTheme(mode);
    updateIsDark(mode);
  }, [updateIsDark]);

  // Compute colors based on theme mode
  const colors = useMemo<ThemeColors>(() => {
    if (themeMode === 'dark') {
      return DARK_COLORS;
    }
    if (themeMode === 'light') {
      return LIGHT_COLORS;
    }
    // System mode
    return Appearance.colorScheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  }, [themeMode]);

  // Slightly larger type on desktop web so text reads well in the centered
  // 480px frame on big monitors. Native and mobile-web keep the base scale.
  const isWebDesktop = Platform.OS === 'web' && width >= 1024;

  const fontSize = useMemo<typeof FONT_SIZE>(() => {
    if (!isWebDesktop) return FONT_SIZE;
    const scaled = {} as typeof FONT_SIZE;
    (Object.keys(FONT_SIZE) as (keyof typeof FONT_SIZE)[]).forEach((key) => {
      scaled[key] = Math.round(FONT_SIZE[key] * WEB_DESKTOP_FONT_SCALE);
    });
    return scaled;
  }, [isWebDesktop]);

  return (
    <ThemeContext.Provider
      value={{
        colors,
        spacing: SPACING,
        radius: RADIUS,
        fontSize,
        shadow: SHADOW,
        themeMode,
        setThemeMode,
        isDark,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
