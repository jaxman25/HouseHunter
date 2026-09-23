/**
 * Video walkthrough validation — mirrors the image config in
 * fileValidation.ts. Constants are shared between the picker UI and the
 * upload service; storage.rules enforces the same limits server-side.
 */

export const VIDEO_CONFIG = {
  /** Maximum file size in bytes (50MB). */
  maxFileSize: 50 * 1024 * 1024,
  /** Maximum duration in seconds (90s). */
  maxDurationSeconds: 90,
  /** Allowed video MIME types (kept in sync with storage.rules). */
  allowedTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
  /** Allowed extensions. */
  allowedExtensions: ['.mp4', '.webm', '.mov'],
} as const;

export interface VideoValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a picked video asset (duration + size + MIME type).
 * `sizeBytes` is optional (picker sometimes omits it; the upload service
 * re-checks from the blob).
 */
export function validateVideoAsset(asset: {
  /** Picker types use `number | null | undefined` here. */
  duration?: number | null;
  fileSize?: number;
  mimeType?: string;
  type?: string;
}): VideoValidationResult {
  const duration = asset.duration ?? 0;
  if (duration <= 0) {
    return { valid: false, error: 'Could not read the video length. Please try another file.' };
  }
  if (duration > VIDEO_CONFIG.maxDurationSeconds + 0.5) {
    return {
      valid: false,
      error: `Video is too long (${Math.round(duration)}s). Maximum: ${VIDEO_CONFIG.maxDurationSeconds}s`,
    };
  }

  const size = asset.fileSize ?? 0;
  if (size > VIDEO_CONFIG.maxFileSize) {
    return {
      valid: false,
      error: `Video is too large (${(size / 1024 / 1024).toFixed(1)}MB). Maximum: 50MB`,
    };
  }

  const mime = (asset.mimeType ?? asset.type ?? '').toLowerCase().split(';')[0].trim();
  if (mime && !(VIDEO_CONFIG.allowedTypes as readonly string[]).includes(mime)) {
    return {
      valid: false,
      error: `Video format "${mime}" is not supported. Use MP4, WebM, or MOV.`,
    };
  }

  return { valid: true };
}
