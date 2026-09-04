import {
  collection,
  writeBatch,
  WriteBatch,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  increment,
  serverTimestamp,
  updateDoc,
  DocumentSnapshot,
  DocumentData,
  QueryConstraint,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { Property, PropertyFilter } from '../types';
import { PROPERTIES_COLLECTION, ITEMS_PER_PAGE } from '../utils/constants';
import {
  firestoreCircuitBreaker,
  storageCircuitBreaker,
} from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import {
  withTimeout,
  DEFAULT_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
} from '../utils/network/timeout';
import {
  getCachedOrFetch,
  buildCacheKey,
  stableStringify,
  PROPERTY_CACHE_TTL_MS,
} from '../utils/cache/cacheService';
import {
  invalidatePropertiesCache,
  invalidatePropertyDetail,
} from '../utils/cache/cacheInvalidation';
import { trackMetric } from '../utils/monitoring/metrics';

/** Collection storing per-user write budgets (see firestore.rules). */
const COUNTERS_COLLECTION = 'counters';

/** Current wall-clock minute bucket (epoch millis / 60000). */
function currentMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

/**
 * Normalize a Firestore timestamp to an ISO string.
 *
 * Properties are written with `serverTimestamp()`, so raw docs carry `Timestamp`
 * instances (and cached copies serialize to `{ seconds, nanoseconds }` objects).
 * The `Property` type declares ISO strings and the UI feeds them to
 * `new Date(...)`/date-fns, so convert at the service boundary — same pattern
 * as `subscribeToMessages` in chatService.ts.
 */
function toISO(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value && typeof value === 'object') {
    const t = value as { seconds?: unknown; nanoseconds?: unknown };
    if (typeof t.seconds === 'number' && typeof t.nanoseconds === 'number') {
      return new Date(t.seconds * 1000 + t.nanoseconds / 1_000_000).toISOString();
    }
  }
  return value as string;
}

/** Map a Firestore property document to the `Property` type with ISO dates. */
function toProperty(docSnap: DocumentSnapshot<DocumentData>): Property {
  const data = docSnap.data() as Property;
  return {
    ...data,
    id: docSnap.id,
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt),
  };
}

/**
 * Attach a rate-limit counter bump to `batch` for `uid`. Firestore rules
 * (`withinWriteLimit()` in firestore.rules) require every property write to be
 * accompanied, in the same batch, by a `counters/{uid}` write shaped
 * `{ minute: <epochMinute>, writes: increment(1) }`. Call before commit.
 */
function withWriteCount(batch: WriteBatch, uid: string): void {
  batch.set(
    doc(db, COUNTERS_COLLECTION, uid),
    { minute: currentMinute(), writes: increment(1) },
    { merge: true }
  );
}

export async function createProperty(
  property: Omit<Property, 'id' | 'views' | 'inquiries' | 'createdAt' | 'updatedAt'>,
  /**
   * Optional document id. The AddProperty flow uploads images to
   * `properties/{id}/...` BEFORE the doc exists (see storage.rules), so it
   * passes the id it already used as the storage folder to keep both in sync.
   * Without it an auto-generated id is used.
   */
  docId?: string
): Promise<string> {
  const propRef = docId
    ? doc(db, PROPERTIES_COLLECTION, docId)
    : doc(collection(db, PROPERTIES_COLLECTION));

  // NB: the batch is rebuilt per attempt — a Firestore WriteBatch can only be
  // committed once, so a retried commit needs a fresh batch.
  const commitCreate = () => {
    const batch = writeBatch(db);
    batch.set(propRef, {
      ...property,
      views: 0,
      inquiries: 0,
      version: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    withWriteCount(batch, property.userId);
    return batch.commit();
  };

  await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(commitCreate(), DEFAULT_TIMEOUT_MS))
  );

  // Mutations invalidate cached listing pages so the next read is fresh.
  await invalidatePropertiesCache();
  return propRef.id;
}

export async function updateProperty(
  id: string,
  data: Partial<Property>
): Promise<void> {
  const docRef = doc(db, PROPERTIES_COLLECTION, id);

  // The write budget is charged to the property owner, so read the doc first.
  // The read also gives us the current `version` for optimistic locking.
  const existing = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDoc(docRef), DEFAULT_TIMEOUT_MS))
  );
  const ownerId = existing.exists() ? existing.data().userId : data.userId;
  if (!ownerId) {
    throw new Error('Cannot update property: missing owner');
  }

  // Optimistic locking: docs without a `version` are treated as version 0, so
  // the first edit bumps them to 1 (matches the rules fallback below).
  const nextVersion = (existing.exists() ? existing.data().version ?? 0 : 0) + 1;

  // Rebuild the batch per retry attempt (a committed batch can't be reused).
  const commitUpdate = () => {
    const batch = writeBatch(db);
    // `version` is set AFTER the spread so caller-supplied data can't override it.
    batch.update(docRef, { ...data, version: nextVersion, updatedAt: serverTimestamp() });
    withWriteCount(batch, ownerId);
    return batch.commit();
  };

  try {
    await firestoreCircuitBreaker.execute(() =>
      withRetry(() => withTimeout(commitUpdate(), DEFAULT_TIMEOUT_MS))
    );
  } catch (error) {
    // firestore.rules denies a stale write (version mismatch) with
    // failed-precondition — surface a friendly conflict instead of a raw error.
    if ((error as { code?: unknown } | null)?.code === 'failed-precondition') {
      throw new Error('This listing was modified elsewhere. Refresh and try again.');
    }
    throw error;
  }

  await invalidatePropertiesCache();
  await invalidatePropertyDetail(id);
}

