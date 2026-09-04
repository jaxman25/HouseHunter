import { Platform } from 'react-native';

export function formatPrice(price: number, listingType: 'sale' | 'rent'): string {
  const formatted = price.toLocaleString('en-US');
  if (listingType === 'rent') {
    return `$${formatted}/mo`;
  }
  return `$${formatted}`;
}

export function formatArea(area: number, unit: 'sqft' | 'sqm'): string {
  return `${area.toLocaleString()} ${unit === 'sqft' ? 'sq ft' : 'sq m'}`;
}

export function formatBedrooms(n: number): string {
  if (n === 0) return 'Studio';
  return `${n} Bed${n > 1 ? 's' : ''}`;
}

export function formatBathrooms(n: number): string {
  return `${n} Bath${n > 1 ? 's' : ''}`;
}

export function getPropertyTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    house: 'House',
    apartment: 'Apartment',
    condo: 'Condo',
    townhouse: 'Townhouse',
    land: 'Land',
    commercial: 'Commercial',
  };
  return labels[type] || type;
}

export function calculateDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3959; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function formatDistance(miles: number): string {
  if (miles < 0.1) return 'Nearby';
  if (miles < 1) return `${(miles * 5280).toFixed(0)} ft`;
  return `${miles.toFixed(1)} mi`;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric';
  }
  return date.toLocaleDateString('en-US', options);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

export function isIOS(): boolean {
  return Platform.OS === 'ios';
}

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
