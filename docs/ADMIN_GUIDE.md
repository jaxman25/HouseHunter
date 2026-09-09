# House Hunter — Admin Guide

The admin suite is a set of moderation tools for platform staff. Access is
**role-gated**: an account only sees the admin UI when its uid is listed in
the `admin/roles` collection (`admin/roles/{uid}`). Roles are provisioned by
an operator via the Firebase console or Admin SDK — there is no self-service
admin signup, and client rules deny writes to `admin/roles`.

## Granting admin access

```
Firebase console → Firestore → admin/roles → Add document
  Document ID: <user's Firebase Auth uid>
  Fields: { grantedAt: <server timestamp>, grantedBy: "<operator email>" }
```

The user's `admin/roles/{uid}` document is readable by that user (used by
`useAdmin()` to gate the UI) and writable only by operators (rules: `write:
if false` for clients).

## Reaching the admin suite

1. Sign in as an admin account in the app.
2. Profile tab → **Admin Tools** (only visible to admins).
3. The suite has five sections (tab row at the top of each screen):

| Section | Purpose |
|---|---|
| **Dashboard** | Live metrics: total users, listings, active listings, pending reports. Quick links to the other sections. |
| **Users** | Search by name/email/uid; suspend with a reason and duration (3 days / 14 days / permanent); unsuspend. |
| **Reports** | Triage user-submitted reports: dismiss, resolve (keep the listing), or delete the listing. |
| **Analytics** | Count metrics plus listings-by-status and reports-by-status distributions. |
| **Settings** | Publish in-app announcements (title, body, active immediately) and activate/pause existing ones. |

## Moderation workflows

### Suspending a user

- Users → search → **Suspend** → enter a reason → pick a duration.
- Suspended users keep access to their own data (GDPR) but cannot create
  listings, conversations, messages, or inquiries (enforced in
  `firestore.rules`).
- Suspension expiry is stored on the user doc; a temporary suspension does
  **not** auto-unsuspend in the app UI — unsuspend manually when the expiry
  passes (the rule check is live, so the user is unblocked automatically once
  the rules are consulted — see `isSuspended()`).

### Triaging reports

- Reports arrive under `admin/reports` with status `pending`, created by any
  signed-in user from the property detail screen (reason: inappropriate,
  scam, duplicate, or other). The reporter's identity is never shown to the
  seller.
- **Dismiss** — no action needed; marks `dismissed`.
- **Resolve** — keep the listing, mark `resolved` (e.g. seller contacted).
- **Delete listing** — removes the property document (and its images remain
  in Storage for retention cleanup). Requires the admin update/delete rule
  path; recorded in the audit log with a resolution note.

### Announcements

- Announcements render as a dismissible banner (NoticeBanner) to signed-in
  users — the most recent **active** one wins over the operator notice at
  `config/app_notice`.
- Pause an announcement to stop showing it without deleting it.

## Audit trail

Every admin action calls `logAudit()` writing to `admin/auditLog`:

```
{ actorUid, action, detail, createdAt }
```

Actions recorded: `user.suspend`, `user.unsuspend`, `report.dismiss`,
`report.resolve`, `report.delete`, `announcement.create`,
`announcement.toggle`.

## Notes & limits

- The admin UI is client-side; the security rules are the real enforcement
  layer. Rules deny all client writes to `admin/**` except: role reads,
  report creation by any signed-in user, and admin read/write of
  announcements/reports/auditLog.
- Metrics use Firestore `count()` aggregation (no backend needed); they are
  approximate for large datasets by design.
- Admin users cannot moderate themselves (`You` badge in the Users list).