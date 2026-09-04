/**
 * Unit tests for the transactional email channel (functions/src/email.ts).
 *
 * Runs with Node's built-in test runner against the compiled `lib/` output
 * (build first): `npm test`. No test framework dependency.
 *
 * Coverage:
 *   - sendEmail: request shape (URL, method, auth header, JSON body), HTML
 *     escaping, missing-key failure, non-2xx failure.
 *   - buildDeletionConfirmationMessage: subject + recipient wiring.
 *   - formatSecurityAlertText: severity/title/body/source rendering.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  sendEmail,
  buildDeletionConfirmationMessage,
  formatSecurityAlertText,
} = require('../lib/email');

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.NOTIFICATION_FROM_EMAIL;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

/** Install a fetch stub that records the call and returns `response`. */
function stubFetch(response) {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return response;
  };
  return () => captured;
}

const okResponse = {
  ok: true,
  status: 200,
  text: async () => '',
};

test('sendEmail posts the Resend payload with an auth header and HTML body', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.NOTIFICATION_FROM_EMAIL = 'House Hunter <no-reply@househunter.com>';
  const getCaptured = stubFetch(okResponse);

  await sendEmail({
    to: 'user@example.com',
    subject: 'Test subject',
    text: 'First paragraph.\n\nSecond & <line>.',
  });

  const { url, init } = getCaptured();
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer re_test_key');
  assert.equal(init.headers['Content-Type'], 'application/json');

  const body = JSON.parse(init.body);
  assert.equal(body.from, 'House Hunter <no-reply@househunter.com>');
  assert.deepEqual(body.to, ['user@example.com']);
  assert.equal(body.subject, 'Test subject');
  assert.equal(body.text, 'First paragraph.\n\nSecond & <line>.');
  // HTML wrapper escapes markup but keeps paragraph breaks.
  assert.match(body.html, /Second &amp; &lt;line&gt;/);
  assert.match(body.html, /House Hunter/);
  assert.doesNotMatch(body.html, /Second & <line>/);
});

test('sendEmail normalizes a recipient array', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  const getCaptured = stubFetch(okResponse);

  await sendEmail({ to: ['a@x.com', 'b@x.com'], subject: 'S', text: 'T' });
  const { init } = getCaptured();
  assert.deepEqual(JSON.parse(init.body).to, ['a@x.com', 'b@x.com']);
});

test('sendEmail throws when RESEND_API_KEY is missing', async () => {
  const getCaptured = stubFetch(okResponse);
  await assert.rejects(
    sendEmail({ to: 'user@example.com', subject: 'S', text: 'T' }),
    /RESEND_API_KEY is not set/
  );
  assert.equal(getCaptured(), undefined); // no request was made
});

test('sendEmail throws with the API detail on a non-2xx response', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  stubFetch({ ok: false, status: 422, text: async () => 'missing from address' });

  await assert.rejects(
    sendEmail({ to: 'user@example.com', subject: 'S', text: 'T' }),
    /Resend request failed \(422\): missing from address/
  );
});

test('buildDeletionConfirmationMessage wires the recipient and subject', () => {
  const message = buildDeletionConfirmationMessage('user@example.com');
  assert.equal(message.to, 'user@example.com');
  assert.equal(message.subject, 'Your House Hunter account has been deleted');
  assert.match(message.text, /permanently deleted/);
  assert.match(message.text, /support@househunter\.com/);
});

test('formatSecurityAlertText renders severity, title, body, and source', () => {
  const text = formatSecurityAlertText({
    severity: 'high',
    title: 'Repeated failed sign-ins',
    body: 'Spike detected.',
    source: 'Sentry alert',
  });
  assert.match(text, /\[HIGH\] Repeated failed sign-ins/);
  assert.match(text, /Spike detected\./);
  assert.match(text, /Source: Sentry alert/);
  assert.match(text, /BREACH_NOTIFICATION\.md/);
});

test('formatSecurityAlertText falls back when fields are absent', () => {
  const text = formatSecurityAlertText({});
  assert.match(text, /\[UNKNOWN\] Security alert/);
  assert.match(text, /No details provided\./);
});