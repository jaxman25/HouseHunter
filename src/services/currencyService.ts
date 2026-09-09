/**
 * Currency service — exchange rate fetching, conversion, and formatting.
 *
 * Default currency is KSh (Kenyan Shilling). Exchange rates are fetched
 * from a free API and cached for 24 hours.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type CurrencyCode = 'KES' | 'USD' | 'EUR' | 'GBP' | 'TZS' | 'UGX';

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  /** Decimal places for display. */
  decimals: number;
  /** Thousands separator. */
  thousandsSep: string;
  /** Decimal separator. */
  decimalSep: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  KES: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', decimals: 0, thousandsSep: ',', decimalSep: '.' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 0, thousandsSep: ',', decimalSep: '.' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 0, thousandsSep: '.', decimalSep: ',' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 0, thousandsSep: ',', decimalSep: '.' },
  TZS: { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling', decimals: 0, thousandsSep: ',', decimalSep: '.' },
  UGX: { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling', decimals: 0, thousandsSep: ',', decimalSep: '.' },
};

const STORAGE_KEY = '@househunter/currency';
const RATES_CACHE_KEY = '@househunter/exchange_rates';
const RATES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/** Default exchange rates (used when API is unavailable). */
const FALLBACK_RATES: Record<CurrencyCode, number> = {
  KES: 1,
  USD: 0.0077,
  EUR: 0.0071,
  GBP: 0.0061,
  TZS: 19.5,
  UGX: 28.5,
};

/** Stored rates + timestamp. */
interface CachedRates {
  rates: Record<CurrencyCode, number>;
  timestamp: number;
}

let cachedRates: CachedRates | null = null;

/**
 * Fetch live exchange rates from a free API.
 * Falls back to hardcoded rates if the API is unavailable.
 */
async function fetchRates(): Promise<Record<CurrencyCode, number>> {
  try {
    // Use exchangerate-api.com free tier (no key needed for basic)
    const response = await fetch(
      'https://open.er-api.com/v6/latest/KES',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) throw new Error('API error');
    const data = await response.json();
    if (data.result === 'success' && data.rates) {
      return {
        KES: 1,
        USD: data.rates.USD ?? FALLBACK_RATES.USD,
        EUR: data.rates.EUR ?? FALLBACK_RATES.EUR,
        GBP: data.rates.GBP ?? FALLBACK_RATES.GBP,
        TZS: data.rates.TZS ?? FALLBACK_RATES.TZS,
        UGX: data.rates.UGX ?? FALLBACK_RATES.UGX,
      };
    }
  } catch {
    // API unavailable — use fallback
  }
  return { ...FALLBACK_RATES };
}

/**
 * Get exchange rates, using cache if fresh.
 */
export async function getExchangeRates(): Promise<Record<CurrencyCode, number>> {
  // In-memory cache
  if (cachedRates && Date.now() - cachedRates.timestamp < RATES_CACHE_TTL) {
    return cachedRates.rates;
  }

  // AsyncStorage cache
  try {
    const stored = await AsyncStorage.getItem(RATES_CACHE_KEY);
    if (stored) {
      const parsed: CachedRates = JSON.parse(stored);
      if (Date.now() - parsed.timestamp < RATES_CACHE_TTL) {
        cachedRates = parsed;
        return parsed.rates;
      }
    }
  } catch {
    // Ignore cache read errors
  }

  // Fetch fresh rates
  const rates = await fetchRates();
  cachedRates = { rates, timestamp: Date.now() };

  try {
    await AsyncStorage.setItem(RATES_CACHE_KEY, JSON.stringify(cachedRates));
  } catch {
    // Ignore cache write errors
  }

  return rates;
}

/**
 * Convert an amount from KES to another currency.
 */
export async function convertFromKES(
  amountKES: number,
  toCurrency: CurrencyCode
): Promise<number> {
  if (toCurrency === 'KES') return amountKES;
  const rates = await getExchangeRates();
  return amountKES * (rates[toCurrency] ?? 1);
}

/**
 * Format a price in a given currency with proper symbol and separators.
 */
export function formatCurrencyAmount(
  amount: number,
  currency: CurrencyCode,
  options?: { compact?: boolean }
): string {
  const info = CURRENCIES[currency];

  if (options?.compact) {
    if (amount >= 1_000_000) {
      const m = amount / 1_000_000;
      return `${info.symbol} ${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
    }
    if (amount >= 1_000) {
      const k = amount / 1_000;
      return `${info.symbol} ${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
    }
  }

  const formatted = Math.round(amount).toLocaleString('en-US');
  return `${info.symbol} ${formatted}`;
}

/**
 * Get the saved currency preference.
 */
export async function getSavedCurrency(): Promise<CurrencyCode> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && saved in CURRENCIES) return saved as CurrencyCode;
  } catch {
    // Ignore
  }
  return 'KES'; // Default
}

/**
 * Save currency preference.
 */
export async function saveCurrency(code: CurrencyCode): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, code);
}

/**
 * Get the listing type suffix for display (e.g., "/month" for rent).
 */
export function getListingSuffix(listingType: 'sale' | 'rent', currency: CurrencyCode): string {
  if (listingType === 'rent') return '/mo';
  return '';
}
