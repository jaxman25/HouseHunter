import { useState, useEffect, useCallback } from 'react';
import { UserAnalytics, PlatformAnalytics as PlatformAnalyticsType } from '../types';
import { getUserAnalytics, getPlatformAnalytics } from '../services/analyticsService';

export function useUserAnalytics(userId: string) {
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUserAnalytics(userId);
      setAnalytics(data);
    } catch {
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadAnalytics();
  }, [userId, loadAnalytics]);

  return { analytics, loading, refresh: loadAnalytics };
}

export function usePlatformAnalytics(date?: string) {
  const [analytics, setAnalytics] = useState<PlatformAnalyticsType | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPlatformAnalytics(date);
      setAnalytics(data);
    } catch {
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadAnalytics();
  }, [date, loadAnalytics]);

  return { analytics, loading, refresh: loadAnalytics };
}
