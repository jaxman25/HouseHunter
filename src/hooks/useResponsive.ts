/**
 * Responsive layout hook.
 *
 * All layout that must react to screen size / rotation / web resizes flows
 * through this hook (backed by `useWindowDimensions`, which updates on
 * rotation and browser resizes — unlike a module-level `Dimensions.get`).
 *
 * Breakpoints (by width, matching RN-web viewport behavior):
 *   phone   <  600
 *   tablet  >= 600 && < 1024
 *   desktop >= 1024
 */

import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

/** Side padding list screens use (theme spacing.lg). */
export const SCREEN_PADDING = 16;
/** Gap between grid columns (theme spacing.md). */
export const GRID_GAP = 12;

export interface ResponsiveLayout {
  /** Current window width/height (reacts to rotation and resizes). */
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isLandscape: boolean;
  isPortrait: boolean;
  /**
   * Number of property-card columns for the current width, capped at
   * `maxColumns` (default 4) and never below 1. Cards keep a ~150pt minimum
   * width so they never get cramped on very small screens.
   */
  gridColumns: (maxColumns?: number) => number;
  /**
   * Width of one grid cell for `gridColumns()` columns, computed against the
   * standard screen padding / gap so rows tile exactly edge to edge.
   */
  gridCellWidth: (columns?: number) => number;
  /**
   * Suggested max width for page content on large screens (readability cap).
   * Phones/tablets get the natural width so nothing changes there.
   */
  pageMaxWidth: number;
}

const MIN_CARD_WIDTH = 150;

export function useResponsive(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();

  const isDesktop = width >= 1024;
  const isTablet = width >= 600 && width < 1024;
  const isPhone = width < 600;
  const isLandscape = width > height;

  const gridColumns = (maxColumns = 4): number => {
    const available = width - SCREEN_PADDING * 2 + GRID_GAP;
    const byWidth = Math.floor(available / (MIN_CARD_WIDTH + GRID_GAP));
    return Math.min(Math.max(byWidth, 1), maxColumns);
  };

  const gridCellWidth = (columns?: number): number => {
    const cols = columns ?? gridColumns();
    return Math.floor(
      (width - SCREEN_PADDING * 2 - GRID_GAP * (cols - 1)) / cols
    );
  };

  return {
    width,
    height,
    breakpoint: isDesktop ? 'desktop' : isTablet ? 'tablet' : 'phone',
    isPhone,
    isTablet,
    isDesktop,
    isLandscape,
    isPortrait: !isLandscape,
    gridColumns,
    gridCellWidth,
    pageMaxWidth: isDesktop ? 1240 : isTablet ? width : width,
  };
}

/**
 * Style helper: spread onto a screen root to cap + center content on large
 * screens (no-op on phones, where the natural width already fits).
 */
export function pageContainerStyle(
  layout: Pick<ResponsiveLayout, 'pageMaxWidth'>,
  backgroundColor?: string
) {
  return {
    width: '100%' as const,
    maxWidth: layout.pageMaxWidth,
    alignSelf: 'center' as const,
    backgroundColor,
  };
}
