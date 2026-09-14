# Security Deployment Configuration

This document covers all security-related deployment settings for House Hunter.
Every item here is either automated in code or requires manual Firebase Console configuration.

---

## 1. HTTPS Enforcement

### Automated (firebase.json)
- **HSTS header** applied to all routes: `max-age=31536000; includeSubDomains; preload`
- **Content-Security-Policy** includes `upgrade-insecure-requests` directive
- Firebase Hosting automatically serves over HTTPS (HTTP is redirected)

### Manual (Firebase Console)
1. Go to **Hosting → Settings → General**
2. Verify "Auto-redirect HTTP to HTTPS" is enabled (default: ON)
3. Verify custom domain has SSL certificate provisioned

---

## 2. Security Headers (Automated)

Applied to ALL routes via `firebase.json`:

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS for 1 year |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS filter |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leaks |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self), payment=()` | Restrict browser APIs |
| `Content-Security-Policy` | (see firebase.json) | Prevent XSS, data injection |

---

## 3. Secret Management

### Client-Side (EXPO_PUBLIC_*)
These are **public by design** — Firebase API keys are restricted by:
- App Check (reCAPTCHA verification)
- Firestore/Storage security rules
- API key restrictions in Google Cloud Console

| Variable | Purpose | Restricted By |
|----------|---------|---------------|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase Auth/FS init | App Check + Rules |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth domain | N/A (public) |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Project identifier | N/A (public) |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage bucket | Rules |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | App identifier | N/A (public) |
| `EXPO_PUBLIC_RECAPTCHA_SITE_KEY` | App Check | Rate limiting |

### Server-Side (Cloud Functions)
These are **never exposed to clients**:

| Variable | Purpose | Where to Set |
|----------|---------|--------------|
| `RESEND_API_KEY` | Transactional email | Firebase Console → Functions → Secrets |
| `NOTIFICATION_FROM_EMAIL` | Sender address | Firebase Console → Functions → Secrets |
| `ADMIN_ALERT_EMAILS` | Security alert inbox | Firebase Console → Functions → Secrets |
| `APP_ORIGIN` | Base URL for links | Firebase Console → Functions → Secrets |

### Manual Steps
1. Go to **Firebase Console → Project Settings → Cloud Functions → Environment variables**
2. Set each secret using the Firebase CLI or Console:
   ```bash
   firebase functions:config:set resend.api_key="re_xxx" \
     notification.from_email="House Hunter <no-reply@yourdomain.com>" \
     admin.alert_emails="ops@yourdomain.com" \
     app.origin="https://househunter.app"
   ```
3. Never commit `.env` files (already in `.gitignore`)

---

## 4. Database Access Restrictions

### Firestore Rules (firestore.rules)
- **Default deny**: All unmatched paths return `allow read, write: if false`
- **Authentication required**: Every collection requires `request.auth != null`
- **Ownership enforced**: Users can only modify their own documents
- **Write rate limiting**: 100 writes/minute per user via `counters/{uid}`
- **Admin gating**: Admin operations require `admin/roles/{uid}` document

### Storage Rules (storage.rules)
- **Default deny**: Unmatched paths blocked
- **Owner-only writes**: Profile photos, property images, chat images
- **Read requires auth**: No anonymous access to any storage path

### App Check Enforcement
**CRITICAL**: App Check must be enabled in Firebase Console:

1. Go to **Firebase Console → App Check → APIs**
2. Enable enforcement for:
   - ✅ Cloud Firestore
   - ✅ Cloud Storage
   - ✅ Cloud Functions (callables)
3. This blocks unauthenticated/automated access even if rules allow it

### Manual Steps
1. Register your app in App Check (web: reCAPTCHA, native: Play Integrity/App Attest)
2. Set `EXPO_PUBLIC_RECAPTCHA_SITE_KEY` in `.env`
3. Enable enforcement per API in Firebase Console
4. Test that unauthenticated requests are blocked

---

## 5. Security Monitoring & Logging

### Automated Logging
All security events are logged to `admin/securityLogs/{date}/events`:

| Event Type | When Logged | Purpose |
|------------|-------------|---------|
| `auth.login.success` | Successful login | Anomaly detection |
| `auth.login.failed` | Failed login attempt | Brute-force detection |
| `auth.register` | New account created | Abuse monitoring |
| `auth.password_reset` | Password reset requested | Account takeover detection |
| `auth.email_verify` | Email verified | Verification tracking |
| `auth.session_revoked` | Session invalidated | Security event tracking |
| `api.callable_error` | Cloud Function error | Error rate monitoring |
| `api.rate_limit_hit` | Rate limit triggered | Abuse detection |

### Anomaly Detection (Hourly)
The `analyzeSecurityLogs` Cloud Function runs hourly and detects:

| Pattern | Threshold | Alert |
|---------|-----------|-------|
| Brute-force (per IP) | ≥10 failed logins/hour | High severity |
| Credential stuffing (per email) | ≥5 failed logins/hour | High severity |
| API error spike | ≥20 errors/function/hour | Medium severity |
| High error rate (per IP) | >50% error rate (≥10 requests) | Medium severity |

### Alert Flow
1. Threshold exceeded → `admin/security_alerts` document created
2. `emailOnSecurityAlert` trigger → emails `ADMIN_ALERT_EMAILS`
3. Admin dashboard displays alerts in real-time
4. Audit log records all actions for compliance

### Manual Steps
1. Set `ADMIN_ALERT_EMAILS` in Cloud Functions config
2. Verify the `emailOnSecurityAlert` trigger is deployed
3. Test alert flow by triggering a threshold breach
4. Review `admin/securityReports/{date}` for daily summaries

---

## 6. CORS Configuration

### Production (cors.json)
- Allowed origins: `https://househunter.app`, `https://househunter.web.app`, `https://househunter.firebaseapp.com`
- Development: `http://localhost:8081`, `http://localhost:19006`, `http://localhost:3000`
- Methods: GET, POST, PUT, DELETE, HEAD
- Max age: 3600 seconds (1 hour)

