/**
 * Cloudinary asset management (Firebase Cloud Functions v2).
 *
 * Client uploads are UNSIGNED (no API secret in the app bundle), which means
 * the client cannot delete anything — Cloudinary's destroy API requires a
 * signed request with the API secret. This module is the signed proxy:
 *
 *   deleteCloudinaryAsset (HTTPS callable)
 *     - requires an authenticated caller
 *     - verifies via Firestore that the caller owns a document referencing
 *       the asset's URL (avatars are verified by uid embedded in the id)
 *     - performs the signed destroy against Cloudinary
 *
 * Secrets (server-side only, configure with `firebase functions:secrets:set`):
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Pure helpers below (URL → public_id derivation, signature computation,
 * ownership rules) are exported for unit testing — same pattern as
 * functions/src/email.ts.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

// ─── Cloudinary constants (client mirrors these in storageService.ts) ─────

export const CLOUD_NAME = 'qrbmp96d';
export const CLOUDINARY_BASE = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}`;

/** Mirrors storageService.ts: avatar filenames are `avatar_<uid>_<ts>`. */
export function publicIdForAvatar(uid: string, timestamp: number | string): string {
  return `avatar_${uid}_${timestamp}`;
}

/** Whether a Cloudinary public_id belongs to the given user's avatar. */
export function isAvatarAsset(uid: string, publicId: string): boolean {
  return publicId.startsWith(`avatar_${uid}_`);
}

/**
 * Derive a Cloudinary public_id from a `secure_url` this app hands out.
 * Shape: https://res.cloudinary.com/<cloud>/<kind>/upload/<transformations?>/v<mangle>/<public_id>.<ext>
 * The version segment (`v1234/`) is optional; transformations may precede it.
 * Returns null for non-Cloudinary or malformed URLs.
 */
export function publicIdFromUrl(url: string): string | null {
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

/** The exact URL prefix Cloudinary secure_urls start with. */
export function isCloudinaryUrl(url: string): boolean {
  return typeof url === 'string' && url.startsWith('https://res.cloudinary.com/');
}

/**
 * Signed destroy request for Cloudinary's Upload API.
 * Cloudinary requires: timestamp (seconds), api_key, and a sha1 signature of
 * every parameter (sorted, `k=v&…`) + the API secret. Pure so the parameter
 * encoding is unit-testable; the caller injects the real api_key afterwards.
 */
export function buildDestroyParams(
  publicId: string,
  resourceType: 'image' | 'video',
  apiSecret: string,
  timestampSeconds: number
): { endpoint: string; body: URLSearchParams; signature: string } {
  const timestamp = String(timestampSeconds);
  const toSign = `public_id=${publicId}&resource_type=${resourceType}&timestamp=${timestamp}`;
  const signature = createHash('sha1')
    .update(`${toSign}${apiSecret}`)
    .digest('hex');

  const body = new URLSearchParams({
    public_id: publicId,
    resource_type: resourceType,
    timestamp,
    api_key: '', // caller injects the real key after signing
    signature,
  });
  return {
    endpoint: `${CLOUDINARY_BASE}/${resourceType}/destroy`,
    body,
    signature,
  };
}

/**
 * Ownership decision inputs for a delete request. Pure.
 *
 * Docs reference assets by FULL URL (images: string[], videoUrl: string), so
 * ownership is proven by querying with the URL itself. Avatars are the
 * exception: the uid is embedded in the public id, so ownership is implied.
 */
export function ownershipPlan(uid: string, url: string, publicId: string): {
  avatarOwned: boolean;
  propertyQueries: Array<{ field: 'images' | 'videoUrl'; op: 'array-contains' | '=='; value: string }>;
} {
  return {
    avatarOwned: isAvatarAsset(uid, publicId),
    propertyQueries: [
      { field: 'images', op: 'array-contains', value: url },
      { field: 'videoUrl', op: '==', value: url },
    ],
  };
}

/** True when any ownership query matched at least one document. */
export function hasOwnership(avatarOwned: boolean, matchCounts: number[]): boolean {
  return avatarOwned || matchCounts.some((count) => count > 0);
}

// ─── Callable ─────────────────────────────────────────────────────────────

/**
 * Deletes one Cloudinary asset after verifying the caller owns it.
 *
 * Input: { url: string, resourceType?: 'image' | 'video' }
 *  - `url` is the Cloudinary secure_url stored on the caller's documents.
 *  - resourceType defaults to 'image'; pass 'video' for video walkthroughs.
 *
 * Returns: { ok: true, result: 'ok' | 'not found' }
 * Throws HttpsError when unauthenticated / not owner / server misconfigured.
 */
export const deleteCloudinaryAsset = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to delete media.');
  }

  const data = (request.data ?? {}) as {
    url?: string;
    resourceType?: 'image' | 'video';
  };
  const resourceType = data.resourceType === 'video' ? 'video' : 'image';

  if (!isCloudinaryUrl(data.url ?? '')) {
    throw new HttpsError('invalid-argument', 'Provide a Cloudinary secure_url.');
  }
  const url = data.url as string;
  const publicId = publicIdFromUrl(url);
  if (!publicId) {
    throw new HttpsError('invalid-argument', 'Could not derive the asset id from that URL.');
  }

  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) {
    console.error(
      '[deleteCloudinaryAsset] Missing CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET. ' +
        'Set them with: firebase functions:secrets:set CLOUDINARY_API_KEY (and _SECRET)'
    );
    throw new HttpsError('failed-precondition', 'Server is not configured for media deletion.');
  }

  const uid = request.auth.uid;

  // ── Ownership verification via Firestore ────────────────────────────────
  const plan = ownershipPlan(uid, url, publicId);
  let owned = plan.avatarOwned;
  if (!owned) {
    try {
      const db = getFirestore();
      const matches: number[] = [];
      // Property images: the URL appears in a listing the caller owns.
      const imagesSnap = await db
        .collection('properties')
        .where('userId', '==', uid)
        .where('images', 'array-contains', url)
        .limit(1)
        .get();
      matches.push(imagesSnap.size);
      // Property videos: the URL is the listing's videoUrl.
      if (!owned) {
        const videoSnap = await db
          .collection('properties')
          .where('userId', '==', uid)
          .where('videoUrl', '==', url)
          .limit(1)
          .get();
        matches.push(videoSnap.size);
      }
      owned = hasOwnership(plan.avatarOwned, matches);
    } catch (error) {
      console.error('[deleteCloudinaryAsset] ownership check failed:', error);
      throw new HttpsError('internal', 'Could not verify ownership.');
    }
  }

  if (!owned) {
    throw new HttpsError('permission-denied', 'You do not own this asset.');
  }

  // ── Signed destroy call ─────────────────────────────────────────────────
  const { endpoint, body } = buildDestroyParams(
    publicId,
    resourceType,
    apiSecret,
    Math.floor(Date.now() / 1000)
  );
  body.set('api_key', apiKey);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const result = (await response.json()) as { result?: string };
    // 'not found' counts as success — deleting an already-gone asset is fine
    // (matches the old deleteObject tolerance for missing objects).
    if (!response.ok || (result.result !== 'ok' && result.result !== 'not found')) {
      console.error('[deleteCloudinaryAsset] destroy failed:', response.status, result);
      throw new HttpsError('internal', 'Cloudinary deletion failed.');
    }
    return { ok: true, result: result.result };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('[deleteCloudinaryAsset] destroy request failed:', error);
    throw new HttpsError('internal', 'Cloudinary deletion failed.');
  }
});
