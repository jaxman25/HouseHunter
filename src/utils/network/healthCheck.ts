/**
 * Firebase service health checks.
 *
 * Pings Firestore with a bounded timeout so the app can detect a degraded
 * backend and surface a friendly state (e.g. "offline mode") instead of
 * failing silently. Storage and Auth health can be layered on later.
 */

import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { withTimeout, DEFAULT_TIMEOUT_MS } from './timeout';

export interface HealthStatus {
  healthy: boolean;
  /** Round-trip latency in ms, or null if the check failed. */
  latencyMs: number | null;
  /** Error message, or null when healthy. */
  error: string | null;
}

/**
 * Check whether Firestore is reachable by issuing a tiny bounded query.
 * A non-existent collection returns an empty snapshot, so this only fails when
 * the backend itself is unreachable or the rules deny the read.
 */
export async function checkFirebaseHealth(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    await withTimeout(
      getDocs(query(collection(db, 'healthcheck'), limit(1))),
      DEFAULT_TIMEOUT_MS,
      'Health check timed out'
    );
    return { healthy: true, latencyMs: Date.now() - start, error: null };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}