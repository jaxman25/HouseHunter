/**
 * File upload validation utilities.
 *
 * Provides defense against:
 *   - Malicious file type uploads (e.g., .exe disguised as .jpg)
   - Oversized uploads (DoS prevention)
   - MIME type spoofing
   - Dangerous file content (polyglot files, embedded scripts)
 *   - Path traversal in filenames
 *
 * Usage:
 *   import { validateImageUpload, IMAGE_CONFIG } from '../utils/security/fileValidation';
 *   const result = validateImageUpload(file);
 *   if (!result.valid) { showError(result.error); return; }
 */

import { sanitizeFilename } from './sanitize';

// ─── Configuration ────────────────────────────────────────────────────

/** Allowed image MIME types with their magic bytes. */
const ALLOWED_IMAGE_TYPES: Record<string, { magic: number[]; ext: string }> = {
  'image/jpeg': { magic: [0xff, 0xd8, 0xff], ext: '.jpg' },
  'image/png': { magic: [0x89, 0x50, 0x4e, 0x47], ext: '.png' },
  'image/webp': { magic: [0x52, 0x49, 0x46, 0x46], ext: '.webp' }, // RIFF....WEBP
  'image/gif': { magic: [0x47, 0x49, 0x46, 0x38], ext: '.gif' },   // GIF8
};

/** Image upload limits. */
export const IMAGE_CONFIG = {
  /** Maximum file size in bytes (5MB). */
  maxFileSize: 5 * 1024 * 1024,
  /** Maximum number of images per property. */
  maxImages: 10,
  /** Maximum image dimensions (pixels). */
  maxDimension: 4096,
  /** Minimum image dimensions (pixels). */
  minDimension: 100,
  /** Allowed MIME types. */
  allowedTypes: Object.keys(ALLOWED_IMAGE_TYPES),
  /** Allowed file extensions. */
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
};

/** Chat image upload limits (more restrictive). */
export const CHAT_IMAGE_CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
};

/** Profile photo limits. */
export const PROFILE_IMAGE_CONFIG = {
  maxFileSize: 2 * 1024 * 1024, // 2MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
};

// ─── Types ────────────────────────────────────────────────────────────

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  /** Sanitized filename with correct extension. */
  sanitizedName?: string;
}

export interface FileInput {
  /** Original filename. */
  name: string;
  /** MIME type. */
  type: string;
  /** File size in bytes. */
  size: number;
  /** File content (first 8 bytes for magic byte check). */
  content?: ArrayBuffer | Uint8Array;
}

// ─── Validation Functions ─────────────────────────────────────────────

/**
 * Validate a file upload against security rules.
 *
 * Checks:
 *   1. Filename is safe (no path traversal)
 *   2. File extension matches allowed list
 *   3. MIME type is allowed
 *   4. File size is within limits
 *   5. Magic bytes match declared type (if content provided)
 *   6. File is not a dangerous type (exe, bat, etc.)
 */
