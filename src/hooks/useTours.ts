import { useState, useEffect, useCallback } from 'react';
import { Tour, TourAvailability } from '../types';
import { getAvailability, subscribeToUserTours } from '../services/tourService';

export function useUserTours(userId: string, role: 'buyer' | 'seller' = 'buyer') {
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToUserTours(userId, role, (data) => {
      setTours(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userId, role]);

  const upcomingTours = tours.filter(
    (t) => new Date(t.datetime) > new Date() && t.status !== 'canceled'
  );
  const pastTours = tours.filter(
    (t) => new Date(t.datetime) <= new Date() || t.status === 'completed' || t.status === 'no_show'
  );

  return { tours, upcomingTours, pastTours, loading };
}

export function useSellerAvailability(sellerId: string) {
  const [availability, setAvailability] = useState<TourAvailability | null>(null);
  // `loading` is derived, not stored: true until the fetch for the current
  // sellerId has landed (and while a manual refresh is in flight).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Pure fetcher (no state): null means "nothing to show for this seller".
  const loadAvailability = useCallback(
    () => getAvailability(sellerId).catch(() => null),
    [sellerId]
  );

  useEffect(() => {
    if (!sellerId) return;
    let active = true;
    loadAvailability().then((data) => {
      if (!active) return;
      setAvailability(data);
      setLoadedFor(sellerId);
    });
    return () => {
      active = false;
    };
  }, [sellerId, loadAvailability]);

  /** Manual refresh: clears the marker so the spinner shows again. */
  const refresh = useCallback(async () => {
    setLoadedFor(null);
    const data = await loadAvailability();
    setAvailability(data);
    setLoadedFor(sellerId);
  }, [loadAvailability, sellerId]);

  return { availability, loading: loadedFor !== sellerId, refresh };
}
