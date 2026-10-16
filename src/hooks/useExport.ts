import { useState, useEffect, useCallback } from 'react';
import { DataExport } from '../types';
import { getUserExports } from '../services/exportService';

export function useExport(userId: string) {
  const [exports, setExports] = useState<DataExport[]>([]);
  // `loading` is derived, not stored: it is true until the fetch for the
  // current userId has landed (and while a manual refresh is in flight).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Pure fetcher (no state): the effect commits it from a promise callback so
  // nothing sets state synchronously inside the effect body
  // (react-hooks/set-state-in-effect).
  const loadExports = useCallback(
    () => getUserExports(userId).catch(() => [] as DataExport[]),
    [userId]
  );

  useEffect(() => {
    if (!userId) return;
    let active = true;
    loadExports().then((data) => {
      if (!active) return;
      setExports(data);
      setLoadedFor(userId);
    });
    return () => {
      active = false;
    };
  }, [userId, loadExports]);

  /** Manual refresh: clears the marker so the spinner shows again. */
  const refresh = useCallback(async () => {
    setLoadedFor(null);
    const data = await loadExports();
    setExports(data);
    setLoadedFor(userId);
  }, [loadExports, userId]);

  return { exports, loading: loadedFor !== userId, refresh };
}
