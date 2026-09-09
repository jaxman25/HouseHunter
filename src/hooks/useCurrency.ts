import { useState, useEffect, useCallback } from 'react';
import { useCurrencyContext } from '../context/CurrencyContext';
import { CurrencyCode, convertFromKES, formatCurrencyAmount, getListingSuffix } from '../services/currencyService';

/**
 * Hook for currency-aware price formatting in components.
 *
 * Usage:
 *   const { formatPrice, formatPriceSync, convertedPrice } = useCurrency();
 *   // Async (waits for rates):
 *   const price = await formatPrice(property.price, 'sale');
 *   // Sync (uses fallback rates, instant):
 *   const price = formatPriceSync(property.price, 'sale');
 */
export function useCurrency() {
  const { currency, setCurrency, ratesLoaded } = useCurrencyContext();
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);

  /**
   * Synchronous price formatting using fallback rates.
   * Use this in render paths where async is not possible.
   */
  const formatPriceSync = useCallback(
    (amountKES: number, listingType?: 'sale' | 'rent', compact?: boolean): string => {
      const formatted = formatCurrencyAmount(amountKES, currency, { compact });
      const suffix = listingType ? getListingSuffix(listingType, currency) : '';
      return formatted + suffix;
    },
    [currency]
  );

  /**
   * Async price formatting using live exchange rates.
   */
  const formatPriceAsync = useCallback(
    async (amountKES: number, listingType?: 'sale' | 'rent', compact?: boolean): Promise<string> => {
      const converted = await convertFromKES(amountKES, currency);
      const formatted = formatCurrencyAmount(converted, currency, { compact });
      const suffix = listingType ? getListingSuffix(listingType, currency) : '';
      return formatted + suffix;
    },
    [currency]
  );

  /**
   * Convert a KES amount and store the result.
   */
  const convertAmount = useCallback(
    async (amountKES: number): Promise<number> => {
      const result = await convertFromKES(amountKES, currency);
      setConvertedAmount(result);
      return result;
    },
    [currency]
  );

  return {
    currency,
    setCurrency,
    ratesLoaded,
    formatPrice: formatPriceSync,
    formatPriceAsync,
    formatPriceIn: (amountKES: number, targetCurrency: CurrencyCode, listingType?: 'sale' | 'rent', compact?: boolean) => {
      const formatted = formatCurrencyAmount(amountKES, targetCurrency, { compact });
      const suffix = listingType ? getListingSuffix(listingType, targetCurrency) : '';
      return formatted + suffix;
    },
    convertAmount,
    convertedPrice: convertedAmount,
  };
}
