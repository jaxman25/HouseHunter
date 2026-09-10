import { format } from 'date-fns';
import { CurrencyCode, CURRENCIES } from '../services/currencyService';

export function formatCurrency(amount: number, currency: CurrencyCode = 'USD'): string {
  const info = CURRENCIES[currency];
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: info.decimals,
    maximumFractionDigits: info.decimals,
  }).format(amount);
}

export function formatCurrencyCompact(amount: number, currency: CurrencyCode = 'USD'): string {
  const info = CURRENCIES[currency];
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `${info.symbol} ${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    const k = amount / 1_000;
    return `${info.symbol} ${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `${info.symbol} ${Math.round(amount).toLocaleString('en-US')}`;
}

export function formatDate(dateString: string): string {
  return format(new Date(dateString), 'MMM d, yyyy');
}

export function formatDateTime(dateString: string): string {
  return format(new Date(dateString), 'MMM d, yyyy h:mm a');
}

export function formatTime(dateString: string): string {
  return format(new Date(dateString), 'h:mm a');
}

export function formatChatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return format(date, 'h:mm a');
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return format(date, 'EEEE');
  return format(date, 'MMM d');
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function formatViews(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K views`;
  return `${count} view${count !== 1 ? 's' : ''}`;
}
