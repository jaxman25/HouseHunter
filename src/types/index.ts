// ─── User Types ───────────────────────────────────────────
export interface User {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  photoURL: string;
  bio: string;
  role: 'buyer' | 'seller' | 'agent';
  favorites: string[];
  /** ISO timestamp of when the user accepted the Terms of Service. */
  termsAcceptedAt?: string;
  /** Version of the Terms the user agreed to (see TERMS_VERSION). */
  termsAcceptedVersion?: string;
  /** True when the account's email is verified (server-enforced for inquiries). */
  emailVerified?: boolean;
  /** Moderation: set by admins via the admin suite (see firestore.rules). */
  suspended?: boolean;
  suspensionReason?: string;
  suspensionExpiry?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  photoURL: string;
  bio: string;
  role: 'buyer' | 'seller' | 'agent';
}

// ─── Property Types ───────────────────────────────────────
export type PropertyType = 'house' | 'apartment' | 'condo' | 'townhouse' | 'bedsitter' | 'maisonette' | 'land' | 'commercial';
export type ListingType = 'sale' | 'rent';
export type PropertyStatus = 'active' | 'pending' | 'sold' | 'rented' | 'inactive';

export interface Property {
  id: string;
  title: string;
  description: string;
  price: number;
  listingType: ListingType;
  propertyType: PropertyType;
  status: PropertyStatus;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: number;
  longitude: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  areaUnit: 'sqft' | 'sqm';
  yearBuilt: number;
  images: string[];
  features: string[];
  amenities: string[];
  userId: string;
  userName: string;
  userPhoto: string;
  userPhone: string;
  views: number;
  inquiries: number;
  /** Optimistic-lock counter — bumped on every owner edit (see firestore.rules). */
  version?: number;
  /** ISO timestamp set when the listing moved to Pending (offer accepted). */
  soldDate?: string;
  /** ISO timestamp set when the listing moved to Sold/Rented. */
  pendingDate?: string;
  /** Seller opt-in for email inquiries (defaults to true). */
  contactEnabled?: boolean;
  /** Hidden from default browse once archived (archived listings are also set to inactive). */
  archived?: boolean;
  archivedAt?: string;
  archiveReason?: 'sold' | 'pending' | 'manual' | 'inactive';
  /** ISO date after which the auto-archive job may hide this listing. */
  expirationDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyFilter {
  listingType?: ListingType;
  propertyType?: PropertyType[];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  minArea?: number;
  maxArea?: number;
  city?: string;
  state?: string;
  features?: string[];
  status?: PropertyStatus;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'oldest' | 'popular';
}

// ─── Chat Types ───────────────────────────────────────────
export interface Conversation {
  id: string;
  participants: string[];
  participantNames: { [uid: string]: string };
  participantPhotos: { [uid: string]: string };
  lastMessage: string;
  lastMessageTime: string;
  lastMessageSenderId: string;
  unreadCount: { [uid: string]: number };
  propertyId: string;
  propertyTitle: string;
  propertyImage: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  image?: string;
  read: boolean;
  createdAt: string;
}

// ─── Notification Types ──────────────────────────────────
export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'message' | 'inquiry' | 'price_drop' | 'new_listing' | 'favorite' | 'system';
  data: Record<string, string>;
  read: boolean;
  createdAt: string;
}

// ─── Recently Viewed Types ────────────────────────────────
/**
 * Lightweight snapshot of a property stored locally (AsyncStorage) when its
 * detail page is visited, so "Recently Viewed" renders instantly without a
 * Firestore fetch. Kept intentionally small; the extra fields beyond the
 * core set (listingType, state, bedrooms, …) exist so PropertyCard can
 * render from the snapshot alone.
 */
export interface RecentlyViewedItem {
  propertyId: string;
  title: string;
  price: number;
  listingType: ListingType;
  propertyType: PropertyType;
  /** Last-known availability status (snapshotted at view time). */
  status: PropertyStatus;
  images: string[];
  city: string;
  state: string;
  bedrooms: number;
  bathrooms: number;
  area: number;
  areaUnit: 'sqft' | 'sqm';
  /** ISO timestamp of when the property was last viewed. */
  viewedAt: string;
}

