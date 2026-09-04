export const APP_NAME = 'House Hunter';

/** Version + effective date of the Terms of Service users agree to. */
export const TERMS_VERSION = '1';
export const TERMS_EFFECTIVE_DATE = 'September 4, 2026';
export const CONTACT_EMAIL = 'support@househunter.com';
export const CONSENT_STORAGE_KEY = '@househunter/cookie_consent';
export const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?name=User&background=1B6EF3&color=fff&size=200';
export const DEFAULT_PROPERTY_IMAGE = 'https://via.placeholder.com/400x300/E5E7EB/9CA3AF?text=No+Image';
export const MAX_IMAGES_PER_PROPERTY = 10;
export const ITEMS_PER_PAGE = 20;
export const CHAT_COLLECTION = 'conversations';
export const MESSAGES_COLLECTION = 'messages';
export const PROPERTIES_COLLECTION = 'properties';
export const USERS_COLLECTION = 'users';
export const NOTIFICATIONS_COLLECTION = 'notifications';

export const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest First' },
  { key: 'oldest', label: 'Oldest First' },
  { key: 'price_asc', label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
  { key: 'popular', label: 'Most Popular' },
] as const;

export const PRICE_RANGES = [
  { label: 'Any', min: 0, max: undefined },
  { label: 'Under $100K', min: 0, max: 100000 },
  { label: '$100K - $250K', min: 100000, max: 250000 },
  { label: '$250K - $500K', min: 250000, max: 500000 },
  { label: '$500K - $750K', min: 500000, max: 750000 },
  { label: '$750K - $1M', min: 750000, max: 1000000 },
  { label: '$1M - $2M', min: 1000000, max: 2000000 },
  { label: '$2M+', min: 2000000, max: undefined },
] as const;

export const RENT_RANGES = [
  { label: 'Any', min: 0, max: undefined },
  { label: 'Under $500/mo', min: 0, max: 500 },
  { label: '$500 - $1,000/mo', min: 500, max: 1000 },
  { label: '$1,000 - $2,000/mo', min: 1000, max: 2000 },
  { label: '$2,000 - $3,000/mo', min: 2000, max: 3000 },
  { label: '$3,000 - $5,000/mo', min: 3000, max: 5000 },
  { label: '$5,000+/mo', min: 5000, max: undefined },
] as const;
