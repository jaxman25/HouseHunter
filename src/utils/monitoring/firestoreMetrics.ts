/**
 * Firestore read/write accounting — identifies the top cost drivers.
 *
 * `tracked*` wrappers (src/utils/firestore/tracked.ts) feed every Firestore
 * read/write through trackRead/trackWrite. Counts accumulate in memory keyed
 * by collection + operation, and flush every 60s into a SINGLE shared doc
 * `metrics/{yyyy-mm-dd}` using one batched set with increment() ops — the
 * atomic-counter pattern, so N devices can merge into the same doc without
 * lost updates and the whole flush costs ONE write per device per minute.
 *
 * Doc shape:
 *   {
 *     reads:   { properties: 412, messages: 37, ... },   // increment deltas
 *     writes:  { properties: 12, notifications: 3, ... },
 *     updatedAt: serverTimestamp()
 *   }
 *
 * Gated behind EXPO_PUBLIC_METRICS_ENABLED: when unset, trackRead/trackWrite
 * are no-ops and no timer ever runs — zero behavioral change in prod until
 * deliberately enabled. Reads of the metrics doc itself are NOT tracked
 * (the admin screen uses raw Firestore access to avoid recursion).
 */

import { AppState, AppStateStatus } from 'react-native';
import { doc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { env } from '../env';

const METRICS_COLLECTION = 'metrics';
const FLUSH_INTERVAL_MS = 60_000;

/** Set EXPO_PUBLIC_METRICS_ENABLED=true in .env to start accounting. */
export const METRICS_ENABLED = env.EXPO_PUBLIC_METRICS_ENABLED === 'true';

type Op = 'reads' | 'writes';

/** op:collection → pending count, drained on each flush. */
const buffer = new Map<string, number>();

let flushTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let warnedWriteFailure = false;

/** Collection names become field-path segments — keep them rule-safe. */
export function sanitizeCollection(collectionName: string): string {
  return collectionName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
}

export function trackRead(collectionName: string, count = 1): void {
  track('reads', collectionName, count);
}

export function trackWrite(collectionName: string, count = 1): void {
  track('writes', collectionName, count);
}

function track(op: Op, collectionName: string, count: number): void {
  if (!METRICS_ENABLED || count <= 0) return;
  const key = `${op}:${sanitizeCollection(collectionName)}`;
  buffer.set(key, (buffer.get(key) ?? 0) + count);
  startFlusher();
}

/**
 * Drain the buffer into plain `{ 'reads.properties': 3, ... }` deltas.
 * Pure (takes the map as an argument) so the flush math is unit-testable;
 * the live caller passes the module buffer, which is cleared as part of
 * the drain.
 */
export function drainCounters(
  source: Map<string, number>
): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const [key, count] of source) {
    if (count <= 0) continue;
    deltas[key] = (deltas[key] ?? 0) + count;
  }
  source.clear();
  return deltas;
}

/**
 * Map `op:collection` deltas to Firestore field paths for the metrics doc.
 * Pure — the flush wraps the values in increment() before writing.
 */
export function buildFlushFields(
  deltas: Record<string, number>
): Record<string, number> {
  const fields: Record<string, number> = {};
  for (const [key, count] of Object.entries(deltas)) {
    const [op, collection] = key.split(':');
    if ((op !== 'reads' && op !== 'writes') || !collection) continue;
    fields[`${op}.${sanitizeCollection(collection)}`] =
      (fields[`${op}.${sanitizeCollection(collection)}`] ?? 0) + count;
  }
  return fields;
}

/** Local-date doc id, `metrics/{yyyy-mm-dd}`. */
export function metricsDocIdFor(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Push the pending counters to Firestore. Cheap no-op when nothing buffered. */
export async function flushFirestoreMetrics(): Promise<void> {
  if (!METRICS_ENABLED) return;
  const deltas = drainCounters(buffer);
  const fields = buildFlushFields(deltas);
  if (Object.keys(fields).length === 0) return;

  const incrementFields: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(fields)) {
    incrementFields[path] = increment(value);
  }

  try {
    // ONE batched set with increment ops → ONE write, merge-safe across
    // devices. The metrics doc is intentionally NOT tracked itself.
    const batch = writeBatch(db);
    batch.set(doc(db, METRICS_COLLECTION, metricsDocIdFor(new Date())), {
      ...incrementFields,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  } catch (error) {
    // Rules not deployed yet, offline, etc. Drop the batch (don't retry
    // forever) but keep the process alive — metrics must never break the app.
    if (!warnedWriteFailure) {
      warnedWriteFailure = true;
      console.warn('[firestoreMetrics] flush failed; dropping batch:', error);
    }
  }
}

function startFlusher(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushFirestoreMetrics();
  }, FLUSH_INTERVAL_MS);

  // App backgrounding can precede process death — flush what's pending.
  appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state !== 'active') void flushFirestoreMetrics();
  });
}

/** Test/teardown hook — stops the flusher and clears pending counters. */
export function stopFirestoreMetrics(): void {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  appStateSub?.remove();
  appStateSub = null;
  buffer.clear();
}
