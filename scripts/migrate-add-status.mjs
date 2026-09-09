#!/usr/bin/env node
/**
 * One-time data migration: backfill `status: 'active'` on property documents
 * created before the status field existed (or whose status is missing).
 *
 * New listings already default to Active (AddPropertyScreen sends it and
 * firestore.rules now requires it on create); this brings pre-existing docs
 * in line so the default browse query (status in [active, pending, sold,
 * rented]) and status badges behave consistently.
 *
 * Usage (from the project root, with a service-account key for a real run):
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node scripts/migrate-add-status.mjs
 *
 * Uses firebase-admin from functions/node_modules (the only place it's
 * installed). Idempotent: docs that already have a valid status are skipped.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// firebase-admin lives under functions/ in this repo.
let admin;
try {
  admin = require('firebase-admin');
} catch {
  const functionsNodeModules = path.resolve(__dirname, '..', 'functions', 'node_modules');
  admin = require(path.join(functionsNodeModules, 'firebase-admin'));
}

const VALID_STATUSES = new Set(['active', 'pending', 'sold', 'rented', 'inactive']);

async function main() {
  admin.initializeApp();
  const db = admin.firestore();

  console.log('Reading properties collection…');
  const snapshot = await db.collection('properties').get();
  console.log(`Found ${snapshot.size} property documents.`);

  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let writes = 0;

  const commit = async () => {
    if (writes === 0) return;
    await batch.commit();
    batch = db.batch();
    writes = 0;
  };

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    if (typeof data.status === 'string' && VALID_STATUSES.has(data.status)) {
      skipped++;
      continue;
    }
    batch.update(doc.ref, { status: 'active' });
    updated++;
    writes++;
    if (writes >= 400) await commit(); // Firestore batch limit
  }
  await commit();

  console.log(
    updated > 0
      ? `✅ Backfilled ${updated} properties to status='active' (${skipped} already had a valid status).`
      : `No properties needed migration (${skipped} already had a valid status).`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});