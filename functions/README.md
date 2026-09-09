# House Hunter — Cloud Functions (email channel)

Transactional email for the workflows documented in `docs/BREACH_NOTIFICATION.md`:

1. **Security alerts** — writing a doc to `admin/security_alerts/{id}` emails the
   on-call inbox (Sentry stays the primary real-time detector; this is the
   paging/email channel).
2. **Breach broadcasts** — writing a doc to `admin/breach_broadcasts/{id}`
   emails every affected user (or an explicit recipient list).
3. **Deletion confirmation** — the app calls `sendAccountDeletionConfirmation`
   right before an account is deleted so the user gets a confirmation email.
4. **Seller inquiries** — the app calls the `sendSellerInquiry` callable when a
   buyer uses "Contact Seller via Email"; the function validates the listing,
   rate-limits per user (5/day), and emails the seller through Resend.
5. **Auto-archive** — a scheduled job (`every day 02:00`) soft-hides stale
   closing listings (sold/rented 30d, pending 60d, inactive 90d) and notifies
   sellers in-app.

Emails are sent through [Resend](https://resend.com) using plain `fetch`
(`functions/src/email.ts`).

## Why Resend

Chosen via the Gravity Index for a developer-friendly transactional email API
with a generous free tier and no server management. Resend supports API-key
auth and is designed to run from serverless functions.

## Setup (one time)

1. Create an account at https://resend.com and verify your sending domain.
2. Create an API key: Resend → API Keys.
3. Configure the functions environment variables (see `.env.example`):

   | Variable                | Purpose                                        |
   | ----------------------- | ---------------------------------------------- |
   | `RESEND_API_KEY`        | Resend API key (required to send)              |
   | `NOTIFICATION_FROM_EMAIL` | Verified sender, e.g. `House Hunter <no-reply@your-domain.com>` |
   | `ADMIN_ALERT_EMAILS`    | Comma-separated on-call inbox(es) for alerts   |

   Prefer Firebase Secrets for production:
   ```bash
   firebase functions:secrets:set RESEND_API_KEY
   firebase functions:secrets:set NOTIFICATION_FROM_EMAIL
   firebase functions:secrets:set ADMIN_ALERT_EMAILS
   ```
   (This package reads plain `process.env`, so `functions.config()` is not
   used. Secrets set with `firebase functions:secrets:set` are injected as
   environment variables automatically.)

## Local development

```bash
cd functions
npm install
cp .env.example .env   # fill in real values
npm run typecheck
```

To run locally with the emulator, load `.env` into the shell before
`firebase emulators:start` (Functions v2 reads `process.env`).

## Deploy

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

The root `firebase.json` already points at `functions/`. Runtime is Node 20
(declared in `functions/package.json` — keep in sync with `firebase.json`).

## Usage

### Alert the on-call inbox (security event)

From the Firebase console (or an Admin SDK script), create:

```
Collection: admin/security_alerts
Doc id:     <anything unique>
Fields:
  severity:   "critical" | "high" | "medium" | "low"
  title:      "Repeated failed sign-ins detected"
  body:       "What happened, what was checked, current status."
  source:     optional — where the alert originated
  recipientEmails: optional — overrides ADMIN_ALERT_EMAILS
```

The function emails the recipients and sets `status: sent` (or `failed` with
an `error` field).

### Broadcast a breach notice to users

```
Collection: admin/breach_broadcasts
Doc id:     <anything unique>
Fields:
  status:   "pending"
  subject:  "Security notice regarding your House Hunter account"
  body:     "Plain-text message for users (see the template in docs/BREACH_NOTIFICATION.md §5)."
  recipientUids:    optional — email only these uids
  recipientEmails:  optional — explicit email list (overrides uids)
```

Omitting both recipient lists emails **every user who has an email address**.
The function writes back `status: sent | partial | failed`, `sentCount`,
`failedCount`, and (up to 50) `failures`.

Clients cannot write to `admin/**` (firestore.rules denies it) — only you,
via the console or an Admin SDK, can trigger these.

### Deletion confirmation email

The app calls `sendAccountDeletionConfirmation` automatically during
Delete Account (best-effort — if the function isn't deployed, deletion still
proceeds). The recipient is the signed-in user's own email from the auth
token, never caller-supplied, so the endpoint cannot be used to relay spam.

## Testing

Automated unit tests run with Node's built-in test runner (no framework):

```bash
cd functions
npm test   # builds then runs test/email.test.js
```

Coverage: the Resend request shape (auth header, payload, HTML escaping),
missing-key and non-2xx failures, and the deletion-confirmation + security-
alert message builders. These also run in CI (`.github/workflows/ci.yml`).

### End-to-end verification after deploy

The unit tests mock the network; a true end-to-end check needs a deployed
function and a real Resend key. Run this after the first `firebase deploy`:

1. **Deletion confirmation email** — in the app, sign in with a throwaway
   account and delete it (Settings → Delete Account). Within seconds the
   account's email should receive "Your House Hunter account has been
   deleted".
   - Confirm the callable was invoked: `firebase functions:log --only
     sendAccountDeletionConfirmation`.
2. **Security alert email** — from the Firebase console create
   `admin/security_alerts/smoke-test` with `{ severity: "low",
   title: "Smoke test", body: "Verifying alert email",
   recipientEmails: ["you@yourdomain.com"] }`. You should receive the alert
   email and the doc should flip to `status: sent`.
3. **Breach broadcast email** — create `admin/breach_broadcasts/smoke-test`
   with `{ status: "pending", subject: "Test broadcast", body: "Test",
   recipientEmails: ["you@yourdomain.com"] }` (never omit `recipientEmails`
   for a smoke test — omitting it emails every user). The doc should end at
   `status: sent` with `sentCount: 1`.

Watch failures on the docs themselves: each trigger records `status` plus an
`error` field, which is the first place to look if an email doesn't arrive.

## Environment variables

| Variable | Used by |
|---|---|
| `RESEND_API_KEY` | All email (required) |
| `NOTIFICATION_FROM_EMAIL` | All email (defaults to House Hunter <no-reply@househunter.com>) |
| `ADMIN_ALERT_EMAILS` | Security alerts (comma-separated on-call inboxes) |
| `APP_ORIGIN` | `sendSellerInquiry` deep link in the email (defaults to https://househunter.app) |

## Notes

- Firestore triggers retry on transient failure; config errors (e.g. missing
  `RESEND_API_KEY`) are recorded on the doc as `status: failed` instead of
  retrying forever.
- Very large broadcasts run under bounded concurrency (10 parallel sends);
  Cloud Functions' default timeout is enough for thousands of recipients. For
  a large user base, chunk by `recipientUids`.
