import { ThemeColors, ThemeMode } from '../types';

// Ascend Hunters design system (implementations/DESIGN.md): editorial
// architectural-modernism palette — emerald primary reserved for decisive
// actions and verification, deep-slate headings, hairline borders, white
// card surfaces on a cool-gray canvas.
export const LIGHT_COLORS: ThemeColors = {
  primary: '#15803D',
  primaryLight: '#DCFCE7',
  primaryDark: '#166534',
  // Secondary doubles as the structural/heading slate (DESIGN.md
  // "Secondary / Headings") and the rent-badge fill.
  secondary: '#0F172A',
  // Tertiary / warm amber: premium tags, star ratings, featured banners.
  accent: '#D97706',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#0F172A',
  // Neutral foreground ramp from DESIGN.md. text/textSecondary/textLight
  // stay ordered dark → light and all pass WCAG AA (≥4.5:1) on the lightest
  // backgrounds (white, #F8FAFC canvas, #F1F5F9 input fills).
  textSecondary: '#334155',
  textLight: '#64748B',
  border: '#E2E8F0',
  // Semantic hues stay dark enough for white text on them (Badge chips,
  // danger buttons) and their use as text — all ≥ 4.5:1.
  error: '#BA1A1A',
  success: '#166534',
  warning: '#B45309',
  info: '#1D4ED8',
  white: '#FFFFFF',
  black: '#000000',
  // Slate neutral scale: inset containers, hairline borders, stronger strokes.
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  // gray400/gray500 are used for icons and small foreground graphics, so they
  // are dark enough for 3:1 (WCAG AA graphics) — and 4.5:1 where used as text.
  gray400: '#64748B',
  gray500: '#475569',
  gray600: '#334155',
  gray700: '#1E293B',
  gray800: '#0F172A',
  shadow: '#0F172A',
  // Banner surfaces: light tints paired with dark text of the same hue
  // (DESIGN.md error-container / tertiary-fixed).
  warningSurface: '#FFDCC3',
  warningText: '#6E3900',
  errorSurface: '#FFDAD6',
  errorText: '#93000A',
};

// Dark mode: DESIGN.md only specifies the light system, so this is its
// derived counterpart — deep navy-slate canvas/surfaces (spec `on-surface`
// #0B1C30 family) with the emerald anchor preserved. Fill tokens (primary,
// secondary, error, success, warning, info) back WHITE text in Buttons and
// Badges, so they're tuned into the AA window for that pairing (white-text
// ≥ 4.5:1 AND ≥ 3:1 against the card surface): body text is ≥ 4.5:1 and
// icons/placeholders ≥ 3:1 on every surface.
export const DARK_COLORS: ThemeColors = {
  // Emerald anchor at the white-text-safe luminance (4.5:1 on white button/
  // badge text, 3.1:1 against cards and inset trays).
  primary: '#158840',
  // Deep emerald container tint (spec primary-container direction).
  primaryLight: '#02210E',
  primaryDark: '#166534',
  // Structural slate fill — the dark counterpart of the light `secondary`
  // slate (spec secondary #565e74 lightened into the white-text AA window).
  secondary: '#5A7196',
  // Tertiary/amber stays bright for legibility on dark (star ratings, tags).
  accent: '#FBBF24',
  background: '#0B1C30',
  surface: '#152538',
  card: '#152538',
  text: '#EAF1FF',
  // Neutral foreground ramp mirrors the light ordering (text → textSecondary
  // → textLight, strong → subtle); all ≥ 4.5:1 on cards and inset trays.
  textSecondary: '#A9B7CC',
  textLight: '#8496AF',
  // Hairline borders (spec: 1px structural framing, darkened for the canvas).
  border: '#2B3B52',
  // Semantic fills stay in the white-text AA window; as text they keep ≥ 3:1
  // on cards (banner text uses the brighter warningText/errorText tokens).
  error: '#DC2626',
  success: '#0E8058',
  warning: '#B45309',
  info: '#2563EB',
  white: '#FFFFFF',
  black: '#000000',
  // Slate ramp ascending lightness (gray100 = recessed inset → gray800 =
  // lightest foreground), inverting the light ramp to match dark surfaces.
  gray100: '#1E3149',
  gray200: '#2B3B52',
  gray300: '#3B4E6B',
  gray400: '#64799C',
  gray500: '#7488A3',
  gray600: '#8496AF',
  gray700: '#A9B7CC',
  gray800: '#EAF1FF',
  shadow: '#000000',
  // Dark-mode banner surfaces: deep tinted fills with light hue text.
  warningSurface: '#3A2A08',
  warningText: '#FBBF24',
  errorSurface: '#3B1212',
  errorText: '#FCA5A5',
};

