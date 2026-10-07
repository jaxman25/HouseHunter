/**
 * Unit tests for the pure view-event guard used by the `countViewEvent`
 * trigger (functions/src/viewEventsGuard.ts).
 *
 * The guard decides whether a created
 * `properties/{id}/viewEvents/{uid}_{yyyy-mm-dd}` document may increment the
 * parent's `views`. Together with firestore.rules (create-only + the same
 * shape check against `request.auth.uid`) this caps counting at one +1 per
 * user per property per UTC day.
 *
 * Run via: npm test  (in functions/ — builds to lib/, then node --test)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { viewEventShouldCount } = require('../lib/viewEventsGuard');

/** Fixed event time → UTC day `2026-10-07`. */
const EVENT_TIME = '2026-10-07T12:34:56.789Z';
const UID = 'user-1';
const GOOD_ID = `${UID}_2026-10-07`;

describe('viewEventShouldCount', () => {
  test('accepts a well-formed id whose day matches the event time', () => {
    assert.deepEqual(viewEventShouldCount(GOOD_ID, UID, EVENT_TIME), {
      count: true,
    });
  });

  test('rejects a malformed id (missing/multiple underscores)', () => {
    for (const id of ['nounderscore', 'a_b_c_2026-10-07', '_2026-10-07', '']) {
      const verdict = viewEventShouldCount(id, UID, EVENT_TIME);
      assert.equal(verdict.count, false, `id "${id}" must not count`);
      assert.match(verdict.reason, /malformed event id/);
    }
  });

  test('rejects uids containing "_" (fail closed, matches rules split())', () => {
    const verdict = viewEventShouldCount('a_b_2026-10-07', 'a_b', EVENT_TIME);
    assert.equal(verdict.count, false);
    assert.match(verdict.reason, /malformed event id/);
  });

  test('rejects a non-YYYY-MM-DD date suffix', () => {
    for (const id of [
      `${UID}_today`,
      `${UID}_2026-1-7`,
      `${UID}_20261007`,
      `${UID}_2026-10-07T12:00Z`,
    ]) {
      const verdict = viewEventShouldCount(id, UID, EVENT_TIME);
      assert.equal(verdict.count, false, `id "${id}" must not count`);
    }
  });

  test('rejects an id whose day differs from the event day (forged future id)', () => {
    const verdict = viewEventShouldCount(`${UID}_2099-01-01`, UID, EVENT_TIME);
    assert.equal(verdict.count, false);
    assert.match(verdict.reason, /was not created on 2026-10-07/);
  });

  test('rejects a stale id from a previous day', () => {
    const verdict = viewEventShouldCount(`${UID}_2026-10-06`, UID, EVENT_TIME);
    assert.equal(verdict.count, false);
  });

  test('normalizes event-time offsets to UTC before extracting the day', () => {
    // 23:59 at +05:00 is still 2026-10-07 in UTC → id for Oct 7 counts.
    assert.equal(
      viewEventShouldCount(`${UID}_2026-10-07`, UID, '2026-10-07T23:59:59+05:00')
        .count,
      true
    );
    // 01:00 next day at +05:00 is 2026-10-07 in UTC → the Oct 8 id must NOT
    // count, and the Oct 7 id must.
    const justAfterMidnightLocal = '2026-10-08T01:00:00+05:00';
    assert.equal(
      viewEventShouldCount(`${UID}_2026-10-08`, UID, justAfterMidnightLocal)
        .count,
      false
    );
    assert.equal(
      viewEventShouldCount(`${UID}_2026-10-07`, UID, justAfterMidnightLocal)
        .count,
      true
    );
  });

  test('rejects a payload userId that does not match the id prefix', () => {
    const verdict = viewEventShouldCount(GOOD_ID, 'someone-else', EVENT_TIME);
    assert.equal(verdict.count, false);
    assert.match(verdict.reason, /does not match id uid/);
  });

  test('rejects a missing or non-string payload userId', () => {
    for (const bad of [undefined, null, 42, { uid: UID }]) {
      assert.equal(
        viewEventShouldCount(GOOD_ID, bad, EVENT_TIME).count,
        false,
        `payload ${JSON.stringify(bad)} must not count`
      );
    }
  });

  test('rejects an unparseable event time', () => {
    const verdict = viewEventShouldCount(GOOD_ID, UID, 'not-a-date');
    assert.equal(verdict.count, false);
    assert.match(verdict.reason, /unparseable event time/);
  });
});
