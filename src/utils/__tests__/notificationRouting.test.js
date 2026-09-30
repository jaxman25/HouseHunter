/**
 * Unit tests for notification tap routing (mirrors
 * src/utils/notificationRouting.ts).
 *
 * Run with: node src/utils/__tests__/notificationRouting.test.js
 * Same mirror pattern as the other suites — the routing table is
 * re-implemented here so the test has no TS/React Navigation dependencies.
 * The mirrored cases pin the destination for every payload shape the app
 * emits, including the cases where the old push-tap switch DRIFTED from the
 * in-app one (price drops and favorites landed on MainTabs instead of the
 * property).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Mirror of routeNotificationData (src/utils/notificationRouting.ts) ────

function routeNotificationData(data, navigate) {
  const payload = data ?? {};
  switch (payload.type) {
    case 'user_review': {
      if (payload.revieweeId) {
        navigate('WriteUserReview', {
          revieweeId: payload.revieweeId,
          revieweeName: payload.revieweeName,
          tourId: payload.tourId,
          propertyId: payload.propertyId,
        });
        return 'WriteUserReview';
      }
      break;
    }
    case 'new_listing': {
      if (payload.savedSearchId) {
        navigate('SavedSearches', { savedSearchId: payload.savedSearchId });
        return 'SavedSearches';
      }
      break;
    }
    case 'price_drop':
    case 'favorite': {
      if (payload.propertyId) {
        navigate('PropertyDetail', { propertyId: payload.propertyId });
        return 'PropertyDetail';
      }
      break;
    }
    case 'message':
      navigate('Conversations');
      return 'Conversations';
    default:
      break;
  }
  if (payload.type === 'tour' || payload.tourId) {
    navigate('Tours');
    return 'Tours';
  }
  navigate('MainTabs');
  return 'MainTabs';
}

/** Harness: routes a payload and records every navigate call. */
function route(data) {
  const calls = [];
  const result = routeNotificationData(data, (route, params) =>
    calls.push({ route, params })
  );
  return { result, calls };
}

// ── Specific destinations ─────────────────────────────────────────────────

describe('specific destinations', () => {
  test('user_review with revieweeId opens the review form with full params', () => {
    const { result, calls } = route({
      type: 'user_review',
      revieweeId: 'u2',
      revieweeName: 'Jane',
      tourId: 't1',
      propertyId: 'p1',
    });
    assert.equal(result, 'WriteUserReview');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      route: 'WriteUserReview',
      params: { revieweeId: 'u2', revieweeName: 'Jane', tourId: 't1', propertyId: 'p1' },
    });
  });

  test('new_listing with savedSearchId opens SavedSearches', () => {
    const { result, calls } = route({ type: 'new_listing', savedSearchId: 's1' });
    assert.equal(result, 'SavedSearches');
    assert.deepEqual(calls, [{ route: 'SavedSearches', params: { savedSearchId: 's1' } }]);
  });

  test('price_drop with propertyId opens the property (push-tap drift fixed)', () => {
    const { result, calls } = route({ type: 'price_drop', propertyId: 'p1' });
    assert.equal(result, 'PropertyDetail');
    assert.deepEqual(calls, [{ route: 'PropertyDetail', params: { propertyId: 'p1' } }]);
  });

  test('favorite with propertyId opens the property (push-tap drift fixed)', () => {
    const { result, calls } = route({ type: 'favorite', propertyId: 'p1' });
    assert.equal(result, 'PropertyDetail');
    assert.deepEqual(calls, [{ route: 'PropertyDetail', params: { propertyId: 'p1' } }]);
  });

  test('message opens the conversations list', () => {
    const { result, calls } = route({ type: 'message' });
    assert.equal(result, 'Conversations');
    assert.deepEqual(calls, [{ route: 'Conversations', params: undefined }]);
  });
});

// ── Fallbacks ─────────────────────────────────────────────────────────────

describe('fallbacks', () => {
  test('tour-type system notifications open Tours', () => {
    const { result, calls } = route({ type: 'system', tourId: 't1' });
    assert.equal(result, 'Tours');
    assert.deepEqual(calls, [{ route: 'Tours', params: undefined }]);
  });

  test('generic inquiry without ids falls back to MainTabs', () => {
    const { result, calls } = route({ type: 'inquiry' });
    assert.equal(result, 'MainTabs');
    assert.deepEqual(calls, [{ route: 'MainTabs', params: undefined }]);
  });

  test('unknown type falls back to MainTabs', () => {
    const { result, calls } = route({ type: 'mystery' });
    assert.equal(result, 'MainTabs');
    assert.deepEqual(calls, [{ route: 'MainTabs', params: undefined }]);
  });

  test('user_review WITHOUT revieweeId falls through to MainTabs', () => {
    const { result, calls } = route({ type: 'user_review' });
    assert.equal(result, 'MainTabs');
    assert.equal(calls.length, 1);
  });

  test('new_listing WITHOUT savedSearchId falls through to MainTabs', () => {
    const { result, calls } = route({ type: 'new_listing' });
    assert.equal(result, 'MainTabs');
    assert.equal(calls.length, 1);
  });

  test('price_drop WITHOUT propertyId falls through to MainTabs', () => {
    const { result, calls } = route({ type: 'price_drop' });
    assert.equal(result, 'MainTabs');
    assert.equal(calls.length, 1);
  });
});

// ── Robustness ────────────────────────────────────────────────────────────

describe('robustness', () => {
  test('undefined data navigates to MainTabs without throwing', () => {
    const { result, calls } = route(undefined);
    assert.equal(result, 'MainTabs');
    assert.deepEqual(calls, [{ route: 'MainTabs', params: undefined }]);
  });

  test('empty payload navigates to MainTabs without throwing', () => {
    const { result } = route({});
    assert.equal(result, 'MainTabs');
  });

  test('exactly one navigate call per route decision', () => {
    for (const data of [
      { type: 'message' },
      { type: 'favorite', propertyId: 'p' },
      { type: 'system', tourId: 't' },
      {},
    ]) {
      const { calls } = route(data);
      assert.equal(calls.length, 1, `one call for ${JSON.stringify(data)}`);
    }
  });
});
