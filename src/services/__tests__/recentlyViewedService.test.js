/**
 * Unit tests for recentlyViewedService view-count debounce.
 *
 * `shouldCountView(propertyId)` records whether the current user may fire a
 * view increment for `propertyId`. The client-side view counter is
 * server-side (Firestore `properties/{id}/viewEvents/{uid}_{yyyy-mm-dd}`
 * create-only, incremented by a Cloud Function), so this module is the
 * client-side guard: a view is only counted once per user per property per
 * 24h window.
 *
 * Run with: node --test src/services/__tests__/recentlyViewedService.test.js
 *
 * @note Requires `@babel/core` (a devDependency of the functions package) to
 *       transpile the TypeScript service under Node's built-in test runner,
 *       which has no bundler.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ── Load the TypeScript service through the babel shim ─────────────────────
const { loadService, installShim, MemoryAsyncStorage } = require('./run_view_test');

let testStorage = new MemoryAsyncStorage();

/**
 * Replace the service's AsyncStorage singleton with the in-memory shim and
 * re-resolve the service export. Node's module cache means the real module
 * (and our shim) reference the same object, so the shim is patched at the
 * require() cache entry so the service reads it.
 */
function resetStorage() {
  return loadService();
}

beforeEach(() => {
  testStorage = new MemoryAsyncStorage();
  installShim(testStorage);
  resetStorage();
});

afterEach(() => {});

// ── shouldCountView ────────────────────────────────────────────────────────

describe('shouldCountView', () => {
  test('returns true when the view-count record is missing', async () => {
    const service = resetStorage();
    const result = await service.shouldCountView('prop_1');
    assert.equal(result, true);
  });

  test('returns true when the record is older than 24h (view may be counted again)', async () => {
    const service = resetStorage();
    const now = Date.now();
    testStorage.store.set('viewCounted:prop_1', String(now - 25 * 60 * 60 * 1000));
    const result = await service.shouldCountView('prop_1', now);
    assert.equal(result, true);
  });

  test('returns false when the record is within the last 24h (view suppressed)', async () => {
    const service = resetStorage();
    const now = Date.now();
    testStorage.store.set('viewCounted:prop_1', String(now - 1 * 60 * 60 * 1000));
    const result = await service.shouldCountView('prop_1', now);
    assert.equal(result, false);
  });

  test('returns true when the record is exactly 24h old (boundary)', async () => {
    const service = resetStorage();
    const now = Date.now();
    testStorage.store.set('viewCounted:prop_1', String(now - 24 * 60 * 60 * 1000));
    const result = await service.shouldCountView('prop_1', now);
    assert.equal(result, true);
  });

  test('stores a fresh timestamp when the view is counted', async () => {
    const service = resetStorage();
    const now = Date.now();
    const result = await service.shouldCountView('prop_1', now);
    assert.equal(result, true);
    // The caller then records the view so the 24h window is keyed on the
    // view hit, not on storage.
    await service.markViewCounted('prop_1', now + 1000);
    const stored = testStorage.store.get('viewCounted:prop_1');
    assert.ok(stored !== undefined, 'markViewCounted should write the entry');
    assert.ok(Number(stored) >= now, 'stored timestamp should be recent');
  });

  test('markViewCounted writes a timestamp keyed on the property id', async () => {
    const service = resetStorage();
    const now = Date.now();
    await service.markViewCounted('prop_2', now + 5000);
    const stored = testStorage.store.get('viewCounted:prop_2');
    assert.ok(stored !== undefined);
    assert.ok(Number.isFinite(Number(stored)));
    assert.equal(testStorage.store.has('viewCounted:prop_1'), false);
  });

  test('markViewCounted does nothing for an empty id', async () => {
    const service = resetStorage();
    const now = Date.now();
    await service.markViewCounted('', now);
    assert.equal(testStorage.store.has('viewCounted:'), false);
  });

  test('shouldCountView returns false right after markViewCounted (suppressed)', async () => {
    const service = resetStorage();
    const now = Date.now();
    await service.markViewCounted('prop_1', now);
    const result = await service.shouldCountView('prop_1', now);
    assert.equal(result, false);
  });

  test('shouldCountView returns true again after the 24h window elapses', async () => {
    const service = resetStorage();
    const now = Date.now();
    await service.markViewCounted('prop_1', now);
    const t0 = Number(testStorage.store.get('viewCounted:prop_1'));
    // Simulate the clock advancing past 24h by passing an injected now.
    const result = await service.shouldCountView('prop_1', t0 + 24 * 60 * 60 * 1000 + 1);
    assert.equal(result, true);
  });
});
