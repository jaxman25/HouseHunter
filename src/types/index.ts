import { Timestamp } from 'firebase/firestore';

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
export type PropertyType = 'house' | 'apartment' | 'condo' | 'townhouse' | 'land' | 'commercial';
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
  type: 'message' | 'inquiry' | 'price_drop' | 'new_listing' | 'favorite';
  data: Record<string, string>;
  read: boolean;
  createdAt: string;
}

// ─── Navigation Types ─────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Onboarding: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  ExploreTab: undefined;
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
  Settings: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
};

// ─── Theme Types ──────────────────────────────────────────
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

export type PropertyFeature =
  | 'parking' | 'garage' | 'pool' | 'gym' | 'garden' | 'balcony'
  | 'laundry' | 'dishwasher' | 'ac' | 'heating' | 'fireplace'
  | 'security' | 'elevator' | 'storage' | 'furnished' | 'pet_friendly'
  | 'smart_home' | 'solar' | 'ev_charging' | 'rooftop'
  | 'concierge' | 'doorman' | 'bbq' | 'playground';
