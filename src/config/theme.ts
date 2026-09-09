import { ThemeColors, ThemeMode } from '../types';

// Kenya-inspired: green primary (Kenya flag), black accents, red accents
export const LIGHT_COLORS: ThemeColors = {
  primary: '#00843D',
  primaryLight: '#E6F5ED',
  primaryDark: '#005C2B',
  // Secondary: warm red (Kenya flag accent)
  secondary: '#BB133E',
  accent: '#F2A900', // Gold accent (Kenya flag sun)
  background: '#F6F8FA',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1A1D26',
  // Secondary and light text are kept ≥ 4.5:1 against the lightest app
  // backgrounds (white, #F8F9FB, #F9FAFB input fills).
  textSecondary: '#5F6670',
  textLight: '#6B7280',
  border: '#E5E7EB',
  // Semantic hues are darkened (error/success/warning/info) so white text on
  // them (Badge chips, danger buttons) and their use as text pass WCAG AA.
  error: '#B91C1C',
  success: '#047857',
  warning: '#B45309',
  info: '#1D4ED8',
  white: '#FFFFFF',
  black: '#000000',
  gray100: '#F9FAFB',
  gray200: '#F3F4F6',
  gray300: '#E5E7EB',
  // gray400/gray500 are used for icons and small foreground graphics, so they
  // are dark enough for 3:1 (WCAG AA graphics) — and 4.5:1 where used as text.
  gray400: '#8A8F99',
  gray500: '#717680',
  gray600: '#5F6670',
  gray700: '#374151',
  gray800: '#1F2937',
  shadow: '#000000',
};

// Dark mode: surfaces are darkened, text is lightened, but brand colors are
// preserved so the Kenya-green primary still reads clearly. Contrast is kept
// ≥ 4.5:1 for body text and ≥ 3:1 for large text/UI components.
export const DARK_COLORS: ThemeColors = {
  primary: '#22C55E',
  primaryLight: '#022C11',
  primaryDark: '#16A34A',
  secondary: '#F87171',
  accent: '#FBBF24',
  background: '#111827',
  surface: '#1F2937',
  card: '#1F2937',
  text: '#F9FAFB',
  textSecondary: '#9CA3AF',
  textLight: '#D1D5DB',
  border: '#374151',
  error: '#F87171',
  success: '#34D399',
  warning: '#FBBF24',
  info: '#60A5FA',
  white: '#FFFFFF',
  black: '#000000',
  gray100: '#1F2937',
  gray200: '#374151',
  gray300: '#4B5563',
  gray400: '#6B7280',
  gray500: '#9CA3AF',
  gray600: '#D1D5DB',
  gray700: '#E5E7EB',
  gray800: '#F3F4F6',
  shadow: '#000000',
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

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 16,
  round: 999,
};

export const FONT_SIZE = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  title: 34,
};

export const SHADOW = {
  sm: {
    boxShadow: '0px 1px 3px rgba(0,0,0,0.06)',
  },
  md: {
    boxShadow: '0px 2px 8px rgba(0,0,0,0.08)',
  },
  lg: {
    boxShadow: '0px 4px 20px rgba(0,0,0,0.10)',
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
