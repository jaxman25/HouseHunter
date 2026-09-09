import { Platform, Share } from 'react-native';
import * as Linking from 'expo-linking';
import { Property } from '../types';
import {
  formatPrice,
  formatBedrooms,
  formatBathrooms,
  getPropertyTypeLabel,
} from './helpers';
import { showToast } from './ui/toast';

/**
 * Property sharing.
 *
 * Native: react-native's Share sheet (WhatsApp, Messages, email, …).
 * Web: navigator.share() where available, otherwise copy the deep link to
 * the clipboard with a toast. Sharing is best-effort — user cancellation and
 * unsupported platforms never surface an error.
 */

/** Keep titles readable in one-line share previews. */
const MAX_TITLE_LENGTH = 60;

/** A shareable URL that reopens this property (native scheme or web path). */
export function getPropertyDeepLink(propertyId: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Real origin so the link opens wherever the app is hosted.
    return `${window.location.origin}/property/${propertyId}`;
  }
  // househunter://property/{id} (scheme configured in app.json)
  return Linking.createURL(`property/${propertyId}`);
}

/** Formatted share text: emoji summary + deep link. */
export function buildShareMessage(property: Property): string {
  const title =
    property.title.length > MAX_TITLE_LENGTH
      ? `${property.title.slice(0, MAX_TITLE_LENGTH - 3)}...`
      : property.title;

  const lines = [
    `🏠 ${title}`,
    `📍 ${property.address}, ${property.city}, ${property.state}`,
    `💰 ${formatPrice(property.price, property.listingType)}`,
    `🛏️ ${formatBedrooms(property.bedrooms)} | 🛁 ${formatBathrooms(property.bathrooms)}`,
    `📐 ${getPropertyTypeLabel(property.propertyType)} | ${
      property.listingType === 'rent' ? 'For Rent' : 'For Sale'
    }`,
    '',
    'View this property on House Hunter:',
    getPropertyDeepLink(property.id),
  ];
  return lines.join('\n');
}

/** Copy text to the web clipboard with a legacy fallback. */
async function copyToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall through to the legacy path (permissions, insecure context).
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

/**
 * Share a property. Resolves on completion or cancellation; never rejects
 * with a user-facing error.
 */
export async function shareProperty(property: Property): Promise<void> {
  const message = buildShareMessage(property);
  const url = getPropertyDeepLink(property.id);

  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: property.title, text: message, url });
          return;
        } catch (error) {
          // AbortError = the user dismissed the share sheet — not a failure.
          if ((error as { name?: string } | null)?.name === 'AbortError') return;
          // Any other failure: fall through to clipboard.
        }
      }
      await copyToClipboard(url);
      showToast('Property link copied to clipboard');
      return;
    }

    await Share.share({ message });
  } catch (error) {
    // Cancellation (or unsupported platform) — never show an error.
    console.warn('Share failed:', error);
  }
}