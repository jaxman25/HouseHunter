/**
 * Lightweight in-memory performance metrics.
 *
 * Tracks operation durations (name → samples) so the app can answer "how slow
 * is X right now?" without a backend: count, avg, p95, and max. Metrics live
 * only for the current session (bounded sample list per metric) — ship them to
 * Sentry via the `perfSpans` feature flag (breadcrumbs), or export a real
 * metrics pipeline (e.g. Firebase Analytics custom events) when that's wired.
 *
 * Instrument with `trackMetric(name, fn)` around the operation; the measured
 * time includes retries/backoff, i.e. the latency the user actually sees.
 */

import { isFeatureEnabled } from '../featureFlags';
import { addBreadcrumb, isSentryEnabled } from './sentry';

/** Cap samples per metric so memory stays bounded (drops oldest first). */
const MAX_SAMPLES_PER_METRIC = 500;

/** name → durations (ms), in call order. */
const metrics = new Map<string, number[]>();

/** Time a promise and record its duration under `name`. */
export async function trackMetric<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    reportMetric(name, Date.now() - start);
  }
}

/** Record a single duration sample for `name`. */
export function reportMetric(name: string, durationMs: number): void {
  let samples = metrics.get(name);
  if (!samples) {
    samples = [];
    metrics.set(name, samples);
  }
  samples.push(durationMs);
  if (samples.length > MAX_SAMPLES_PER_METRIC) {
    samples.shift();
  }

  if (isFeatureEnabled('perfSpans') && isSentryEnabled()) {
    addBreadcrumb({
      category: 'performance',
      message: name,
      data: { durationMs: Math.round(durationMs) },
    });
  }

  if (__DEV__ && isFeatureEnabled('devMetricsLog')) {
    console.debug(`[metric] ${name}: ${Math.round(durationMs)}ms`);
  }
}

export interface MetricSummary {
  count: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

/** Aggregate stats for one metric, or null when it has no samples. */
export function getMetricSummary(name: string): MetricSummary | null {
  const samples = metrics.get(name);
  if (!samples || samples.length === 0) return null;

  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);

  return {
    count: samples.length,
    avgMs: total / samples.length,
    p95Ms: sorted[p95Index],
    maxMs: sorted[sorted.length - 1],
  };
}

/** Snapshot of every tracked metric. */
export function getMetricsReport(): Record<string, MetricSummary> {
  const report: Record<string, MetricSummary> = {};
  for (const name of metrics.keys()) {
    const summary = getMetricSummary(name);
    if (summary) report[name] = summary;
  }
  return report;
}

/** Clear all samples (e.g. after logging the report, or on sign-out). */
export function resetMetrics(): void {
  metrics.clear();
}

/** Dev-only dump of the current report to the console. */
export function logMetricsReport(): void {
  if (!__DEV__) return;
  const report = getMetricsReport();
  if (Object.keys(report).length === 0) {
    console.log('[metrics] No samples recorded yet.');
    return;
  }
  console.log('[metrics] Performance report:');
  for (const [name, summary] of Object.entries(report)) {
    console.log(
      `  ${name}: n=${summary.count} avg=${Math.round(summary.avgMs)}ms ` +
        `p95=${Math.round(summary.p95Ms)}ms max=${Math.round(summary.maxMs)}ms`
    );
  }
}