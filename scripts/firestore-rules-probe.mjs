/**
 * Firestore rules probe + regression suite (run under the Firestore emulator).
 *
 * Usage:
 *   npx firebase emulators:exec --only firestore --project rules-probe \
 *     "node scripts/firestore-rules-probe.mjs"
 *
 * Part 1 probes whether server-time minute binding (Option A) is expressible:
 *   minute = request.time.toMillis() / 60000   (CEL integer division)
 * Part 2 runs regression tests against the repo's actual firestore.rules:
 *   T1 property create (honest batch with counter bump)   → allowed
 *   T2 view bump (+1, no counter write)                   → allowed
 *   T3 view bump (+2)                                     → denied
 *   T4 message send by participant (no counter write)     → allowed
 *   T5 message send by non-participant                    → denied
 *   T6 counters write with extra field                    → denied
 *   T7 create with verified:true                          → denied
 *   T8 owner flips verified (valid bump + counter)        → denied
 *   T9 owner writes response-time stats                   → denied
 *   T10 admin toggles verified                            → allowed
 *   T11 view event `{uid}_{yyyy-mm-dd}` + { userId }      → allowed
 *   T12 same-id re-create (duplicate view)                → denied
 *   T13 id forged with another uid                        → denied
 *   T14 non-YYYY-MM-DD date suffix                        → denied
 *   T15 payload userId != author                          → denied
 *   T16 view event delete                                 → denied
 *   T17 unrelated-user read / author read                 → denied / allowed
 *   T18 admin reads config/metrics                        → allowed
 *   T19 non-admin reads config/metrics                    → denied
 *   T20 anyone reads config/app_notice (public config)    → allowed
 *   T21 admin writes config/metrics (client write)        → denied
 *   T22 client writes users/{uid}/meta/chat               → denied
 *   T23 meta/chat owner read / other-user read            → allowed / denied
 *   T24 own reads/{uid} receipt (server time)             → allowed
 *   T25 receipt forged with another uid                   → denied
 *   T26 receipt shape-locked (extra field / client time)  → denied
 *   T27 receipt delete                                    → denied
 */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  increment,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const ADMIN = 'admin-uid';
let failures = 0;

