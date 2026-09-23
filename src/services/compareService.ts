import AsyncStorage from '@react-native-async-storage/async-storage';
import { Property } from '../types';

/**
 * Locally stored compare tray.
 *
 * Same non-critical pattern as recentlyViewedService: reads return `[]` and
 * writes no-op on failure. Snapshots are taken when a property is added so
 * the compare table renders instantly without Firestore fetches; rows show a
 * "refresh" state if the listing has since been archived or removed.
 *
 * Max 4 properties (side-by-side readability on a phone screen).
 * Works on web via AsyncStorage's localStorage backend.
 */

const STORAGE_KEY = '@house_hunter/compare_v1';

/** Maximum number of properties held in the compare tray. */
export const COMPARE_MAX = 4;

/** Lightweight property snapshot stored in the compare tray. */
export interface CompareItem {
  propertyId: string;
  title: string;
  price: number;
  listingType: 'sale' | 'rent';
  propertyType: string;
  status: Property['status'];
  images: string[];
  city: string;
  state: string;
  bedrooms: number;
  bathrooms: number;
  area: number;
  areaUnit: 'sqft' | 'sqm';
  yearBuilt: number;
  features: string[];
  /** ISO — the listing's createdAt, surfaced as days-on-market. */
  createdAt: string;
  /** ISO — when the item was added to the tray. */
  addedAt: string;
}

/** Read the compare tray (oldest first). Never throws. */
export async function readCompareList(): Promise<CompareItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CompareItem[]) : [];
  } catch (error) {
    console.warn('Failed to read compare list:', error);
    return [];
  }
}

/** Persist the list. Never throws. */
async function writeCompareList(items: CompareItem[]): Promise<CompareItem[]> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn('Failed to save compare list:', error);
  }
  return items;
}

/** Is this property already in the tray? */
export async function isInCompareList(propertyId: string): Promise<boolean> {
  const list = await readCompareList();
  return list.some((item) => item.propertyId === propertyId);
}

/**
 * Add a property snapshot to the tray.
 * Returns 'added' | 'exists' | 'full'. Caller decides what UI to show.
 */
export async function addToCompare(
  item: Omit<CompareItem, 'addedAt'>
): Promise<'added' | 'exists' | 'full'> {
  const list = await readCompareList();
  if (list.some((i) => i.propertyId === item.propertyId)) return 'exists';
  if (list.length >= COMPARE_MAX) return 'full';
  list.push({ ...item, addedAt: new Date().toISOString() });
  await writeCompareList(list);
  return 'added';
}

/** Remove one property from the tray. */
export async function removeFromCompare(propertyId: string): Promise<CompareItem[]> {
  const list = await readCompareList();
  return writeCompareList(list.filter((i) => i.propertyId !== propertyId));
}

/** Empty the tray. Never throws. */
export async function clearCompareList(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear compare list:', error);
  }
}

/** Days on market, derived from the listing's createdAt. */
export function daysOnMarket(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
}

/** Build a snapshot from a full Property doc (fields CompareItem needs). */
export function toCompareItem(property: Property): CompareItem {
  return {
    propertyId: property.id,
    title: property.title,
    price: property.price,
    listingType: property.listingType,
    propertyType: property.propertyType,
    status: property.status,
    images: property.images ?? [],
    city: property.city,
    state: property.state,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    area: property.area,
    areaUnit: property.areaUnit,
    yearBuilt: property.yearBuilt,
    features: property.features ?? [],
    createdAt: property.createdAt,
    addedAt: new Date().toISOString(),
  };
}
