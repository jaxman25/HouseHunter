# Production Readiness Plan — House Hunter

Implementation plans for **Phase 2–5**. Phase 1 (retry/backoff, caching, error
boundaries, timeouts, circuit breaker) is already implemented in `src/utils/`
and wired into the service layer — see the [Phase 1 summary](#phase-1-done) at
the bottom.

> **Stack note:** this project runs **Expo SDK 57 / React Native 0.86 / Firebase 12
> (modular v9+ API)**, not SDK 51 / Firebase v10. Package installs below use
> `npm install --legacy-peer-deps`.

---

## Phase 2 — Performance Optimization

### 2.1 Firestore query optimization

**Status: mostly done — field masks are BLOCKED by the SDK.**

| Item | Status | Action |
|---|---|---|
| Batch reads (avoid N+1) | ✅ `getPropertiesByIds()` chunks `in` queries by 30 | Done |
| Pagination | ✅ `getProperties(filter, pageSize, lastDoc)` + `startAfter`; ExploreScreen now loads more on scroll (`onEndReached`) | Done |
| Field masks (`select()`) | ⛔ **Not available in the installed SDK** | See note below |
| Indexed fields | ✅ `firestore.indexes.json` covers every composite query | Add a CI check that new queries are covered (see 5.1) |

> **Field masks — SDK constraint (verified Sep 2026):** `select()` is not
> exported by `firebase/firestore` **or** `firebase/firestore/lite` in firebase
> 12.18.0 (the current latest) — `QueryConstraintType` has no `select` member
> and no projection API exists in the public types. Server-side projections
> currently live only behind the `eap-firestore-pipelines` pre-release. Revisit
> when field-mask support lands on a stable release; until then, keep list
> queries lean via the Phase 1 cache (page 1) + pagination above. (If it does
> become available: mask card-level fields — `title, price, images, city,
> status, latitude, longitude, bedrooms, bathrooms, area` — in
> `fetchPropertiesPage()` and `getPropertiesByIds()`, and note that
> `getUserProperties()` must stay full because `MyListingsScreen` passes the
> whole doc to `EditProperty`.)

### 2.2 Debouncing & throttling

**Status: done** — `src/utils/performance/debounce.ts` + `throttle.ts` (with
`useDebouncedCallback` / `useThrottledCallback` hooks and `.cancel()` support)
exist and are exported from `src/utils/index.ts`; the old `debounce` was
removed from `helpers.ts`.

| Call site | Utility | Delay | Status |
|---|---|---|---|
| `SearchScreen` search input | debounce (`useDebouncedCallback`) | 300ms | ✅ |
| `ExploreScreen` filter changes | debounce (`useDebouncedCallback`) | 300ms | ✅ |
| `ExploreScreen` load-more (`onEndReached`) | throttle (`useThrottledCallback`) | 500ms | ✅ |
| FlatList `onScroll` (Home) | throttle | 500ms | ⏳ apply when a scroll-driven feature exists |
| Map region-change → marker fetch | throttle | 500ms | ⏳ needs geohash/region queries first |

### 2.3 Connection & offline configuration

In `src/config/firebase.ts` (web + native):

```ts
import { initializeFirestore } from 'firebase/firestore';
// Web: avoid WebChannel issues behind proxies
const settings = Platform.OS === 'web'
  ? { experimentalForceLongPolling: true }
  : {};
const db = initializeFirestore(app, settings);
```

**Offline persistence caveat:** the JS SDK in React Native (Expo Go) does **not**
support `enableIndexedDbPersistence` (web-only) or native offline persistence.
If offline reads matter, move to a development build with `@react-native-firebase/firestore`,
which supports native offline persistence. Until then, the AsyncStorage cache
(Phase 1) is the offline layer.

---

## Phase 3 — Monitoring & Observability

### 3.1 Sentry integration

1. `npm install @sentry/react-native --legacy-peer-deps`
2. Init once in `App.tsx` (or `src/config/sentry.ts`):

```ts
import * as Sentry from '@sentry/react-native';
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2,
  enabled: !__DEV__ || !!process.env.EXPO_PUBLIC_SENTRY_DSN,
});
```

3. Hook the existing `ErrorBoundary` `onError` prop → `Sentry.captureException(error)`.
4. Add breadcrumbs: `Sentry.addBreadcrumb({ category: 'firestore', message })` in
   `withRetry`'s `onRetry` and in the service layer on uploads/creates.
5. Performance: wrap slow ops with `Sentry.startSpan` (upload, first listing load).
6. Upload source maps: `eas build` with `sentry: { url, authToken, org, project }`
   in `app.json`.

### 3.2 Performance metrics

Create `src/utils/monitoring/metrics.ts` — a tiny in-memory tracker (name →
{count, totalMs, avgMs, p95}) with a `reportMetric(name, durationMs)` helper and
a dev-only console dump. Instrument:

| Metric | Where |
|---|---|
| Property list load | around `getProperties` |
| Property detail load | around `getProperty` |
| Image upload | around `uploadPropertyImage` / `uploadImage` |
| Search latency | around `searchProperties` |
| Screen render | navigation `focus` listener timestamps |

`monitoring/sentry.ts` becomes a thin wrapper choosing between Sentry and the
local tracker when Sentry is absent.

---

## Phase 4 — Production Readiness

### 4.1 Rate limiting (Firestore rules)

Firestore rules can't do sliding-window rate limits; use a **burst budget**
pattern in `firestore.rules`:

- Add a `counters/{uid}` doc with `writes: timestamp` array.
- Rule: allow `create`/`update` only if the write count in the last 60s is
  `< 100` (writes) / `< 1000` (reads), else `deny`.
- Reads are harder to rate-limit in rules — combine with **Firebase App Check**
  (enforce real clients only) and `firestore.rules` `getAfter` checks.

Practical scope for this app: enforce write limits (100/min) in rules + App Check
enforcement; rely on client caching (Phase 1) to cut read volume.

### 4.2 Health checks & degraded mode

- `src/utils/network/healthCheck.ts` (Phase 1) already pings Firestore with a
  bounded timeout.
- Add a "Service status" row in `SettingsScreen` calling `checkFirebaseHealth()`.
- Degraded mode: when `firestoreCircuitBreaker.currentState === 'open'`, show a
  banner ("You're offline — showing saved listings") and serve from the Phase 1
  cache instead of the network.

### 4.3 CI/CD pipeline

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci --legacy-peer-deps
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npx expo export --platform web   # verifies the bundle builds
```

Deployment (add `firebase.json` hosting section + `deploy.yml`):
1. `npx expo export --platform web` → `dist/`
2. `firebase deploy --only hosting` with env-specific Firebase projects
   (`dev`/`staging`/`prod`) via `FIREBASE_PROJECT` matrix + secrets.
3. Rollbacks: keep prior `dist` versions in Hosting and `firebase hosting:clone`
   on failure; for EAS builds use `eas build:list` + re-run previous build.

### 4.4 Secret management

- ✅ All keys already live in `.env` (`EXPO_PUBLIC_*`) — never commit real values
  (`.gitignore` covers `.env`).
- Add `src/utils/env.ts` `validateEnv()` called at startup: fail fast in
  production when required `EXPO_PUBLIC_FIREBASE_*` vars are missing.
- Sensitive runtime tokens → `expo-secure-store` (install `expo-secure-store`);
  never store auth tokens in plain AsyncStorage.

### 4.5 CORS & security

- ✅ `cors.json` ships; deploy with
  `gsutil cors set cors.json gs://<project>.firebasestorage.app`.
- XSS: React Native escapes text by default; for web-rendered HTML (rich text),
  sanitize with a whitelist before `dangerouslySetInnerHTML`.
- CSRF: app uses Firebase Auth ID tokens (no cookies), so CSRF surface is
  minimal; keep rules `request.auth != null` enforced (never test-mode in prod).
- Input sanitization: extend `src/utils/validators.ts` for property fields
  (price ranges, image count, string lengths) — validation already exists for
  auth forms.

---

## Phase 5 — Scalability

### 5.1 Database indexing

- ✅ `firestore.indexes.json` defines every composite index the app queries
  (`status+createdAt`, `listingType+status+price`, `userId+createdAt`,
  `participants+updatedAt`, etc.). Deploy with
  `npx firebase deploy --only firestore:indexes`.
- Add a CI script that fails the build if a new `orderBy`/range query is added
  without a matching entry in `firestore.indexes.json`.

### 5.2 Caching strategy

- Firebase Hosting serves static assets over a global CDN by default; set
  `Cache-Control: public, max-age=31536000, immutable` for hashed assets and
  `no-cache` for `index.html` via `firebase.json` `headers`.
- Add a service worker for web (PWA): `expo start` web + `workbox` (or Expo's
  web service worker support) to cache images and shell assets.
- Image CDN: migrate property photos to a CDN-backed URL (Firebase Storage +
  `firebasestorage.googleapis.com` is already CDN-backed).

### 5.3 Backup & recovery

Automated Firestore backups with Cloud Scheduler + Storage export:

```bash
# One-time export
gcloud firestore export gs://<project>-backups/firestore/$(date +%F)

# Scheduled (Cloud Scheduler → Cloud Run/PubSub task that runs the export)
# Restore
gcloud firestore import gs://<project>-backups/firestore/<export-timestamp>
```

Document in `docs/DISASTER_RECOVERY.md`:
- RPO: daily export; RTO: < 1 hour (import is minutes for this data size).
- Restore runbook: import to a scratch project first, verify, then point app to it.
- Test the restore quarterly.

---

## Phase 1 (done) — summary

Implemented and wired into the service layer:

| Item | Location |
|---|---|
| Retry + exponential backoff (1/2/4/8s, jitter, 4 attempts) | `src/utils/network/retry.ts` |
| Timeouts (10s ops, 30s uploads) | `src/utils/network/timeout.ts` |
| Circuit breaker (5 fails/30s, half-open 30s) | `src/utils/network/circuitBreaker.ts` |
| Health check | `src/utils/network/healthCheck.ts` |
| AsyncStorage cache (5min props, 1h profiles, SWR) | `src/utils/cache/cacheService.ts` |
| Cache invalidation on mutations | `src/utils/cache/cacheInvalidation.ts` |
| Error boundary + themed fallbacks | `src/utils/errors/ErrorBoundary.tsx`, `fallbacks.tsx` |
| Wiring | `propertyService`, `authService`, `storageService`, `chatService`, `App.tsx`, `AppNavigator.tsx` |