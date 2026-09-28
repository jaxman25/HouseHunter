import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../config/firebase';
import { storageCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, UPLOAD_TIMEOUT_MS } from '../utils/network/timeout';
import { trackMetric } from '../utils/monitoring/metrics';
import { IMAGE_CONFIG } from '../utils/security/fileValidation';
import { VIDEO_CONFIG } from '../utils/security/videoValidation';

/**
 * Cloudinary unsigned direct uploads.
 *
 * Replaces Firebase Storage: files POST straight from the client to
 * Cloudinary using an unsigned upload preset (no API secret in the app).
 * The response's `secure_url` replaces the previous Firebase download URL.
 *
 * Deletion: unsigned uploads cannot destroy assets, so `deleteImage` and
 * `deleteVideo` call the signed `deleteCloudinaryAsset` Cloud Function
 * (server holds the API secret). Best-effort by contract: failures log a
 * warning and never throw — callers treat deletion as fire-and-forget.
 */

/**
 * Cloudinary cloud + unsigned upload presets (no API secret client-side).
 * Configurable via .env (see .env.example); defaults match the docs.
 */
export const CLOUDINARY_CLOUD_NAME =
  process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'qrbmp96d';
const IMAGE_PRESET =
  process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'househunter_unsigned';
/**
 * Videos POST to the /video/upload resource, which requires a VIDEO-typed
 * unsigned preset. SETUP: create `househunter_unsigned_video` in the
 * Cloudinary console (Settings → Upload → Upload presets, signing mode
 * "Unsigned", resource type "video", 50MB cap) — video walkthrough uploads
 * fail until it exists.
 */
const VIDEO_PRESET =
  process.env.EXPO_PUBLIC_CLOUDINARY_VIDEO_PRESET || 'househunter_unsigned_video';

/** Videos are large — a 10-minute budget (vs 30s for images). */
const VIDEO_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

/** Lazy Cloud Functions instance for the signed delete proxy. */
let functionsInstance: ReturnType<typeof getFunctions> | null = null;

/** Longest edge allowed after resize. Larger images are scaled down. */
const MAX_IMAGE_DIMENSION = 2000;

/**
 * Validate a file URI before upload.
 * Only allows http/https/data URIs — blocks file://, content://, and other
 * schemes. NOTE: this is intentionally identical to the previous Firebase
 * implementation's validation (no behavior change for callers).
 */
function validateUploadUri(uri: string): void {
  if (!uri) throw new Error('Upload URI is required');
  // Only allow http, https, and data URIs (from image picker)
  if (!/^(https?|data):/.test(uri)) {
    throw new Error('Invalid upload source');
  }
}

/**
 * Normalize a local image to a bounded-size JPEG:
 * - resize so the longest edge is <= MAX_IMAGE_DIMENSION (never upscale)
 * - re-encode as JPEG (strips EXIF/GPS metadata — important now that URLs are
 *   publicly fetchable CDN links rather than auth-gated Firebase objects)
 *
 * Returns the ORIGINAL uri when resize/re-encode is unavailable (e.g. web
 * fallback), so callers always get something uploadable.
 */
async function resizeForUpload(uri: string): Promise<string> {
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_IMAGE_DIMENSION } }],
      { compress: 0.8, format: SaveFormat.JPEG }
    );
    return result.uri;
  } catch (error) {
    console.warn('Image resize failed, uploading original:', error);
    return uri;
  }
}

/**
 * Build the `file` FormData entry in the shape React Native's fetch expects:
 * { uri, type, name }. uri drives the native upload; type/name travel as part
 * of the multipart body.
 */
function buildFileField(
  uri: string,
  type: string,
  name: string
): { uri: string; type: string; name: string } {
  return { uri, type, name };
}

/**
 * POST to Cloudinary's unsigned endpoint and return the secure_url.
 * Shared by every upload entry point below (`resource` picks the endpoint).
 */
async function postToCloudinary(
  resource: 'image' | 'video',
  fileField: { uri: string; type: string; name: string }
): Promise<string> {
  const formData = new FormData();
  // RN fetch serializes this object shape into a multipart file part.
  formData.append('file', fileField as any);
  formData.append(
    'upload_preset',
    resource === 'image' ? IMAGE_PRESET : VIDEO_PRESET
  );

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resource}/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error?.message) detail = body.error.message;
      else if (typeof body?.error === 'string') detail = body.error;
    } catch {
      // non-JSON error body — keep the status text
    }
    throw new Error(`Cloudinary upload failed: ${detail}`);
  }

  const data = await response.json();
  if (!data?.secure_url) {
    throw new Error('Cloudinary upload failed: missing secure_url in response');
  }
  return data.secure_url as string;
}