function report(name, ok, err) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${err ? ' — ' + err.message : ''}`);
  if (!ok) failures += 1;
}

// ─── Part 1: is server-time minute binding expressible? ────────────────
async function probeServerTime() {
  const rules = `
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /probe/{docId} {
          allow create: if request.resource.data.minute ==
            request.time.toMillis() / 60000;
        }
      }
    }`;
  try {
    const env = await initializeTestEnvironment({
      projectId: 'rules-probe-arith',
      firestore: { rules, host: '127.0.0.1', port: 8080 },
    });
    // v5 API: no `env.db` handle — go through an unauthenticated context
    // (the probe rules below don't require auth).
    const db = env.unauthenticatedContext('').firestore();
    const minute = Math.floor(Date.now() / 60000);
    await assertSucceeds(
      setDoc(doc(db, 'probe/x'), { minute }),
      'honest current-minute write should pass'
    );
    await assertFails(
      setDoc(doc(db, 'probe/y'), { minute: minute + 999 }),
      'far-future minute should be denied'
    );
    await env.cleanup();
    console.log('PROBE: request.time.toMillis()/60000 IS expressible ✓');
    return true;
  } catch (err) {
    console.log('PROBE: NOT expressible —', err.message);
    return false;
  }
}

// ─── Part 2: regression suite against the real rules ───────────────────
function validPropertyData(uid) {
  return {
    title: 'Test listing', description: 'A place', price: 1000,
    listingType: 'sale', propertyType: 'house', status: 'active',
    address: '1 Main St', city: 'Springfield', state: 'IL', zipCode: '62701',
    country: 'US', latitude: 39.78, longitude: -89.65, bedrooms: 3,
    bathrooms: 2, area: 120, areaUnit: 'sqft', yearBuilt: 2000,
    images: [], features: [], amenities: [],
    userId: uid, userName: 'Alice', userPhoto: '', userPhone: '',
    views: 0, inquiries: 0, version: 1, archived: false,
    contactEnabled: true, verified: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
}

async function regressionSuite() {
  const env = await initializeTestEnvironment({
    projectId: 'rules-probe-app',
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });

  // Seed a property + a conversation, bypassing rules (admin-style setup).
  await env.withSecurityRulesDisabled(async (ctx) => {
    const adb = ctx.firestore();
    await setDoc(doc(adb, 'properties', 'prop1'), validPropertyData(BOB));
    await setDoc(doc(adb, 'conversations', 'conv1'), {
      participants: [ALICE, BOB],
      participantNames: { [ALICE]: 'Alice', [BOB]: 'Bob' },
      participantPhotos: {},
      lastMessage: '', lastMessageTime: '', lastMessageSenderId: '',
      unreadCount: {}, propertyId: 'prop1', propertyTitle: 'T',
      propertyImage: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    // Admin role doc for T10 — isAdmin() only checks exists(admin_roles/{uid}).
    await setDoc(doc(adb, 'admin_roles', ADMIN), { role: 'admin' });
  });

  const alice = env.authenticatedContext(ALICE);

  // T1 — honest property create: batch = property + counter bump (client contract).
  try {
    const batch = writeBatch(alice.firestore());
    batch.set(doc(alice.firestore(), 'properties', 'prop2'), validPropertyData(ALICE));
    batch.set(
      doc(alice.firestore(), 'counters', ALICE),
      { minute: Math.floor(Date.now() / 60000), writes: increment(1) },
      { merge: true }
    );
    await assertSucceeds(batch.commit(), 'T1 honest property create');
    report('T1 property create with counter bump', true);
  } catch (e) { report('T1 property create with counter bump', false, e); }

  // T2 — view bump without counter write must now pass.
  try {
    await assertSucceeds(
      updateDoc(doc(alice.firestore(), 'properties', 'prop1'), { views: increment(1) }),
      'T2 view bump'
    );
    report('T2 view bump (no counter write) allowed', true);
  } catch (e) { report('T2 view bump (no counter write) allowed', false, e); }

  // T3 — +2 view bump must stay denied.
  try {
    await assertFails(
      updateDoc(doc(alice.firestore(), 'properties', 'prop1'), { views: increment(2) }),
      'T3 +2 view bump'
    );
    report('T3 +2 view bump denied', true);
  } catch (e) { report('T3 +2 view bump denied', false, e); }

  // T4 — participant message send without counter write must pass.
  try {
    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'conversations/conv1/messages', 'm1'), {
        conversationId: 'conv1', senderId: ALICE, text: 'hi', read: false,
        createdAt: serverTimestamp(),
      }),
      'T4 message send'
    );
    report('T4 participant message send (no counter write) allowed', true);
  } catch (e) { report('T4 participant message send (no counter write) allowed', false, e); }

  // T5 — non-participant message send denied.
  try {
    const mallory = env.authenticatedContext('mallory-uid');
    await assertFails(
      setDoc(doc(mallory.firestore(), 'conversations/conv1/messages', 'm2'), {
        conversationId: 'conv1', senderId: 'mallory-uid', text: 'spam',
        read: false, createdAt: serverTimestamp(),
      }),
      'T5 non-participant send'
    );
    report('T5 non-participant message send denied', true);
  } catch (e) { report('T5 non-participant message send denied', false, e); }

  // T6 — counters doc with an extra field denied (shape lock).
  try {
    await assertFails(
      setDoc(doc(alice.firestore(), 'counters', ALICE),
        { minute: 1, writes: 1, evil: true }, { merge: true }),
      'T6 extra field'
    );
    report('T6 counters write with extra field denied', true);
  } catch (e) { report('T6 counters write with extra field denied', false, e); }

  // T7 — crafted create with verified:true must be denied (admin-only flag).
  try {
    const b7 = writeBatch(alice.firestore());
    b7.set(
      doc(alice.firestore(), 'properties', 'evil1'),
      { ...validPropertyData(ALICE), verified: true }
    );
    b7.set(
      doc(alice.firestore(), 'counters', ALICE),
      { minute: Math.floor(Date.now() / 60000), writes: increment(1) },
      { merge: true }
    );
    await assertFails(b7.commit(), 'T7 create verified:true');
    report('T7 create with verified:true denied', true);
  } catch (e) { report('T7 create with verified:true denied', false, e); }

  // T8 — owner flipping verified must be denied even with a valid version
  // bump + counter write (isolates the allowlist: all other conditions pass).
  try {
    const b8 = writeBatch(alice.firestore());
    b8.update(doc(alice.firestore(), 'properties', 'prop2'), {
      verified: true,
      version: increment(1),
    });
    b8.set(
      doc(alice.firestore(), 'counters', ALICE),
      { minute: Math.floor(Date.now() / 60000), writes: increment(1) },
      { merge: true }
    );
    await assertFails(b8.commit(), 'T8 owner sets verified');
    report('T8 owner sets verified denied', true);
  } catch (e) { report('T8 owner sets verified denied', false, e); }

  // T9 — owner writing response-time stats must be denied (Cloud-Function-only
  // fields; also with a valid version bump + counter write).
  try {
    const b9 = writeBatch(alice.firestore());
    b9.update(doc(alice.firestore(), 'properties', 'prop2'), {
      avgResponseMinutes: 1,
      conversationCount: 3,
      version: increment(1),
    });
    b9.set(
      doc(alice.firestore(), 'counters', ALICE),
      { minute: Math.floor(Date.now() / 60000), writes: increment(1) },
      { merge: true }
    );
    await assertFails(b9.commit(), 'T9 owner writes response stats');
    report('T9 owner writes response-time stats denied', true);
  } catch (e) { report('T9 owner writes response-time stats denied', false, e); }

  // T10 — admin verified toggle must be allowed (moderation branch).
  try {
    const admin = env.authenticatedContext(ADMIN);
    await assertSucceeds(
      updateDoc(doc(admin.firestore(), 'properties', 'prop1'), { verified: true }),
      'T10 admin sets verified'
    );
    report('T10 admin sets verified allowed', true);
  } catch (e) { report('T10 admin sets verified allowed', false, e); }

  // ─── T11–T16: viewEvents rate-limit guard ──────────────────────────
  // Create-only `properties/{id}/viewEvents/{uid}_{yyyy-mm-dd}`: the doc-id
  // is the guard (one id per user per property per day, no overwrite), the
  // payload is shape-locked to { userId == author }, and reads stay
  // need-to-know (owner / author / admin).
  const utcDay = new Date().toISOString().slice(0, 10);
  const aliceEventId = `${ALICE}_${utcDay}`;
  const aliceEventRef = (id) =>
    doc(alice.firestore(), 'properties', 'prop1', 'viewEvents', id);

  // T11 — honest view event: id `{auth.uid}_{yyyy-mm-dd}`, payload { userId }.
  try {
    await assertSucceeds(
      setDoc(aliceEventRef(aliceEventId), { userId: ALICE }),
      'T11 view event create'
    );
    report('T11 view event create (uid_date, {userId}) allowed', true);
  } catch (e) { report('T11 view event create (uid_date, {userId}) allowed', false, e); }

  // T12 — re-create of the same id (an overwrite = update) must be denied:
  // this is what caps counting at one view per user per property per day.
  try {
    await assertFails(
      setDoc(aliceEventRef(aliceEventId), { userId: ALICE }),
      'T12 duplicate view event'
    );
    report('T12 duplicate view event (same day) denied', true);
  } catch (e) { report('T12 duplicate view event (same day) denied', false, e); }

  // T13 — the id's uid prefix must be the AUTHOR's own uid (no forging
  // another user's slot, no inflating someone else's event space).
  try {
    await assertFails(
      setDoc(aliceEventRef(`${BOB}_${utcDay}`), { userId: ALICE }),
      'T13 forged uid prefix'
    );
    report('T13 event id forged with another uid denied', true);
  } catch (e) { report('T13 event id forged with another uid denied', false, e); }

  // T14 — the date suffix must be exactly YYYY-MM-DD (the trigger separately
  // checks it equals the event's own UTC day).
  try {
    await assertFails(
      setDoc(aliceEventRef(`${ALICE}_today`), { userId: ALICE }),
      'T14 malformed date suffix'
    );
    report('T14 non-YYYY-MM-DD date suffix denied', true);
  } catch (e) { report('T14 non-YYYY-MM-DD date suffix denied', false, e); }

  // T15 — payload is shape-locked: userId must equal the author.
  try {
    await assertFails(
      setDoc(aliceEventRef(`${ALICE}_2000-01-01`), { userId: BOB }),
      'T15 payload userId mismatch'
    );
    report('T15 payload userId != author denied', true);
  } catch (e) { report('T15 payload userId != author denied', false, e); }

  // T16 — no deletion either: view events are immutable audit records.
  try {
    await assertFails(
      deleteDoc(aliceEventRef(aliceEventId)),
      'T16 delete view event'
    );
    report('T16 view event delete denied', true);
  } catch (e) { report('T16 view event delete denied', false, e); }

  // T17 — read scoping: an unrelated authenticated user cannot read another
  // user's view event (viewer identity is personal data); the author themself
  // can read their own.
  try {
    const mallory = env.authenticatedContext('mallory-uid');
    await assertFails(
      getDoc(doc(mallory.firestore(), 'properties', 'prop1', 'viewEvents', aliceEventId)),
      'T17 unrelated user read'
    );
    await assertSucceeds(
      getDoc(aliceEventRef(aliceEventId)),
      'T17b author read of own event'
    );
    report('T17 unrelated user read denied / author read allowed', true);
  } catch (e) { report('T17 unrelated user read denied / author read allowed', false, e); }

  // ─── T18–T21: config/metrics (maintained platform counters) ──────────
  await env.withSecurityRulesDisabled(async (ctx) => {
    const adb = ctx.firestore();
    await setDoc(doc(adb, 'config', 'app_notice'), { message: 'hi' });
    await setDoc(doc(adb, 'config', 'metrics'), { users: 7, properties: 3 });
  });

  const adminCtx = env.authenticatedContext(ADMIN);
  const aliceCtx = env.authenticatedContext(ALICE);

  // T18 — admins read the maintained metrics doc.
  try {
    await assertSucceeds(
      getDoc(doc(adminCtx.firestore(), 'config', 'metrics')),
      'T18 admin reads config/metrics'
    );
    report('T18 admin reads config/metrics allowed', true);
  } catch (e) { report('T18 admin reads config/metrics allowed', false, e); }

  // T19 — aggregates are not public: non-admin authenticated read denied.
  try {
    await assertFails(
      getDoc(doc(aliceCtx.firestore(), 'config', 'metrics')),
      'T19 non-admin reads config/metrics'
    );
    report('T19 non-admin read of config/metrics denied', true);
  } catch (e) { report('T19 non-admin read of config/metrics denied', false, e); }

  // T20 — the rest of config/ stays public (NoticeBanner reads app_notice).
  try {
    await assertSucceeds(
      getDoc(doc(aliceCtx.firestore(), 'config', 'app_notice')),
      'T20 public config read'
    );
    await assertSucceeds(
      getDoc(doc(env.unauthenticatedContext('').firestore(), 'config', 'app_notice')),
      'T20b signed-out config read'
    );
    report('T20 config/app_notice stays publicly readable', true);
  } catch (e) { report('T20 config/app_notice stays publicly readable', false, e); }

  // T21 — config writes are denied to EVERY client, even admins (the
  // platformMetrics Cloud Function writes it via the Admin SDK, bypassing rules).
  try {
    await assertFails(
      setDoc(doc(adminCtx.firestore(), 'config', 'metrics'), { users: 999 }),
      'T21 admin writes config/metrics'
    );
    await assertFails(
      setDoc(doc(aliceCtx.firestore(), 'config', 'metrics'), { users: 1 }),
      'T21b non-admin writes config/metrics'
    );
    report('T21 client write to config/metrics denied (admin + non-admin)', true);
  } catch (e) { report('T21 client write to config/metrics denied (admin + non-admin)', false, e); }

  // ─── T22–T27: chat meta + batched read receipts ───────────────────
  // T22 — `users/{uid}/meta/chat` is Cloud-Function-only: no client write.
  try {
    await assertFails(
      setDoc(doc(aliceCtx.firestore(), 'users', ALICE, 'meta', 'chat'), { unreadCount: 99 }),
      'T22 client writes meta/chat'
    );
    report('T22 client write to users/{uid}/meta/chat denied', true);
  } catch (e) { report('T22 client write to users/{uid}/meta/chat denied', false, e); }

  // T23 — meta/chat is personal: owner reads it, other users cannot.
  try {
    await assertSucceeds(
      getDoc(doc(aliceCtx.firestore(), 'users', ALICE, 'meta', 'chat')),
      'T23 owner reads meta/chat'
    );
    await assertFails(
      getDoc(doc(env.authenticatedContext(BOB).firestore(), 'users', ALICE, 'meta', 'chat')),
      'T23 other user reads meta/chat'
    );
    report('T23 meta/chat owner read allowed / other-user denied', true);
  } catch (e) { report('T23 meta/chat owner read allowed / other-user denied', false, e); }

  // T24 — a participant records their OWN receipt with a server timestamp.
  try {
    await assertSucceeds(
      setDoc(
        doc(aliceCtx.firestore(), 'conversations', 'conv1', 'reads', ALICE),
        { lastReadAt: serverTimestamp() }
      ),
      'T24 own receipt'
    );
    report('T24 own reads/{uid} receipt (server time) allowed', true);
  } catch (e) { report('T24 own reads/{uid} receipt (server time) allowed', false, e); }

  // T25 — nobody can forge another reader's receipt.
  try {
    await assertFails(
      setDoc(
        doc(aliceCtx.firestore(), 'conversations', 'conv1', 'reads', BOB),
        { lastReadAt: serverTimestamp() }
      ),
      'T25 forged receipt'
    );
    report('T25 receipt forged with another uid denied', true);
  } catch (e) { report('T25 receipt forged with another uid denied', false, e); }

  // T26 — receipt docs are shape-locked: no extra fields, no client clock.
  try {
    await assertFails(
      setDoc(
        doc(aliceCtx.firestore(), 'conversations', 'conv1', 'reads', `${ALICE}_extra`),
        { lastReadAt: serverTimestamp(), evil: true }
      ),
      'T26 extra receipt field'
    );
    await assertFails(
      setDoc(
        doc(aliceCtx.firestore(), 'conversations', 'conv1', 'reads', `${ALICE}_clock`),
        { lastReadAt: new Date(0) }
      ),
      'T26b client-supplied receipt time'
    );
    report('T26 receipt shape-locked (extra field / client time denied)', true);
  } catch (e) { report('T26 receipt shape-locked (extra field / client time denied)', false, e); }

  // T27 — receipts are immutable (no delete).
  try {
    await assertFails(
      deleteDoc(doc(aliceCtx.firestore(), 'conversations', 'conv1', 'reads', ALICE)),
      'T27 delete receipt'
    );
    report('T27 receipt delete denied', true);
  } catch (e) { report('T27 receipt delete denied', false, e); }

  await env.cleanup();
}

try {
  const expressible = await probeServerTime();
  await regressionSuite();
  console.log(`\nRESULT: ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} — serverTimeExpressible=${expressible}`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('FATAL:', err);
  process.exit(1);
}
