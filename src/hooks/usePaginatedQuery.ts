/**
 * Generic cursor pagination for list screens.
 *
 * Wires the standard pattern — first page on mount (and on `refresh`, e.g.
 * from pull-to-refresh), older pages on demand via `loadMore` — around any
 * service function that accepts `(cursor, pageSize)` and returns
 * `{ items, cursor }`. The hook is Firestore-agnostic: the service owns
 * query construction, the hook owns page state.
 *
 *   const { items, loadMore, hasMore, loading, error, refresh } =
 *     usePaginatedQuery({
 *       key: uid,
 *       fetchPage: (cursor, pageSize) =>
 *         getUserPropertiesPage(uid, cursor, pageSize),
 *     });
 *
 * `key` is an identity token (user id, filter signature…): when it changes
 * the state resets and page one refetches. `loadMore` is idempotent while a
 * page is in flight and never runs past `hasMore === false`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentSnapshot, DocumentData } from 'firebase/firestore';

export interface PageResult<T> {
  items: T[];
  /** Cursor to pass to the next fetchPage call (null = no more pages). */
  cursor: DocumentSnapshot<DocumentData> | null;
}

export interface UsePaginatedQueryOptions<T> {
  /** Identity token — changing it resets pagination and refetches page one. */
  key: string | null | undefined;
  /** Fetch one page. Receives the cursor from the previous page (or null). */
  fetchPage: (
    cursor: DocumentSnapshot<DocumentData> | null,
    pageSize: number
  ) => Promise<PageResult<T>>;
  /** Page size; defaults to 20 per the app-wide pagination convention. */
  pageSize?: number;
  /** Skip fetching entirely (e.g. signed out). Defaults to true. */
  enabled?: boolean;
}

export interface PaginatedQuery<T> {
  items: T[];
  hasMore: boolean;
  /** True while page one is in flight. */
  loading: boolean;
  /** True while a subsequent page is in flight. */
  loadingMore: boolean;
  error: Error | null;
  /** Fetch the next page (no-op while loading or when !hasMore). */
  loadMore: () => void;
  /** Back to page one (pull-to-refresh). */
  refresh: () => void;
  /**
   * Escape hatch for optimistic updates (status flips, deletions…) —
   * applies a functional update to the loaded items. Loses effect on
   * refresh/reset, which refetch from the source.
   */
  mutateItems: (updater: (prev: T[]) => T[]) => void;
}

export function usePaginatedQuery<T>({
  key,
  fetchPage,
  pageSize = 20,
  enabled = true,
}: UsePaginatedQueryOptions<T>): PaginatedQuery<T> {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(enabled && key != null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const cursorRef = useRef<DocumentSnapshot<DocumentData> | null>(null);
  const busyRef = useRef(false);
  const generationRef = useRef(0);
  // Latest fetchPage without retriggering effects on identity churn.
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

  const run = useCallback(
    async (mode: 'reset' | 'more') => {
      if (busyRef.current) return;
      if (mode === 'more' && !cursorRef.current) return; // exhausted already
      busyRef.current = true;
      const generation = ++generationRef.current;
      if (mode === 'reset') {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const cursor = mode === 'reset' ? null : cursorRef.current;
        const page = await fetchPageRef.current(cursor, pageSize);
        if (generation !== generationRef.current) return; // superseded

        cursorRef.current = page.cursor;
        setHasMore(page.cursor != null);
        setItems((prev) =>
          mode === 'reset' ? page.items : [...prev, ...page.items]
        );
      } catch (err) {
        if (generation === generationRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (generation === generationRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
        busyRef.current = false;
      }
    },
    [pageSize]
  );

  const loadMore = useCallback(() => {
    if (!busyRef.current && cursorRef.current) void run('more');
  }, [run]);

  const refresh = useCallback(() => {
    void run('reset');
  }, [run]);

  // Reset + refetch when the identity key or page size changes. The setState
  // calls here are intentional page-one teardown (the "cascade" is the
  // desired UX — clearing the old list immediately) and are guarded by the
  // busy/generation refs; suppressed per the react-hooks guidance.
  useEffect(() => {
    cursorRef.current = null;
    busyRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems([]);
     
    setHasMore(false);
     
    setError(null);
    if (enabled && key != null) {
      void run('reset');
    } else {
       
      setLoading(false);
    }
    // `run` depends only on pageSize; key/enabled drive resets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, pageSize]);

  const mutateItems = useCallback((updater: (prev: T[]) => T[]) => {
    setItems(updater);
  }, []);

  return {
    items,
    hasMore,
    loading,
    loadingMore,
    error,
    loadMore,
    refresh,
    mutateItems,
  };
}
