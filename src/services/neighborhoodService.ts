import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  DocumentSnapshot,
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

// ─── Neighborhood Insights (OpenStreetMap Overpass + Firestore cache) ──────

/** A school (or similar institution) near a property, from OSM tags. */
export interface NearbySchool {
  name: string;
  /** Straight-line miles from the property. */
  distanceMiles: number;
  /** OSM amenity tag: school | kindergarten | college | university. */
  kind: string;
}

/**
 * Lightweight per-location insights. Unlike `NeighborhoodData` above (rich,
 * Cloud-Function-managed), this is fetched client-side from the free,
 * keyless OpenStreetMap Overpass API and cached in Firestore keyed by the
 * lat/lng rounded to 3 decimals (~110m grid) so repeat views skip the API.
 */
export interface NeighborhoodInsights {
  id: string;
  /** Heuristic 0–100 walkability score from nearby-amenity density (an estimate, not the proprietary Walk Score). */
  walkScore: number;
  /** Heuristic 0–100 transit score from nearby stop density. */
  transitScore: number;
  schools: NearbySchool[];
  /** ISO timestamp of when OSM was queried (cache age). */
  fetchedAt: string;
}

const INSIGHTS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const OVERPASS_TIMEOUT_MS = 12_000;

/** Round to 3 decimals and build the cache doc id (~110m grid). */
export function insightsDocId(latitude: number, longitude: number): string {
  const lat = Math.round(latitude * 1000) / 1000;
  const lng = Math.round(longitude * 1000) / 1000;
  return `${lat}_${lng}`;
}

/** Great-circle distance in miles (haversine). */
function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SCHOOL_AMENITIES = new Set(['school', 'kindergarten', 'college', 'university']);
const TRANSIT_TAGS = new Set([
  'bus_stop', 'bus_station', 'ferry_terminal',
  'station', 'tram_stop', 'subway_entrance', 'halt',
]);
const WALKABLE_AMENITIES = new Set([
  'cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'supermarket',
  'bakery', 'pharmacy', 'bank', 'post_office', 'clinic', 'hospital',
  'library', 'marketplace', 'fuel', 'kindergarten', 'school',
]);
const LEISURE_TAGS = new Set(['park', 'playground', 'sports_centre', 'fitness_centre']);

/** Map amenity density to a 0–100 score (piecewise, transparent). */
function densityScore(count: number, thresholds: [number, number][]): number {
  for (const [n, score] of thresholds) {
    if (count <= n) return score;
  }
  return 95;
}

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function fetchOverpassInsights(
  lat: number,
  lng: number
): Promise<Omit<NeighborhoodInsights, 'id' | 'fetchedAt'> | null> {
  const query = `[out:json][timeout:10];(
    node(around:1000,${lat},${lng})["amenity"];
    node(around:1000,${lat},${lng})["railway"~"^(station|tram_stop|halt)$"];
    node(around:1000,${lat},${lng})["railway"="bus_stop"];
    way(around:1000,${lat},${lng})["leisure"~"^(park|playground|sports_centre|fitness_centre)$"];
  );out center 80;`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { elements?: OverpassElement[] };
    const elements = data.elements ?? [];

    let walkableCount = 0;
    let transitCount = 0;
    const schools: NearbySchool[] = [];

    for (const el of elements) {
      const tags = el.tags ?? {};
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      const amenity = tags.amenity;
      const railway = tags.railway;
      const leisure = tags.leisure;

      if (amenity && SCHOOL_AMENITIES.has(amenity)) {
        if (elLat != null && elLng != null) {
          schools.push({
            name: tags.name ?? 'Unnamed school',
            distanceMiles: Math.round(distanceMiles(lat, lng, elLat, elLng) * 10) / 10,
            kind: amenity,
          });
        }
      }
      if ((amenity && TRANSIT_TAGS.has(amenity)) || (railway && TRANSIT_TAGS.has(railway))) {
        transitCount++;
      }
      if ((amenity && WALKABLE_AMENITIES.has(amenity)) || (leisure && LEISURE_TAGS.has(leisure))) {
        walkableCount++;
      }
    }

    schools.sort((a, b) => a.distanceMiles - b.distanceMiles);

    return {
      walkScore: densityScore(walkableCount, [
        [2, 20], [5, 40], [10, 60], [18, 75], [30, 88],
      ]),
      transitScore: densityScore(transitCount, [
        [0, 5], [1, 30], [3, 55], [6, 75], [12, 90],
      ]),
      schools: schools.slice(0, 5),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toInsights(docId: string, data: Record<string, unknown>): NeighborhoodInsights {
  const schools = Array.isArray(data.schools) ? data.schools : [];
  return {
    id: docId,
    walkScore: typeof data.walkScore === 'number' ? data.walkScore : 0,
    transitScore: typeof data.transitScore === 'number' ? data.transitScore : 0,
    schools: schools
      .filter(
        (s: any): s is NearbySchool =>
          s && typeof s.name === 'string' && typeof s.distanceMiles === 'number'
      )
      .slice(0, 5),
    fetchedAt: toISO(data.fetchedAt),
  };
}

/**
 * Get neighborhood insights for a coordinate. Order of preference:
 *   1. Fresh Firestore cache (< 7 days)
 *   2. Live Overpass fetch (then cached, best-effort)
 *   3. Stale cache (better than nothing)
 *   4. null (caller hides the section)
 */
export async function getNeighborhoodInsights(
  latitude: number,
  longitude: number
): Promise<NeighborhoodInsights | null> {
  const docId = insightsDocId(latitude, longitude);
  const docRef = doc(db, NEIGHBORHOOD_COLLECTION, docId);

  // 1. Try the cache first.
  let cached: NeighborhoodInsights | null = null;
  try {
    const snap: DocumentSnapshot = await firestoreCircuitBreaker.execute(() =>
      withRetry(() => withTimeout(getDoc(docRef), DEFAULT_TIMEOUT_MS))
    );
    if (snap.exists()) cached = toInsights(docId, snap.data() as Record<string, unknown>);
  } catch {
    // Cache read failed — fall through to the live fetch.
  }

  if (
    cached &&
    Date.now() - new Date(cached.fetchedAt).getTime() < INSIGHTS_CACHE_TTL_MS
  ) {
    return cached;
  }

  // 2. Live fetch from Overpass.
  const fresh = await fetchOverpassInsights(latitude, longitude);
  if (fresh) {
    const result: NeighborhoodInsights = {
      ...fresh,
      id: docId,
      fetchedAt: new Date().toISOString(),
    };
    // Best-effort cache write (rules allow authenticated creates/updates of
    // exactly this shape; failures never block the UI).
    setDoc(docRef, {
      walkScore: result.walkScore,
      transitScore: result.transitScore,
      schools: result.schools,
      fetchedAt: serverTimestamp(),
    }).catch((error: unknown) => {
      console.warn('[neighborhood] insights cache write failed:', error);
    });
    return result;
  }

  // 3. Stale cache, 4. nothing.
  return cached;
}
