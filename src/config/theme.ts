import { ThemeColors } from '../types';

export const COLORS: ThemeColors = {
  primary: '#1B6EF3',
  primaryLight: '#E8F1FF',
  primaryDark: '#0D4FB5',
  secondary: '#FF6B35',
  accent: '#7C5CFC',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1A1D26',
  textSecondary: '#6B7280',
  textLight: '#9CA3AF',
  border: '#E5E7EB',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',
  white: '#FFFFFF',
  black: '#000000',
  gray100: '#F9FAFB',
  gray200: '#F3F4F6',
  gray300: '#E5E7EB',
  gray400: '#D1D5DB',
  gray500: '#9CA3AF',
  gray600: '#6B7280',
  gray700: '#374151',
  gray800: '#1F2937',
  shadow: '#000000',
};

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
    boxShadow: '0px 1px 2px rgba(0,0,0,0.05)',
  },
  md: {
    boxShadow: '0px 2px 8px rgba(0,0,0,0.08)',
  },
  lg: {
    boxShadow: '0px 4px 16px rgba(0,0,0,0.12)',
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
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
  'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'Austin',
  'San Francisco', 'Seattle', 'Denver', 'Miami', 'Boston',
  'Nashville', 'Portland', 'Las Vegas', 'Atlanta', 'Detroit',
];
