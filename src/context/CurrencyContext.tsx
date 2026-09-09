import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  CurrencyCode,
  getSavedCurrency,
  saveCurrency,
  getExchangeRates,
  convertFromKES,
  formatCurrencyAmount,
  getListingSuffix,
} from '../services/currencyService';

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => Promise<void>;
  /** Convert a KES amount to the current display currency. */
  convert: (amountKES: number) => Promise<number>;
  /** Format a KES amount in the current display currency. */
  formatPrice: (amountKES: number, listingType?: 'sale' | 'rent', compact?: boolean) => string;
  /** Format a KES amount in a specific currency. */
  formatPriceIn: (amountKES: number, currency: CurrencyCode, listingType?: 'sale' | 'rent', compact?: boolean) => string;
  /** Whether rates have loaded. */
  ratesLoaded: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>('KES');
  const [ratesLoaded, setRatesLoaded] = useState(false);

  // Load saved currency on mount
  useEffect(() => {
    getSavedCurrency().then((saved) => {
      setCurrencyState(saved);
      // Pre-fetch rates
      getExchangeRates().then(() => setRatesLoaded(true)).catch(() => setRatesLoaded(true));
    });
  }, []);

  const setCurrency = useCallback(async (code: CurrencyCode) => {
    setCurrencyState(code);
    await saveCurrency(code);
  }, []);

  const convert = useCallback(async (amountKES: number): Promise<number> => {
    return convertFromKES(amountKES, currency);
  }, [currency]);

  const formatPrice = useCallback(
    (amountKES: number, listingType?: 'sale' | 'rent', compact?: boolean): string => {
      // Use fallback rates for synchronous rendering
      const rates: Record<CurrencyCode, number> = {
        KES: 1, USD: 0.0077, EUR: 0.0071, GBP: 0.0061, TZS: 19.5, UGX: 28.5,
      };
      const converted = amountKES * (rates[currency] ?? 1);
      const formatted = formatCurrencyAmount(converted, currency, { compact });
      const suffix = listingType ? getListingSuffix(listingType, currency) : '';
      return formatted + suffix;
    },
    [currency]
  );

  const formatPriceIn = useCallback(
    (amountKES: number, targetCurrency: CurrencyCode, listingType?: 'sale' | 'rent', compact?: boolean): string => {
      // Synchronous version for components that need immediate rendering
      // Uses cached rates or fallback
      const info = { KES: 1, USD: 0.0077, EUR: 0.0071, GBP: 0.0061, TZS: 19.5, UGX: 28.5 };
      const rate = info[targetCurrency] ?? 1;
      const converted = amountKES * rate;
      const formatted = formatCurrencyAmount(converted, targetCurrency, { compact });
      const suffix = listingType ? getListingSuffix(listingType, targetCurrency) : '';
      return formatted + suffix;
    },
    []
  );

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        convert,
        formatPrice,
        formatPriceIn,
        ratesLoaded,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrencyContext(): CurrencyContextType {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrencyContext must be used within a CurrencyProvider');
  }
  return context;
}