// ─── Saved Searches ───────────────────────────────────────
export type NotificationFrequency = 'instant' | 'daily' | 'weekly';

/** Filter criteria persisted with a saved search (subset of PropertyFilter). */
export interface SavedSearchFilters {
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  propertyTypes?: PropertyType[];
  city?: string;
  state?: string;
  features?: string[];
  listingType?: ListingType;
  minArea?: number;
  maxArea?: number;
  sortBy?: PropertyFilter['sortBy'];
}

/** A saved search stored under users/{uid}/savedSearches/{id}. */
export interface SavedSearch {
  id: string;
  name: string;
  filters: SavedSearchFilters;
  notificationFrequency: NotificationFrequency;
  /** Paused searches keep matching disabled. */
  isActive: boolean;
  /** Total matches found the last time the search ran. */
  matchCount: number;
  /** Matches found since the user last ran/cleared the search. */
  newMatchCount: number;
  /** ISO timestamps. */
  lastRunAt?: string;
  lastNotifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Reporting & Moderation ────────────────────────────────
export type ReportReason = 'inappropriate' | 'scam' | 'duplicate' | 'other';
export type ReportStatus = 'pending' | 'dismissed' | 'resolved';

/** A user-submitted report stored under admin/reports/{id}. */
export interface Report {
  id: string;
  propertyId: string;
  reporterId: string;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;
  /** ISO timestamps. */
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

/** An operator-authored announcement under admin/announcements/{id}. */
export interface Announcement {
  id: string;
  title?: string;
  body: string;
  active: boolean;
  /** Bump to force re-display for users who dismissed the previous version. */
  version: number;
  createdAt: string;
}

// ─── Navigation Types ─────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Terms: undefined;
  PrivacyPolicy: undefined;
  Onboarding: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  /** Optional saved-search filters applied when the tab is navigated to. */
  ExploreTab: { savedFilter?: SavedSearchFilters } | undefined;
  MapTab: undefined;
  FavoritesTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  PropertyDetail: { propertyId: string };
  AddProperty: undefined;
  EditProperty: { property: Property };
  MyListings: undefined;
  Search: undefined;
  Chat: { conversationId: string; recipientId: string; recipientName: string };
  Conversations: undefined;
  RecentlyViewed: undefined;
  AdminLogin: undefined;
  AdminDashboard: undefined;
  AdminUsers: undefined;
  AdminReports: undefined;
  AdminSettings: undefined;
  AdminAnalytics: undefined;
  Settings: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
  DeleteAccount: undefined;
  SavedSearches: undefined;
  Terms: undefined;
  PrivacyPolicy: undefined;
  // ─── Feature Screens ──────────────────────────────────
  Reviews: { propertyId: string };
  WriteReview: { propertyId: string; sellerId: string };
  SellerReviews: { sellerId: string };
  ReviewModeration: undefined;
  Tours: undefined;
  TourDetails: { tourId: string };
  TourSettings: undefined;
  Neighborhood: { propertyId: string; city: string; state: string; zipCode: string };
  UserAnalytics: undefined;
  PlatformAnalytics: undefined;
  DataExport: undefined;
  CurrencySettings: undefined;
  LanguageSettings: undefined;
  ThemeSettings: undefined;
};

// ─── Theme Types ──────────────────────────────────────────
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  textLight: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  white: string;
  black: string;
  gray100: string;
  gray200: string;
  gray300: string;
  gray400: string;
  gray500: string;
  gray600: string;
  gray700: string;
  gray800: string;
  shadow: string;
}

// ─── Language Types ──────────────────────────────────────

export type LanguageCode = 'en' | 'sw' | 'fr' | 'de' | 'es' | 'ar';

export interface LanguageInfo {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
  direction: 'ltr' | 'rtl';
}

