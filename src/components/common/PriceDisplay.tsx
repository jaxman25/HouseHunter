import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { formatCurrencyAmount, getListingSuffix, convertFromKES } from '../../services/currencyService';

interface PriceDisplayProps {
  /** Price in KES (Kenyan Shillings). */
  amount: number;
  /** 'sale' shows the amount; 'rent' appends /mo. */
  listingType?: 'sale' | 'rent';
  /** Use compact format (KSh 5.5M instead of KSh 5,500,000). */
  compact?: boolean;
  /** Override the font color. */
  color?: string;
  /** Override the font size. */
  fontSize?: number;
  /** Override the font weight. */
  fontWeight?: string;
  /** Additional style. */
  style?: any;
  /** Show strikethrough for original price when on sale. */
  showStrikethrough?: boolean;
  /** Original KES amount before discount (for strikethrough). */
  originalAmount?: number;
}

/**
 * Display a property price converted to the user's selected currency.
 *
 * Prices are stored in KES internally. This component fetches the
 * exchange rate and renders the formatted price in the user's
 * preferred currency.
 */
export default function PriceDisplay({
  amount,
  listingType,
  compact = false,
  color,
  fontSize,
  fontWeight = '700',
  style,
  showStrikethrough,
  originalAmount,
}: PriceDisplayProps) {
  const { colors, fontSize: themeFontSize } = useTheme();
  const { currency } = useCurrencyContext();
  const [displayPrice, setDisplayPrice] = useState(() =>
    formatCurrencyAmount(amount, currency, { compact })
  );
  const [displayOriginal, setDisplayOriginal] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const converted = await convertFromKES(amount, currency);
        if (mounted) {
          const suffix = listingType ? getListingSuffix(listingType, currency) : '';
          setDisplayPrice(formatCurrencyAmount(converted, currency, { compact }) + suffix);
        }
        if (showStrikethrough && originalAmount) {
          const convertedOrig = await convertFromKES(originalAmount, currency);
          if (mounted) {
            setDisplayOriginal(formatCurrencyAmount(convertedOrig, currency, { compact }));
          }
        }
      } catch {
        // Use fallback
        const suffix = listingType ? getListingSuffix(listingType, currency) : '';
        setDisplayPrice(formatCurrencyAmount(amount, currency, { compact }) + suffix);
      }
    })();
    return () => { mounted = false; };
  }, [amount, currency, listingType, compact, showStrikethrough, originalAmount]);

  return (
    <Text
      style={[
        {
          color: color || colors.primary,
          fontSize: fontSize || themeFontSize.xl,
          fontWeight,
        },
        showStrikethrough && displayOriginal
          ? { textDecorationLine: 'line-through', textDecorationStyle: 'solid' }
          : null,
        style,
      ]}
    >
      {displayPrice}
    </Text>
  );
}
