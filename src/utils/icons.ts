/**
 * Icon utility map — consistent icon names across the app.
 *
 * Uses MaterialCommunityIcons (already installed via @expo/vector-icons).
 * This map provides a single source of truth for icon names so changes
 * only need to happen in one place.
 */

export const ICONS = {
  // Navigation tabs
  home: 'home',
  homeOutline: 'home-outline',
  search: 'magnify',
  map: 'map',
  mapOutline: 'map-outline',
  heart: 'heart',
  heartOutline: 'heart-outline',
  user: 'account',
  userOutline: 'account-outline',
  message: 'message-text',
  messageOutline: 'message-text-outline',

  // Actions
  filter: 'tune-variant',
  sort: 'sort',
  share: 'share-variant',
  edit: 'pencil',
  delete: 'delete',
  close: 'close',
  back: 'arrow-left',
  forward: 'arrow-right',
  chevronRight: 'chevron-right',
  chevronDown: 'chevron-down',
  plus: 'plus',
  check: 'check',
  refresh: 'refresh',

  // Property
  bedroom: 'bed-outline',
  bathroom: 'bathtub-outline',
  area: 'resize',
  price: 'cash',
  calendar: 'calendar',
  clock: 'clock-outline',
  location: 'map-marker-outline',
  camera: 'camera',

  // Property types
  house: 'home',
  apartment: 'office-building',
  condo: 'domain',
  townhouse: 'home-variant',
  land: 'terrain',
  commercial: 'factory',
  bedsitter: 'bed',
  maisonette: 'home-city',

  // Status
  sold: 'check-decagram',
  pending: 'clock-fast',
  active: 'check-circle',
  inactive: 'close-circle',

  // Categories / Quick actions
  nearMe: 'crosshairs-gps',
  trending: 'fire',
  priceDrop: 'tag-arrow-down',
  new: 'star',

  // Settings
  gear: 'cog',
  bell: 'bell',
  email: 'email',
  bookmark: 'bookmark',
  compass: 'compass',
  shield: 'shield',
  key: 'key',
  logout: 'logout',
  globe: 'earth',
  dollarSign: 'cash',

  // Social
  star: 'star',
  starOutline: 'star-outline',
  flag: 'flag',
  report: 'flag-outline',

  // Empty states
  homeSearch: 'home-search',
  heartOutlineLg: 'heart-outline',
  messageOutlineLg: 'message-text-outline',
  calendarBlank: 'calendar-blank',

  // Map
  myLocation: 'crosshairs-gps',
  layers: 'layers',
  searchMap: 'magnify',

  // Misc
  verified: 'check-decagram',
  alertCircle: 'alert-circle',
  infoCircle: 'information',
} as const;

export type IconName = keyof typeof ICONS;

/**
 * Get a MaterialCommunityIcons name from the icon map.
 */
export function getIcon(name: IconName): string {
  return ICONS[name];
}
