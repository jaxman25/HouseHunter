# Privacy & Data — House Hunter

This is the engineering companion to the in-app Privacy Policy
(`src/screens/legal/LegalScreens.tsx`). If you change what data the app
collects, update BOTH this document and the in-app policy text.

## Data inventory

| Data | Where it lives | Why it exists | Kept until |
|---|---|---|---|
| Email, display name, role, favorites | `users/{uid}` (Firestore) | Running the account; transactional notices (deletion confirmation, security/breach emails) | Account deletion |
| Optional phone, bio, photo | `users/{uid}` + Storage | Shown to people you message/deal with | Account deletion |
| Terms acceptance (`termsAcceptedAt`, `termsAcceptedVersion`) | `users/{uid}` | Legal consent record | 30 days after account deletion (see below) |
| Listings + photos | `properties/{id}` + Storage | Core product | Listing deletion / account deletion |
| Messages, conversations | `conversations/*` + `messages` | Chat between users | Own messages deleted at account deletion |
| Notifications | `notifications/{id}` | In-app alerts | Account deletion |
| Recently-viewed history (property id + a small display snapshot) | On-device only — AsyncStorage (`@house_hunter/recently_viewed_v1`), never sent to Firebase | Quick return to listings you've seen | User clears it (Settings → Recently Viewed → Clear All) or app data is cleared |
| Error/crash reports | Sentry (only when `EXPO_PUBLIC_SENTRY_DSN` is set) | Reliability | Sentry retention policy |
| Map tiles (web) | Loaded directly from the Google Maps iframe embed | Show map/list locations | N/A — no data stored or sent beyond the map location requested |
| Local cache / session | AsyncStorage / localStorage | Offline use, keep signed in | Cleared via account deletion flow / site data |

## What we deliberately do NOT collect

- No advertising identifiers, no ad-tracking pixels, no cross-site tracking.
- No payment card data (any future payments will be tokenized by the payment
  processor — see `docs/PAYMENT_CONSENT.md`).
- No analytics SDK beyond what is listed above; no purchase of data from
  third parties.
- No third-party image hot-linking: avatar/photo fallbacks are rendered
  locally (initials / themed placeholder), not fetched from external services.
- The only third-party embed is the Google Maps iframe on web (property +
  map screens); it sends no referrer (`referrerPolicy="no-referrer"`) and only
  receives the map location being viewed.
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
5. A best-effort **deletion confirmation email** is sent to the user's own
   address (via `emailService` → the `sendAccountDeletionConfirmation` Cloud
   Function) while the session is still valid. If the function is not
   deployed this is skipped — it never blocks deletion.
6. User profile document, then the Firebase Auth account.

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

## Saved Searches

Saving a search stores the filter criteria, the chosen name, notification
frequency, and match counts under `users/{uid}/savedSearches` in Firestore.
Unlike Recently Viewed (on-device only), saved searches are **server-side** so
they follow the user across devices. They are deleted with the account
(Account deletion step: the `savedSearches` subcollection is removed), and a
user can delete individual searches at any time from the Saved Searches
screen. Pausing a search stops future matching/notifications; nothing about a
saved search is shared with third parties.

## Contact Seller via Email

When a buyer sends an email inquiry from a property detail page, the buyer's
**display name, email address, and message text** are sent to the seller by
email (via Resend, through the `sendSellerInquiry` Cloud Function). The
seller's email address is resolved server-side and is never exposed to the
app or other buyers. The inquiry also creates an in-app notification for the
seller and increments the listing's inquiry counter. Guards in place:

- The buyer must have a **verified email** before sending (anti-spam).
- A **daily rate limit of 5 inquiries per user** is enforced server-side.
- Sellers can **opt out** per listing (`contactEnabled = false`) and can
  block further contact through the platform's moderation tools.
- Inquiries are **not stored** in Firestore (the email + notification are the
  only records), so there is no message archive beyond the recipient's inbox.

## Moderation & admin access

Reporting a listing stores the property id, a reason (inappropriate / scam /
duplicate / other), optional details, and the reporter's user id under
`admin/reports`; the seller does **not** see who reported. Suspension records a
reason and expiry on the user document — a suspended user's data remains
readable (GDPR) but they cannot create listings, messages, or inquiries.
Announcements published by admins render as a dismissible banner. Every admin
action is appended to `admin/auditLog` with the acting admin's uid. Admin
roles live in `admin/roles` and are provisioned by operators only — there is
no self-service admin signup.

## Archives

Closed listings (sold/pending/inactive) may be **auto-archived** by the daily
Cloud Function (sold 30d, pending 60d, inactive 90d) or archived manually by
the seller. Archiving is a soft-hide: the document and its images remain in
Firestore for the seller, for analytics, and for chat history, but the listing
leaves default browse results. Sellers can restore an archived listing at any
time; the auto-archive job notifies them in-app when it archives a listing.

## Data subject requests

Email `support@househunter.com` with the account email. Because deletion and
correction are already self-service in-app, most requests are handled by
pointing the user at Settings → Edit Profile / Delete Account. A backup
restore (rare) may recreate recently-deleted data — see the incident-response
docs for how restores are gated.
