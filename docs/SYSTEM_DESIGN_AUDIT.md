# System Design Audit — House Hunter

Every item from the production-readiness checklist, audited against this codebase
(Expo SDK 57 / React Native 0.86 / Firebase 12 client SDK, web + native).

**Legend**

| Mark | Meaning |
|---|---|
| ✅ | Implemented and wired — verified in code/config |
| 🟡 | Partial — some coverage, concrete gap noted |
| ➖ | Not applicable / platform-managed — the platform (Firebase, Expo, Google Cloud) provides it |
| 🔴 | Gap — actionable now; recommendation given |

Audit date: 2026-09-04. Companion docs: [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md),
[`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md).

---

## Resilience & Networking

| Checklist item | Status | Where / notes |
|---|---|---|
| Rate Limiting | 🟡 | ✅ Property create/update/delete are limited to **100 writes/min per user** via `firestore.rules` (`withinWriteLimit()` burst-window pattern) + `withWriteCount()` in `src/services/propertyService.ts` (atomic counter bump in the same `writeBatch`). ⚠️ Chat, notification, and profile writes are not rate-limited yet — extend `withWriteCount()` + `withinWriteLimit()` to them. Reads cannot be limited in rules; add **Firebase App Check** before public launch. |
| Caching | ✅ | 3 layers: (1) client — `src/utils/cache/cacheService.ts` AsyncStorage TTL cache (5 min listings, 1 h profiles, stale-while-revalidate); (2) CDN — immutable `Cache-Control` headers in `firebase.json`; (3) PWA — `public/sw.js` (cache-first images, SWR hashed assets, network-first navigations). |
| Load Balancing | ➖ | Firebase Hosting serves from a global CDN with automatic load balancing; Firestore is serverless and scales horizontally itself. No self-managed load balancer needed. |
| Reverse Proxies | ➖ | Firebase Hosting edge terminates TLS and serves as the reverse proxy (`firebase.json` SPA rewrite). |
| API Gateways | ➖ | No server API — the client talks to Firebase directly. Firebase Auth + security rules + App Check are the API boundary; consider Cloud Functions + API Gateway only if a server backend is added. |
| CI/CD | ✅ | `.github/workflows/ci.yml` (typecheck + index coverage + web export) and `deploy.yml` (push-to-main → Firebase Hosting deploy with `FIREBASE_PROJECT_ID`/`FIREBASE_TOKEN` secrets). |
| Docker | ➖ | Not applicable — Expo/EAS builds the app; no container runtime in the pipeline. |
| Kubernetes | ➖ | Not applicable — no self-managed services. |
| Service Discovery | ➖ | Firebase endpoints are static and managed; nothing to discover. |
| Circuit Breakers | ✅ | `src/utils/network/circuitBreaker.ts` — CLOSED/OPEN/HALF-OPEN with 5 fails/30 s window and 30 s cooldown; three instances (`firestore`, `storage`, `auth`) wrapped around every service call. |
| Timeouts | ✅ | `src/utils/network/timeout.ts` — 10 s ops / 30 s uploads; wrapped around every Firestore/Auth/Storage call via `withTimeout`. |
| Retries | ✅ | `src/utils/network/retry.ts` — 4 attempts with jitter; permanent errors (`permission-denied`, `not-found`, `invalid-argument`, auth errors…) are never retried. |
| Exponential Backoff | ✅ | 1/2/4/8 s with ±20 % jitter (`retry.ts`); Sentry breadcrumb on every retry. |
| Idempotency | ✅ | **New:** conversation creation is idempotent — deterministic doc ID (`SHA-256` of sorted participant IDs + property ID via `expo-crypto`) with `setDoc(..., { merge: true })`, so concurrent "Contact Seller" taps converge on one conversation (`src/services/chatService.ts` `getOrCreateConversation`). Favorites use atomic `arrayUnion`/`arrayRemove` (idempotent toggles). 🟡 Message *sends* still use auto-IDs: a retry after a timed-out commit can duplicate a message — fixing this needs a client-generated message ID plus a rules tweak to allow re-writes of own messages (see "Race Conditions"). |
| Message Queues | ➖ | No in-app async jobs. Firestore realtime + Cloud Scheduler→Pub/Sub (below) cover the queue-like needs. |
| Pub/Sub | ✅ | Backup pipeline uses Cloud Scheduler → Pub/Sub topic → Cloud Function (`docs/DISASTER_RECOVERY.md` §3.2). |
| Event-Driven Architecture | 🟡 | Firestore `onSnapshot` listeners (chat, conversations, notifications) are event-driven push; no serverless event handlers beyond the backup function. |
| Distributed Transactions | ✅ | `writeBatch` used for multi-doc atomicity: property write + rate-limit counter; message send (message + conversation metadata + unread bump) in one commit. |
| Saga Pattern | ➖ | Not applicable — no multi-service workflows; multi-doc ops are atomic batches instead. |
| Dead Letter Queues | ➖ | Not applicable — no async jobs in the app. |
| Cron Jobs | ✅ | Daily Firestore export via Cloud Scheduler (documented + deployable, `docs/DISASTER_RECOVERY.md` §3). |
| WebSockets | ✅ | Equivalent via Firestore realtime listeners (`onSnapshot`) for messages, conversations, notifications — push with automatic resubscribe. |
| Long Polling | ➖ | Superseded by Firestore push listeners. |
| Server-Sent Events | ➖ | Not applicable. |

## Data

| Checklist item | Status | Where / notes |
|---|---|---|
| Database Indexing | ✅ | `firestore.indexes.json` defines every composite index; `scripts/check-indexes.js` (CI + `npm run check:indexes`) fails the build if a query's index is missing. |
| Query Optimization | 🟡 | Pagination with `startAfter` cursors ("load more" on scroll), `limit` everywhere, chunked `in` queries (30 max), cache-first reads. ⚠️ Field masks (`select()`) are **blocked by firebase 12.18.0** (no projection API) — see `PRODUCTION_READINESS.md` §2.1; bedrooms/bathrooms/features filtering is client-side post-query. |
| N+1 Queries | ✅ | `getPropertiesByIds()` chunks by 30; `markAsRead` now uses one query + chunked `writeBatch` (was an N-round-trip loop). |
| Connection Pooling | ➖ | Single Firebase client per app; SDK manages connections. |
| Read Replicas | ➖ | Firestore managed. |
| Sharding | ➖ | Firestore manages automatically. |
| Partitioning | ➖ | Not applicable (NoSQL; collection structure is the partition). |
| Replication | ➖ | Firestore managed (single- or multi-region at creation). |
| Leader Election | ➖ | Not applicable. |
| CAP Theorem | ➖ | Firestore: strong consistency for single-region (CP-ish), tunable multi-region. The app treats reads as eventually consistent (TTL cache + SWR + pull-to-refresh). |
| Eventual Consistency | 🟡 | Tolerated by design (5 min cache); list pages may lag a write until invalidation — acceptable for this app. |
| Optimistic Locking | ✅ | Favorites are atomic (`arrayUnion`/`arrayRemove`). Property edits now carry a `version` counter: `updateProperty` reads the doc, bumps `version` by 1, and `firestore.rules` (`versionBumpedExactlyOnce()`) rejects stale writes (`failed-precondition` → friendly "modified elsewhere" error). Legacy docs without `version` are treated as version 0. |
| Pessimistic Locking | ➖ | Not applicable. |
| Distributed Locks | ➖ | Not applicable. |
| Race Conditions | ✅ | Fixed: conversation creation (deterministic ID + merge-set), message send (single atomic batch), favorites (atomic transforms), property edits (optimistic-lock version check). |
| Deadlocks | ➖ | Not applicable — no lock acquisition. |

## Performance & Memory

| Checklist item | Status | Where / notes |
|---|---|---|
| Memory Leaks | ✅ | All `onSnapshot` subscriptions return unsubscribers invoked in `useEffect` cleanup (`ChatScreen`, `ConversationsScreen`); metrics capped at 500 samples/metric; cache entries TTL-bounded. |
| Garbage Collection | ➖ | Platform-managed (JS engine). |
| Thread Safety | ➖ | Single-threaded JS; Firebase SDK serializes async ops. |
| Backpressure | 🟡 | ✅ Load-more throttled (500 ms), search debounced (300 ms), FlatList virtualization. ⚠️ No UI queue limit on rapid chat sends beyond the `sending` flag. |
| Autoscaling | ➖ | Firebase managed. |
| Horizontal Scaling | ➖ | Firebase managed. |
| Vertical Scaling | ➖ | Not applicable. |
| CDN | ✅ | Firebase Hosting serves from a global CDN; images live on `firebasestorage.googleapis.com` (CDN-backed). |
| Edge Caching | ✅ | Immutable `max-age=31536000` for hashed js/css/fonts/images; `no-cache` for `index.html`; service worker cache-first for storage images. |
| Cache Invalidation | ✅ | `src/utils/cache/cacheInvalidation.ts` — all mutations invalidate: property create/update/delete → list+detail; profile update → profile; favorites toggle → favorites; sign-out → full purge. |

## Deploy & Release

| Checklist item | Status | Where / notes |
|---|---|---|
| Feature Flags | ✅ | `src/utils/featureFlags.ts` — env-driven (`EXPO_PUBLIC_*`), documented, with real usage (`perfSpans`, `devMetricsLog`). ⚠️ For no-rebuild runtime flips in production, swap the backing to Firebase Remote Config (the module is the seam). |
| Blue-Green Deployments | 🟡 | Supported by Firebase Hosting (multi-site `hosting:clone` between sites) but not configured. See `PRODUCTION_READINESS.md` §4.3. |
| Canary Releases | ✅ | `.github/workflows/preview.yml` deploys a short-lived (7-day) preview channel on every PR with an auto-commented URL; promote to production by merging to `main` or `firebase hosting:channel:deploy` + `hosting:clone`. |
| Rolling Deployments | ➖ | Firebase Hosting deploys are atomic; EAS handles native builds. |
| Rollbacks | ✅ | Documented: `firebase-tools hosting:clone <prev> <site>`; re-run previous EAS build for native. |
| Health Checks | ✅ | `src/utils/network/healthCheck.ts` pings Firestore with a bounded timeout; Settings → System → Firebase Status shows latency/circuit state. |
| Liveness & Readiness Probes | 🟡 | One probe covers both. ⚠️ Distinguish: liveness = app boot/JS thread (Sentry init, `validateEnv`), readiness = backend reachable (`checkFirebaseHealth`). Documented in `PRODUCTION_READINESS.md` §4.2. |

## Observability

| Checklist item | Status | Where / notes |
|---|---|---|
| Monitoring | 🟡 | Sentry error tracking (DSN-gated, `src/utils/monitoring/sentry.ts`) + in-app health check + metrics. ⚠️ Sentry performance spans + source maps pending a real DSN (`PRODUCTION_READINESS.md` §3.1). |
| Logging | 🟡 | Sentry breadcrumbs (retries, ops) + `console.*`. ⚠️ Screens log via `console.error` — route those through `captureError()` so production sees them; no structured logging (acceptable at this scale). |
| Distributed Tracing | 🟡 | Breadcrumb trail only. ⚠️ `Sentry.startSpan` wrapping planned once a DSN is live (§3.1 step 5). |
| Metrics | ✅ | `src/utils/monitoring/metrics.ts` — in-memory tracker (count/avg/p95/max, bounded samples) + `trackMetric()` instrumenting property list/detail/search/byUser/upload, profile reads, chat send/upload. Dev console dump via `logMetricsReport()`. |
| Alerting | 🟡 | Backup-failure log-based alert documented (§3.2); ⚠️ Sentry alerts and Firebase budget alerts not configured. |
| SLOs | 🟡 | RPO ≤ 24 h / RTO < 1 h defined for backups (`DISASTER_RECOVERY.md`). ⚠️ No availability/latency SLOs for the app itself. |
| SLIs | 🟡 | Latency SLI inputs exist (`metrics.ts`, health check latency); ⚠️ availability SLI (success-rate from Sentry) not aggregated. |
| Error Budgets | 🔴 | Not defined. **Action:** once SLOs exist, set an error budget (e.g. 99.9 % → 43 min/month) and alert when exhausted. |
| Observability | 🟡 | Errors + metrics + breadcrumbs + health probes. ⚠️ Missing: tracing, session replay, release tagging (Sentry release via EAS). |

## Security

| Checklist item | Status | Where / notes |
|---|---|---|
| Secrets Management | ✅ | All config via `.env` (`EXPO_PUBLIC_*`), `.gitignore`d; `src/utils/env.ts` validates and **throws in production** on missing/placeholder keys. ⚠️ Native auth tokens should move to `expo-secure-store` (Firebase keys are public-by-design client keys). |
| IAM | ✅ | Firestore rules are fine-grained per-collection (owner-only writes, participant-only chat, self-only notifications) — `firestore.rules`; **Storage rules added** (`storage.rules`, wired in `firebase.json`): owner-only profile writes, property images writable pre-doc-creation then owner-only, chat images participant-only, deny-all default. |
| OAuth | ✅ | Google sign-in (web popup + native ID-token exchange) in `src/services/authService.ts`; email/password too. |
| JWT Rotation | ✅ | Firebase ID tokens auto-refresh; `onIdTokenChanged`-style handling via SDK. |
| TLS | ✅ | HTTPS everywhere (Firebase-managed). |
| Encryption at Rest | ✅ | Firebase-managed (Firestore, Storage, Auth). |
| Encryption in Transit | ✅ | TLS managed; WSS for realtime. |
| WAF | 🟡 | Google Cloud CDN/Hosting mitigates common attacks; ⚠️ add a Cloud Armor policy in front of a custom domain, and App Check to stop unauthenticated client abuse. |
| DDoS Protection | 🟡 | CDN absorbs volumetric attacks; App Check is now wired on web (`src/config/firebase.ts`, `ReCaptchaV3/Enterprise` provider via `EXPO_PUBLIC_RECAPTCHA_SITE_KEY`) — remaining steps are **console-side**: register the site key and enable enforcement per API (Firestore/Storage). Native builds need a dev build with `@react-native-firebase/app-check` before enforcement for iOS/Android. |
| CORS | ✅ | `cors.json` ships for Storage web uploads (deploy via `gsutil cors set`); SPA rewrites handled by Hosting. |
| CSRF | ✅ | Token-based auth (no cookies), so the CSRF surface is minimal; all rules require `request.auth != null`. |
| SQL Injection | ✅ | Not applicable (NoSQL); rules validate document shape (`propertyDataIsValid`, `userDataIsValid`). |
| XSS | ✅ | React Native escapes text by default; web rendering never uses `dangerouslySetInnerHTML`; ⚠️ sanitize with a whitelist if rich-text HTML is ever rendered on web. |
| SSRF | ➖ | Not applicable — no server-side URL fetching. |

## Data Lifecycle

| Checklist item | Status | Where / notes |
|---|---|---|
| Database Migrations | ✅ | `docs/DATA_MIGRATIONS.md` — schema baseline, additive-change convention, two-phase renames, rules checklist, idempotent backfill script template, and a migration log. |
| Schema Versioning | ✅ | `docs/DATA_MIGRATIONS.md` defines the convention (additive changes, `sv` marker pattern, legacy-field fallbacks). The `properties.version` optimistic-lock field is a working example of a backward-compatible field addition. |
| Disaster Recovery | ✅ | `docs/DISASTER_RECOVERY.md` — RPO/RTO, restore runbook with verification checklists, partial-restore guidance, quarterly drill ownership. |
| Backups | ✅ | Architecture + deployable exporter (Cloud Scheduler → Pub/Sub → Function → `exportDocuments`), GCS retention (30 days), versioning note. ⚠️ Not yet deployed (needs GCP access). |
| Failover | ➖ | Firebase-managed (Firestore multi-region option; Hosting global). |
| Multi-Region Deployments | 🟡 | Hosting is globally distributed; ⚠️ Firestore region is fixed at database creation — choose multi-region upfront if global writes matter. |

## Scalability & Performance

| Checklist item | Status | Where / notes |
|---|---|---|
| Chaos Engineering | 🟡 | Quarterly restore drills documented; ⚠️ no fault-injection game days (e.g. kill Firestore writes, then verify degraded mode + circuit breakers). |
| Cost Optimization | 🟡 | Caching cuts read volume (the main Firestore cost); ⚠️ set Firebase budget alerts; consider field masks when the SDK supports them (biggest read-cost lever). |
| Cold Starts | ➖ | Not applicable client-side; backup Function timeout noted in DR doc. |
| Serverless Limits | ➖ | Client app — but Firestore limits are respected: `writeBatch` ≤ 500 (chunked at 400 in `markAsRead`), `in` ≤ 30 (chunked), paginated reads. |
| Latency | 🟡 | Cache-first reads + pagination + debounce/throttle; now measurable via `metrics.ts`. |
| Throughput | ➖ | Platform-managed. |
| P99 Latency | ✅ | p95 tracked in `metrics.ts` (P99 is a one-line change in `getMetricSummary`); ⚠️ no percentile dashboard/alert yet. |
| Tail Latency | 🟡 | Bounded by timeouts + retries + circuit breaker; ⚠️ no outlier tracking. |

## Networking

| Checklist item | Status | Where / notes |
|---|---|---|
| Network Partitions | 🟡 | Circuit breakers fail fast; timeouts bound hangs; ⚠️ offline persistence is **not** available in Expo Go (documented in `PRODUCTION_READINESS.md` §2.3) — cache is the offline layer until a dev build with `@react-native-firebase/firestore`. |
| Clock Skew | ✅ | All writes use server clocks: conversations/properties/notifications via `serverTimestamp()`, and **messages** now write `createdAt: serverTimestamp()` (ordering comes from Firestore's clock); `subscribeToMessages` normalizes the `Timestamp` back to an ISO string for the UI. |
| DNS | ➖ | Firebase Hosting custom domains. |
| TCP vs UDP | ➖ | Not applicable (HTTPS/WSS only). |
| HTTP/2 & HTTP/3 | ✅ | Firebase Hosting serves HTTP/2 (and HTTP/3 where supported). |
| gRPC | ➖ | Not applicable. |
| Webhooks | ➖ | No inbound webhooks. |

## Versioning & Infra

| Checklist item | Status | Where / notes |
|---|---|---|
| API Versioning | ➖ | Client talks to Firebase directly; rules/indexes are versioned in the repo alongside the client. |
| Semantic Versioning | ✅ | `package.json` `1.0.0`; releases documented in README. |
| Infrastructure as Code | ✅ | `firebase.json`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`, workflows, DR automation all live in-repo. |
| Terraform | ➖ | Not applicable — Firebase CLI + `gcloud` are the IaC here (documented commands). |
| Helm Charts | ➖ | Not applicable. |
| Build Caching | ✅ | GitHub Actions `npm` cache; Metro cache; `expo export` incremental builds; EAS build cache for native. |
| Dependency Hell | 🟡 | `npm install --legacy-peer-deps` is required (React 19 / RN peer mismatch) — pinned by `package-lock.json`; ⚠️ revisit on the next SDK upgrade to drop the legacy flag. |

## Operations

| Checklist item | Status | Where / notes |
|---|---|---|
| Production Incidents | ✅ | `docs/INCIDENT_RESPONSE.md` — severity levels (SEV1–4), detection sources, rollback-first response flow, and verification steps. |
| On-call | 🟡 | `docs/INCIDENT_RESPONSE.md` §4 defines restore executor/approver slots and an escalation path; formal rotation pending SLOs/alerting. Fill in the named owners. |
| Postmortems | ✅ | Blameless postmortem template with timeline/root-cause/action-items/prevention checklist in `docs/INCIDENT_RESPONSE.md` §5 (filed under `docs/POSTMORTEMS/`). |

---

## Summary

- **Fully covered (✅):** 50+ items across caching, retries/backoff/timeouts/circuit breakers, indexing, CI/CD + canary previews, CDN, health checks, cache invalidation, distributed transactions, disaster recovery, metrics, feature flags, optimistic locking, server-clock ordering, migrations/schema conventions, security rules (Firestore + Storage), App Check (web), and incident-response docs.
- **Recently fixed in this audit:** idempotent conversations, atomic message send, race-free favorites, optimistic-locked property edits, server-timestamped messages, batched read receipts, retryable batch commits, Storage rules, metrics + instrumentation, feature flags, preview-channel canaries, and the incident/migration docs.
- **Remaining gaps:** error budgets (needs SLOs first), App Check enforcement steps (console-side), Remote Config for runtime flags, and the inline ⚠️ items — see each row.