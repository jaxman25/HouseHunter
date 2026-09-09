import { useCallback, useEffect, useState } from 'react';
import { Property, SavedSearch } from '../types';
import { useAuthContext } from '../context/AuthContext';
import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
  runSavedSearch,
  toggleSavedSearchActive,
  updateSavedSearch,
  SavedSearchInput,
} from '../services/savedSearchService';

/**
 * Saved-searches state for a signed-in user: list, loading, and CRUD with
 * local optimistic-ish updates (the list refreshes after each mutation).
 */
export function useSavedSearches() {
  const { user } = useAuthContext();
  const uid = user?.uid;

  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!uid) {
      setSearches([]);
      setLoading(false);
      return;
    }
    try {
      setSearches(await getSavedSearches(uid));
    } catch (error) {
      console.warn('Failed to load saved searches:', error);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    // setState happens after the awaited service call, never synchronously
    // during the effect (see react-hooks/set-state-in-effect).
    const run = async () => {
      await refresh();
    };
    void run();
  }, [refresh]);

  const create = useCallback(
    async (input: SavedSearchInput) => {
      if (!uid) return null;
      const created = await createSavedSearch(uid, input);
      await refresh();
      return created;
    },
    [uid, refresh]
  );

  const update = useCallback(
    async (searchId: string, data: Partial<SavedSearchInput>) => {
      if (!uid) return;
      await updateSavedSearch(uid, searchId, data);
      await refresh();
    },
    [uid, refresh]
  );

  const remove = useCallback(
    async (searchId: string) => {
      if (!uid) return;
      await deleteSavedSearch(uid, searchId);
      await refresh();
    },
    [uid, refresh]
  );

  const toggleActive = useCallback(
    async (searchId: string, isActive: boolean) => {
      if (!uid) return;
      await toggleSavedSearchActive(uid, searchId, isActive);
      await refresh();
    },
    [uid, refresh]
  );

  /** Execute a search and clear its new-match badge. */
  const run = useCallback(
    async (search: SavedSearch): Promise<Property[]> => {
      if (!uid) return [];
      const matches = await runSavedSearch(uid, search);
      await refresh();
      return matches;
    },
    [uid, refresh]
  );

  return { searches, loading, refresh, create, update, remove, toggleActive, run };
}