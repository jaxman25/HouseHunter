import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { DataExport } from '../types';
import {
  EXPORTS_COLLECTION,
  PROPERTIES_COLLECTION,
  CHAT_COLLECTION,
  MESSAGES_COLLECTION,
  USERS_COLLECTION,
  REVIEWS_COLLECTION,
  TOURS_COLLECTION,
  NOTIFICATIONS_COLLECTION,
} from '../utils/constants';
import { firestoreCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../utils/network/timeout';

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
  // Check for existing pending/processing export
  const existing = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(
          query(
            collection(db, EXPORTS_COLLECTION),
            where('userId', '==', userId),
            where('status', 'in', ['pending', 'processing'])
          )
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
        addDoc(collection(db, EXPORTS_COLLECTION), {
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
  const result = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(
          query(
            collection(db, EXPORTS_COLLECTION),
            where('userId', '==', userId),
            where('status', 'in', ['ready', 'processing', 'pending'])
          )
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
    withRetry(() => withTimeout(getDoc(doc(db, EXPORTS_COLLECTION, exportId)), DEFAULT_TIMEOUT_MS))
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
      withTimeout(updateDoc(doc(db, EXPORTS_COLLECTION, exportId), updateData), DEFAULT_TIMEOUT_MS)
    )
  );
}

/** Compile user data for export (called by Cloud Function). */
export async function compileUserData(userId: string): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};

  // Profile
  const userDoc = await getDoc(doc(db, USERS_COLLECTION, userId));
  if (userDoc.exists()) {
    data.profile = userDoc.data();
  }

  // Listings
  const listings = await getDocs(
    query(collection(db, PROPERTIES_COLLECTION), where('userId', '==', userId))
  );
  data.listings = listings.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Reviews
  const reviews = await getDocs(
    query(collection(db, REVIEWS_COLLECTION), where('buyerId', '==', userId))
  );
  data.reviews = reviews.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Tours
  const tours = await getDocs(
    query(
      collection(db, TOURS_COLLECTION),
      where('buyerId', '==', userId)
    )
  );
  data.tours = tours.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Notifications
  const notifications = await getDocs(
    query(collection(db, NOTIFICATIONS_COLLECTION), where('userId', '==', userId))
  );
  data.notifications = notifications.docs.map((d) => ({ id: d.id, ...d.data() }));

  return data;
}
