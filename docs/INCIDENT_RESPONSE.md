# Incident Response — House Hunter

How to detect, respond to, and learn from production incidents. This is the
human-runbook companion to the automated recovery steps in
[`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md).

---

## 1. Severity levels

| Sev | Definition | Examples | Response target |
|---|---|---|---|
| **SEV1** | Total outage — users cannot use the app at all | Firestore database deleted; Auth provider broken; DNS/Hosting down | Continuous; page whoever is on call |
| **SEV2** | Major feature broken for many users; no workaround | Chat failing for all users; all property writes denied (rules bug); data loss risk | < 1 h to mitigation |
| **SEV3** | Minor feature degraded; workaround exists | Slow image uploads; search missing results; rate limiter too strict for one user | Next business day |
| **SEV4** | Cosmetic / non-user-visible | Metric noise, log spam, stale cache for a single user | Backlog |

## 2. Detection

- **Automated:** log-based alerts on the backup exporter (failed export pages
  someone), Sentry issue alerts once a DSN is configured, Firebase budget
  alerts. See `PRODUCTION_READINESS.md` §3.1 / §5.3 and `DISASTER_RECOVERY.md` §3.2.
- **In-app health:** Settings → System → Firebase Status shows latency and
  circuit-breaker state (`src/utils/network/healthCheck.ts`). A user reporting
  "Firebase Status shows an error" is a first-hand signal.
- **Manual:** a user report or a failing CI deploy.

## 3. Response flow (rollback-first)

1. **Acknowledge** — create the incident in the tracker with severity, time,
   and reporter. Announce to the team channel: `[SEVn] <what broke>`.
2. **Assess blast radius** — is it a single user, one feature, or everything?
   Check Firebase Status page (console), Sentry, and the health endpoint.
3. **Mitigate before root-cause** — the priority is restoring users:
   - **Web:** `npx firebase-tools hosting:clone <previous-version> <site>`
     rolls the site back to the last good deploy (Firebase keeps prior
     versions). Roll back **first**, investigate after.
   - **Data:** follow `DISASTER_RECOVERY.md` §4 — restore to a scratch project,
     verify, then restore production during a maintenance window. **Only if
     data was lost/corrupted** — never restore over a healthy database.
   - **Rules/security:** if a bad `firestore.rules`/`storage.rules` deploy is
     denying legitimate users, redeploy the last known-good rules file
     (`git checkout <prev> -- firestore.rules` then `deploy --only firestore:rules`).
   - **Feature flag off:** for anything gated behind a flag
     (`src/utils/featureFlags.ts`), flip the env value and rebuild — or better,
     migrate the flag to Remote Config so it can be flipped without a deploy.
4. **Communicate** — status updates every 30 min for SEV1/2 (what's broken,
   what's being done, ETA when known). Post a user-facing note if the incident
   is user-visible for a sustained period.
5. **Verify** — after mitigation, confirm via the app health check + a smoke
   test (login, browse, chat, settings).
6. **Resolve & file the postmortem** (below) within 48 h for SEV1/2.

## 4. On-call & ownership

- **Named owners** (two-person rule for production restores): who can run a
  restore, and who approves it. Record names here:
  - Restore executor: ______
  - Restore approver: ______
- **Rotation:** until a formal rotation exists, the primary owner is the person
  who owns the last production-affecting deploy; a SEV1 escalates to the
  repository maintainer.
- **Access:** restore + rules deploys use the existing `FIREBASE_TOKEN` / gcloud
  identities; never store raw service-account keys in the repo
  (`DISASTER_RECOVERY.md` §6).

## 5. Postmortem template

File as `docs/POSTMORTEMS/<date>-<sev>-<slug>.md`.

```markdown
# Postmortem: <title>

- Date / duration: <start> – <end> (UTC)
- Severity: SEVn
- Impact: <users affected, features down, data affected>
- Trigger: <what started it>

## Timeline
| Time (UTC) | Event |
|---|---|
|  | detection / mitigation / resolution |

## Root cause
<one paragraph; blame the process, not the person>

## Contributing factors
- <e.g. rules deployed without emulator test>

## What went well / what went wrong
- Well: <rollback was fast because...>
- Wrong: <no alert fired because...>

## Action items
- [ ] <owner> <action> (tracked in issue tracker)

## Prevention checklist (for the next release)
- [ ] Rules change? Tested in the emulator before deploy
- [ ] Schema change? Followed docs/DATA_MIGRATIONS.md checklist
- [ ] Deploy? Rollback path verified (hosting:clone / previous EAS build)
- [ ] Alert? Would this incident have paged someone?
```

## 6. Practice (game days)

- **Quarterly restore drill** already required by `DISASTER_RECOVERY.md` §6 —
  use it to also rehearse this response flow end to end.
- **Chaos exercise:** temporarily break something small (e.g. make
  `checkFirebaseHealth` return an error) in a dev environment and verify the
  app degrades gracefully (circuit breaker trips, cached data still serves).

## 7. Related

- [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md) — backups, restore runbook, RPO/RTO.
- [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md) — alerting, SLOs, deploy rollbacks.
- [`SYSTEM_DESIGN_AUDIT.md`](./SYSTEM_DESIGN_AUDIT.md) — observability status and gaps.