/**
 * Get colors for the current theme mode. Use this when you need colors
 * outside of the ThemeContext (e.g., in services or utils).
 */
export function getColorsForMode(mode: ThemeMode): ThemeColors {
  return mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}

/** Default colors (light mode) for backward compatibility. */
export const COLORS: ThemeColors = LIGHT_COLORS;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// DESIGN.md rounded scale: buttons/inputs ~8-12px, cards/modals 16px,
// pills/badges full.
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  round: 9999,
};

// DESIGN.md type scale: label-sm 11, body-sm 12, body-md 14, body-lg 16,
// price-display 20, headline-md 22, headline-lg-mobile 26, headline-lg 32.
export const FONT_SIZE = {
  xs: 11,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 22,
  xxxl: 26,
  title: 32,
};

// DESIGN.md elevation hierarchy: cards sit on shadow-sm over the canvas,
// floating actions/press states on shadow-md, modals/overlays higher — all
// tinted with the slate shadow color rather than pure black.
export const SHADOW = {
  sm: {
    boxShadow: '0px 1px 2px rgba(15,23,42,0.05)',
  },
  md: {
    boxShadow: '0px 4px 6px -1px rgba(15,23,42,0.08), 0px 2px 4px -2px rgba(15,23,42,0.04)',
  },
  lg: {
    boxShadow: '0px 12px 24px rgba(15,23,42,0.12)',
  },
};

export const PROPERTY_FEATURES: { key: string; label: string; icon: string }[] = [
  { key: 'parking', label: 'Parking', icon: 'car' },
  { key: 'garage', label: 'Garage', icon: 'garage' },
  { key: 'pool', label: 'Swimming Pool', icon: 'pool' },
  { key: 'gym', label: 'Gym', icon: 'dumbbell' },
  { key: 'garden', label: 'Garden', icon: 'flower' },
  { key: 'balcony', label: 'Balcony', icon: 'balcony' },
  { key: 'laundry', label: 'In-unit Laundry', icon: 'washing-machine' },
  { key: 'dishwasher', label: 'Dishwasher', icon: 'silverware-fork-knife' },
  { key: 'ac', label: 'Air Conditioning', icon: 'snowflake' },
  { key: 'heating', label: 'Central Heating', icon: 'fire' },
  { key: 'fireplace', label: 'Fireplace', icon: 'fireplace' },
  { key: 'security', label: 'Security System', icon: 'shield-check' },
  { key: 'elevator', label: 'Elevator', icon: 'elevator' },
  { key: 'storage', label: 'Storage', icon: 'archive' },
  { key: 'furnished', label: 'Furnished', icon: 'sofa' },
  { key: 'pet_friendly', label: 'Pet Friendly', icon: 'dog' },
  { key: 'smart_home', label: 'Smart Home', icon: 'cellphone-link' },
  { key: 'solar', label: 'Solar Panels', icon: 'solar-panel' },
  { key: 'ev_charging', label: 'EV Charging', icon: 'car-electric' },
  { key: 'rooftop', label: 'Rooftop Access', icon: 'home-floor-g' },
];

export const PROPERTY_TYPES = [
  { key: 'house', label: 'House' },
  { key: 'apartment', label: 'Apartment' },
  { key: 'condo', label: 'Condo' },
  { key: 'townhouse', label: 'Townhouse' },
  { key: 'bedsitter', label: 'Bedsitter' },
  { key: 'maisonette', label: 'Maisonette' },
  { key: 'land', label: 'Land' },
  { key: 'commercial', label: 'Commercial' },
];

export const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'price_asc', label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
  { key: 'popular', label: 'Most Popular' },
];

export const CITIES = [
  // Kenya
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret',
  'Thika', 'Malindi', 'Diani', 'Naivasha', 'Nyeri',
  'Machakos', 'Meru', 'Kitale', 'Garissa', 'Lamu',
  // East Africa
  'Dar es Salaam', 'Kampala', 'Arusha',
  // International
  'New York', 'Los Angeles', 'London', 'Dubai',
];
