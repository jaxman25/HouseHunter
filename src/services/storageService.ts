import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../config/firebase';
import { storageCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, UPLOAD_TIMEOUT_MS } from '../utils/network/timeout';
import { trackMetric } from '../utils/monitoring/metrics';
import { generateSafeFilename, IMAGE_CONFIG, PROFILE_IMAGE_CONFIG } from '../utils/security/fileValidation';
import { VIDEO_CONFIG } from '../utils/security/videoValidation';
import { sanitizeFilename } from '../utils/security/sanitize';

/** Videos are large — a 10-minute budget (vs 30s for images). */
const VIDEO_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Validate a file URI before upload.
 * Only allows http/https/data URIs — blocks file:// and other schemes.
 */
function validateUploadUri(uri: string): void {
  if (!uri) throw new Error('Upload URI is required');
  // Only allow http, https, and data URIs (from image picker)
  if (!/^(https?|data):/.test(uri)) {
    throw new Error('Invalid upload source');
  }
}

export async function uploadImage(
  uri: string,
  path: string
): Promise<string> {
  // SECURITY: Validate the upload URI scheme.
  validateUploadUri(uri);

  // SECURITY: Sanitize the storage path to prevent path traversal.
  const safePath = path.replace(/\.\./g, '').replace(/\\/g, '/');

  // Uploads get a 30s budget and retry with backoff on transient failures.
  const url = await storageCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackMetric('storage.upload', async () => {
          const response = await fetch(uri);
          const blob = await response.blob();

          // SECURITY: Enforce file size limit (5MB).
          if (blob.size > IMAGE_CONFIG.maxFileSize) {
            throw new Error(`File too large: ${(blob.size / 1024 / 1024).toFixed(1)}MB (max: 5MB)`);
          }

          // SECURITY: Validate content type from blob.
          const contentType = blob.type?.split(';')[0]?.trim();
          if (contentType && !IMAGE_CONFIG.allowedTypes.includes(contentType)) {
            throw new Error(`File type "${contentType}" is not allowed`);
          }

          const storageRef = ref(storage, safePath);
          await uploadBytes(storageRef, blob);
          return getDownloadURL(storageRef);
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

  // SECURITY: Generate safe filename with sanitized userId.
  const safeUserId = sanitizeFilename(userId);
  const filename = `profiles/${safeUserId}/avatar_${Date.now()}`;
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

export async function deleteImage(url: string): Promise<void> {
  try {
    const imageRef = ref(storage, url);
    await storageCircuitBreaker.execute(() =>
      withRetry(() => withTimeout(deleteObject(imageRef), UPLOAD_TIMEOUT_MS))
    );
  } catch (error) {
    console.warn('Failed to delete image:', error);
  }
}

export async function deleteImages(urls: string[]): Promise<void> {
  for (const url of urls) {
    await deleteImage(url);
  }
}

// ─── Video walkthroughs ───────────────────────────────────────────────────
// One short video per listing (≤50MB, ≤90s — limits also enforced by
// storage.rules; see src/utils/security/videoValidation.ts).

/**
 * Upload a property video walkthrough to properties/{id}/videos/.
 * Enforces the same size/type limits as storage.rules before sending.
 */
export async function uploadPropertyVideo(
  uri: string,
  propertyId: string
): Promise<string> {
  validateUploadUri(uri);
  const safeId = propertyId.replace(/\.\./g, '');
  const filename = `properties/${safeId}/videos/video_${Date.now()}.mp4`;

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

          const storageRef = ref(storage, filename);
          await uploadBytes(storageRef, blob, {
            contentType: contentType || 'video/mp4',
          });
          return getDownloadURL(storageRef);
        }),
        VIDEO_UPLOAD_TIMEOUT_MS
      )
    )
  );
  return url;
}

/** Delete a property video (fire-and-forget friendly: warns, never throws). */
export async function deleteVideo(url: string): Promise<void> {
  try {
    const videoRef = ref(storage, url);
    await storageCircuitBreaker.execute(() =>
      withRetry(() => withTimeout(deleteObject(videoRef), UPLOAD_TIMEOUT_MS))
    );
  } catch (error) {
    console.warn('Failed to delete video:', error);
  }
}