# Breach Detection & User Notification — House Hunter

How the team learns a security breach happened the moment it does, and the
pre-agreed plan for telling users — written before it is needed, per
`docs/INCIDENT_RESPONSE.md`.

## 1. How a breach is detected

Error monitoring is Sentry (`src/utils/monitoring/sentry.ts`), enabled in
production when `EXPO_PUBLIC_SENTRY_DSN` is set. **Configure alerting once:**

1. Sentry → Alerts → create an alert on the `production` environment for:
   - `New Issue` with level `error` or `fatal` → notify the on-call owner
     (email + Slack).
   - `New Issue` tagged `category:security`
     (`captureSecurityEvent` in `sentry.ts`) → notify immediately.
2. Firebase Console → Security → **Security rules monitoring** (audit logs of
   denied requests). Spike in denials = possible probing.
3. Firebase Console → Auth → watch for spikes in failed sign-ins or unusual
   new-account bursts for the same provider/IP.
4. Firebase budget alerts remain on (cost anomaly = abuse signal).

High-signal indicators a breach is in progress or occurred:

- Mass `deleteAccount` executions or a burst of `account-deletion` Sentry
  events (someone probing the deletion path or exfiltrating-then-deleting).
- A flood of rules denials on `users/{uid}` reads (credential stuffing /
  enumeration attempts).
- Data export/backup job failures that persist (`DISASTER_RECOVERY.md` §3.2).
- Sentry issues tagged `security` or repeated `auth/wrong-password` on many
  accounts.

## 2. Assessment checklist (first 30 minutes)

1. Confirm scope: which collections, which users, read-only or write?
2. Determine if data was **exposed** (read) vs **modified/deleted** (write).
   - Exposed: assume ALL data in scope is compromised — notify.
   - Write-only abuse (e.g. one spammer): contain, notify if their data was
     visible to others is unaffected; usually no breach notification needed.
3. Revoke what you can immediately: disable the abused account(s), roll back
   rules to last-known-good (`git checkout <prev> -- firestore.rules` +
   `firebase deploy --only firestore:rules`), block the abusive IP/region via
   hosting or Auth.
4. Decide the severity per `docs/INCIDENT_RESPONSE.md` §1 and open the
   incident + postmortem.

## 3. When users must be told

Notify affected users **without undue delay** and in any case:

| Jurisdiction | Deadline |
|---|---|
| GDPR (EU/EEA/UK) | 72 hours after awareness for notifiable breaches |
| US state breach laws (CA, NY, etc.) | Per state statute (often "most expedient time possible") |
| Other | As soon as practical after containment |

Erase-benefit exception: if exposed data was encrypted and keys were not
exposed (or data was otherwise rendered unintelligible), no notification may
be required — confirm before deciding.

## 4. How users are notified

Channels available today:

1. **In-app notice** — highest priority for active users. Implemented:
   `src/components/common/NoticeBanner.tsx` renders a dismissible top banner
   driven by the Firestore doc `config/app_notice`. Publishing is a single
   console write (no app release, no deploy):

   ```
   config/app_notice = {
     active: true,
     title: "Security notice",      // optional
     body: "…",                      // shown to every user
     version: 2,                     // bump to force re-display after dismissal
     dismissible: true,
     actionLabel: "Read the notice", // optional — link button
     actionUrl: "https://…",         // optional — opened with Linking
   }
   ```

   Rules give it public read / console-write (see `firestore.rules` `/config`),
   so it reaches signed-out users on the login screen too.
2. **Email** — user emails are in `users/{uid}.email`. Implemented: Firebase
   Cloud Functions (`functions/`) send through Resend. To email affected
   users, write a breach-broadcast doc (see `functions/README.md`):

   ```
   admin/breach_broadcasts/{id} = {
     status: "pending",
     subject: "…",
     body: "…",                 // template below
     recipientUids: ["uid1", …], // omit to email every user
   }
   ```

   The trigger emails each recipient, then records `sent`/`partial`/`failed`
   with counts back on the doc. Deploy once: `firebase deploy --only functions`
   (requires the Resend env vars in `functions/.env.example`).
3. **App-store / web notice** — update the app description or site with a
   notice for users who do not open the app.

Send the notification to the REGULATOR too where required (GDPR: local DPA,
within 72 h) using the same facts.

## 5. User notification template

Subject: Security notice regarding your House Hunter account

> We are writing to let you know about a security incident that involved
> House Hunter data. [What happened — date, what was accessed, how we found
> it.] [What data was involved — e.g. names, email addresses, listing
> content. Be specific about what was NOT involved, e.g. passwords are
> stored only as irreversible hashes / payment details are not stored.]
> [What we have done — containment, rules rollback, password resets where
> applicable.] [What you should do — change your password, watch for
> suspicious messages, contact us.] If you have questions: support@househunter.com.

Rules for accurate notices: do not speculate; if the full picture is unknown,
notify with what is known and follow up; never pay or acknowledge extortion;
coordinate with law enforcement before publishing if they ask.

## 6. Operator alerting (before user notification)

The same email channel pages the on-call owner first. Writing a doc to
`admin/security_alerts/{id}` emails `ADMIN_ALERT_EMAILS` (or the doc's
`recipientEmails`) with severity/title/body — use it to notify the team the
moment a breach is suspected, before deciding whether users must be told.
(Sentry remains the primary automated detector; this is the human paging
channel and a backup if Sentry is down.)

## 7. Owners

- Detection owner: person on call per `docs/INCIDENT_RESPONSE.md` §4.
- Notification approver (named before an incident): repository maintainer.
- Fill in concrete names/rotations here when the team exists:
  - On-call / detection: ______
  - Notification approver: ______

## 8. Practice

Run a full notification drill quarterly (pair it with the restore drill in
`DISASTER_RECOVERY.md`). Use a throwaway test account and the **staging**
project; never send to real users.

### Drill checklist — notification channels

1. **Deletion confirmation email** — sign in as the throwaway account,
   delete it, and verify the confirmation email arrives at the account's
   address (`functions/README.md` → end-to-end verification, step 1).
2. **Security alert email** — write `admin/security_alerts/drill` with
   `{ severity: "medium", title: "Drill", body: "…",
   recipientEmails: ["oncall@yourdomain.com"] }` and confirm the email
   lands and the doc flips to `status: sent`.
3. **Breach broadcast doc (the core practice)** — write
   `admin/breach_broadcasts/drill` with
   `{ status: "pending", subject: "Security notice regarding your House
   Hunter account", body: <template from §5>, recipientEmails:
   ["oncall@yourdomain.com"] }`. Verify the doc ends at `status: sent`
   with `sentCount: 1` and the email renders correctly. **Never omit
   `recipientEmails` in a drill** — omitting it emails every user.
4. **In-app notice banner** — set `config/app_notice` to
   `{ active: true, title: "Drill notice", body: "…", version: <bump> }`
   and confirm the banner appears on the login screen and dismisses without
   a release. Then set `active: false` and confirm it disappears.
5. **Sentry alert** — raise a test `captureSecurityEvent` in the staging
   build and confirm the configured alert actually fires (docs §1).
6. **Time it** — record the wall-clock time from the simulated breach to
   the last notification sent, and check it against the 72 h clock (docs §3).

A drill counts as passed when every item above completes without a code or
infrastructure change beyond writing the trigger docs.

### After the drill

- Delete the drill docs (`admin/security_alerts/drill`,
  `admin/breach_broadcasts/drill`) and reset `config/app_notice`.
- Note anything that needed manual intervention and fix it before the next
  drill (e.g. missing Resend env var, alert routing gap).