### Firebase Hosting
CORS is handled by Firebase Hosting headers — no separate CORS configuration needed for hosted content.

---

## 7. Authentication Security

### Client-Side
- ✅ Login rate limiting (exponential backoff after 5 failures)
- ✅ Session timeout (30 minutes idle)
- ✅ Email verification required
- ✅ Password validation (8+ chars, upper, lower, digit, special)
- ✅ Honeypot anti-bot fields
- ✅ Form submission timing detection

### Server-Side (Cloud Functions)
- ✅ Token revocation on password change
- ✅ Session validity checking on app foreground
- ✅ Failed login audit logging
- ✅ beforeSignIn blocking function (suspension check + custom claims)
- ✅ Rate limiting on callable functions

### Firebase Console
1. Go to **Authentication → Settings → Session lifetime**
2. Set ID token expiration: **1 hour** (default)
3. Set refresh token expiration: **30 days** (recommended)
4. Enable **Blocking Functions** (requires Blaze plan)

---

## 8. Deployment Checklist

### Pre-Deployment
- [ ] `.env` file is NOT committed (verify `.gitignore`)
- [ ] All `EXPO_PUBLIC_*` variables are set in `.env`
- [ ] Cloud Functions secrets are configured via Firebase CLI
- [ ] `ADMIN_ALERT_EMAILS` is set

### Firebase Console
- [ ] App Check enforcement enabled for Firestore, Storage, Functions
- [ ] reCAPTCHA site key registered in App Check
- [ ] Authentication session lifetime configured
- [ ] Blocking Functions enabled (if using beforeSignIn)
- [ ] Custom domain SSL certificate provisioned

### Post-Deployment
- [ ] Verify HTTPS redirect works (http → https)
- [ ] Verify security headers present (curl -I https://househunter.app)
- [ ] Verify App Check blocks unauthenticated requests
- [ ] Verify Firestore rules block unauthorized access
- [ ] Test login rate limiting (5+ failed attempts)
- [ ] Test session timeout (30 min idle)
- [ ] Verify security alerts are received via email
- [ ] Review admin audit log for test events

---

## 9. Monitoring Dashboards

### Firebase Console
- **Authentication → Users**: User growth, provider breakdown
- **Firestore → Usage**: Read/write operations, stored data
- **Functions → Logs**: Function execution logs, errors
- **App Check → Overview**: Attestation stats, rejection rates

### Admin Dashboard (In-App)
- **Audit Log**: All admin actions and security events
- **Security Alerts**: Real-time threat notifications
- **Analytics**: Platform metrics and trends

### External
- **Sentry**: Error tracking and performance monitoring
- **Google Cloud Console**: Detailed IAM, audit logs, VPC flow logs
