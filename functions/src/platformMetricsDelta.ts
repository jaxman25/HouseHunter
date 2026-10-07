/**
 * Pure delta calculators for the `config/metrics` maintained counters
 * (no Firebase imports — unit-tested in functions/test/platformMetrics.test.js).
 *
 * Each trigger on `users`, `properties`, or `admin_reports` translates a
 * before/after snapshot pair into integer field deltas which are then applied
 * with `FieldValue.increment` by platformMetrics.ts. Existence-only writes
 * (favorites toggles, profile edits, listing metadata edits) yield an empty
 * delta, so those triggers perform no Firestore writes at all.
 */

/** Field deltas for `config/metrics` (field name → integer change). */
export type MetricsDelta = Record<string, number>;

export interface SnapshotInfo {
  exists: boolean;
  /** Primary field read from the snapshot (status for properties/reports). */
  status?: string;
}

/** Add `delta` to `field` only when non-zero. */
function bump(delta: MetricsDelta, field: string, change: number): void {
  if (change === 0) return;
  delta[field] = (delta[field] ?? 0) + change;
}

/** users/{uid} — total user accounts (create/delete only). */
export function userMetricsDelta(
  before: SnapshotInfo,
  after: SnapshotInfo
): MetricsDelta {
  const delta: MetricsDelta = {};
  bump(delta, 'users', (after.exists ? 1 : 0) - (before.exists ? 1 : 0));
  return delta;
}

/**
 * Property status → config/metrics bucket field. `sold` and `rented` share
 * one bucket (AnalyticsScreen renders them as a single "Sold/Rented" bar).
 */
export const PROPERTY_STATUS_FIELDS: Record<string, string> = {
  active: 'propertiesActive',
  pending: 'propertiesPending',
  sold: 'propertiesSold',
  rented: 'propertiesSold',
  inactive: 'propertiesInactive',
};

/** admin_reports status → config/metrics bucket field. */
export const REPORT_STATUS_FIELDS: Record<string, string> = {
  pending: 'reportsPending',
  dismissed: 'reportsDismissed',
  resolved: 'reportsResolved',
};

/**
 * properties/{id} — total count plus per-status buckets. Handles create,
 * delete, and status transitions; every other write yields `{}`.
 */
export function propertyMetricsDelta(
  before: SnapshotInfo,
  after: SnapshotInfo
): MetricsDelta {
  const delta: MetricsDelta = {};
  bump(delta, 'properties', (after.exists ? 1 : 0) - (before.exists ? 1 : 0));

  if (!before.exists && after.exists) {
    // Create: land in the new doc's status bucket.
    const field = after.status ? PROPERTY_STATUS_FIELDS[after.status] : undefined;
    if (field) bump(delta, field, 1);
  } else if (before.exists && !after.exists) {
    // Delete: leave the old doc's status bucket.
    const field = before.status ? PROPERTY_STATUS_FIELDS[before.status] : undefined;
    if (field) bump(delta, field, -1);
  } else if (before.exists && after.exists && before.status !== after.status) {
    // Status transition: move one from the old bucket to the new one.
    const from = before.status ? PROPERTY_STATUS_FIELDS[before.status] : undefined;
    const to = after.status ? PROPERTY_STATUS_FIELDS[after.status] : undefined;
    if (from) bump(delta, from, -1);
    if (to) bump(delta, to, 1);
  }
  return delta;
}

/**
 * admin_reports/{id} — per-status buckets only (no total-report card exists).
 * Handles create, delete, and status triage; other writes yield `{}`.
 */
export function reportMetricsDelta(
  before: SnapshotInfo,
  after: SnapshotInfo
): MetricsDelta {
  const delta: MetricsDelta = {};
  if (!before.exists && after.exists) {
    const field = after.status ? REPORT_STATUS_FIELDS[after.status] : undefined;
    if (field) bump(delta, field, 1);
  } else if (before.exists && !after.exists) {
    const field = before.status ? REPORT_STATUS_FIELDS[before.status] : undefined;
    if (field) bump(delta, field, -1);
  } else if (before.exists && after.exists && before.status !== after.status) {
    const from = before.status ? REPORT_STATUS_FIELDS[before.status] : undefined;
    const to = after.status ? REPORT_STATUS_FIELDS[after.status] : undefined;
    if (from) bump(delta, from, -1);
    if (to) bump(delta, to, 1);
  }
  return delta;
}
