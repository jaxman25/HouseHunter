/**
 * Neighborhood Data Cloud Function — weekly update of neighborhood scores.
 *
 * Scheduled function that runs weekly to refresh neighborhood data for
 * areas with active property listings. Uses Google Maps, WalkScore,
 * and other APIs to aggregate scores.
 *
 * This is a skeleton implementation — the actual API calls would need
 * to be configured with the appropriate API keys.
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
 * In production, this would call WalkScore, Google Maps, GreatSchools, etc.
 */
async function fetchNeighborhoodData(
  city: string,
  state: string,
  zipCode: string,
  lat: number,
  lng: number
): Promise<NeighborhoodUpdate> {
  // In production, these would be actual API calls:
  // - WalkScore API for walkability scores
  // - Google Places API for amenities
  // - GreatSchools API for school ratings
  // - Census API for demographics

  // Placeholder implementation returning mock data
  return {
    walkScore: Math.floor(Math.random() * 100),
    transitScore: Math.floor(Math.random() * 100),
    bikeScore: Math.floor(Math.random() * 100),
    crimeRate: ['Low', 'Moderate', 'High'][Math.floor(Math.random() * 3)] as 'Low' | 'Moderate' | 'High',
    schools: {
      elementary: [],
      middle: [],
      high: [],
    },
    amenities: {
      restaurants: Math.floor(Math.random() * 50),
      shopping: Math.floor(Math.random() * 30),
      parks: Math.floor(Math.random() * 15),
      gyms: Math.floor(Math.random() * 20),
      transitStops: Math.floor(Math.random() * 25),
      hospitals: Math.floor(Math.random() * 5),
    },
    propertyTrends: {
      averagePrice: 300000 + Math.floor(Math.random() * 200000),
      yearOverYearChange: Math.round((Math.random() * 10 - 3) * 10) / 10,
      yearlyData: Array.from({ length: 5 }, (_, i) => ({
        year: new Date().getFullYear() - 4 + i,
        price: 280000 + Math.floor(Math.random() * 100000) + i * 10000,
      })),
    },
    population: 50000 + Math.floor(Math.random() * 100000),
    medianIncome: 50000 + Math.floor(Math.random() * 50000),
    medianHomeValue: 250000 + Math.floor(Math.random() * 200000),
  };
}

/**
 * Scheduled function: runs weekly (Sundays at 2 AM) to update neighborhood
 * data for all areas with active property listings.
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

    console.log(`[updateNeighborhoodData] Complete: ${updated} updated, ${failed} failed`);
  }
);
