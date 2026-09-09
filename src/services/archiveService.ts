import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Property } from '../types';
import { PROPERTIES_COLLECTION } from '../utils/constants';
import { updateProperty } from './propertyService';

export type ArchiveReason = 'sold' | 'pending' | 'manual' | 'inactive';

/**
 * Archive a listing. Archiving is a soft-hide: the doc stays in Firestore
 * (analytics, chat history, seller records) but the status flips to inactive,
 * which the default browse query already excludes — zero new query logic.
 */
export async function archiveProperty(
  propertyId: string,
  reason: ArchiveReason = 'manual'
): Promise<void> {
  const now = new Date().toISOString();
  await updateProperty(propertyId, {
    archived: true,
    archivedAt: now,
    archiveReason: reason,
    status: 'inactive',
    expirationDate: now,
  });
}

/** Re-activate an archived listing (seller changed their mind). */
export async function restoreProperty(propertyId: string): Promise<void> {
  await updateProperty(propertyId, {
    archived: false,
    status: 'active',
  });
}

/** Archived listings owned by `userId`, newest archive first. */
export async function getArchivedProperties(
  userId: string
): Promise<Property[]> {
  const q = query(
    collection(db, PROPERTIES_COLLECTION),
    where('userId', '==', userId),
    where('archived', '==', true),
    orderBy('archivedAt', 'desc'),
    limit(100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Property);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Auto-archive window per status (matches functions/src/archive.ts). */
export const ARCHIVE_WINDOWS: Partial<Record<Property['status'], number>> = {
  sold: 30,
  rented: 30,
  pending: 60,
  inactive: 90,
};

/**
 * The date a listing becomes due for auto-archive, or null when it isn't a
 * candidate (active listings and manual archives without a stored date).
 */
export function getExpirationDate(property: Property): string | null {
  if (property.expirationDate) return property.expirationDate;
  const windowDays = ARCHIVE_WINDOWS[property.status];
  if (!windowDays) return null;
  const anchor =
    property.status === 'inactive' ? property.updatedAt : property.soldDate ?? property.pendingDate;
  if (!anchor) return null;
  return new Date(new Date(anchor).getTime() + windowDays * DAY_MS).toISOString();
}

/** Whole days until `dateIso` (0 = today, negative = overdue). */
export function daysUntil(dateIso: string): number {
  const ms = new Date(dateIso).getTime() - Date.now();
  return Math.ceil(ms / DAY_MS);
}