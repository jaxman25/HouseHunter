/**
 * Tracked Firestore access — the ONE place every service read/write should
 * flow through so Firestore billing can be attributed per collection.
 *
 * Thin pass-through wrappers around firebase/firestore that additionally
 * call trackRead/trackWrite (src/utils/monitoring/firestoreMetrics.ts).
 * Zero behavior change when metrics are disabled (the trackers no-op).
 *
 * Collection attribution:
 *  - Doc-based ops (getDoc/setDoc/updateDoc/addDoc/deleteDoc/batch) read the
 *    collection straight from the reference path — including subcollections
 *    (`users/{uid}/savedSearches` → `savedSearches`) — so services never
 *    restate it. Query-based ops (getDocs/onSnapshot) can't be derived from
 *    a query shape reliably, so they take the collection name explicitly.
 *  - Batch ops are attributed to their own collection as they are QUEUED,
 *    so a partially-filled batch that throws still accounts for the ops it
 *    attempted.
 *
 * Metrics-bookkeeping writes (the metrics doc itself) and admin reads of
 * the metrics docs use raw firestore/firestore imports to stay out of the
 * numbers they measure.
 */

import {
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  writeBatch as firestoreWriteBatch,
  type DocumentReference,
  type CollectionReference,
  type Query,
  type QuerySnapshot,
  type DocumentSnapshot,
  type SetOptions,
  type UpdateData,
  type WithFieldValue,
  type PartialWithFieldValue,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import {
  trackRead,
  trackWrite,
  sanitizeCollection,
} from '../monitoring/firestoreMetrics';
import { consumeReadBudget } from './readBudget';

/**
 * Gate + account one read. Order matters: the budget is consumed BEFORE the
 * read fires, so an over-budget user is rejected without spending more.
 * The consume call is a no-op (and never throws) when metrics are disabled.
 */
async function accountRead(collectionName: string, count = 1): Promise<void> {
  await consumeReadBudget(count);
  trackRead(collectionName, count);
}

/**
 * Last path segment = top-level collection; subcollections keep their own
 * name. Duck-typed on `.path` so both document and collection references
 * work without casts.
 */
function collectionOf(ref: { path: string }): string {
  return ref.path.split('/').pop() ?? 'unknown';
}

// ─── Reads ────────────────────────────────────────────────────────────────

export async function trackedGetDoc<T>(
  ref: DocumentReference<T>
): Promise<DocumentSnapshot<T>> {
  await accountRead(collectionOf(ref));
  return getDoc(ref);
}

export async function trackedGetDocs<T>(
  q: Query<T>,
  collectionName: string
): Promise<QuerySnapshot<T>> {
  // Per-read budget is spent here (1 doc minimum); the exact result size is
  // accounted after the query resolves.
  await accountRead(sanitizeCollection(collectionName));
  const snap = await getDocs(q);
  trackRead(sanitizeCollection(collectionName), Math.max(0, snap.size - 1));
  return snap;
}

export function trackedOnSnapshot<T>(
  q: Query<T>,
  collectionName: string,
  onNext: (snapshot: QuerySnapshot<T>) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const name = sanitizeCollection(collectionName);

  // Sync signature (the ~6 subscriber factories return this straight to
  // their callers as an unsubscribe fn), so the budget gate attaches the
  // listener only AFTER the check passes; over budget → onError fires and
  // nothing attaches. Each emission's docs are gated the same way — a user
  // who trips the cap mid-session stops receiving emissions.
  let unsubscribe: Unsubscribe | null = null;
  let cancelled = false;

  const gatedEmit = (snapshot: QuerySnapshot<T>): void => {
    void consumeReadBudget(snapshot.size)
      .then(() => {
        if (cancelled) return;
        trackRead(name, snapshot.size);
        onNext(snapshot);
      })
      .catch((error: Error) => onError?.(error));
  };

  void consumeReadBudget()
    .then(() => {
      if (cancelled) return;
      trackRead(name);
      unsubscribe = onSnapshot(q, gatedEmit, onError);
    })
    .catch((error: Error) => onError?.(error));

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

// ─── Writes ───────────────────────────────────────────────────────────────

export function trackedSetDoc<T>(
  ref: DocumentReference<T>,
  data: PartialWithFieldValue<T>,
  options?: SetOptions
): Promise<void> {
  trackWrite(collectionOf(ref));
  // Always pass an options object so the PartialWithFieldValue overload is
  // selected (an omitted third arg would demand WithFieldValue).
  return setDoc(ref, data, options ?? {});
}

export function trackedUpdateDoc(
  ref: DocumentReference<unknown>,
  data: UpdateData<unknown>
): Promise<void> {
  trackWrite(collectionOf(ref));
  return updateDoc(ref, data);
}

export function trackedAddDoc<T>(
  ref: CollectionReference<T>,
  data: WithFieldValue<T>
): Promise<DocumentReference<T>> {
  trackWrite(collectionOf(ref));
  return addDoc(ref, data);
}

export function trackedDeleteDoc(
  ref: DocumentReference<unknown>
): Promise<void> {
  trackWrite(collectionOf(ref));
  return deleteDoc(ref);
}

// ─── Batched writes ───────────────────────────────────────────────────────

export interface TrackedWriteBatch {
  set<T extends object>(
    documentRef: DocumentReference<T>,
    data: T,
    options?: SetOptions
  ): TrackedWriteBatch;
  update(
    documentRef: DocumentReference<unknown>,
    data: UpdateData<unknown>
  ): TrackedWriteBatch;
  delete(documentRef: DocumentReference<unknown>): TrackedWriteBatch;
  commit(): Promise<void>;
}

/**
 * Wraps WriteBatch so every queued op is attributed to its own collection
 * at queue time (a failed commit still accounts for what it attempted).
 */
export function trackedWriteBatch(): TrackedWriteBatch {
  const batch = firestoreWriteBatch(db);
  const queued = new Map<string, number>();

  const count = (ref: { path: string }): void => {
    const name = sanitizeCollection(collectionOf(ref));
    queued.set(name, (queued.get(name) ?? 0) + 1);
  };

  return {
    set(ref, data, options) {
      count(ref);
      if (options !== undefined) {
        batch.set(ref, data, options);
      } else {
        batch.set(ref, data);
      }
      return this;
    },
    update(ref, data) {
      count(ref);
      batch.update(ref, data);
      return this;
    },
    delete(ref) {
      count(ref);
      batch.delete(ref);
      return this;
    },
    commit() {
      for (const [name, ops] of queued) trackWrite(name, ops);
      queued.clear();
      return batch.commit();
    },
  };
}
