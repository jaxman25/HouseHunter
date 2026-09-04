# Dependency Security Status — House Hunter

Last checked: 2026-09-04

## Snyk (`npx snyk test`)

Not runnable without an account token — Snyk CLI returned
`SNYK-0005 (401 Unauthorized)` and requires `snyk auth` first. To enable this
scan in CI/PRs:

1. Create a Snyk account/org and generate an API token.
2. Add it as a repo secret (e.g. `SNYK_TOKEN`).
3. Run `npx snyk monitor` once locally, then add a
   `npx snyk test --all-projects` step to `.github/workflows/ci.yml`.

Until then, the registry-backed scan below is the source of truth.

## npm audit

`npm audit` reports **19 moderate** vulnerabilities. All are transitive and
there is **no non-breaking remediation** (`npm audit fix` has nothing to
apply; `npm audit fix --force` would install breaking major versions that
conflict with the pinned Expo SDK 57 toolchain):

| Advisory | Affected path | Impact |
|---|---|---|
| decode-uri-component (GHSA-vcc3-ghjq-m6fr) | query-string → @react-navigation/* | Denial of service on malformed URLs; only reachable through navigation internals |
| @expo/cli / @expo/config / metro-config chain | expo → @sentry/react-native | Toolchain advisories (moderate) |
| @sentry/react-native ≥5.16 chain | expo | Depends on vulnerable @expo packages above |

These are moderate severity, no known public exploitation in this app's usage
(shallow, server-side rendering is not used; navigation URLs are app-internal).
Remediation happens naturally with the next Expo SDK major upgrade, after
which `npm audit fix` should be re-run and this section updated.

## Keeping it current

- Run `npm audit` in CI (a failing `high`/`critical` gate is a good default;
  moderate-only fails are noisy given the above).
- After any dependency bump, re-run `npm audit` and update this file.
- Enable Snyk when an org token exists (see above).
