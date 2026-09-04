/**
 * Feature flags — build-time switches driven by `.env` (`EXPO_PUBLIC_*` keys
 * are inlined by Expo). Each flag has a stable name, an env var, and a default,
 * so behavior can be flipped per build (dev/staging/prod) without code changes.
 *
 * Keep flags short-lived: add a flag when a feature is risky/experimental,
 * default it ON once it's proven, and remove the flag entirely when the
 * feature becomes permanent.
 *
 * For runtime (no-rebuild) flag changes in production, move these to
 * Firebase Remote Config — the API below is the seam to swap out.
 */

interface FlagDefinition {
  /** Env var read at build time (empty/missing → defaultValue). */
  envVar: string;
  defaultValue: boolean;
  description: string;
}

export const FEATURE_FLAGS: Record<string, FlagDefinition> = {
  /**
   * Emit performance samples to Sentry breadcrumbs (see metrics.ts). Useful
   * when triaging latency issues; noise otherwise. Requires a Sentry DSN.
   */
  perfSpans: {
    envVar: 'EXPO_PUBLIC_ENABLE_PERF_SPANS',
    defaultValue: false,
    description: 'Record performance metric samples as Sentry breadcrumbs',
  },
  /**
   * Dev-only: print each recorded metric to the console. Defaults ON so local
   * development surfaces latency without extra setup; disable to silence.
   */
  devMetricsLog: {
    envVar: 'EXPO_PUBLIC_ENABLE_DEV_METRICS_LOG',
    defaultValue: true,
    description: 'Log performance metrics to the console in development',
  },
};

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;

/**
 * Whether a feature flag is enabled. Missing/empty env value falls back to the
 * flag's default; accepts "1", "true", "yes", "on" (case-insensitive).
 */
export function isFeatureEnabled(name: FeatureFlagName): boolean {
  const flag = FEATURE_FLAGS[name];
  if (!flag) return false;

  const raw = process.env[flag.envVar];
  if (raw === undefined || raw.trim() === '') return flag.defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}