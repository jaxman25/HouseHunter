/**
 * Unit tests for the pure config/metrics delta calculators
 * (functions/src/platformMetricsDelta.ts) used by the platformMetrics
 * triggers. The triggers turn before/after snapshot pairs into integer
 * field deltas; existence-only writes must yield an empty delta so they
 * never touch Firestore.
 *
 * Run via: npm test  (in functions/ — builds to lib/, then node --test)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  userMetricsDelta,
  propertyMetricsDelta,
  reportMetricsDelta,
} = require('../lib/platformMetricsDelta');

describe('userMetricsDelta', () => {
  test('create → users +1', () => {
    assert.deepEqual(
      userMetricsDelta({ exists: false }, { exists: true }),
      { users: 1 }
    );
  });

  test('delete → users −1', () => {
    assert.deepEqual(
      userMetricsDelta({ exists: true }, { exists: false }),
      { users: -1 }
    );
  });

  test('profile update (favorites, bio, …) → empty delta', () => {
    assert.deepEqual(
      userMetricsDelta({ exists: true }, { exists: true }),
      {}
    );
  });
});

describe('propertyMetricsDelta', () => {
  test('create → total +1 and the new status bucket +1', () => {
    assert.deepEqual(
      propertyMetricsDelta({ exists: false }, { exists: true, status: 'active' }),
      { properties: 1, propertiesActive: 1 }
    );
  });

  test('delete → total −1 and the old status bucket −1', () => {
    assert.deepEqual(
      propertyMetricsDelta({ exists: true, status: 'pending' }, { exists: false }),
      { properties: -1, propertiesPending: -1 }
    );
  });

  test('status move → one out of the old bucket, one into the new', () => {
    assert.deepEqual(
      propertyMetricsDelta(
        { exists: true, status: 'active' },
        { exists: true, status: 'sold' }
      ),
      { propertiesActive: -1, propertiesSold: 1 }
    );
  });

  test('rented shares the Sold/Rented bucket', () => {
    assert.deepEqual(
      propertyMetricsDelta(
        { exists: true, status: 'active' },
        { exists: true, status: 'rented' }
      ),
      { propertiesActive: -1, propertiesSold: 1 }
    );
  });

  test('metadata edit (no status change) → empty delta', () => {
    assert.deepEqual(
      propertyMetricsDelta(
        { exists: true, status: 'active' },
        { exists: true, status: 'active' }
      ),
      {}
    );
  });

  test('unknown status creates/deletes skip the bucket but still count totals', () => {
    assert.deepEqual(
      propertyMetricsDelta({ exists: false }, { exists: true, status: 'weird' }),
      { properties: 1 }
    );
    assert.deepEqual(
      propertyMetricsDelta({ exists: true, status: 'weird' }, { exists: false }),
      { properties: -1 }
    );
  });

  test('status removed (active → undefined) leaves the bucket but counts the doc', () => {
    // A legacy write clearing status still keeps the total honest; the
    // nightly sync reconciles buckets exactly.
    assert.deepEqual(
      propertyMetricsDelta(
        { exists: true, status: 'active' },
        { exists: true, status: undefined }
      ),
      { propertiesActive: -1 }
    );
  });
});

describe('reportMetricsDelta', () => {
  test('create → the report lands in its status bucket', () => {
    assert.deepEqual(
      reportMetricsDelta({ exists: false }, { exists: true, status: 'pending' }),
      { reportsPending: 1 }
    );
  });

  test('triage pending → resolved moves one between buckets', () => {
    assert.deepEqual(
      reportMetricsDelta(
        { exists: true, status: 'pending' },
        { exists: true, status: 'resolved' }
      ),
      { reportsPending: -1, reportsResolved: 1 }
    );
  });

  test('delete → leaves its bucket', () => {
    assert.deepEqual(
      reportMetricsDelta({ exists: true, status: 'dismissed' }, { exists: false }),
      { reportsDismissed: -1 }
    );
  });

  test('status-only report edits (notes) → empty delta', () => {
    assert.deepEqual(
      reportMetricsDelta(
        { exists: true, status: 'pending' },
        { exists: true, status: 'pending' }
      ),
      {}
    );
  });
});
