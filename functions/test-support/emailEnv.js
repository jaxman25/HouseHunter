/**
 * Shared email-channel environment setup (functions/src/email.ts).
 *
 * `sendEmail` requires BOTH `RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL`, and
 * throws before issuing a request when either is missing. A test that forgets
 * to set them fails with a config error instead of exercising the behaviour it
 * was written for, so set up the environment through these helpers rather than
 * assigning `process.env` by hand:
 *
 *   const { setEmailEnv } = require('../test-support/emailEnv');
 *   beforeEach(() => setEmailEnv());
 *
 *   setEmailEnv({ RESEND_API_KEY: null });        // missing-key case
 *   setEmailEnv({ NOTIFICATION_FROM_EMAIL: null }); // missing-sender case
 */

/** Valid placeholder values for every env var the email channel reads. */
const EMAIL_ENV_DEFAULTS = {
  RESEND_API_KEY: 're_test_key',
  NOTIFICATION_FROM_EMAIL: 'House Hunter <no-reply@househunter.com>',
};

/** Remove every env var the email channel reads. */
function clearEmailEnv() {
  for (const key of Object.keys(EMAIL_ENV_DEFAULTS)) {
    delete process.env[key];
  }
}

/**
 * Reset the email env vars to valid defaults, then apply `overrides`.
 * Pass `null` for a key to leave it unset (for missing-config tests).
 */
function setEmailEnv(overrides = {}) {
  clearEmailEnv();
  for (const [key, value] of Object.entries({ ...EMAIL_ENV_DEFAULTS, ...overrides })) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

module.exports = { EMAIL_ENV_DEFAULTS, clearEmailEnv, setEmailEnv };
