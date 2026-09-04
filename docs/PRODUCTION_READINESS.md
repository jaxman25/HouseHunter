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
| `HomeScreen` New Listings “Load More” | pagination cursor | — | ✅ (button, not scroll) |
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

**Status: done (steps 1–4); step 5+ pending a real DSN.**

1. ✅ `@sentry/react-native` installed (`npx expo install`) and registered in
   `app.json` `plugins`.
2. ✅ `src/utils/monitoring/sentry.ts` — `initSentry()` guarded by
   `EXPO_PUBLIC_SENTRY_DSN` (no-op without it), plus `captureError` and
   `addBreadcrumb` helpers; `initSentry()` runs at the top of `App`.
3. ✅ `ErrorBoundary.componentDidCatch` reports to Sentry via `captureError`
   with the component stack attached.
4. ✅ Retries leave breadcrumbs: `withRetry` calls `addBreadcrumb` (category
   `network`, attempt + delay + error code) before each backoff.
5. ⏳ Performance spans: wrap slow ops with `Sentry.startSpan` once a DSN is live.
6. ⏳ Source maps: `eas build` with `sentry: { url, authToken, org, project }`
   in the Expo config.

**To enable:** set `EXPO_PUBLIC_SENTRY_DSN` in `.env` (Sentry project DSN).

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

**Status: done for property writes (create/update/delete) — the app's main write
surface. Reads can't be counted in rules.**

Firestore rules can't do sliding-window rate limits, so `firestore.rules` now
enforces a **per-user minute budget** (burst-window pattern, 100 writes/min):

- `counters/{uid}` holds `{ minute: <epochMinute>, writes: <count> }`.
- `withinWriteLimit()` (rules helper) compares the counter **after** a batched
  write against its state **before**: same-minute writes must increment by
  exactly 1; a new minute bucket restarts the budget; counts over 100 deny.
- Every property create/update/delete **must** include the counter bump in the
  same `writeBatch` (client side: `withWriteCount()` in `propertyService.ts`,
  atomic `increment(1)` with `merge` — no extra reads, no client clocks).
- Reads can't be rate-limited in rules — rely on Phase 1 caching for read
  volume and add **Firebase App Check** before public launch.

> ⚠️ Rules and client must be deployed together: old clients that don't bump the
> counter will be denied property writes once these rules are live. Chat,
> notifications, and user-profile writes are not rate-limited yet — reuse
> `withWriteCount()` + `withinWriteLimit()` to extend.

### 4.2 Health checks & degraded mode

**Status: done.**

- ✅ `src/utils/network/healthCheck.ts` (Phase 1) pings Firestore with a bounded
  timeout; `firestore.rules` now allows authenticated reads of the
  `healthcheck` collection so the probe isn't denied.
- ✅ Settings → **System → Firebase Status** row runs `checkFirebaseHealth()` on
  mount and on tap, showing latency when healthy or the error (plus circuit
  state) when not.
- ⏳ Full degraded mode (offline banner + serve from Phase 1 cache app-wide)
  still to build when offline support lands (see 2.3).

### 4.3 CI/CD pipeline

**Status: CI + deploy workflows done.**

- ✅ `.github/workflows/ci.yml` — on push/PR: `npm ci --legacy-peer-deps` →
  `npx tsc --noEmit` → `npx expo export --platform web`.
- ✅ `.github/workflows/deploy.yml` — on push to `main`: export + `firebase-tools
  deploy --only hosting` (needs `FIREBASE_PROJECT_ID` + `FIREBASE_TOKEN`
  secrets from `npx firebase-tools login:ci`).
- ✅ `firebase.json` hosting block: `dist/` public dir, SPA rewrite, immutable
  CDN caching for hashed assets, `no-cache` for `index.html`.

> Lint step intentionally commented out until ESLint is configured (see
> `ci.yml`). Use `npx firebase-tools deploy` (not `npx firebase deploy`) so the
> CLI doesn't need a global install.

Env-specific builds (dev/staging/prod): duplicate `deploy.yml` per environment
or parameterize `FIREBASE_PROJECT_ID` as a variable; EAS profiles go in
`eas.json` when native releases start.

Rollbacks: Firebase Hosting keeps prior deployments — `firebase-tools
hosting:clone <prev-version> <site>` reverts the web app; for EAS builds re-run
the previous build.

### 4.4 Secret management

**Status: mostly done.**

- ✅ All keys live in `.env` (`EXPO_PUBLIC_*`) — never commit real values
  (`.gitignore` covers `.env`).
- ✅ `src/utils/env.ts` `validateEnv()` runs at startup in `App`: warns in dev,
  **throws in production** when required `EXPO_PUBLIC_FIREBASE_*` vars are
  missing or still placeholders.
- ⏳ Sensitive runtime tokens → `expo-secure-store` (install + native rebuild);
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
  `npx firebase-tools deploy --only firestore:indexes`.
- Add a CI script that fails the build if a new `orderBy`/range query is added
  without a matching entry in `firestore.indexes.json`.

### 5.2 Caching strategy

- ✅ `firebase.json` hosting headers: immutable `max-age=31536000` for hashed
  js/css/images/fonts, `no-cache` for `index.html` (CDN served by Firebase
  Hosting automatically).
- ⏳ Add a service worker for web (PWA): `expo start` web + `workbox` (or Expo's
  web service worker support) to cache images and shell assets.
- ⏳ Image CDN: migrate property photos to a CDN-backed URL (Firebase Storage +
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