# Privacy & Data — House Hunter

This is the engineering companion to the in-app Privacy Policy
(`src/screens/legal/LegalScreens.tsx`). If you change what data the app
collects, update BOTH this document and the in-app policy text.

## Data inventory

| Data | Where it lives | Why it exists | Kept until |
|---|---|---|---|
| Email, display name, role, favorites | `users/{uid}` (Firestore) | Running the account | Account deletion |
| Optional phone, bio, photo | `users/{uid}` + Storage | Shown to people you message/deal with | Account deletion |
| Terms acceptance (`termsAcceptedAt`, `termsAcceptedVersion`) | `users/{uid}` | Legal consent record | 30 days after account deletion (see below) |
| Listings + photos | `properties/{id}` + Storage | Core product | Listing deletion / account deletion |
| Messages, conversations | `conversations/*` + `messages` | Chat between users | Own messages deleted at account deletion |
| Notifications | `notifications/{id}` | In-app alerts | Account deletion |
| Error/crash reports | Sentry (only when `EXPO_PUBLIC_SENTRY_DSN` is set) | Reliability | Sentry retention policy |
| Local cache / session | AsyncStorage / localStorage | Offline use, keep signed in | Cleared via account deletion flow / site data |

## What we deliberately do NOT collect

- No advertising identifiers, no ad-tracking pixels, no cross-site tracking.
- No payment card data (any future payments will be tokenized by the payment
  processor — see `docs/PAYMENT_CONSENT.md`).
- No analytics SDK beyond what is listed above; no purchase of data from
  third parties.
- Sentry reports exclude message contents, passwords, and payment details.
  When adding data to a Sentry event, keep it to ids and operation names.

## Minimization rules for contributors

1. Before adding a field or SDK, ask: can the feature work without it? Default
   is no.
2. Mark the field `optional` in `src/types/index.ts` until it exists for every
   user (avoid undefined-required migrations).
3. Add it to the table above and to the Privacy Policy text.
4. If it is personal data, verify the account-deletion flow in
   `src/services/accountService.ts` removes it.

## Cookies / local storage (web)

The web build shows a consent banner (`src/components/common/CookieConsentBanner.tsx`).
Storage is categorized:

- **Essential** (always used, cannot be declined): auth session, consent
  preference itself, viewed-data cache.
- **Optional** (today: none enabled). When optional trackers are added, they
  MUST be gated behind the banner choice (`accepted` vs `declined`), which is
  persisted under `CONSENT_STORAGE_KEY`.

## Account deletion

`Settings → Delete Account` (`src/screens/settings/DeleteAccountScreen.tsx`)
runs `accountService.deleteAccountData(uid)` then `authService.deleteAuthAccount()`:

1. Profile avatar file in Storage.
2. Listings (docs + Storage images).
3. Notifications.
4. Own chat messages, and removal of the user from conversation participant /
   unread metadata (shared conversation documents are kept for the other
   participant).
5. User profile document, then the Firebase Auth account.

Security rules permit a user to delete their own messages
(`firestore.rules`), which is required for step 4. If any category fails the
user is told which part could not be removed and is directed to support; the
failure also goes to Sentry as `account-deletion`.

**Consent record:** `termsAcceptedAt`/`termsAcceptedVersion` live on the user
document. Once the auth account is deleted the record is gone; a manual
erasure request from a user who already deleted their account only needs their
email (no retained profile data exists to erase beyond backups — see
`DISASTER_RECOVERY.md` for restore windows, which retain encrypted copies
only for the restore window).

## Data subject requests

Email `support@househunter.com` with the account email. Because deletion and
correction are already self-service in-app, most requests are handled by
pointing the user at Settings → Edit Profile / Delete Account. A backup
restore (rare) may recreate recently-deleted data — see the incident-response
docs for how restores are gated.
