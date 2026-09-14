/**
 * Server-side input validation for Cloud Functions.
 *
 * Provides strict validation for all callable function inputs.
 * Every validation function either returns the sanitized value or throws
 * an HttpsError with a descriptive message.
 *
 * This is the PRIMARY security boundary for input validation.
 * Client-side validation is defense-in-depth only.
 */

import { HttpsError } from 'firebase-functions/v2/https';

// ─── String Validation ────────────────────────────────────────────────

/**
 * Validate and sanitize a required string field.
 * Strips HTML, enforces length limits, and checks for empty values.
 */
export function requireString(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; pattern?: RegExp; allowEmpty?: boolean } = {}
): string {
  const { min = 1, max = 1000, pattern, allowEmpty = false } = options;

  if (value === null || value === undefined) {
    if (allowEmpty) return '';
    throw new HttpsError('invalid-argument', `${fieldName} is required.`);
  }

  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${fieldName} must be a string.`);
  }

  // Strip HTML tags and dangerous content
  let sanitized = value
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/\$/g, '') // Strip NoSQL injection operators
    .replace(/\.\./g, '') // Strip path traversal
    .replace(/\0/g, '') // Strip null bytes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  if (!allowEmpty && sanitized.length < min) {
    throw new HttpsError(
      'invalid-argument',
      `${fieldName} must be at least ${min} characters.`
    );
  }

  if (sanitized.length > max) {
    throw new HttpsError(
      'invalid-argument',
      `${fieldName} must be at most ${max} characters.`
    );
  }

  if (pattern && !pattern.test(sanitized)) {
    throw new HttpsError('invalid-argument', `${fieldName} has invalid format.`);
  }

  return sanitized;
}

/**
 * Validate an optional string field.
 * Returns the sanitized value or undefined if not provided.
 */
export function optionalString(
  value: unknown,
  fieldName: string,
  options: { max?: number; pattern?: RegExp } = {}
): string | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  return requireString(value, fieldName, { ...options, allowEmpty: false });
}

// ─── Number Validation ────────────────────────────────────────────────

/**
 * Validate and parse a required number field.
 */
export function requireNumber(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): number {
  const { min = -Infinity, max = Infinity, integer = false } = options;

  if (value === null || value === undefined) {
    throw new HttpsError('invalid-argument', `${fieldName} is required.`);
  }

  const num = typeof value === 'number' ? value : parseFloat(String(value));

  if (isNaN(num) || !Number.isFinite(num)) {
    throw new HttpsError('invalid-argument', `${fieldName} must be a valid number.`);
  }

  if (integer && !Number.isInteger(num)) {
    throw new HttpsError('invalid-argument', `${fieldName} must be an integer.`);
  }

  if (num < min || num > max) {
    throw new HttpsError(
      'invalid-argument',
      `${fieldName} must be between ${min} and ${max}.`
    );
  }

  return num;
}

/**
 * Validate an optional number field.
 */
export function optionalNumber(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  return requireNumber(value, fieldName, options);
}

// ─── Boolean Validation ───────────────────────────────────────────────

/**
 * Validate a required boolean field.
 */
export function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new HttpsError('invalid-argument', `${fieldName} must be a boolean.`);
}

// ─── ID Validation ────────────────────────────────────────────────────

/**
 * Validate a Firestore document ID.
 * Firestore IDs are alphanumeric with hyphens and underscores, max 1500 chars.
 */
export function requireId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `${fieldName} is required.`);
  }

  const id = value.trim();

  // Firestore document IDs: alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9_-]{1,1500}$/.test(id)) {
    throw new HttpsError('invalid-argument', `${fieldName} contains invalid characters.`);
  }

  // Block path traversal
  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new HttpsError('invalid-argument', `${fieldName} contains invalid characters.`);
  }

  return id;
}

// ─── Email Validation ─────────────────────────────────────────────────

/**
 * Strict email validation for server-side use.
 */
export function requireEmail(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `${fieldName} is required.`);
  }

  const email = value.trim().toLowerCase();

  if (email.length < 5 || email.length > 254) {
    throw new HttpsError('invalid-argument', `${fieldName} has invalid format.`);
  }

  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    throw new HttpsError('invalid-argument', `${fieldName} has invalid format.`);
  }

  // Block injection patterns
  if (/[<>'"%;\\]/.test(email)) {
    throw new HttpsError('invalid-argument', `${fieldName} has invalid format.`);
  }

  return email;
}

// ─── Array Validation ─────────────────────────────────────────────────

/**
 * Validate a required array field with optional item validation.
 */
export function requireArray<T>(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; itemValidator?: (item: unknown) => T } = {}
): T[] {
  const { min = 0, max = 100, itemValidator } = options;

  if (!Array.isArray(value)) {
    throw new HttpsError('invalid-argument', `${fieldName} must be an array.`);
  }

  if (value.length < min) {
    throw new HttpsError(
      'invalid-argument',
      `${fieldName} must have at least ${min} items.`
    );
  }

  if (value.length > max) {
    throw new HttpsError(
      'invalid-argument',
      `${fieldName} must have at most ${max} items.`
    );
  }

  if (itemValidator) {
    return value.map((item, i) => {
      try {
        return itemValidator(item);
      } catch (error) {
        if (error instanceof HttpsError) {
          throw new HttpsError(
            'invalid-argument',
            `${fieldName}[${i}]: ${error.message}`
          );
        }
        throw error;
      }
    });
  }

  return value as T[];
}

// ─── Enum Validation ──────────────────────────────────────────────────

/**
 * Validate a value is one of the allowed options.
 */
export function requireEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[]
): T {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${fieldName} is required.`);
  }

  if (!allowed.includes(value as T)) {
    throw new HttpsError(
      'invalid-argument',
      `${fieldName} must be one of: ${allowed.join(', ')}`
    );
  }

  return value as T;
}

// ─── Date Validation ──────────────────────────────────────────────────

/**
 * Validate an ISO date string.
 */
export function requireDate(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${fieldName} is required.`);
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new HttpsError('invalid-argument', `${fieldName} must be a valid date.`);
  }

  // Block dates more than 1 year in the future
  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  if (date > oneYearFromNow) {
    throw new HttpsError('invalid-argument', `${fieldName} is too far in the future.`);
  }

  // Block dates more than 10 years in the past
  const tenYearsAgo = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000);
  if (date < tenYearsAgo) {
    throw new HttpsError('invalid-argument', `${fieldName} is too far in the past.`);
  }

  return date.toISOString();
}

// ─── Combined Validation ──────────────────────────────────────────────

/**
 * Validate the full seller inquiry payload.
 */
export function validateSellerInquiry(data: unknown): {
  propertyId: string;
  message: string;
} {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Request body is required.');
  }

  const obj = data as Record<string, unknown>;

  const propertyId = requireId(obj.propertyId, 'propertyId');
  const message = requireString(obj.message, 'message', { min: 20, max: 1000 });

  return { propertyId, message };
}

/**
 * Validate the full security event payload.
 */
export function validateSecurityEvent(data: unknown): {
  type: string;
  uid?: string;
  detail?: Record<string, unknown>;
} {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Request body is required.');
  }

  const obj = data as Record<string, unknown>;

  const type = requireString(obj.type, 'type', { max: 50, pattern: /^[a-z.]+$/ });
  const uid = optionalString(obj.uid, 'uid', { max: 128 });
  const detail = obj.detail && typeof obj.detail === 'object'
    ? obj.detail as Record<string, unknown>
    : undefined;

  return { type, uid, detail };
}
