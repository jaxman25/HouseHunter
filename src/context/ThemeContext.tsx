import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZE, SHADOW } from '../config/theme';
import { ThemeColors } from '../types';

interface ThemeContextType {
  colors: ThemeColors;
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  fontSize: typeof FONT_SIZE;
  shadow: typeof SHADOW;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: COLORS,
  spacing: SPACING,
  radius: RADIUS,
  fontSize: FONT_SIZE,
  shadow: SHADOW,
});

/** Scale factor for desktop web typography (see spec: fonts ~1.1x on desktop). */
const WEB_DESKTOP_FONT_SCALE = 1.1;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();

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
        colors: COLORS,
        spacing: SPACING,
        radius: RADIUS,
        fontSize,
        shadow: SHADOW,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
