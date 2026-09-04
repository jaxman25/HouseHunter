# Data Migrations & Schema Versioning — House Hunter

How document shapes evolve in this Firestore-backed app without breaking
running clients, the security rules, or the indexes.

Firestore has no built-in migration system: documents are schemaless and rules
are the only shape enforcement. This doc defines the convention the codebase
follows so a schema change is a deliberate, reviewable step.

---

## 1. Current schema (baseline)

| Collection | Key fields | Enforced by |
|---|---|---|
| `users/{uid}` | `uid, email, displayName, phoneNumber, photoURL, bio, role, favorites[], createdAt, updatedAt` | `firestore.rules` → `userDataIsValid()` (create) + update field allowlist |
| `properties/{id}` | `title, description, price, listingType, propertyType, status, address, city, state, zipCode, country, latitude, longitude, bedrooms, bathrooms, area, areaUnit, yearBuilt, images[], features[], amenities[], userId, userName, userPhoto, userPhone, views, inquiries, version, createdAt, updatedAt` | `firestore.rules` → `propertyDataIsValid()` (create), `propertyEditFieldsAreValid()` + `versionBumpedExactlyOnce()` (update) |
| `conversations/{id}` | `participants[], participantNames{}, participantPhotos{}, lastMessage, lastMessageTime, lastMessageSenderId, unreadCount{}, propertyId, propertyTitle, propertyImage, createdAt, updatedAt` | `firestore.rules` → conversation `create` key check |
| `conversations/{id}/messages/{id}` | `conversationId, senderId, text, read, createdAt (server Timestamp), image?` | `firestore.rules` → message `create` key check |
| `notifications/{id}` | `userId, title, body, type, data{}, read, createdAt` | `firestore.rules` → notification `create` key check |
| `counters/{uid}` | `minute, writes` | `firestore.rules` → `withinWriteLimit()` |

## 2. The schema-versioning convention

- **Additive changes only** in a single release: adding a new field never
  requires a backfill before the client ships — old docs simply lack it, and
  client code treats it as optional (`?? default`).
- **Breaking changes** (rename/remove/rettype a field) require a **two-phase
  rollout**: phase 1 ships code that writes the new field *and* still reads the
  old one; phase 2 (after backfill) drops the old field.
- **`version` on `properties`** is an optimistic-lock counter (see
  `firestore.rules` `versionBumpedExactlyOnce()`), **not** a schema marker.
  Docs without it are treated as version 0 by both rules and client, which is
  exactly the backward-compatibility pattern to copy for new fields.
- If a collection's shape ever needs an explicit schema marker, add
  `sv: <int>` (schema version) to the create-time `...DataIsValid()` rules and
  bump it per migration — the properties `version` field shows the wiring.

### Rules checklist for any field change

1. Add/remove the field in the matching `...DataIsValid()` / edit-allowlist
   function in `firestore.rules`.
2. Add/remove it in the TypeScript interface (`src/types/index.ts`) and in
   `src/utils/validators.ts` when the field is user-entered.
3. If the field participates in a query, update `firestore.indexes.json` **and**
   `scripts/check-indexes.js` (the CI coverage list) — the CI check fails
   otherwise.
4. If it affects cached data, confirm the cache serializer tolerates the new
   shape (`src/utils/cache/cacheService.ts` `serialize()` handles
   Timestamp-shaped objects; `stableStringify` handles filter objects).

## 3. Migration runbook

Most "migrations" here are backfills of existing documents. Run them once,
from a trusted environment (CI with a service account, not the app client).

### 3.1 Additive backfill (e.g. "set `version` on all properties")

```js
// scripts/backfill-version.js — run with a service account (firebase-admin)
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// GOOGLE_APPLICATION_CREDENTIALS=service-account.json node scripts/backfill-version.js
const db = getFirestore();

async function backfill() {
  const snap = await db.collection('properties').get();
  const writes = [];
  let i = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (typeof data.version === 'number') continue; // already migrated
    writes.push(
      db.collection('properties').doc(doc.id).update({
        version: data.version ?? 0, // legacy docs act as version 0
        updatedAt: data.updatedAt,   // don't churn the timestamp
      })
    );
    if (++i % 400 === 0) { await Promise.all(writes.splice(0)); }
  }
  await Promise.all(writes);
  console.log(`Backfilled ${snap.size} properties`);
}

backfill().catch((e) => { console.error(e); process.exit(1); });
```

Notes:
- **Batch size:** `Promise.all` in chunks of ≤ 400 (client batches cap at 500).
- **Idempotent:** skip docs already carrying the field, so re-running is safe.
- **Rate rules:** `counters` rate limiting applies to *client* writes through
  rules; `firebase-admin` bypasses rules, so no counter bump is needed.

### 3.2 Field rename (two-phase example)

1. **Phase 1 (release N):** client writes the new field; rules allowlist both;
   readers prefer new field, fall back to old. Backfill old → new.
2. **Phase 2 (release N+1):** remove old field from types, rules allowlist,
   and any remaining reads.

### 3.3 After a restore / fresh project

- Redeploy `firestore.indexes.json` and `firestore.rules` + `storage.rules`
  (`npx firebase-tools deploy --only firestore:rules,storage:rules,firestore:indexes`)
  — exports don't include rules or indexes (see `docs/DISASTER_RECOVERY.md` §7).

## 4. Migration log

| Date | Change | Phase | Backfill | Status |
|---|---|---|---|---|
| 2026-09-04 | `properties.version` added (optimistic locking) | Additive — rules treat missing as 0 | None required (client + rules fallback) | ✅ |
| 2026-09-04 | `messages.createdAt` → server `Timestamp` | Additive (server Timestamp vs ISO string both normalized in `subscribeToMessages`) | None required | ✅ |