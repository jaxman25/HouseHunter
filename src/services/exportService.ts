import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  DocumentSnapshot,
  DocumentData,
  Query,
  QuerySnapshot,
} from 'firebase/firestore';
import {
  trackedGetDoc,
  trackedGetDocs,
  trackedAddDoc,
  trackedUpdateDoc,
} from '../utils/firestore/tracked';
import { auth, db } from '../config/firebase';
import { DataExport } from '../types';
import {
  EXPORTS_COLLECTION,
  PROPERTIES_COLLECTION,
  USERS_COLLECTION,
  REVIEWS_COLLECTION,
  TOURS_COLLECTION,
  NOTIFICATIONS_COLLECTION,
} from '../utils/constants';
import { firestoreCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../utils/network/timeout';

const EXPORT_PAGE_SIZE = 500;

/**
 * Drain an entire (filtered) collection in bounded pages — GDPR exports must
 * be complete, so instead of one unbounded getDocs the fetch loops cursor
 * pages of EXPORT_PAGE_SIZE. Stops when a page comes back short.
 */
async function collectAllPages(
  collectionName: string,
  buildPage: (
    cursor: DocumentSnapshot<DocumentData> | null
  ) => Query<DocumentData, DocumentData>
): Promise<Record<string, unknown>[]> {
  type Snap = DocumentSnapshot<DocumentData>;
  const all: Record<string, unknown>[] = [];
  let cursor: Snap | null = null;
  // Hard safety valve (≈ 100k docs) — exports are user-scoped so this is
  // never reached in practice; protects against a cursor that never advances.
  for (let i = 0; i < 200; i++) {
    const snap: QuerySnapshot<DocumentData> = await trackedGetDocs(
      buildPage(cursor),
      collectionName
    );
    if (snap.empty) break;
    snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
    if (snap.size < EXPORT_PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return all;
}

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

function toExport(docSnap: any): DataExport {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    userId: data.userId,
    status: data.status,
    fileUrl: data.fileUrl,
    createdAt: toISO(data.createdAt),
    expiresAt: toISO(data.expiresAt),
    completedAt: data.completedAt ? toISO(data.completedAt) : undefined,
    error: data.error,
  };
}

/** Request a data export (GDPR). The actual compilation is done via Cloud Function. */
export async function requestDataExport(userId: string): Promise<string> {
  // SECURITY (IDOR): Verify the caller owns this userId.
  const user = auth.currentUser;
  if (!user || user.uid !== userId) {
    throw new Error('Unauthorized: you can only request exports for yourself');
  }

  // Check for existing pending/processing export
  const existing = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackedGetDocs(
          query(
            collection(db, EXPORTS_COLLECTION),
            where('userId', '==', userId),
            where('status', 'in', ['pending', 'processing'])
          ),
          EXPORTS_COLLECTION
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  if (!existing.empty) {
    throw new Error('An export is already in progress. Please wait for it to complete.');
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const docRef = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackedAddDoc(collection(db, EXPORTS_COLLECTION), {
          userId,
          status: 'pending',
          createdAt: serverTimestamp(),
          expiresAt: expiresAt.toISOString(),
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  return docRef.id;
}

/** Get the user's export history. */
export async function getUserExports(userId: string): Promise<DataExport[]> {
  // SECURITY (IDOR): Verify the caller owns this userId.
  const user = auth.currentUser;
  if (!user || user.uid !== userId) {
    throw new Error('Unauthorized: you can only view your own exports');
  }

  const result = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackedGetDocs(
          query(
            collection(db, EXPORTS_COLLECTION),
            where('userId', '==', userId),
            where('status', 'in', ['ready', 'processing', 'pending'])
          ),
          EXPORTS_COLLECTION
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  return result.docs.map(toExport);
}

/** Get a single export. */
export async function getExport(exportId: string): Promise<DataExport | null> {
  const docSnap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(trackedGetDoc(doc(db, EXPORTS_COLLECTION, exportId)), DEFAULT_TIMEOUT_MS))
  );
  if (!docSnap.exists()) return null;
  return toExport(docSnap);
}

/** Update export status (called by Cloud Function). */
export async function updateExportStatus(
  exportId: string,
  status: DataExport['status'],
  fileUrl?: string,
  error?: string
): Promise<void> {
  const updateData: Record<string, unknown> = { status };
  if (fileUrl) updateData.fileUrl = fileUrl;
  if (error) updateData.error = error;
  if (status === 'ready') updateData.completedAt = serverTimestamp();

  await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(trackedUpdateDoc(doc(db, EXPORTS_COLLECTION, exportId), updateData), DEFAULT_TIMEOUT_MS)
    )
  );
}

/** Compile user data for export (called by Cloud Function). */
export async function compileUserData(userId: string): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};

  // Profile
  const userDoc = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(trackedGetDoc(doc(db, USERS_COLLECTION, userId)), DEFAULT_TIMEOUT_MS))
  );
  if (userDoc.exists()) {
    data.profile = userDoc.data();
  }

  // Listings
  data.listings = await collectAllPages(PROPERTIES_COLLECTION, (cursor) =>
    query(
      collection(db, PROPERTIES_COLLECTION),
      where('userId', '==', userId),
      orderBy('createdAt', 'asc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(EXPORT_PAGE_SIZE)
    )
  );

  // Reviews
  data.reviews = await collectAllPages(REVIEWS_COLLECTION, (cursor) =>
    query(
      collection(db, REVIEWS_COLLECTION),
      where('buyerId', '==', userId),
      orderBy('createdAt', 'asc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(EXPORT_PAGE_SIZE)
    )
  );

  // Tours
  data.tours = await collectAllPages(TOURS_COLLECTION, (cursor) =>
    query(
      collection(db, TOURS_COLLECTION),
      where('buyerId', '==', userId),
      orderBy('createdAt', 'asc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(EXPORT_PAGE_SIZE)
    )
  );

  // Notifications
  data.notifications = await collectAllPages(NOTIFICATIONS_COLLECTION, (cursor) =>
    query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('userId', '==', userId),
      orderBy('createdAt', 'asc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(EXPORT_PAGE_SIZE)
    )
  );

  return data;
}
