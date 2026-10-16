import { useState, useEffect, useCallback } from 'react';
import { UserAnalytics, PlatformAnalytics as PlatformAnalyticsType } from '../types';
import { getUserAnalytics, getPlatformAnalytics } from '../services/analyticsService';

/**
 * Both hooks keep `loading` derived (a marker records which key the held data
 * belongs to) and keep their fetcher free of state writes, so the effect only
 * commits results from a promise callback — never synchronously in its body
 * (react-hooks/set-state-in-effect). The `active` flag drops a late result
 * after the key changed or the component unmounted.
 */

export function useUserAnalytics(userId: string) {
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  // `loading` is derived, not stored: it is true until the fetch for the
  // current userId has landed (and while a manual refresh is in flight).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Pure fetcher (no state): null means "this read failed".
  const loadAnalytics = useCallback(
    () => getUserAnalytics(userId).catch(() => null),
    [userId]
  );

  useEffect(() => {
    if (!userId) return;
    let active = true;
    loadAnalytics().then((data) => {
      if (!active) return;
      setAnalytics(data);
      setLoadedFor(userId);
    });
    return () => {
      active = false;
    };
  }, [userId, loadAnalytics]);

  /** Manual refresh: clears the marker so the spinner shows again. */
  const refresh = useCallback(async () => {
    setLoadedFor(null);
    const data = await loadAnalytics();
    setAnalytics(data);
    setLoadedFor(userId);
  }, [loadAnalytics, userId]);

  return { analytics, loading: loadedFor !== userId, refresh };
}

export function usePlatformAnalytics(date?: string) {
  const [analytics, setAnalytics] = useState<PlatformAnalyticsType | null>(null);
  // Derived (see useUserAnalytics): null until the fetch for `date` lands.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = date ?? null;

  const loadAnalytics = useCallback(
    () => getPlatformAnalytics(date).catch(() => null),
    [date]
  );

  useEffect(() => {
    let active = true;
    loadAnalytics().then((data) => {
      if (!active) return;
      setAnalytics(data);
      setLoadedFor(key);
    });
    return () => {
      active = false;
    };
  }, [key, loadAnalytics]);

  /** Manual refresh: clears the marker so the spinner shows again. */
  const refresh = useCallback(async () => {
    setLoadedFor(null);
    const data = await loadAnalytics();
    setAnalytics(data);
    setLoadedFor(key);
  }, [key, loadAnalytics]);

  return { analytics, loading: loadedFor !== key, refresh };
}
