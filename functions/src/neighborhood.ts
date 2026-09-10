/**
 * Neighborhood Data Cloud Function — weekly update of neighborhood scores.
 *
 * Scheduled function that runs weekly to refresh neighborhood data for
 * areas with active property listings. Requires external API keys
 * (WalkScore, Google Maps, GreatSchools, Census) to be configured.
 *
 * SECURITY: This function MUST NOT write mock/random data to production.
 * If API keys are not configured, the function logs a warning and exits
 * without modifying any documents.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

interface NeighborhoodUpdate {
  walkScore: number;
  transitScore: number;
  bikeScore: number;
  crimeRate: 'Low' | 'Moderate' | 'High';
  schools: {
    elementary: { name: string; rating: number; distance: number; type: 'public' | 'private' }[];
    middle: { name: string; rating: number; distance: number; type: 'public' | 'private' }[];
    high: { name: string; rating: number; distance: number; type: 'public' | 'private' }[];
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
}

/**
 * Fetch neighborhood data from external APIs.
 *
 * This is a stub. To activate, configure the required API keys as
 * Cloud Functions environment variables and implement the real calls:
 *   - WALKSCORE_API_KEY — https://www.walkscore.com/professional/api.php
 *   - GOOGLE_MAPS_API_KEY — for Places / Geocoding
 *   - GREATSCHOOLS_API_KEY — for school ratings
 *   - CENSUS_API_KEY — for demographics
 *
 * Returns null when APIs are not configured (function exits without writing).
 */
async function fetchNeighborhoodData(
  city: string,
  state: string,
  zipCode: string,
  lat: number,
  lng: number
): Promise<NeighborhoodUpdate | null> {
  // Check that required API keys are present.
  const walkscoreKey = process.env.WALKSCORE_API_KEY;
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!walkscoreKey || !mapsKey) {
    // APIs not configured — return null so the caller skips the write.
    return null;
  }

  // ── WalkScore ────────────────────────────────────────────────
  // Example: https://api.walkscore.com/score?format=json&address=...&lat=...&lon=...&wsapikey=...
  // const walkRes = await fetch(`https://api.walkscore.com/score?format=json&address=${encodeURIComponent(`${city}, ${state} ${zipCode}`)}&lat=${lat}&lon=${lng}&wsapikey=${walkscoreKey}`);
  // const walkData = await walkRes.json();

  // ── Google Places (amenities) ────────────────────────────────
  // const placesRes = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=1609&type=restaurant&key=${mapsKey}`);

  // ── GreatSchools (schools) ───────────────────────────────────
  // const schoolsRes = await fetch(`https://api.greatschools.org/schools?key=...&zip=${zipCode}`);

  // ── Census (demographics) ────────────────────────────────────
  // const censusRes = await fetch(`https://api.census.gov/data/...`);

  // When implemented, assemble the real data and return it.
  // For now, returning null prevents any data from being written.

  console.warn(
    `[neighborhood] API keys configured but real implementations not yet built. `
    + `Skipping write for ${city}, ${state} ${zipCode}.`
  );
  return null;
}

/**
 * Scheduled function: runs weekly (Sundays at 2 AM) to update neighborhood
 * data for all areas with active property listings.
 *
 * SECURITY: Only writes data returned by real API calls. Never writes
 * random or mock data to production.
 */
export const updateNeighborhoodData = onSchedule(
  'every week on sunday at 02:00',
  async () => {
    console.log('[updateNeighborhoodData] Starting weekly neighborhood data update');

    // Get all unique city/state/zip combinations from active listings
    const propertiesSnap = await db
      .collection('properties')
      .where('status', 'in', ['active', 'pending', 'sold'])
      .get();

    const uniqueLocations = new Map<string, { city: string; state: string; zipCode: string; lat: number; lng: number }>();

    for (const doc of propertiesSnap.docs) {
      const data = doc.data();
      const key = `${data.city}_${data.state}_${data.zipCode}`;
      if (!uniqueLocations.has(key)) {
        uniqueLocations.set(key, {
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
          lat: data.latitude || 0,
          lng: data.longitude || 0,
        });
      }
    }

    console.log(`[updateNeighborhoodData] Found ${uniqueLocations.size} unique locations`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const [key, location] of uniqueLocations) {
      try {
        const neighborhoodData = await fetchNeighborhoodData(
          location.city,
          location.state,
          location.zipCode,
          location.lat,
          location.lng
        );

        if (!neighborhoodData) {
          skipped++;
          continue;
        }

        await db.doc(`neighborhood_data/${key}`).set({
          ...neighborhoodData,
          city: location.city,
          state: location.state,
          zipCode: location.zipCode,
          lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true });

        updated++;
      } catch (error) {
        console.error(`[updateNeighborhoodData] Failed for ${key}:`, error);
        failed++;
      }
    }

    console.log(
      `[updateNeighborhoodData] Complete: ${updated} updated, ${skipped} skipped (APIs not configured), ${failed} failed`
    );
  }
);
