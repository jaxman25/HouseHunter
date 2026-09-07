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
 *
 * Web is special-cased: the app renders inside a centered 480px "phone
 * frame" (src/components/common/WebFrame.tsx), so `contentWidth` — the width
 * layouts and grids actually have to work with — is capped at 480 on web.
 * Breakpoint detection still uses the real viewport width (a 1440px browser
 * window is still "desktop"), but every computed size uses `contentWidth`.
 */

import { Platform, useWindowDimensions } from 'react-native';

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

/** Width of the web phone-frame column (see WebFrame.tsx). */
export const WEB_MAX_WIDTH = 480;

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
   * Width available to layouts: the real window width on native, capped at
   * `WEB_MAX_WIDTH` on web (the centered phone frame). Use this instead of
   * `width` when computing grid cells, card widths, or container sizes.
   */
  contentWidth: number;
  /**
   * Number of property-card columns for the current breakpoint — 1 on
   * phones, 2 on tablets and desktops — capped at `maxColumns` (default 2).
   */
  gridColumns: (maxColumns?: number) => number;
  /**
   * Width of one grid cell for `gridColumns()` columns, computed against
   * `contentWidth` and the standard padding/gap so rows tile edge to edge
   * inside the centered frame.
   */
  gridCellWidth: (columns?: number) => number;
  /**
   * Suggested max width for page content on large screens. 480 on web (the
   * frame already caps it) so per-screen containers don't fight the frame;
   * native tablets/desktops keep their natural width.
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

  const contentWidth = Platform.OS === 'web' ? Math.min(width, WEB_MAX_WIDTH) : width;

  const gridColumns = (maxColumns = 2): number => {
    // Breakpoint grid: 1 column on phones, 2 on tablet/desktop.
    const byBreakpoint = isPhone ? 1 : 2;
    const available = contentWidth - SCREEN_PADDING * 2 + GRID_GAP;
    const byWidth = Math.floor(available / (MIN_CARD_WIDTH + GRID_GAP));
    return Math.min(Math.max(Math.min(byBreakpoint, byWidth), 1), maxColumns);
  };

  const gridCellWidth = (columns?: number): number => {
    const cols = columns ?? gridColumns();
    return Math.floor(
      (contentWidth - SCREEN_PADDING * 2 - GRID_GAP * (cols - 1)) / cols
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
    contentWidth,
    gridColumns,
    gridCellWidth,
    pageMaxWidth:
      Platform.OS === 'web' ? WEB_MAX_WIDTH : isDesktop ? 1240 : width,
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