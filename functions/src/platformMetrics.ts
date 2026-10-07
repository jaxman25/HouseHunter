/**
 * House Hunter — platform metrics maintained in `config/metrics`.
 *
 * The admin dashboard/analytics screens used to run client-side
 * `getCountFromServer` aggregation queries per metric. Those are replaced by
 * ONE document, `config/metrics`, kept up to date by these Cloud Function
 * triggers (eventually consistent) and reconciled to exact values nightly:
 *
 *   platformMetricsOnUser     — users            (create/delete)
 *   platformMetricsOnProperty — properties +     (create/delete/status move)
 *                               propertiesActive/Pending/Sold/Inactive
 *   platformMetricsOnReport   — reportsPending/  (create/delete/status
 *                               Dismissed/Resolved  triage)
 *   syncPlatformMetrics       — nightly 04:00 UTC exact recount (bootstrap
 *                               + drift correction if a trigger event is
 *                               ever missed)
 *
 * Rules (firestore.rules): `config/metrics` is admin-read-only and
 * client-write DENIED — only the Admin SDK writes it.
 *
 * Deltas are computed by the pure helpers in platformMetricsDelta.ts
 * (unit-tested); existence-only writes produce an empty delta and are
 * dropped before any Firestore write happens.
 *
 * Deploy with: firebase deploy --only functions
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  userMetricsDelta,
  propertyMetricsDelta,
  reportMetricsDelta,
  type MetricsDelta,
} from './platformMetricsDelta';

const db = getFirestore();

/** Single maintained metrics doc (path mirrored in src/utils/constants.ts). */
const METRICS_PATH = 'config/metrics';

/**
 * Apply integer deltas with `increment` (merge-set): creates the doc when
 * missing and never clobbers fields this event doesn't touch. No-op deltas
 * are dropped so existence-only writes cost zero Firestore operations.
 */
async function bumpMetrics(delta: MetricsDelta): Promise<void> {
  const entries = Object.entries(delta).filter(([, change]) => change !== 0);
  if (entries.length === 0) return;
  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  for (const [field, change] of entries) {
    payload[field] = FieldValue.increment(change);
  }
  await db.doc(METRICS_PATH).set(payload, { merge: true });
}

function info(snap: { exists: boolean; get(field: string): unknown }) {
  return {
    exists: snap.exists,
    status: snap.exists ? (snap.get('status') as string | undefined) : undefined,
  };
}

/** users/{uid} — total accounts. */
export const platformMetricsOnUser = onDocumentWritten(
  'users/{uid}',
  async (event) => {
    const change = event.data;
    if (!change) return;
    await bumpMetrics(
      userMetricsDelta(info(change.before), info(change.after))
    );
  }
);

/** properties/{id} — total + status buckets. */
export const platformMetricsOnProperty = onDocumentWritten(
  'properties/{propertyId}',
  async (event) => {
    const change = event.data;
    if (!change) return;
    await bumpMetrics(
      propertyMetricsDelta(info(change.before), info(change.after))
    );
  }
);

/** admin_reports/{id} — status buckets (pending/dismissed/resolved). */
export const platformMetricsOnReport = onDocumentWritten(
  'admin_reports/{reportId}',
  async (event) => {
    const change = event.data;
    if (!change) return;
    await bumpMetrics(reportMetricsDelta(info(change.before), info(change.after)));
  }
);

/**
 * Nightly reconcile (04:00 UTC) — exact recount of every field, written with
 * a full overwrite so any drift from a missed trigger event self-heals, and
 * the doc is bootstrapped correctly on the first run after deploy. Server-side
 * aggregation only (Admin SDK `count()`), never a client query.
 */
export const syncPlatformMetrics = onSchedule('0 4 * * *', async () => {
  const count = (q: FirebaseFirestore.Query) => q.count().get().then((s) => s.data().count);
  const properties = db.collection('properties');
  const reports = db.collection('admin_reports');

  const [users, propertiesTotal, active, pending, soldRented, inactive,
    reportsPending, reportsDismissed, reportsResolved] = await Promise.all([
    count(db.collection('users')),
    count(properties),
    count(properties.where('status', '==', 'active')),
    count(properties.where('status', '==', 'pending')),
    count(properties.where('status', 'in', ['sold', 'rented'])),
    count(properties.where('status', '==', 'inactive')),
    count(reports.where('status', '==', 'pending')),
    count(reports.where('status', '==', 'dismissed')),
    count(reports.where('status', '==', 'resolved')),
  ]);

  await db.doc(METRICS_PATH).set({
    users,
    properties: propertiesTotal,
    propertiesActive: active,
    propertiesPending: pending,
    propertiesSold: soldRented,
    propertiesInactive: inactive,
    reportsPending,
    reportsDismissed,
    reportsResolved,
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log('[syncPlatformMetrics] reconciled', METRICS_PATH);
});
