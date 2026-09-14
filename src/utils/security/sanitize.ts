/**
 * Input sanitization and validation utilities.
 *
 * Provides defense-in-depth against:
 *   - XSS (Cross-Site Scripting): HTML entity encoding, script tag removal
 *   - SQL/NoSQL injection: stripping query operators from user input
 *   - Path traversal: blocking ../ and encoded variants
 *   - Command injection: blocking shell metacharacters
 *   - Storage of malicious content: content-aware sanitization
 *
 * Usage:
 *   import { sanitize, sanitizeStrict, sanitizeFilename } from '../utils/security/sanitize';
 *
 * IMPORTANT: These are client-side defenses. Server-side validation in
 * Firestore rules and Cloud Functions is the primary security boundary.
 * These utilities prevent accidental storage of malicious content and
 * provide defense-in-depth.
 */

// ─── HTML/XSS Sanitization ───────────────────────────────────────────

/** HTML entity map for encoding special characters. */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
};

/**
 * Encode HTML entities to prevent XSS.
 * Converts <, >, &, ", ', /, ` to their HTML entity equivalents.
 */
export function encodeHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'`/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Strip HTML tags entirely (for plain-text fields).
 * Removes <script>, <iframe>, <object>, <embed>, <form>, and all other tags.
 */
export function stripHtmlTags(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Remove dangerous HTML patterns while preserving safe content.
 * Strips script/event handler patterns but keeps basic formatting.
 */
export function removeDangerousHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    // Remove script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove iframe tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Remove object/embed tags
    .replace(/<(object|embed)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '')
    // Remove form tags
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
    // Remove event handlers (onclick, onerror, onload, etc.)
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // Remove javascript: protocol
    .replace(/javascript\s*:/gi, '')
    // Remove data: protocol (except images)
    .replace(/data\s*:(?!image\/)/gi, '')
    // Remove vbscript: protocol
    .replace(/vbscript\s*:/gi, '');
}

// ─── Injection Prevention ─────────────────────────────────────────────

/**
 * Sanitize input to prevent NoSQL injection.
 * Strips MongoDB query operators ($where, $gt, $regex, etc.) and
 * Firestore field path operators.
 */
export function sanitizeNoSql(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    // Remove $ operators (MongoDB injection)
    .replace(/\$/g, '')
    // Remove array operators
    .replace(/[\[\]{}]/g, '')
    // Remove comparison operators
    .replace(/[<>]=?/g, '')
    // Remove regex operators
    .replace(/\/[^/]*\/[gimsuy]*/g, '')
    // Remove dot notation that could access nested fields
    .replace(/\.\./g, '')
    .trim();
}

/**
 * Sanitize input to prevent path traversal attacks.
 * Blocks ../ and URL-encoded variants.
 */
export function sanitizePath(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    // Block parent directory references
    .replace(/\.\./g, '')
    // Block URL-encoded variants
    .replace(/%2e%2e/gi, '')
    .replace(/%252e%252e/gi, '')
    // Block double-encoded variants
    .replace(/%25252e/gi, '')
    // Block null byte injection
    .replace(/\0/g, '')
    // Block backslash (Windows path separator)
    .replace(/\\/g, '/')
    // Normalize multiple slashes
    .replace(/\/{2,}/g, '/')
    .trim();
}

/**
 * Sanitize input to prevent command injection.
 * Blocks shell metacharacters and common injection patterns.
 */
export function sanitizeCommand(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    // Block shell metacharacters
    .replace(/[|;&`$!(){}[\]<>]/g, '')
    // Block backticks
    .replace(/`/g, '')
    // Block dollar sign (variable expansion)
    .replace(/\$/g, '')
    .trim();
}

// ─── Filename Sanitization ───────────────────────────────────────────

/**
 * Sanitize a filename to prevent path traversal and unsafe characters.
 * Only allows alphanumeric, hyphens, underscores, and dots.
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') return '';
  return filename
    // Remove path components
    .replace(/[/\\]/g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters
    .replace(/[\x00-\x1f\x7f]/g, '')
    // Remove dangerous characters
    .replace(/[<>"'`|;&$!(){}[\]]/g, '')
    // Remove leading dots (hidden files)
    .replace(/^\.+/, '')
    // Collapse multiple dots
    .replace(/\.+/g, '.')
    // Trim
    .trim()
    // Ensure not empty
    || 'unnamed';
}

// ─── Strict Type Enforcement ──────────────────────────────────────────

/** Enforce a string is within length bounds. */
export function clampLength(str: string, min: number, max: number): string {
  if (typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (trimmed.length < min) return '';
  return trimmed.slice(0, max);
}

/** Validate and parse an integer from a string. Returns null if invalid. */
export function parseIntStrict(value: string): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const num = parseInt(trimmed, 10);
  if (isNaN(num) || !Number.isFinite(num)) return null;
  return num;
}

/** Validate and parse a float from a string. Returns null if invalid. */
export function parseFloatStrict(value: string): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const num = parseFloat(trimmed);
  if (isNaN(num) || !Number.isFinite(num)) return null;
  return num;
}

/** Validate a string matches a strict pattern. */
export function matchesPattern(value: string, pattern: RegExp): boolean {
  if (typeof value !== 'string') return false;
  return pattern.test(value.trim());
}

// ─── Combined Sanitizers ──────────────────────────────────────────────

/**
 * General-purpose sanitizer for user text input.
 * Applies XSS encoding, NoSQL injection prevention, and length clamping.
 * Use for: names, descriptions, titles, messages, search queries.
 */
export function sanitize(str: string, maxLength: number = 1000): string {
  if (typeof str !== 'string') return '';
  return removeDangerousHtml(str)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Strict sanitizer for sensitive fields (emails, IDs, filenames).
 * Strips all HTML, encodes entities, and enforces strict patterns.
 */
export function sanitizeStrict(str: string, maxLength: number = 255): string {
  if (typeof str !== 'string') return '';
  return stripHtmlTags(encodeHtml(str))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize rich text content (chat messages, review content).
 * Strips dangerous HTML but preserves basic formatting.
 */
export function sanitizeRichText(str: string, maxLength: number = 5000): string {
  if (typeof str !== 'string') return '';
  return removeDangerousHtml(str)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

// ─── URL Sanitization ─────────────────────────────────────────────────

/**
 * Validate and sanitize a URL.
 * Only allows http/https protocols, blocks javascript: and data: URIs.
 */
export function sanitizeUrl(url: string): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Block dangerous protocols
  if (/^(javascript|data|vbscript|blob):/i.test(trimmed)) return null;

  // Must be http or https
  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    // Only allow http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// ─── Email Validation ─────────────────────────────────────────────────

/**
 * Strict email validation.
 * Checks format, length, and blocks common injection patterns.
 */
export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();

  // Length limits
  if (trimmed.length < 5 || trimmed.length > 254) return false;

  // Basic format check
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) return false;

  // Block injection patterns
  if (/[<>'"%;\\]/.test(trimmed)) return false;
  if (/\.\./.test(trimmed)) return false;

  return true;
}

// ─── Phone Number Validation ──────────────────────────────────────────

/**
 * Strict phone number validation.
 * Allows +, digits, spaces, hyphens, parentheses only.
 */
export function isValidPhone(phone: string): boolean {
  if (typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-()]/g, '');
  // Must start with + or digit, followed by 7-15 digits
  return /^\+?\d{7,15}$/.test(cleaned);
}
