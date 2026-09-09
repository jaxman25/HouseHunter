import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { NeighborhoodData } from '../types';
import { NEIGHBORHOOD_COLLECTION } from '../utils/constants';
import { firestoreCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../utils/network/timeout';
import { getCachedOrFetch, buildCacheKey } from '../utils/cache/cacheService';

const NEIGHBORHOOD_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function toISO(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  const t = value as { seconds?: unknown; nanoseconds?: unknown };
  if (typeof t.seconds === 'number' && typeof t.nanoseconds === 'number') {
    return new Date(t.seconds * 1000 + t.nanoseconds / 1_000_000).toISOString();
  }
  return new Date().toISOString();
}

function buildNeighborhoodId(city: string, state: string, zipCode: string): string {
  return `${city.toLowerCase().replace(/\s+/g, '_')}_${state.toLowerCase()}_${zipCode}`;
}

function toNeighborhoodData(docSnap: any): NeighborhoodData {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    walkScore: data.walkScore ?? 0,
    transitScore: data.transitScore ?? 0,
    bikeScore: data.bikeScore ?? 0,
    crimeRate: data.crimeRate ?? 'Low',
    schools: data.schools ?? { elementary: [], middle: [], high: [] },
    amenities: data.amenities ?? { restaurants: 0, shopping: 0, parks: 0, gyms: 0, transitStops: 0, hospitals: 0 },
    propertyTrends: data.propertyTrends ?? { averagePrice: 0, yearOverYearChange: 0, yearlyData: [] },
    population: data.population ?? 0,
    medianIncome: data.medianIncome ?? 0,
    medianHomeValue: data.medianHomeValue ?? 0,
    lastUpdated: toISO(data.lastUpdated),
  };
}

/** Get cached or fresh neighborhood data. */
export async function getNeighborhoodData(
  city: string,
  state: string,
  zipCode: string
): Promise<NeighborhoodData | null> {
  const id = buildNeighborhoodId(city, state, zipCode);

  const fetchFromFirestore = async (): Promise<NeighborhoodData | null> => {
    const docSnap = await firestoreCircuitBreaker.execute(() =>
      withRetry(() => withTimeout(getDoc(doc(db, NEIGHBORHOOD_COLLECTION, id)), DEFAULT_TIMEOUT_MS))
    );
    if (!docSnap.exists()) return null;
    return toNeighborhoodData(docSnap);
  };

  const result = await getCachedOrFetch(
    buildCacheKey('neighborhood', city, state, zipCode),
    fetchFromFirestore,
    NEIGHBORHOOD_CACHE_TTL_MS
  );

  return result.data;
}

/** Save neighborhood data (called by Cloud Function). */
export async function saveNeighborhoodData(
  city: string,
  state: string,
  zipCode: string,
  data: Omit<NeighborhoodData, 'id'>
): Promise<void> {
  const id = buildNeighborhoodId(city, state, zipCode);
  await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        setDoc(doc(db, NEIGHBORHOOD_COLLECTION, id), {
          ...data,
          lastUpdated: serverTimestamp(),
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
}

/** Compute commute time using Google Distance Matrix (client-side wrapper). */
export async function getCommuteTime(
  originLat: number,
  originLng: number,
  destAddress: string,
  mode: 'driving' | 'transit' | 'walking' | 'bicycling' = 'driving'
): Promise<{ duration: string; durationMinutes: number; distance: string } | null> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${encodeURIComponent(destAddress)}&mode=${mode}&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') {
      const element = data.rows[0].elements[0];
      return {
        duration: element.duration.text,
        durationMinutes: Math.round(element.duration.value / 60),
        distance: element.distance.text,
      };
    }
    return null;
  } catch {
    return null;
  }
}