export async function deleteProperty(id: string): Promise<void> {
  const docRef = doc(db, PROPERTIES_COLLECTION, id);

  // Delete associated images from storage
  const propDoc = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDoc(docRef), DEFAULT_TIMEOUT_MS))
  );
  if (propDoc.exists()) {
    const ownerId = propDoc.data().userId;
    const images = propDoc.data().images || [];
    for (const imageUrl of images) {
      try {
        const imageRef = ref(storage, imageUrl);
        await deleteObject(imageRef);
      } catch {
        // Image might not be in storage (external URLs)
      }
    }

    // Rebuild the batch per retry attempt (a committed batch can't be reused).
    const commitDelete = () => {
      const batch = writeBatch(db);
      batch.delete(docRef);
      withWriteCount(batch, ownerId);
      return batch.commit();
    };
    await firestoreCircuitBreaker.execute(() =>
      withRetry(() => withTimeout(commitDelete(), DEFAULT_TIMEOUT_MS))
    );
  }
  // Document already gone — nothing to delete (and the rate limiter requires
  // a counter bump alongside a delete, so don't fire an empty one).

  await invalidatePropertiesCache();
  await invalidatePropertyDetail(id);
}

/** Inner fetch: read the property document and bump its view counter. */
async function fetchProperty(id: string): Promise<Property | null> {
  const docRef = doc(db, PROPERTIES_COLLECTION, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    // Increment views
    await updateDoc(docRef, { views: increment(1) });
    return toProperty(docSnap);
  }
  return null;
}

export async function getProperty(id: string): Promise<Property | null> {
  const result = await getCachedOrFetch(
    buildCacheKey('properties', 'detail', id),
    () =>
      trackMetric('properties.detail', () =>
        firestoreCircuitBreaker.execute(() =>
          withRetry(() =>
            withTimeout(fetchProperty(id), DEFAULT_TIMEOUT_MS)
          )
        )
      ),
    PROPERTY_CACHE_TTL_MS
  );
  return result.data;
}

/** Inner fetch: build and execute the (possibly filtered/sorted/paged) query. */
async function fetchPropertiesPage(
  filter: PropertyFilter,
  pageSize: number,
  lastDoc?: DocumentSnapshot
): Promise<{ properties: Property[]; lastDoc: DocumentSnapshot | null }> {
  const constraints: QueryConstraint[] = [];

  if (filter.listingType) {
    constraints.push(where('listingType', '==', filter.listingType));
  }
  if (filter.propertyType && filter.propertyType.length > 0) {
    constraints.push(where('propertyType', 'in', filter.propertyType));
  }
  if (filter.status) {
    constraints.push(where('status', '==', filter.status));
  } else {
    constraints.push(where('status', '==', 'active'));
  }
  if (filter.minPrice !== undefined) {
    constraints.push(where('price', '>=', filter.minPrice));
  }
  if (filter.maxPrice !== undefined) {
    constraints.push(where('price', '<=', filter.maxPrice));
  }
  if (filter.city) {
    constraints.push(where('city', '==', filter.city));
  }
  if (filter.state) {
    constraints.push(where('state', '==', filter.state));
  }

  // Sorting
  switch (filter.sortBy) {
    case 'price_asc':
      constraints.push(orderBy('price', 'asc'));
      break;
    case 'price_desc':
      constraints.push(orderBy('price', 'desc'));
      break;
    case 'popular':
      constraints.push(orderBy('views', 'desc'));
      break;
    case 'oldest':
      constraints.push(orderBy('createdAt', 'asc'));
      break;
    case 'newest':
    default:
      constraints.push(orderBy('createdAt', 'desc'));
      break;
  }

  constraints.push(limit(pageSize));
  if (lastDoc) {
    constraints.push(startAfter(lastDoc));
  }

  const q = query(collection(db, PROPERTIES_COLLECTION), ...constraints);
  const querySnapshot = await getDocs(q);

  const properties: Property[] = [];
  querySnapshot.forEach((doc) => {
    properties.push(toProperty(doc));
  });

  // Client-side filtering for fields that can't be indexed easily
  let filtered = properties;
  if (filter.minBedrooms !== undefined) {
    filtered = filtered.filter((p) => p.bedrooms >= filter.minBedrooms!);
  }
  if (filter.maxBedrooms !== undefined) {
    filtered = filtered.filter((p) => p.bedrooms <= filter.maxBedrooms!);
  }
  if (filter.minBathrooms !== undefined) {
    filtered = filtered.filter((p) => p.bathrooms >= filter.minBathrooms!);
  }
  if (filter.maxBathrooms !== undefined) {
    filtered = filtered.filter((p) => p.bathrooms <= filter.maxBathrooms!);
  }
  if (filter.features && filter.features.length > 0) {
    filtered = filtered.filter((p) =>
      filter.features!.every((f) => p.features.includes(f))
    );
  }

  const lastVisible =
    querySnapshot.docs.length > 0
      ? querySnapshot.docs[querySnapshot.docs.length - 1]
      : null;

  return { properties: filtered, lastDoc: lastVisible };
}

