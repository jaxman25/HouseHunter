/**
 * AI Natural Language Search — HTTPS callable that turns a free-form query
 * like "Find me a 3-bed near a park under $400k" into the client's existing
 * PropertyFilter shape (src/components/property/FilterModal.tsx).
 *
 * The model returns STRICT JSON; every field is re-validated server-side and
 * anything unparseable yields `{ ok: false }` so the client falls back to the
 * existing full-text search path (no error surfaced to the user).
 *
 * Rate limit: shared 20 calls/user/day AI budget (functions/src/aiBudget.ts).
 *
 * Env: OPENAI_API_KEY (required to enable; without it the callable throws a
 * clear failed-precondition error the client treats as "fall back").
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { enforceDailyAiLimit } from './aiBudget';
import { requireString } from './validation';

const PROPERTY_TYPES = [
  'house', 'apartment', 'condo', 'townhouse', 'bedsitter', 'maisonette', 'land', 'commercial',
] as const;
const LISTING_TYPES = ['sale', 'rent'] as const;
const FEATURE_KEYS = [
  'parking', 'pool', 'gym', 'petFriendly', 'airConditioning', 'furnished', 'garden',
  'balcony', 'security', 'wifi', 'elevator', 'laundry', 'dishwasher', 'fireplace',
  'garage', 'basement', 'solar', 'borehole', 'servantQuarters', 'gatedCommunity',
] as const;
const SORT_KEYS = ['price_asc', 'price_desc', 'newest', 'oldest', 'popular'] as const;

/** Mirrors PropertyFilter (src/types/index.ts) minus maxPayment/client-sort extras. */
export interface ParsedSearchFilter {
  listingType?: string;
  propertyType?: string[];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  city?: string;
  features?: string[];
  sortBy?: string;
}

interface ParseResult {
  ok: boolean;
  filters?: ParsedSearchFilter;
  /** Echo of the normalized query (useful for display/debugging). */
  query?: string;
  reason?: string;
}

function optionalBoundedNumber(
  value: unknown,
  name: string,
  min: number,
  max: number
): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (n < min || n > max) return undefined;
  return n;
}

/** Coerce one LLM-produced filter object into the strict ParsedSearchFilter shape. */
function coerceFilters(raw: Record<string, unknown>): ParsedSearchFilter {
  const out: ParsedSearchFilter = {};

  if (typeof raw.listingType === 'string' && (LISTING_TYPES as readonly string[]).includes(raw.listingType)) {
    out.listingType = raw.listingType;
  }

  if (Array.isArray(raw.propertyType)) {
    const types = raw.propertyType
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.toLowerCase())
      .filter((t): t is (typeof PROPERTY_TYPES)[number] =>
        (PROPERTY_TYPES as readonly string[]).includes(t));
    if (types.length > 0) out.propertyType = types.slice(0, 6);
  }

  const minPrice = optionalBoundedNumber(raw.minPrice, 'minPrice', 0, 1_000_000_000);
  const maxPrice = optionalBoundedNumber(raw.maxPrice, 'maxPrice', 0, 1_000_000_000);
  if (minPrice !== undefined) out.minPrice = minPrice;
  if (maxPrice !== undefined) out.maxPrice = maxPrice;
  // Guard against an inverted range (e.g. "over 100k but under 50k" noise).
  if (out.minPrice !== undefined && out.maxPrice !== undefined && out.minPrice > out.maxPrice) {
    const tmp = out.minPrice;
    out.minPrice = out.maxPrice;
    out.maxPrice = tmp;
  }

  const minBedrooms = optionalBoundedNumber(raw.minBedrooms, 'minBedrooms', 0, 50);
  if (minBedrooms !== undefined) out.minBedrooms = Math.round(minBedrooms);
  const minBathrooms = optionalBoundedNumber(raw.minBathrooms, 'minBathrooms', 0, 50);
  if (minBathrooms !== undefined) out.minBathrooms = Math.round(minBathrooms);

  if (typeof raw.city === 'string' && raw.city.trim().length >= 2 && raw.city.length <= 80) {
    out.city = raw.city.trim();
  }

  if (Array.isArray(raw.features)) {
    const feats = raw.features
      .filter((f): f is string => typeof f === 'string')
      .map((f) => f.trim())
      .filter((f): f is (typeof FEATURE_KEYS)[number] =>
        (FEATURE_KEYS as readonly string[]).includes(f));
    if (feats.length > 0) out.features = feats.slice(0, 10);
  }

  if (typeof raw.sortBy === 'string' && (SORT_KEYS as readonly string[]).includes(raw.sortBy)) {
    out.sortBy = raw.sortBy;
  }

  return out;
}

/** True when the model produced nothing usable. */
function isEmptyFilters(f: ParsedSearchFilter): boolean {
  return Object.keys(f).length === 0;
}

async function callOpenAI(query: string): Promise<ParsedSearchFilter> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new HttpsError(
      'failed-precondition',
      'AI search is not configured yet. Please try a regular search.'
    );
  }

  const system =
    'You parse real-estate search requests into JSON filters. Respond with ONLY a JSON object ' +
    '(no markdown fence) of shape: {"listingType": "sale"|"rent"|null, ' +
    '"propertyType": string[] (subset of house|apartment|condo|townhouse|bedsitter|maisonette|land|commercial, may be empty), ' +
    '"minPrice": number|null, "maxPrice": number|null, "minBedrooms": number|null, ' +
    '"minBathrooms": number|null, "city": string|null, ' +
    '"features": string[] (subset of parking|pool|gym|petFriendly|airConditioning|furnished|garden|balcony|security|wifi|elevator|laundry|dishwasher|fireplace|garage|basement|solar|borehole|servantQuarters|gatedCommunity, may be empty), ' +
    '"sortBy": "price_asc"|"price_desc"|"newest"|null}. ' +
    'Rules: map phrases like "3-bed" to minBedrooms 3, "under $400k" to maxPrice 400000, ' +
    '"near a park" to features ["parking"] only if the user clearly wants parking (otherwise null), ' +
    '"cheap" to sortBy "price_asc", "newest" to sortBy "newest". ' +
    'Use null for anything the query does not specify. Never invent values.';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: query },
      ],
    }),
  });

  if (!res.ok) {
    console.error('[parseSearchQuery] OpenAI error:', res.status, await res.text().catch(() => ''));
    throw new HttpsError('internal', 'The AI service could not process this search.');
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? '';

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new HttpsError('internal', 'The AI response could not be parsed.');
  }

  const filters = coerceFilters(raw);
  if (isEmptyFilters(filters)) {
    throw new HttpsError(
      'failed-precondition',
      'The query did not contain any recognizable filters.'
    );
  }
  return filters;
}

export const parseSearchQuery = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const data = (request.data ?? {}) as Record<string, unknown>;
  const query = requireString(data.query, 'query', { min: 3, max: 200 });

  // Budget before model spend (shared with improveListing).
  await enforceDailyAiLimit(auth.uid);

  try {
    const filters = await callOpenAI(query);
    const result: ParseResult = { ok: true, filters, query };
    return result;
  } catch (error) {
    // Deliberate fallback contract: unparseable/empty queries and service
    // misconfiguration return ok:false so the client runs a plain full-text
    // search instead of showing an error.
    if (error instanceof HttpsError && error.code !== 'resource-exhausted') {
      const result: ParseResult = { ok: false, query, reason: error.code };
      return result;
    }
    throw error;
  }
});
