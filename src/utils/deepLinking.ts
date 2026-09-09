import { NavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';

/**
 * Deep-link handling.
 *
 * Supported shapes (native scheme `househunter://` from app.json, Expo dev
 * URLs, and the web app's own origin):
 *   househunter://property/{propertyId}
 *   https://<host>/property/{propertyId}
 *
 * Parsing validates the shape only — the destination screen guards against
 * non-existent ids (PropertyDetail shows "Property not found"), so malformed
 * or dead links fail gracefully instead of crashing navigation.
 */

type NavigationRef = NavigationContainerRef<RootStackParamList> | null;

interface DeepLinkRoute {
  name: keyof RootStackParamList;
  params: { propertyId: string };
}

export function parseDeepLink(url: string): DeepLinkRoute | null {
  const match = url.match(/\/property\/([^/?#]+)/);
  if (!match) return null;
  const propertyId = decodeURIComponent(match[1]);
  if (!propertyId) return null;
  return { name: 'PropertyDetail', params: { propertyId } };
}

/** Navigate to the screen a deep link points at, if the navigator is ready. */
export function handleDeepLink(url: string, navigationRef: NavigationRef): void {
  const route = parseDeepLink(url);
  if (route && navigationRef?.isReady()) {
    // The route name is a dynamic union — cast to the string overload.
    navigationRef.navigate(route.name as any, route.params as any);
  }
}