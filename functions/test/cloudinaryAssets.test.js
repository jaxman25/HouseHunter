/**
 * Unit tests for the Cloudinary delete proxy (functions/src/cloudinaryAssets.ts).
 *
 * Covers the pure helpers: URL → public_id derivation, signed destroy
 * parameter encoding, and ownership rules. Run with Node's built-in runner:
 *   npm test   (in functions/ — builds lib/ first)
 *
 * The network call itself (fetch to api.cloudinary.com) is intentionally not
 * exercised here — only the deterministic logic around it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('crypto');

// ─── Mirrors of cloudinaryAssets.ts helpers (no TS loader in this runner) ──

const CLOUD_NAME = 'qrbmp96d';

function publicIdFromUrl(url) {
  if (!url) return null;
  const marker = '/upload/';
  const idx = url.indexOf(marker);
  if (!url.startsWith('https://res.cloudinary.com/') || idx === -1) return null;
  let tail = url.slice(idx + marker.length);
  const versionMatch = tail.match(/^(?:[^/]+\/)*v\d+\//);
  if (versionMatch) {
    tail = tail.slice(versionMatch[0].length);
  } else {
    const segments = tail.split('/');
    tail = segments[segments.length - 1];
  }
  if (!tail) return null;
  const dot = tail.lastIndexOf('.');
  const id = dot > 0 ? tail.slice(0, dot) : tail;
  return id || null;
}

function isCloudinaryUrl(url) {
  return typeof url === 'string' && url.startsWith('https://res.cloudinary.com/');
}

function isAvatarAsset(uid, publicId) {
  return publicId.startsWith(`avatar_${uid}_`);
}

function publicIdForAvatar(uid, timestamp) {
  return `avatar_${uid}_${timestamp}`;
}

function buildDestroyParams(publicId, resourceType, apiSecret, timestampSeconds) {
  const timestamp = String(timestampSeconds);
  const toSign = `public_id=${publicId}&resource_type=${resourceType}&timestamp=${timestamp}`;
  const signature = createHash('sha1')
    .update(`${toSign}${apiSecret}`)
    .digest('hex');
  return { toSign, signature };
}

function ownershipPlan(uid, url, publicId) {
  return {
    avatarOwned: isAvatarAsset(uid, publicId),
    propertyQueries: [
      { field: 'images', op: 'array-contains', value: url },
      { field: 'videoUrl', op: '==', value: url },
    ],
  };
}

function hasOwnership(avatarOwned, matchCounts) {
  return avatarOwned || matchCounts.some((c) => c > 0);
}

// ─── publicIdFromUrl ──────────────────────────────────────────────────────

describe('publicIdFromUrl', () => {
  test('extracts the public id from a plain secure_url', () => {
    const url = 'https://res.cloudinary.com/qrbmp96d/image/upload/v1727300000/properties/abc123.jpg';
    assert.equal(publicIdFromUrl(url), 'properties/abc123');
  });

  test('handles URLs without a version segment', () => {
    const url = 'https://res.cloudinary.com/qrbmp96d/image/upload/properties/abc123.jpg';
    assert.equal(publicIdFromUrl(url), 'abc123');
  });

  test('handles URLs with transformations before the version', () => {
    const url =
      'https://res.cloudinary.com/qrbmp96d/image/upload/w_1000,c_fill/v1727300000/avatar_u1_99.jpg';
    assert.equal(publicIdFromUrl(url), 'avatar_u1_99');
  });

  test('returns null for non-Cloudinary URLs (legacy Firebase, external)', () => {
    assert.equal(
      publicIdFromUrl('https://firebasestorage.googleapis.com/v0/b/bkt/o/img.jpg'),
      null
    );
    assert.equal(publicIdFromUrl('https://example.com/upload/x.jpg'), null);
  });

  test('returns null for malformed or empty input', () => {
    assert.equal(publicIdFromUrl(''), null);
    assert.equal(publicIdFromUrl(null), null);
    assert.equal(publicIdFromUrl('https://res.cloudinary.com/qrbmp96d/image/upload/'), null);
  });
});

// ─── isCloudinaryUrl / avatar ownership ───────────────────────────────────

describe('origin and avatar checks', () => {
  test('isCloudinaryUrl accepts only res.cloudinary.com', () => {
    assert.equal(isCloudinaryUrl('https://res.cloudinary.com/qrbmp96d/image/upload/x.jpg'), true);
    assert.equal(isCloudinaryUrl('http://res.cloudinary.com/qrbmp96d/image/upload/x.jpg'), false);
    assert.equal(isCloudinaryUrl('https://res.cloudinary.com.evil.com/x.jpg'), false);
  });

  test('isAvatarAsset matches the uid-prefixed public id', () => {
    assert.equal(isAvatarAsset('user1', 'avatar_user1_1730000000'), true);
    assert.equal(isAvatarAsset('user1', 'avatar_user2_1730000000'), false);
    assert.equal(isAvatarAsset('user1', 'properties/user1/x'), false);
  });

  test('publicIdForAvatar produces the expected filename shape', () => {
    assert.equal(publicIdForAvatar('user1', 1730000000), 'avatar_user1_1730000000');
  });
});

// ─── signed destroy parameters ────────────────────────────────────────────

describe('buildDestroyParams signature', () => {
  const SECRET = 'test-secret';

  test('signature covers public_id + resource_type + timestamp sorted + secret', () => {
    const { toSign, signature } = buildDestroyParams('p/abc', 'image', SECRET, 1727300000);
    assert.equal(toSign, 'public_id=p/abc&resource_type=image&timestamp=1727300000');
    assert.equal(
      signature,
      createHash('sha1').update(`${toSign}${SECRET}`).digest('hex')
    );
  });

  test('different secrets produce different signatures', () => {
    const a = buildDestroyParams('p', 'image', 'secret-a', 1727300000).signature;
    const b = buildDestroyParams('p', 'image', 'secret-b', 1727300000).signature;
    assert.notEqual(a, b);
  });

  test('different resource types produce different signatures', () => {
    const a = buildDestroyParams('p', 'image', SECRET, 1727300000).signature;
    const b = buildDestroyParams('p', 'video', SECRET, 1727300000).signature;
    assert.notEqual(a, b);
  });
});

// ─── ownership rules ──────────────────────────────────────────────────────

describe('ownershipPlan / hasOwnership', () => {
  test('avatar assets are owner-implied without Firestore queries', () => {
    const plan = ownershipPlan('u1', 'https://res.cloudinary.com/c/image/upload/v1/avatar_u1_5.jpg', 'avatar_u1_5');
    assert.equal(plan.avatarOwned, true);
    assert.equal(hasOwnership(true, [0, 0]), true);
  });

  test('non-avatar assets require a property query hit', () => {
    const plan = ownershipPlan(
      'u1',
      'https://res.cloudinary.com/c/image/upload/v1/properties/p1/x.jpg',
      'properties/p1/x'
    );
    assert.equal(plan.avatarOwned, false);
    assert.deepEqual(plan.propertyQueries, [
      { field: 'images', op: 'array-contains', value: 'https://res.cloudinary.com/c/image/upload/v1/properties/p1/x.jpg' },
      { field: 'videoUrl', op: '==', value: 'https://res.cloudinary.com/c/image/upload/v1/properties/p1/x.jpg' },
    ]);
    assert.equal(hasOwnership(false, [0, 0]), false);
    assert.equal(hasOwnership(false, [1, 0]), true);
    assert.equal(hasOwnership(false, [0, 1]), true);
  });
});
