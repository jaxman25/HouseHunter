/**
 * Centralized currency + area formatting (prompt4 #5).
 *
 * A single place for `$`/`sqft`-style output so hardcoded units scattered
 * through screens can be replaced. Defaults to USD + sqft but reads the
 * build-time config flag `EXPO_PUBLIC_UNIT_SYSTEM` ('imperial' | 'metric')
 * and, when available, the user's currency preference.
 *
 * Pure functions where possible; the context-aware helpers take the currency
 * code explicitly so screens that already hold useCurrencyContext() can pass
 * it through without this module depending on React.
 */

import { CurrencyCode, CURRENCIES } from '../services/currencyService';

/** Build-time unit system flag (default imperial: USD + sqft). */
export type UnitSystem = 'imperial' | 'metric';

export function getUnitSystem(): UnitSystem {
  const flag = process.env.EXPO_PUBLIC_UNIT_SYSTEM;
  return flag === 'metric' ? 'metric' : 'imperial';
}

/** Currency implied by the unit-system flag. */
export function getDefaultCurrency(): CurrencyCode {
  return getUnitSystem() === 'metric' ? 'KES' : 'USD';
}

/**
 * Format a money amount with the currency symbol.
 * `currency` defaults to the unit-system currency so plain call sites work.
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode = getDefaultCurrency(),
  listingType?: 'sale' | 'rent'
): string {
  if (!Number.isFinite(amount)) return '';
  const info = CURRENCIES[currency];
  const formatted = Math.round(amount).toLocaleString('en-US');
  const base = `${info.symbol}${formatted}`;
  return listingType === 'rent' ? `${base}/mo` : base;
}

/** Compact variant for chips/cards ($1.2M, KES 850K). */
export function formatCurrencyCompact(
  amount: number,
  currency: CurrencyCode = getDefaultCurrency()
): string {
  if (!Number.isFinite(amount)) return '';
  const info = CURRENCIES[currency];
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `${info.symbol}${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    const k = amount / 1_000;
    return `${info.symbol}${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `${info.symbol}${Math.round(amount).toLocaleString('en-US')}`;
}

/** Just the currency symbol for input-field labels (e.g. "Price ($)"). */
export function formatCurrencySymbol(currency: CurrencyCode = getDefaultCurrency()): string {
  return CURRENCIES[currency].symbol;
}

/**
 * Format an area value with the configured unit. Values are stored in sqft;
 * when the metric unit system is configured, sqft is converted to m²
 * (1 sqft = 0.092903 m²) and labeled accordingly.
 */
export function formatAreaFormatted(
  areaSqft: number,
  unit?: 'sqft' | 'sqm'
): string {
  if (!Number.isFinite(areaSqft)) return '';
  const system = unit ?? (getUnitSystem() === 'metric' ? 'sqm' : 'sqft');
  if (system === 'sqm') {
    const m2 = Math.round(areaSqft * 0.092903);
    return `${m2.toLocaleString('en-US')} m²`;
  }
  return `${Math.round(areaSqft).toLocaleString('en-US')} sq ft`;
}