export const LANGUAGES: Record<LanguageCode, LanguageInfo> = {
  en: { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', direction: 'ltr' },
  sw: { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', flag: '🇰🇪', direction: 'ltr' },
  fr: { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', direction: 'ltr' },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', direction: 'ltr' },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', direction: 'ltr' },
  ar: { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', direction: 'rtl' },
};

// ─── Review Types ───────────────────────────────────────
export interface Review {
  id: string;
  propertyId: string;
  sellerId: string;
  buyerId: string;
  rating: number; // 1-5
  title: string;
  content: string;
  pros: string[];
  cons: string[];
  isVerifiedPurchase: boolean;
  sellerResponse?: {
    content: string;
    respondedAt: string;
  };
  isFlagged: boolean;
  isRemoved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRatingBreakdown {
  averageRating: number;
  totalReviews: number;
  breakdown: { [rating: number]: number };
}

// ─── Tour Types ───────────────────────────────────────────
export type TourStatus = 'pending' | 'confirmed' | 'completed' | 'canceled' | 'no_show' | 'rescheduled';

export interface TourAvailability {
  id?: string;
  sellerId: string;
  daysOfWeek: number[]; // 0=Sun, 6=Sat
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  maxToursPerDay: number;
  bufferMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface Tour {
  id: string;
  propertyId: string;
  propertyTitle: string;
  propertyImage: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  status: TourStatus;
  datetime: string; // ISO
  duration: number; // minutes
  attendees: number;
  notes: string;
  reminderSent: boolean;
  confirmedAt?: string;
  canceledBy?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Neighborhood Types ────────────────────────────────────
export interface NeighborhoodData {
  id: string; // city_state_zip key
  walkScore: number;
  transitScore: number;
  bikeScore: number;
  crimeRate: 'Low' | 'Moderate' | 'High';
  schools: {
    elementary: SchoolInfo[];
    middle: SchoolInfo[];
    high: SchoolInfo[];
  };
  amenities: {
    restaurants: number;
    shopping: number;
    parks: number;
    gyms: number;
    transitStops: number;
    hospitals: number;
  };
  propertyTrends: {
    averagePrice: number;
    yearOverYearChange: number;
    yearlyData: { year: number; price: number }[];
  };
  population: number;
  medianIncome: number;
  medianHomeValue: number;
  lastUpdated: string;
}

export interface SchoolInfo {
  name: string;
  rating: number; // 1-10
  distance: number; // miles
  type: 'public' | 'private';
}

// ─── Analytics & Export Types ──────────────────────────────
export type ExportStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'expired';

export interface DataExport {
  id: string;
  userId: string;
  status: ExportStatus;
  fileUrl?: string;
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  error?: string;
}

export interface UserAnalytics {
  userId: string;
  totalListings: number;
  totalFavorites: number;
  totalMessages: number;
  totalTours: number;
  totalReviews: number;
  // Seller-specific
  totalViews?: number;
  totalInquiries?: number;
  conversionRate?: number;
  averageResponseTime?: number; // minutes
  // Activity
  dailyActivity: { date: string; count: number }[];
  weeklyActivity: { week: string; count: number }[];
  // Achievements
  achievements: Achievement[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt?: string;
}

export interface PlatformAnalytics {
  date: string;
  dau: number;
  mau: number;
  newUsers: number;
  newListings: number;
  newMessages: number;
  mostSearchedCities: { city: string; count: number }[];
  conversionFunnel: {
    views: number;
    favorites: number;
    inquiries: number;
    tours: number;
  };
}

export type PropertyFeature =
  | 'parking' | 'garage' | 'pool' | 'gym' | 'garden' | 'balcony'
  | 'laundry' | 'dishwasher' | 'ac' | 'heating' | 'fireplace'
  | 'security' | 'elevator' | 'storage' | 'furnished' | 'pet_friendly'
  | 'smart_home' | 'solar' | 'ev_charging' | 'rooftop'
  | 'concierge' | 'doorman' | 'bbq' | 'playground';
