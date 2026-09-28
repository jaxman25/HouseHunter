/**
 * AI Listing Assistant — HTTPS callable that helps sellers improve listings.
 *
 * improveListing({ title, description, type, city, price }) →
 *   { suggestedTitle, descriptionRewrite, missingFields[], suggestedPriceRange }
 *
 * Uses OpenAI chat completions in JSON mode. The suggested price range is
 * anchored on real data: median price of similar listings (same city + type,
 * ±40% of the caller's price) fetched from Firestore before the LLM call —
 * the model is told to stay near that band.
 *
 * Rate limit: 20 calls/user/day via the same transactional counter pattern
 * as sendSellerInquiry (users/{uid}/inquiryCounters/{yyyymmdd}).
 *
 * Env: OPENAI_API_KEY (required to enable; without it the callable throws a
 * clear failed-precondition error rather than degrading silently).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { requireString, requireNumber, requireEnum } from './validation';

const db = getFirestore();

/** Per-user daily budget for AI assistant calls. */
const DAILY_AI_LIMIT = 20;

const PROPERTY_TYPES = [
  'house', 'apartment', 'condo', 'townhouse', 'bedsitter', 'maisonette', 'land', 'commercial',
] as const;

interface ListingSuggestion {
  suggestedTitle: string;
  descriptionRewrite: string;
  missingFields: string[];
  suggestedPriceRange: { min: number; max: number } | null;
  priceContext: string;
}

/** Median + range of comparable listing prices (same city + type, ±40%). */
async function comparablePriceStats(
  city: string,
  propertyType: string,
  price: number
): Promise<{ median: number; count: number; min: number; max: number } | null> {
  const snap = await db
    .collection('properties')
    .where('status', '==', 'active')
    .where('city', '==', city)
    .where('propertyType', '==', propertyType)
    .get();

  const prices = snap.docs
    .map((d) => Number(d.data().price))
    .filter((p) => Number.isFinite(p) && p > 0 && Math.abs(p - price) <= price * 0.4)
    .sort((a, b) => a - b);

  if (prices.length === 0) return null;
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 1 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);

  return { median, count: prices.length, min: prices[0], max: prices[prices.length - 1] };
}

/** Enforce the daily AI budget with a transactional counter (no fast writes). */
async function enforceDailyLimit(uid: string): Promise<void> {
  const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const counterRef = db.doc(`users/${uid}/inquiryCounters/${dateKey}_ai`);
  let limitReached = false;
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const count = snap.exists ? ((snap.data()?.count as number) ?? 0) : 0;
      if (count >= DAILY_AI_LIMIT) {
        limitReached = true;
        return;
      }
      tx.set(counterRef, { count: count + 1 }, { merge: true });
    });
  } catch (error) {
    throw new HttpsError('unavailable', 'Could not check AI usage limits. Please try again.');
  }
  if (limitReached) {
    throw new HttpsError(
      'resource-exhausted',
      `Daily AI assistant limit reached (${DAILY_AI_LIMIT}). Please try again tomorrow.`
    );
  }
}

/** Call OpenAI and parse the strict-JSON response. */
async function callOpenAI(input: {
  title: string;
  description: string;
  type: string;
  city: string;
  price: number;
  priceContext: string;
}): Promise<{ suggestedTitle: string; descriptionRewrite: string; missingFields: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new HttpsError(
      'failed-precondition',
      'The AI assistant is not configured yet. Please try again later.'
    );
  }

  const system =
    'You are a real-estate listing copywriter. Respond with ONLY a JSON object ' +
    '(no markdown fence) of shape: {"suggestedTitle": string (<=120 chars), ' +
    '"descriptionRewrite": string (<=1200 chars, flowing prose, no bullet lists), ' +
    '"missingFields": string[] (up to 4 short names of details the seller should add, ' +
    'e.g. "year built", "parking")}. Keep all facts from the original description; ' +
    'improve clarity, structure, and appeal. Never invent measurements or amenities.';

  const user = [
    `Title: ${input.title}`,
    `Property type: ${input.type}`,
    `City: ${input.city}`,
    `Price: ${input.price}`,
    input.priceContext,
    `Current description: ${input.description}`,
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    console.error('[improveListing] OpenAI error:', res.status, await res.text().catch(() => ''));
    throw new HttpsError('internal', 'The AI service could not process this request.');
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? '';

  let parsed: { suggestedTitle?: unknown; descriptionRewrite?: unknown; missingFields?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new HttpsError('internal', 'The AI response could not be parsed. Please try again.');
  }

  const suggestedTitle =
    typeof parsed.suggestedTitle === 'string' ? parsed.suggestedTitle.slice(0, 120) : '';
  const descriptionRewrite =
    typeof parsed.descriptionRewrite === 'string'
      ? parsed.descriptionRewrite.slice(0, 1200)
      : '';
  const missingFields = Array.isArray(parsed.missingFields)
    ? parsed.missingFields
        .filter((f): f is string => typeof f === 'string')
        .map((f) => f.slice(0, 40))
        .slice(0, 4)
    : [];

  if (!suggestedTitle || !descriptionRewrite) {
    throw new HttpsError('internal', 'The AI response was incomplete. Please try again.');
  }

  return { suggestedTitle, descriptionRewrite, missingFields };
}

export const improveListing = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const uid = auth.uid;

  // Strict input validation (reject before any reads/costs).
  const data = (request.data ?? {}) as Record<string, unknown>;
  const title = requireString(data.title, 'title', { min: 3, max: 120 });
  const description = requireString(data.description, 'description', { min: 20, max: 4000 });
  const type = requireEnum(data.type, 'type', PROPERTY_TYPES);
  const city = requireString(data.city, 'city', { min: 2, max: 80 });
  const price = requireNumber(data.price, 'price', { min: 1, max: 1_000_000_000 });

  // Budget before model spend.
  await enforceDailyLimit(uid);

  // Anchor the price suggestion on comparable listings.
  let priceContext = 'No comparable listings found — base the range on the given price.';
  let stats: { median: number; count: number; min: number; max: number } | null = null;
  try {
    stats = await comparablePriceStats(city, type, price);
  } catch (error) {
    console.warn('[improveListing] comparable lookup failed:', error);
  }
  if (stats) {
    priceContext =
      `There are ${stats.count} comparable active listings in ${city} ` +
      `(median ${Math.round(stats.median)}, range ${Math.round(stats.min)}-${Math.round(stats.max)}). ` +
      'Suggested range should stay within that band.';
  }

  const suggestion = await callOpenAI({ title, description, type, city, price, priceContext });

  const result: ListingSuggestion = {
    ...suggestion,
    suggestedPriceRange: stats
      ? {
          min: Math.round(Math.min(stats.median * 0.9, price * 0.95)),
          max: Math.round(Math.max(stats.median * 1.1, price * 1.05)),
        }
      : { min: Math.round(price * 0.9), max: Math.round(price * 1.1) },
    priceContext: stats
      ? `Based on ${stats.count} similar listings in ${city}`
      : 'Based on the listing price',
  };

  return result;
});
