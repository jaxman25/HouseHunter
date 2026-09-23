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
    const ctx = env.authenticatedContext(ALICE);
    const minute = Math.floor(Date.now() / 60000);
    await assertSucceeds(
      setDoc(doc(env.db, 'probe/x'), { minute }),
      'honest current-minute write should pass'
    );
    await assertFails(
      setDoc(doc(env.db, 'probe/y'), { minute: minute + 999 }),
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