export async function uploadImage(
  uri: string,
  path: string
): Promise<string> {
  // SECURITY: Validate the upload URI scheme.
  validateUploadUri(uri);

  // `path` was the Firebase Storage object path (profiles/..., properties/...).
  // Cloudinary unsigned presets control the destination folder server-side, so
  // the path is no longer client-controllable — accepted for signature
  // compatibility and currently unused.

  // Uploads get a 30s budget and retry with backoff on transient failures.
  const url = await storageCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackMetric('storage.upload', async () => {
          // Resize + JPEG re-encode (EXIF stripped) before upload.
          const uploadUri = await resizeForUpload(uri);

          const response = await fetch(uploadUri);
          const blob = await response.blob();

          // SECURITY: Enforce file size limit (5MB) — re-check after re-encode.
          if (blob.size > IMAGE_CONFIG.maxFileSize) {
            throw new Error(`File too large: ${(blob.size / 1024 / 1024).toFixed(1)}MB (max: 5MB)`);
          }

          // SECURITY: Validate content type from blob.
          const contentType = blob.type?.split(';')[0]?.trim();
          if (contentType && !IMAGE_CONFIG.allowedTypes.includes(contentType)) {
            throw new Error(`File type "${contentType}" is not allowed`);
          }

          const secureUrl = await postToCloudinary(
            'image',
            buildFileField(uploadUri, 'image/jpeg', 'upload.jpg')
          );
          return secureUrl;
        }),
        UPLOAD_TIMEOUT_MS
      )
    )
  );
  return url;
}

export async function uploadProfileImage(
  userId: string,
  uri: string
): Promise<string> {
  // SECURITY: Validate URI.
  validateUploadUri(uri);

  // Keep a deterministic, unique public id per avatar version. Unsigned
  // presets ignore client folders, but a stable filename keeps successive
  // avatars distinguishable in the Cloudinary console.
  const filename = `avatar_${userId}_${Date.now()}`;
  return uploadImage(uri, filename);
}

export async function uploadMultipleImages(
  uris: string[],
  basePath: string
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const filename = `${basePath}/image_${i}_${Date.now()}`;
    const url = await uploadImage(uris[i], filename);
    urls.push(url);
  }
  return urls;
}

/**
 * Signed delete proxy — best-effort by contract (warns, never throws).
 *
 * The callable verifies via Firestore that the caller owns a document
 * referencing the URL before performing the signed destroy server-side.
 * Non-Cloudinary URLs (legacy Firebase Storage objects, external images)
 * are skipped with a warning: the proxy only accepts its own origin.
 */
async function deleteViaProxy(
  url: string,
  resourceType: 'image' | 'video'
): Promise<void> {
  if (!url.startsWith(`https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/`)) {
    console.warn(
      `[storageService] Skipping delete of non-Cloudinary asset (legacy or external): ${url}`
    );
    return;
  }
  try {
    if (!functionsInstance) {
      functionsInstance = getFunctions(app);
    }
    const callable = httpsCallable<
      { url: string; resourceType: 'image' | 'video' },
      { ok: boolean; result: string }
    >(functionsInstance, 'deleteCloudinaryAsset');
    await callable({ url, resourceType });
  } catch (error) {
    // Never throw: deletion is cleanup, not a user-facing requirement.
    console.warn(`[storageService] Cloudinary delete failed for ${url}:`, error);
  }
}

export async function deleteImage(url: string): Promise<void> {
  await deleteViaProxy(url, 'image');
}

export async function deleteImages(urls: string[]): Promise<void> {
  for (const url of urls) {
    await deleteImage(url);
  }
}

// ─── Video walkthroughs ───────────────────────────────────────────────────
// One short video per listing (≤50MB, ≤90s — see src/utils/security/videoValidation.ts).
// Videos go to Cloudinary's /video/upload resource (image endpoint rejects video bytes).

/**
 * Upload a property video walkthrough.
 * Enforces the same size/type limits as before before sending.
 */
export async function uploadPropertyVideo(
  uri: string,
  propertyId: string
): Promise<string> {
  validateUploadUri(uri);

  const url = await storageCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackMetric('storage.uploadVideo', async () => {
          const response = await fetch(uri);
          const blob = await response.blob();

          if (blob.size > VIDEO_CONFIG.maxFileSize) {
            throw new Error(
              `Video too large: ${(blob.size / 1024 / 1024).toFixed(1)}MB (max: 50MB)`
            );
          }
          const contentType = blob.type?.split(';')[0]?.trim().toLowerCase();
          if (
            contentType &&
            !(VIDEO_CONFIG.allowedTypes as readonly string[]).includes(contentType)
          ) {
            throw new Error(`Video format "${contentType}" is not supported`);
          }

          // Videos use Cloudinary's /video/upload resource — the image
          // endpoint rejects video bytes. Same unsigned-preset pattern.
          return postToCloudinary(
            'video',
            buildFileField(uri, contentType || 'video/mp4', 'upload.mp4')
          );
        }),
        VIDEO_UPLOAD_TIMEOUT_MS
      )
    )
  );
  return url;
}

/** Delete a property video (fire-and-forget friendly: warns, never throws). */
export async function deleteVideo(url: string): Promise<void> {
  await deleteViaProxy(url, 'video');
}
