/**
 * Index coverage check.
 *
 * Verifies that every composite index the app's queries need is defined in
 * `firestore.indexes.json`. Firestore fails queries that lack a composite
 * index at runtime ("The query requires an index"), so this catches a removed
 * or missing index in CI instead of production.
 *
 * When you add a new Firestore query with `where` + `orderBy` (or an `in`
 * combined with ordering), add its index to BOTH `firestore.indexes.json` and
 * REQUIRED_INDEXES below.
 *
 * Run: node scripts/check-indexes.js  (also `npm run check:indexes`)
 */

const fs = require('fs');
const path = require('path');

/** Canonical composite indexes the app queries (mirror firestore.indexes.json). */
// Order values use the Firebase index format: ASCENDING / DESCENDING / CONTAINS.
const REQUIRED_INDEXES = [
  // properties — active listings sorted/filtered
  { collectionGroup: 'properties', fields: [['status', 'ASCENDING'], ['createdAt', 'DESCENDING']] },
  { collectionGroup: 'properties', fields: [['status', 'ASCENDING'], ['views', 'DESCENDING']] },
  // status+price sorts are covered by the createdAt-suffixed indexes below
  // (a query's equality + orderBy fields only need to prefix an index).
  { collectionGroup: 'properties', fields: [['status', 'ASCENDING'], ['price', 'ASCENDING'], ['createdAt', 'DESCENDING']] },
  { collectionGroup: 'properties', fields: [['status', 'ASCENDING'], ['price', 'DESCENDING'], ['createdAt', 'DESCENDING']] },
  // properties — listingType + status
  { collectionGroup: 'properties', fields: [['listingType', 'ASCENDING'], ['status', 'ASCENDING'], ['createdAt', 'DESCENDING']] },
  { collectionGroup: 'properties', fields: [['listingType', 'ASCENDING'], ['status', 'ASCENDING'], ['price', 'ASCENDING']] },
  { collectionGroup: 'properties', fields: [['listingType', 'ASCENDING'], ['status', 'ASCENDING'], ['price', 'DESCENDING']] },
  { collectionGroup: 'properties', fields: [['listingType', 'ASCENDING'], ['status', 'ASCENDING'], ['views', 'DESCENDING']] },
  // properties — propertyType + status
  { collectionGroup: 'properties', fields: [['propertyType', 'ASCENDING'], ['status', 'ASCENDING'], ['createdAt', 'DESCENDING']] },
  { collectionGroup: 'properties', fields: [['propertyType', 'ASCENDING'], ['status', 'ASCENDING'], ['createdAt', 'ASCENDING']] },
  { collectionGroup: 'properties', fields: [['propertyType', 'ASCENDING'], ['status', 'ASCENDING'], ['price', 'ASCENDING']] },
  { collectionGroup: 'properties', fields: [['propertyType', 'ASCENDING'], ['status', 'ASCENDING'], ['price', 'DESCENDING']] },
  { collectionGroup: 'properties', fields: [['propertyType', 'ASCENDING'], ['status', 'ASCENDING'], ['price', 'ASCENDING'], ['createdAt', 'DESCENDING']] },
  { collectionGroup: 'properties', fields: [['propertyType', 'ASCENDING'], ['status', 'ASCENDING'], ['price', 'ASCENDING'], ['createdAt', 'ASCENDING']] },
  { collectionGroup: 'properties', fields: [['propertyType', 'ASCENDING'], ['status', 'ASCENDING'], ['price', 'ASCENDING'], ['views', 'DESCENDING']] },
  { collectionGroup: 'properties', fields: [['propertyType', 'ASCENDING'], ['status', 'ASCENDING'], ['views', 'DESCENDING']] },
  // properties — price range + createdAt-asc/views sorts (no property type)
  { collectionGroup: 'properties', fields: [['status', 'ASCENDING'], ['price', 'ASCENDING'], ['createdAt', 'ASCENDING']] },
  { collectionGroup: 'properties', fields: [['status', 'ASCENDING'], ['price', 'ASCENDING'], ['views', 'DESCENDING']] },
  // properties — city/state + status
  { collectionGroup: 'properties', fields: [['status', 'ASCENDING'], ['city', 'ASCENDING'], ['createdAt', 'DESCENDING']] },
  { collectionGroup: 'properties', fields: [['status', 'ASCENDING'], ['city', 'ASCENDING'], ['price', 'ASCENDING']] },
  { collectionGroup: 'properties', fields: [['status', 'ASCENDING'], ['state', 'ASCENDING'], ['createdAt', 'DESCENDING']] },
  { collectionGroup: 'properties', fields: [['status', 'ASCENDING'], ['state', 'ASCENDING'], ['price', 'ASCENDING']] },
  // properties — user's own listings
  { collectionGroup: 'properties', fields: [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']] },
  // conversations — per-property lookups and the sorted inbox
  { collectionGroup: 'conversations', fields: [['participants', 'CONTAINS'], ['propertyId', 'ASCENDING']] },
  { collectionGroup: 'conversations', fields: [['participants', 'CONTAINS'], ['updatedAt', 'DESCENDING']] },
  // notifications
  { collectionGroup: 'notifications', fields: [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']] },
  { collectionGroup: 'notifications', fields: [['userId', 'ASCENDING'], ['read', 'ASCENDING']] },
];

/** Serialize an index entry. Handles file entries (field objects) and the
 *  REQUIRED_INDEXES format ([fieldPath, order] tuples) identically. */
function signature(index) {
  const fields = (index.fields || [])
    .map((f) =>
      Array.isArray(f)
        ? `${f[0]}:${f[1] || ''}`
        : `${f.fieldPath}:${f.order || f.arrayConfig || ''}`
    )
    .join(',');
  return `${index.queryScope || 'COLLECTION'}|${index.collectionGroup}|${fields}`;
}

function main() {
  const indexPath = path.join(__dirname, '..', 'firestore.indexes.json');
  let raw;
  try {
    raw = fs.readFileSync(indexPath, 'utf8');
  } catch {
    console.error(`✖ Cannot read ${indexPath}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    console.error(`✖ ${indexPath} is not valid JSON: ${error.message}`);
    process.exit(1);
  }

  const defined = new Set((config.indexes || []).map(signature));
  const missing = REQUIRED_INDEXES.filter((req) => !defined.has(signature(req)));

  if (missing.length > 0) {
    console.error('✖ Missing composite indexes in firestore.indexes.json:');
    for (const idx of missing) {
      const fields = idx.fields.map(([f, o]) => `${f} ${o}`).join(', ');
      console.error(`  - ${idx.collectionGroup}: ${fields}`);
    }
    console.error(
      '\nAdd them to firestore.indexes.json and deploy with:\n' +
        '  npx firebase-tools deploy --only firestore:indexes'
    );
    process.exit(1);
  }

  console.log(`✔ All ${REQUIRED_INDEXES.length} required composite indexes are present in firestore.indexes.json`);
}

main();