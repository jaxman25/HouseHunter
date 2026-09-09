import { useState, useEffect } from 'react';
import { NeighborhoodData } from '../types';
import { getNeighborhoodData, getCommuteTime } from '../services/neighborhoodService';

export function useNeighborhood(city: string, state: string, zipCode: string) {
  const [data, setData] = useState<NeighborhoodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!city || !state) {
      setLoading(false);
      return;
    }
    loadData();
  }, [city, state, zipCode]);

  const loadData = async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getNeighborhoodData(city, state, zipCode);
      setData(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, refresh: loadData };
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
