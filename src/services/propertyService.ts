import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  increment,
  serverTimestamp,
  DocumentSnapshot,
  DocumentData,
  QueryConstraint,
  Timestamp,
} from 'firebase/firestore';
import {
  trackedGetDoc,
  trackedGetDocs,
  trackedSetDoc,
  trackedWriteBatch,
  type TrackedWriteBatch,
} from '../utils/firestore/tracked';
import { auth, db } from '../config/firebase';
import { uploadImage, deleteImage } from './storageService';
import { Property, PropertyFilter, PriceHistoryEntry } from '../types';
import { PROPERTIES_COLLECTION, ITEMS_PER_PAGE, PRICE_HISTORY_SUBCOLLECTION, VIEW_EVENTS_SUBCOLLECTION } from '../utils/constants';
import { firestoreCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../utils/network/timeout';
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
import { sanitize, sanitizeStrict } from '../utils/security/sanitize';

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
export function toProperty(docSnap: DocumentSnapshot<DocumentData>): Property {
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
function withWriteCount(batch: TrackedWriteBatch, uid: string): void {
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
  // SECURITY: Sanitize all string fields to prevent stored XSS.
  const sanitizedProperty = {
    ...property,
    title: sanitize(property.title, 200),
    description: sanitize(property.description, 5000),
    address: sanitize(property.address, 300),
    city: sanitize(property.city, 100),
    state: sanitize(property.state, 100),
    zipCode: sanitizeStrict(property.zipCode, 20),
    userName: sanitize(property.userName, 100),
    userPhone: sanitizeStrict(property.userPhone, 30),
    // Enforce numeric bounds
    price: Math.max(0, Math.min(property.price, 100_000_000)),
    bedrooms: Math.max(0, Math.min(property.bedrooms, 50)),
    bathrooms: Math.max(0, Math.min(property.bathrooms, 50)),
    area: Math.max(0, Math.min(property.area, 1_000_000)),
    yearBuilt: Math.max(1800, Math.min(property.yearBuilt, new Date().getFullYear() + 5)),
    // Sanitize array items
    features: (property.features || []).slice(0, 50).map((f) => sanitize(f, 50)),
    amenities: (property.amenities || []).slice(0, 50).map((a) => sanitize(a, 50)),
    // Validate images array
    images: (property.images || []).slice(0, 10),
  };

  const propRef = docId
    ? doc(db, PROPERTIES_COLLECTION, docId)
    : doc(collection(db, PROPERTIES_COLLECTION));

  // NB: the batch is rebuilt per attempt — a Firestore WriteBatch can only be
  // committed once, so a retried commit needs a fresh batch.
  const commitCreate = () => {
    const batch = trackedWriteBatch();
    batch.set(propRef, {
      ...sanitizedProperty,
      views: 0,
      inquiries: 0,
      // Rule-required fields with safe defaults, set AFTER the spread so a
      // caller can't override them (propertyDataIsValid() requires all three
      // on create; firestore.rules pins archived/verified to false).
      archived: false,
      contactEnabled: true,
      verified: false,
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
    withRetry(() => withTimeout(trackedGetDoc(docRef), DEFAULT_TIMEOUT_MS))
  );
  const ownerId = existing.exists() ? existing.data().userId : data.userId;
  if (!ownerId) {
    throw new Error('Cannot update property: missing owner');
  }

  // SECURITY (IDOR): Verify the caller is the property owner.
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== ownerId) {
    throw new Error('Unauthorized: you can only edit your own listings');
  }

  // Optimistic locking: docs without a `version` are treated as version 0, so
  // the first edit bumps them to 1 (matches the rules fallback below).
  const nextVersion = (existing.exists() ? existing.data().version ?? 0 : 0) + 1;

  // Rebuild the batch per retry attempt (a committed batch can't be reused).
  // Price history is now recorded server-side by the trackPriceHistory Cloud
  // Function (functions/src/priceHistoryTracking.ts) so the client only needs
  // to commit the property update itself.
  const commitUpdate = () => {
    const batch = trackedWriteBatch();
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
    withRetry(() => withTimeout(trackedGetDoc(docRef), DEFAULT_TIMEOUT_MS))
  );
  if (propDoc.exists()) {
    const ownerId = propDoc.data().userId;

    // SECURITY (IDOR): Verify the caller is the property owner.
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== ownerId) {
      throw new Error('Unauthorized: you can only delete your own listings');
    }

    const images = propDoc.data().images || [];
    for (const imageUrl of images) {
      // Unsigned uploads can't delete assets — delegate to the shared
      // service (logged no-op until a signed delete proxy exists). It never
      // throws, preserving the old "image might not exist" tolerance.
      await deleteImage(imageUrl);
    }

    // Rebuild the batch per retry attempt (a committed batch can't be reused).
    const commitDelete = () => {
      const batch = trackedWriteBatch();
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

/** Inner fetch: read the property document. Views are no longer bumped here
 * (the client-side increment was removed); the server-side trigger owns
 * `views` via the `properties/{id}/viewEvents/{uid}_{yyyy-mm-dd}` subcollection.
 */
async function fetchProperty(id: string): Promise<Property | null> {
  const docRef = doc(db, PROPERTIES_COLLECTION, id);
  const docSnap = await trackedGetDoc(docRef);
  if (docSnap.exists()) {
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

/**
 * Record a counted view for `propertyId` as a create-only document
 * `properties/{id}/viewEvents/{uid}_{yyyy-mm-dd}` (UTC day).
 *
 * The doc-id IS the server-side rate-limit guard: `{uid}` pins the event to
 * its author and `{yyyy-mm-dd}` collapses a whole day into one id, and
 * firestore.rules only allows `create` — so re-opens can never duplicate or
 * overwrite an event. The `countViewEvent` trigger
 * (functions/src/viewEvents.ts) re-validates the id against the event time
 * and bumps the parent's `views` by +1; the client never writes `views`
 * itself (that increment was removed from `fetchProperty`).
 *
 * Requires a signed-in user — rules deny anonymous events, so signed-out
 * browsing simply doesn't count. Never throws: the caller debounces locally
 * first (`shouldCountView`/`markViewCounted`) and logs any failure here.
 */
export async function recordViewEvent(propertyId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!propertyId || !uid) return;
  // UTC day — must match the trigger's `event.time` day (viewEvents.ts).
  const day = new Date().toISOString().slice(0, 10);
  const eventRef = doc(
    db,
    PROPERTIES_COLLECTION,
    propertyId,
    VIEW_EVENTS_SUBCOLLECTION,
    `${uid}_${day}`
  );
  // Benign same-day duplicates surface as permission-denied (create-only
  // rule) and are non-retryable — withRetry throws them straight through.
  await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(trackedSetDoc(eventRef, { userId: uid }), DEFAULT_TIMEOUT_MS)
    )
  );
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
    // Default browse: everything except Inactive. Equality/IN filters use the
    // same composite indexes (status first), so price/popular sorts keep
    // working; sold/pending listings surface with their status badges.
    constraints.push(
      where('status', 'in', ['active', 'pending', 'sold', 'rented'])
    );
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
  const querySnapshot = await trackedGetDocs(q, PROPERTIES_COLLECTION);

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
  // SECURITY (HIGH 6): Sanitize and truncate search input to prevent
  // abuse (very long strings, excessive reads).
  const MAX_SEARCH_LENGTH = 100;
  const sanitized = searchTerm.trim().slice(0, MAX_SEARCH_LENGTH);
  if (!sanitized) return [];

  // Firestore doesn't support full-text search natively,
  // so we search on the client side with a bounded result set.
  const MAX_RESULTS = 50;
  const result = await trackMetric('properties.search', () =>
    firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          (async () => {
            const q = query(
              collection(db, PROPERTIES_COLLECTION),
              where('status', '==', 'active'),
              orderBy('createdAt', 'desc'),
              limit(MAX_RESULTS)
            );
            const querySnapshot = await trackedGetDocs(q, PROPERTIES_COLLECTION);
            const term = sanitized.toLowerCase();

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
            const querySnapshot = await trackedGetDocs(q, PROPERTIES_COLLECTION);
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
            const querySnapshot = await trackedGetDocs(q, PROPERTIES_COLLECTION);
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
  // Delegates to the shared Cloudinary uploader (replaces direct
  // firebase/storage usage). The propertyId/index no longer form the storage
  // path — Cloudinary's unsigned preset controls the folder — but they stay
  // in the signature for API compatibility and for the legacy-style path arg.
  const filename = `properties/${propertyId}/image_${index}_${Date.now()}`;
  return trackMetric('properties.uploadImage', () => uploadImage(uri, filename));
}

export async function deletePropertyImage(imageUrl: string): Promise<void> {
  // Unsigned Cloudinary uploads cannot delete assets (destroy needs a signed
  // call with the API secret) — delegate to the shared service, which is a
  // logged no-op until a delete-proxy Cloud Function exists. Never throws.
  await deleteImage(imageUrl);
}

/**
 * Fetch price history for a property, ordered by change time ascending.
 * Returns up to `maxEntries` most recent entries (default 50).
 */
export async function getPriceHistory(
  propertyId: string,
  maxEntries = 50
): Promise<PriceHistoryEntry[]> {
  const q = query(
    collection(db, PROPERTIES_COLLECTION, propertyId, PRICE_HISTORY_SUBCOLLECTION),
    orderBy('changedAt', 'asc'),
    limit(maxEntries)
  );
  const snap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(trackedGetDocs(q, PRICE_HISTORY_SUBCOLLECTION), DEFAULT_TIMEOUT_MS))
  );
  return snap.docs.map((d) => ({
    id: d.id,
    price: d.data().price,
    changedAt: toISO(d.data().changedAt),
    changedBy: d.data().changedBy,
  }));
}

/**
 * Rough haversine distance (km) between two lat/lng points.
 * Exported for unit testing.
 */
export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Most recent sold/rented listings within ~1km of the given property
 * (same city as a cheap pre-filter). Client-side sort + distance filter so
 * no composite index is required. Used by the detail screen's
 * "Recently Sold Nearby" section.
 * Exported for unit testing.
 */
export function filterRecentlySoldNearby(
  candidates: Property[],
  current: Property,
  maxResults = 3,
  radiusKm = 1
): Property[] {
  if (!current.latitude || !current.longitude) return [];
  return candidates
    .filter(
      (p) =>
        p.id !== current.id &&
        (p.status === 'sold' || p.status === 'rented') &&
        p.latitude != null &&
        p.longitude != null &&
        distanceKm(current.latitude, current.longitude, p.latitude, p.longitude) <= radiusKm
    )
    .sort(
      (a, b) =>
        (b.soldDate ?? b.updatedAt ?? '').localeCompare(a.soldDate ?? a.updatedAt ?? '')
    )
    .slice(0, maxResults);
}

/**
 * Fetch recent sold/rented listings near a property (same city, ≤1km).
 * Equality-only Firestore query (no orderBy) so no composite index is
 * needed; recency and distance are applied client-side.
 */
export async function getRecentlySoldNearby(
  property: Property,
  maxResults = 3
): Promise<Property[]> {
  const q = query(
    collection(db, PROPERTIES_COLLECTION),
    where('city', '==', property.city),
    where('status', 'in', ['sold', 'rented']),
    limit(30)
  );

  const snap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(trackedGetDocs(q, PROPERTIES_COLLECTION), DEFAULT_TIMEOUT_MS))
  );

  const candidates = snap.docs.map((d) => toProperty(d));
  return filterRecentlySoldNearby(candidates, property, maxResults);
}

/**
 * Find similar properties: same city + same propertyType + price ±20%.
 * Excludes the current listing and inactive properties.
 * Used by PropertyDetailScreen to show a "Similar Listings" section.
 */
/**
 * Compute the price range for similar-property queries (±20%).
 * Exported for unit testing.
 */
export function computeSimilarPriceRange(price: number): {
  min: number;
  max: number;
} {
  return {
    min: Math.round(price * 0.8),
    max: Math.round(price * 1.2),
  };
}

/**
 * Filter candidate properties for similarity: exclude the current listing
 * and inactive properties, keep at most `limit` results.
 * Exported for unit testing.
 */
export function filterSimilarProperties(
  candidates: Property[],
  currentId: string,
  maxResults = 6
): Property[] {
  return candidates
    .filter((p) => p.id !== currentId && p.status !== 'inactive')
    .slice(0, maxResults);
}

export async function getSimilarProperties(
  property: Property
): Promise<Property[]> {
  const { min, max } = computeSimilarPriceRange(property.price);

  const q = query(
    collection(db, PROPERTIES_COLLECTION),
    where('city', '==', property.city),
    where('propertyType', '==', property.propertyType),
    where('status', 'in', ['active', 'pending', 'sold', 'rented']),
    where('price', '>=', min),
    where('price', '<=', max),
    orderBy('price', 'asc'),
    limit(10)
  );

  const snap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(trackedGetDocs(q, PROPERTIES_COLLECTION), DEFAULT_TIMEOUT_MS))
  );

  const candidates = snap.docs.map((d) => toProperty(d));
  return filterSimilarProperties(candidates, property.id);
}


/**
 * Cached read of `getRecentlySoldNearby` — "Recently Sold Nearby" remounts
 * on every detail visit, so reuse the 5-min property TTL (tagged on the
 * listing: `invalidatePropertyTags` clears it when the listing changes).
 */
export async function getRecentlySoldNearbyCached(
  property: Property,
  maxResults = 3
): Promise<Property[]> {
  const result = await getCachedOrFetch(
    buildCacheKey('properties', 'soldNearby', property.id, String(maxResults)),
    () => getRecentlySoldNearby(property, maxResults),
    PROPERTY_CACHE_TTL_MS,
    { tags: [`property:${property.id}`] }
  );
  return result.data;
}

/**
 * Cached read of `getSimilarProperties` — "Similar Listings" remounts on
 * every detail visit; same 5-min property-tagged TTL as above.
 */
export async function getSimilarPropertiesCached(
  property: Property
): Promise<Property[]> {
  const result = await getCachedOrFetch(
    buildCacheKey('properties', 'similar', property.id),
    () => getSimilarProperties(property),
    PROPERTY_CACHE_TTL_MS,
    { tags: [`property:${property.id}`] }
  );
  return result.data;
}
