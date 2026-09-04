import React, { createContext, useContext, ReactNode } from 'react';
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider
      value={{
        colors: COLORS,
        spacing: SPACING,
        radius: RADIUS,
        fontSize: FONT_SIZE,
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
