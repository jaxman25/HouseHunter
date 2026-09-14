# Secrets & Credentials Audit Report

**Date:** September 14, 2026
**Scope:** Full project scan for hardcoded secrets, API keys, tokens, and credentials

---

## Executive Summary

| Category | Status | Details |
|----------|--------|---------|
| Hardcoded secrets in source | ✅ CLEAN | No AWS keys, GitHub tokens, Stripe keys, or private keys found |
| `.env` file protection | ✅ SECURE | In `.gitignore`, never committed to git history |
| Client-side env vars | ✅ CORRECT | All use `EXPO_PUBLIC_*` prefix (public by design) |
| Server-side secrets | ✅ ISOLATED | Only in Cloud Functions (`RESEND_API_KEY`, etc.) |
| Service account keys | ✅ NOT PRESENT | No `service-account.json` or `.pem` files in repo |
| `.gitignore` coverage | ✅ HARDENED | Added `.env.*`, `.env.production`, `.env.staging` patterns |
| Pre-commit hook | ✅ ADDED | Automated secret detection before every commit |

---

## Detailed Findings

### 1. Client-Side Environment Variables

**Status: ✅ ALL CORRECT — `EXPO_PUBLIC_*` prefix**

All 25 client-side `process.env` references use the `EXPO_PUBLIC_*` prefix, which is:
- Inlined by Metro at build time
- Public by design (Firebase API keys are restricted by App Check + Firestore rules)
- Safe to expose in the client bundle

| Variable | Purpose | Restricted By |
|----------|---------|---------------|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase init | App Check + Rules |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth domain | N/A (public) |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Project ID | N/A (public) |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage | Rules |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | App ID | N/A (public) |
| `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` | Analytics | N/A (public) |
| `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY` | Maps (iOS) | API restrictions |
| `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` | Maps (Android) | API restrictions |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google Sign-In | N/A (public) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google Sign-In | N/A (public) |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Google Sign-In | N/A (public) |
| `EXPO_PUBLIC_SENTRY_DSN` | Error tracking | N/A (public) |
| `EXPO_PUBLIC_RECAPTCHA_SITE_KEY` | App Check | Rate limiting |
| `EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` | App Check | Rate limiting |
| `EXPO_PUBLIC_ENABLE_PERF_SPANS` | Feature flag | N/A |
| `EXPO_PUBLIC_ENABLE_DEV_METRICS_LOG` | Feature flag | N/A |

**Note:** The `EXPO_PUBLIC_GOOGLE_MAPS_*` keys are used in `neighborhoodService.ts` for the Google Maps Distance Matrix API. These keys should be restricted in Google Cloud Console to only the Distance Matrix API.

### 2. Server-Side Secrets (Cloud Functions)

**Status: ✅ ALL ISOLATED — Never exposed to client**

| Variable | Where Used | Purpose |
|----------|------------|---------|
| `RESEND_API_KEY` | `functions/src/email.ts` | Transactional email |
| `NOTIFICATION_FROM_EMAIL` | `functions/src/email.ts` | Sender address |
| `ADMIN_ALERT_EMAILS` | `functions/src/index.ts` | Security alerts |
| `APP_ORIGIN` | `functions/src/index.ts` | Link generation |
| `WALKSCORE_API_KEY` | `functions/src/neighborhood.ts` | Neighborhood data |
| `GOOGLE_MAPS_API_KEY` | `functions/src/neighborhood.ts` | Distance matrix |

These are set via:
- `firebase functions:config:set` (legacy)
- Firebase Console → Functions → Environment variables (recommended)
- `.env.<project>` files (for local emulation only)

### 3. Git History Scan

**Status: ✅ CLEAN**

- `.env` was **never committed** to git history (verified via `git log`)
- No `.pem`, `.key`, or `service-account.json` files tracked
- No AWS keys (`AKIA...`), GitHub tokens (`ghp_...`), or Stripe keys found in any tracked file
- Only `.env.example` templates are tracked (contain placeholder values)

### 4. Hardcoded Secrets Scan

**Status: ✅ CLEAN**

Scanned all 227 tracked files for:
- AWS access keys (`AKIA...`)
- Google API keys (`AIza...`)
- GitHub tokens (`ghp_`, `gho_`, `ghs_`, `ghr_`)
- Stripe keys (`sk_live_`, `sk_test_`)
- SendGrid keys (`SG...`)
- Private keys (`-----BEGIN PRIVATE KEY-----`)
- Connection strings (`mongodb://`, `postgresql://`, `mysql://`, `redis://`)
- Hardcoded passwords in assignments

**Result:** Zero matches in tracked files.

---

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `.gitignore` | Added `.env.*`, `.env.production`, `.env.staging` patterns | Prevent accidental commits of env variants |
| `functions/.gitignore` | Added `.env.*`, `service-account*.json`, `*.pem`, `*.key` | Protect function secrets |
| `scripts/pre-commit-secrets-check.sh` | **New** | Automated secret detection before commits |

---

## Pre-Commit Hook Installation

Install the secret detection hook:

```bash
# From the project root:
ln -s ../../scripts/pre-commit-secrets-check.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Or add to `package.json`:
```json
{
  "scripts": {
    "prepare": "ln -sf ../../scripts/pre-commit-secrets-check.sh .git/hooks/pre-commit"
  }
}
```

### What the Hook Checks

- AWS access keys
- Google API keys
- GitHub tokens
- Stripe keys
- SendGrid keys
- Firebase service account JSON
- Private keys (PEM blocks)
- Connection strings
- Hardcoded passwords in assignments

### Bypass (Not Recommended)

```bash
git commit --no-verify -m "commit message"
```

---

## Recommendations

### High Priority
1. **Restrict Google Maps API keys** in Google Cloud Console:
   - Enable only: Distance Matrix API, Maps JavaScript API
   - Set HTTP referrer restrictions to your domains only
   - Set daily quota limits

2. **Enable App Check enforcement** in Firebase Console:
   - Firestore → Enable enforcement
   - Storage → Enable enforcement
   - Cloud Functions → Enable enforcement

3. **Set Cloud Functions secrets** via Firebase CLI:
   ```bash
   firebase functions:config:set \
     resend.api_key="re_YOUR_KEY" \
     notification.from_email="House Hunter <no-reply@yourdomain.com>" \
     admin.alert_emails="ops@yourdomain.com" \
     app.origin="https://househunter.app"
   ```

### Medium Priority
4. **Rotate the Firebase API key** if it was ever exposed in a public repo (even briefly)
5. **Set up Google Cloud Console API key restrictions** for all `EXPO_PUBLIC_*` keys
6. **Enable Firebase Security Rules audit logging** in Google Cloud Console

### Low Priority
7. **Consider moving Google Maps Distance Matrix** calls to a Cloud Function to avoid exposing the Maps API key to clients
8. **Set up automated secret scanning** in CI/CD (GitHub Advanced Security, TruffleHog, etc.)

---

## Verification Commands

```bash
# Check if .env is tracked
git ls-files --cached | grep '\.env$'

# Check for secrets in tracked files
git ls-files --cached | xargs grep -l -i -E '(AKIA|AIza|ghp_|sk_live_)'

# Check git history for .env
git log --all --diff-filter=A --name-only -- ".env"

# Run the pre-commit hook manually
./scripts/pre-commit-secrets-check.sh
```
