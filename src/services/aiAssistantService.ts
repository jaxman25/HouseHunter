import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../config/firebase';

/**
 * AI Listing Assistant (seller side).
 *
 * Calls the `improveListing` Cloud Function, which prompts an LLM to rewrite
 * the title/description, flag missing details, and suggest a price range
 * anchored on comparable listings. Server-side budget: 20 calls/user/day.
 */

let functionsInstance: ReturnType<typeof getFunctions> | null = null;

function getFunctionsInstance() {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app);
  }
  return functionsInstance;
}

export interface ListingSuggestion {
  suggestedTitle: string;
  descriptionRewrite: string;
  missingFields: string[];
  suggestedPriceRange: { min: number; max: number } | null;
  priceContext: string;
}

export interface ImproveListingInput {
  title: string;
  description: string;
  type: string;
  city: string;
  price: number;
}

/**
 * Ask the AI assistant for listing suggestions.
 * Throws on failure — `error.code` may be 'functions/resource-exhausted'
 * when the daily 20-call budget is used up.
 */
export async function improveListing(input: ImproveListingInput): Promise<ListingSuggestion> {
  const callable = httpsCallable<ImproveListingInput, ListingSuggestion>(
    getFunctionsInstance(),
    'improveListing'
  );
  const result = await callable(input);
  return result.data;
}

// ─── AI Natural Language Search ───────────────────────────────────────────

/** Mirrors ParsedSearchFilter in functions/src/nlSearch.ts. */
export interface ParsedSearchFilters {
  listingType?: 'sale' | 'rent';
  propertyType?: string[];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  city?: string;
  features?: string[];
  sortBy?: string;
}

/** Result of the parseSearchQuery callable. */
export interface AiSearchParse {
  ok: boolean;
  filters?: ParsedSearchFilters;
  query?: string;
  reason?: string;
}

/**
 * Parse a natural-language search query into structured filters.
 * Returns `{ ok: false }` when the query can't be parsed — the caller should
 * fall back to plain full-text search. Throws only for transport-level
 * failures (offline, function not deployed).
 */
export async function parseSearchQuery(query: string): Promise<AiSearchParse> {
  const callable = httpsCallable<{ query: string }, AiSearchParse>(
    getFunctionsInstance(),
    'parseSearchQuery'
  );
  const result = await callable({ query });
  return result.data;
}