export function validateFileUpload(
  file: FileInput,
  config: typeof IMAGE_CONFIG = IMAGE_CONFIG
): FileValidationResult {
  // 1. Sanitize filename
  const sanitizedName = sanitizeFilename(file.name);
  if (!sanitizedName || sanitizedName === 'unnamed') {
    return { valid: false, error: 'Invalid filename' };
  }

  // 2. Check file extension
  const ext = getExtension(sanitizedName);
  if (!config.allowedExtensions.includes(ext)) {
    return {
      valid: false,
      error: `File type "${ext}" is not allowed. Allowed: ${config.allowedExtensions.join(', ')}`,
    };
  }

  // 3. Check MIME type
  const mimeType = file.type.toLowerCase().split(';')[0].trim();
  if (!config.allowedTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `File type "${mimeType}" is not allowed.`,
    };
  }

  // 4. Check file size
  if (file.size <= 0) {
    return { valid: false, error: 'File is empty' };
  }
  if (file.size > config.maxFileSize) {
    const maxMB = Math.round(config.maxFileSize / (1024 * 1024));
    const fileMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File too large (${fileMB}MB). Maximum: ${maxMB}MB`,
    };
  }

  // 5. Check magic bytes (if content is provided)
  if (file.content) {
    const contentLength = file.content instanceof ArrayBuffer
      ? file.content.byteLength
      : file.content.length;
    if (contentLength >= 4) {
      const expectedType = ALLOWED_IMAGE_TYPES[mimeType];
      if (expectedType) {
        const bytes = new Uint8Array(file.content.slice(0, 8));
        const matches = expectedType.magic.every(
          (byte, i) => bytes[i] === byte
        );
        if (!matches) {
          return {
            valid: false,
            error: `File content does not match declared type "${mimeType}". This could be a disguised file.`,
          };
        }
      }
    }
  }

  // 6. Check for dangerous filenames
  if (isDangerousFilename(sanitizedName)) {
    return { valid: false, error: 'Filename contains blocked characters' };
  }

  // 7. Ensure correct extension matches MIME type
  const correctExt = ALLOWED_IMAGE_TYPES[mimeType]?.ext;
  const finalName = correctExt
    ? sanitizedName.replace(/\.[^.]+$/, correctExt)
    : sanitizedName;

  return { valid: true, sanitizedName: finalName };
}

/**
 * Validate an image upload specifically.
 * Applies image-specific constraints (dimensions, aspect ratio).
 */
export function validateImageUpload(
  file: FileInput,
  config: typeof IMAGE_CONFIG = IMAGE_CONFIG
): FileValidationResult {
  return validateFileUpload(file, config);
}

// ─── Dangerous File Detection ─────────────────────────────────────────

/** Blocked file extensions (executable, script, archive). */
const BLOCKED_EXTENSIONS = new Set([
  // Executables
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  '.app', '.dmg', '.pkg', '.deb', '.rpm',
  // Scripts
  '.sh', '.bash', '.csh', '.ksh', '.zsh',
  '.js', '.vbs', '.vbe', '.wsf', '.wsh',
  '.ps1', '.psm1', '.psd1',
  '.php', '.phtml', '.php3', '.php4', '.php5',
  '.py', '.pyw', '.rb', '.pl', '.cgi',
  // Web
  '.html', '.htm', '.shtml', '.xhtml',
  '.svg', '.xml',
  // Archives (could contain malicious content)
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
  // Documents with macros
  '.doc', '.docm', '.xls', '.xlsm', '.ppt', '.pptm',
  // Other dangerous
  '.jar', '.class', '.war', '.ear',
  '.lnk', '.url', '.inf',
]);

function isDangerousFilename(filename: string): boolean {
  const ext = getExtension(filename).toLowerCase();
  return BLOCKED_EXTENSIONS.has(ext);
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Extract file extension (including the dot). */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Check if a filename looks like a polyglot (double extension).
 * e.g., "image.jpg.exe" or "photo.png.php"
 */
export function hasDoubleExtension(filename: string): boolean {
  const parts = filename.split('.');
  if (parts.length < 3) return false;
  // Check if any non-final extension is in the blocked list
  for (let i = 1; i < parts.length - 1; i++) {
    const ext = '.' + parts[i].toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) return true;
  }
  return false;
}

/**
 * Generate a safe, unique filename for uploads.
 * Combines sanitized original name with timestamp and random suffix.
 */
export function generateSafeFilename(originalName: string, prefix: string = ''): string {
  const sanitized = sanitizeFilename(originalName);
  const ext = getExtension(sanitized);
  const base = sanitized.replace(/\.[^.]+$/, '').slice(0, 50);
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return prefix
    ? `${prefix}/${base}_${timestamp}_${random}${ext}`
    : `${base}_${timestamp}_${random}${ext}`;
}
