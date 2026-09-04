/**
 * Environment variable validation.
 *
 * All configuration flows through `.env` (`EXPO_PUBLIC_*` keys, inlined by
 * Expo at build time). This module checks the variables the app cannot run
 * without and fails fast in production builds so a misconfigured release is
 * caught at startup instead of surfacing as confusing Firebase errors later.
 */

/** Firebase variables the app cannot function without. */
export const REQUIRED_ENV_VARS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

/** Optional-but-recommended variables (reported as warnings only). */
export const OPTIONAL_ENV_VARS = [
  'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID',
  'EXPO_PUBLIC_SENTRY_DSN',
] as const;

/** Names of the missing required variables, if any. */
export function getMissingEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter(
    (key) => !process.env[key] || process.env[key]!.includes('your-')
  );
}

/**
 * Validate the environment. Call once at app startup (before Firebase init).
 *
 * Behavior:
 *  - Development: logs a clear warning listing missing keys (build can continue
 *    while you fill in `.env`).
 *  - Production: throws, failing fast on a misconfigured build.
 *
 * @returns `true` if all required variables are present.
 */
export function validateEnv(): boolean {
  const missing = getMissingEnvVars();
  if (missing.length === 0) return true;

  const message =
    `Missing environment variables: ${missing.join(', ')}. ` +
    'Copy .env.example to .env and fill in the values.';

  if (__DEV__) {
    console.warn(`[env] ${message}`);
    return false;
  }
  throw new Error(`[env] ${message}`);
}