export async function getProperties(
  filter: PropertyFilter = {},
  pageSize: number = ITEMS_PER_PAGE,
  lastDoc?: DocumentSnapshot
): Promise<{ properties: Property[]; lastDoc: DocumentSnapshot | null }> {
  const fetchPage = () =>
    trackMetric('properties.list', () =>
      firestoreCircuitBreaker.execute(() =>
        withRetry(() =>
          withTimeout(fetchPropertiesPage(filter, pageSize, lastDoc), DEFAULT_TIMEOUT_MS)
        )
      )
    );

  // Pagination cursors can't be cached meaningfully — always hit the network.
  if (lastDoc) {
    return fetchPage();
  }

  // First page only: serve from cache (5 min TTL, stale-while-revalidate).
  const key = buildCacheKey(
    'properties',
    'list',
    stableStringify(filter),
    String(pageSize)
  );
  const result = await getCachedOrFetch(key, fetchPage, PROPERTY_CACHE_TTL_MS);
  return result.data;
}

export async function searchProperties(
  searchTerm: string
): Promise<Property[]> {
  // Firestore doesn't support full-text search natively,
  // so we search on the client side
  const result = await trackMetric('properties.search', () =>
    firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          (async () => {
            const q = query(
              collection(db, PROPERTIES_COLLECTION),
              where('status', '==', 'active'),
              orderBy('createdAt', 'desc'),
              limit(100)
            );
            const querySnapshot = await getDocs(q);
            const term = searchTerm.toLowerCase();

            const results: Property[] = [];
            querySnapshot.forEach((doc) => {
              const property = toProperty(doc);
              if (
                property.title.toLowerCase().includes(term) ||
                property.address.toLowerCase().includes(term) ||
                property.city.toLowerCase().includes(term) ||
                property.state.toLowerCase().includes(term) ||
                property.description.toLowerCase().includes(term)
              ) {
                results.push(property);
              }
            });

            return results;
          })(),
          DEFAULT_TIMEOUT_MS
        )
      )
    )
  );
  return result;
}

export async function getUserProperties(userId: string): Promise<Property[]> {
  const result = await trackMetric('properties.byUser', () =>
    firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          (async () => {
            const q = query(
              collection(db, PROPERTIES_COLLECTION),
              where('userId', '==', userId),
              orderBy('createdAt', 'desc')
            );
            const querySnapshot = await getDocs(q);
            const properties: Property[] = [];
            querySnapshot.forEach((doc) => {
              properties.push(toProperty(doc));
            });
            return properties;
          })(),
          DEFAULT_TIMEOUT_MS
        )
      )
    )
  );
  return result;
}

export async function getPropertiesByIds(ids: string[]): Promise<Property[]> {
  if (ids.length === 0) return [];
  const properties: Property[] = [];

  // Firestore 'in' queries are limited to 30 items
  const chunks = [];
  for (let i = 0; i < ids.length; i += 30) {
    chunks.push(ids.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    const chunkResults = await firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          (async () => {
            const q = query(
              collection(db, PROPERTIES_COLLECTION),
              where('__name__', 'in', chunk)
            );
            const querySnapshot = await getDocs(q);
            const docs: Property[] = [];
            querySnapshot.forEach((doc) => {
              docs.push(toProperty(doc));
            });
            return docs;
          })(),
          DEFAULT_TIMEOUT_MS
        )
      )
    );
    properties.push(...chunkResults);
  }

  return properties;
}

export async function uploadPropertyImage(
  uri: string,
  propertyId: string,
  index: number
): Promise<string> {
  const url = await storageCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackMetric('properties.uploadImage', async () => {
          const response = await fetch(uri);
          const blob = await response.blob();
          const filename = `properties/${propertyId}/image_${index}_${Date.now()}`;
          const storageRef = ref(storage, filename);
          await uploadBytes(storageRef, blob);
          return getDownloadURL(storageRef);
        }),
        UPLOAD_TIMEOUT_MS
      )
    )
  );
  return url;
}

export async function deletePropertyImage(imageUrl: string): Promise<void> {
  try {
    const imageRef = ref(storage, imageUrl);
    await withTimeout(deleteObject(imageRef), UPLOAD_TIMEOUT_MS);
  } catch {
    // Image might not be in storage
  }
}