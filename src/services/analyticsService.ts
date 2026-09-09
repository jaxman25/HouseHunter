import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { UserAnalytics, PlatformAnalytics, Achievement } from '../types';
import {
  PROPERTIES_COLLECTION,
  USERS_COLLECTION,
  REVIEWS_COLLECTION,
  TOURS_COLLECTION,
  ANALYTICS_COLLECTION,
} from '../utils/constants';
import { firestoreCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../utils/network/timeout';

/** Default achievements. */
const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  { id: 'first_listing', title: 'First Listing', description: 'Created your first property listing', icon: 'home-plus' },
  { id: 'five_listings', title: 'Power Seller', description: 'Created 5 property listings', icon: 'home-group' },
  { id: 'first_sale', title: 'First Sale', description: 'Marked your first property as sold', icon: 'check-decagram' },
  { id: 'reviewer', title: 'Review Star', description: 'Left your first review', icon: 'star' },
  { id: 'responder', title: 'Quick Responder', description: 'Average response time under 1 hour', icon: 'clock-fast' },
  { id: 'tour_guide', title: 'Tour Guide', description: 'Conducted 10+ property tours', icon: 'calendar-check' },
  { id: 'popular', title: 'Popular Seller', description: 'Received 10+ inquiries', icon: 'account-group' },
];

/** Get user analytics (seller metrics, activity, achievements). */
export async function getUserAnalytics(userId: string): Promise<UserAnalytics> {
  const userDoc = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDoc(doc(db, USERS_COLLECTION, userId)), DEFAULT_TIMEOUT_MS))
  );

  // Listings
  const listings = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(query(collection(db, PROPERTIES_COLLECTION), where('userId', '==', userId))),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  // Reviews
  const reviews = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(query(collection(db, REVIEWS_COLLECTION), where('buyerId', '==', userId))),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  // Tours (as buyer)
  const buyerTours = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(query(collection(db, TOURS_COLLECTION), where('buyerId', '==', userId))),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  const totalListings = listings.size;
  const totalViews = listings.docs.reduce((sum, d) => sum + (d.data().views || 0), 0);
  const totalInquiries = listings.docs.reduce((sum, d) => sum + (d.data().inquiries || 0), 0);
  const conversionRate = totalViews > 0 ? Math.round((totalInquiries / totalViews) * 100) : 0;

  // Daily activity (last 30 days)
  const dailyActivity = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return { date: date.toISOString().slice(0, 10), count: 0 };
  });

  // Weekly activity (last 12 weeks)
  const weeklyActivity = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i * 7);
    return { week: date.toISOString().slice(0, 10), count: 0 };
  });

  // Check achievements
  const achievements = DEFAULT_ACHIEVEMENTS.map((a) => {
    let unlocked = false;
    switch (a.id) {
      case 'first_listing':
        unlocked = totalListings >= 1;
        break;
      case 'five_listings':
        unlocked = totalListings >= 5;
        break;
      case 'first_sale':
        unlocked = listings.docs.some((d) => d.data().status === 'sold');
        break;
      case 'reviewer':
        unlocked = reviews.size >= 1;
        break;
      case 'popular':
        unlocked = totalInquiries >= 10;
        break;
      case 'tour_guide':
        unlocked = buyerTours.size >= 10;
        break;
    }
    return { ...a, unlockedAt: unlocked ? new Date().toISOString() : undefined };
  });

  return {
    userId,
    totalListings,
    totalFavorites: userDoc.exists() ? (userDoc.data().favorites?.length || 0) : 0,
    totalMessages: 0,
    totalTours: buyerTours.size,
    totalReviews: reviews.size,
    totalViews,
    totalInquiries,
    conversionRate,
    averageResponseTime: undefined,
    dailyActivity,
    weeklyActivity,
    achievements,
  };
}

/** Get platform analytics (admin). */
export async function getPlatformAnalytics(date?: string): Promise<PlatformAnalytics> {
  const targetDate = date || new Date().toISOString().slice(0, 10);

  const analyticsDoc = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(getDoc(doc(db, ANALYTICS_COLLECTION, targetDate)), DEFAULT_TIMEOUT_MS)
    )
  );

  if (analyticsDoc.exists()) {
    const data = analyticsDoc.data();
    return {
      date: targetDate,
      dau: data.dau || 0,
      mau: data.mau || 0,
      newUsers: data.newUsers || 0,
      newListings: data.newListings || 0,
      newMessages: data.newMessages || 0,
      mostSearchedCities: data.mostSearchedCities || [],
      conversionFunnel: data.conversionFunnel || { views: 0, favorites: 0, inquiries: 0, tours: 0 },
    };
  }

  return {
    date: targetDate,
    dau: 0,
    mau: 0,
    newUsers: 0,
    newListings: 0,
    newMessages: 0,
    mostSearchedCities: [],
    conversionFunnel: { views: 0, favorites: 0, inquiries: 0, tours: 0 },
  };
}
