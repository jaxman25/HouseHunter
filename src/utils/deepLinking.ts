import { NavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';

/**
 * Deep-link handling.
 *
 * Supported shapes (native scheme `househunter://` from app.json, Expo dev
 * URLs, and the web app's own origin):
 *   househunter://property/{propertyId}
 *   https://<host>/property/{propertyId}
 *   househunter://saved-search/{savedSearchId}
 *   https://<host>/saved-search/{savedSearchId}
 *
 * Parsing validates the shape only — the destination screen guards against
 * non-existent ids (PropertyDetail shows "Property not found",
 * SavedSearches shows a toast), so malformed or dead links fail gracefully
 * instead of crashing navigation.
 */

type NavigationRef = NavigationContainerRef<RootStackParamList> | null;

type DeepLinkRoute =
  | { name: 'PropertyDetail'; params: { propertyId: string } }
  | { name: 'SavedSearches'; params: { savedSearchId: string } };

export function parseDeepLink(url: string): DeepLinkRoute | null {
  // Try saved-search/{id} first (more specific path).
  const savedMatch = url.match(/\/saved-search\/([^/?#]+)/);
  if (savedMatch) {
    const savedSearchId = decodeURIComponent(savedMatch[1]);
    if (!savedSearchId) return null;
    return { name: 'SavedSearches', params: { savedSearchId } };
  }

  // Fall back to property/{id}.
  const propMatch = url.match(/\/property\/([^/?#]+)/);
  if (propMatch) {
    const propertyId = decodeURIComponent(propMatch[1]);
    if (!propertyId) return null;
    return { name: 'PropertyDetail', params: { propertyId } };
  }

  return null;
}

/** Navigate to the screen a deep link points at, if the navigator is ready. */
export function handleDeepLink(url: string, navigationRef: NavigationRef): void {
  const route = parseDeepLink(url);
  if (route && navigationRef?.isReady()) {
    // The route name is a dynamic union — cast to the string overload.
    navigationRef.navigate(route.name as any, route.params as any);
  }
}
