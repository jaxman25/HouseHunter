import { useState, useEffect, useCallback } from 'react';
import { NeighborhoodData } from '../types';
import { getNeighborhoodData, getCommuteTime } from '../services/neighborhoodService';

export function useNeighborhood(city: string, state: string, zipCode: string) {
  // Nothing to look up without a city/state — never report "loading" then.
  const enabled = Boolean(city && state);
  const key = `${city}|${state}|${zipCode}`;
  // `loading`/`error` are derived from which key the held data belongs to, and
  // the fetcher writes no state, so the effect only commits from a promise
  // callback (react-hooks/set-state-in-effect).
  const [loaded, setLoaded] = useState<{
    key: string | null;
    data: NeighborhoodData | null;
    error: boolean;
  }>({ key: null, data: null, error: false });

  const loadData = useCallback(
    () =>
      getNeighborhoodData(city, state, zipCode).then(
        (data) => ({ data, error: false }),
        () => ({ data: null, error: true })
      ),
    [city, state, zipCode]
  );

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadData().then((result) => {
      if (!active) return;
      // Keep whatever was on screen on failure; only flag the attempt.
      setLoaded((prev) => ({
        key,
        data: result.error ? prev.data : result.data,
        error: result.error,
      }));
    });
    return () => {
      active = false;
    };
  }, [enabled, key, loadData]);

  /** Manual refresh: clears the marker so the spinner shows again. */
  const refresh = useCallback(async () => {
    setLoaded((prev) => ({ ...prev, key: null }));
    const result = await loadData();
    setLoaded((prev) => ({
      key,
      data: result.error ? prev.data : result.data,
      error: result.error,
    }));
  }, [key, loadData]);

  return {
    data: loaded.data,
    loading: enabled && loaded.key !== key,
    error: loaded.key === key && loaded.error,
    refresh,
  };
}

export function useCommute(originLat: number, originLng: number) {
  const [result, setResult] = useState<{ duration: string; durationMinutes: number; distance: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const calculateCommute = async (destAddress: string, mode: 'driving' | 'transit' | 'walking' | 'bicycling' = 'driving') => {
    setLoading(true);
    try {
      const commuteResult = await getCommuteTime(originLat, originLng, destAddress, mode);
      setResult(commuteResult);
      return commuteResult;
    } catch {
      setResult(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { result, loading, calculateCommute };
}
