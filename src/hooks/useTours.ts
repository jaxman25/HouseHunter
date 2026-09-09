import { useState, useEffect, useCallback } from 'react';
import { Tour, TourAvailability } from '../types';
import { getUserTours, getAvailability, subscribeToUserTours } from '../services/tourService';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sellerId) return;
    loadAvailability();
  }, [sellerId]);

  const loadAvailability = async () => {
    setLoading(true);
    try {
      const data = await getAvailability(sellerId);
      setAvailability(data);
    } catch {
      setAvailability(null);
    } finally {
      setLoading(false);
    }
  };

  return { availability, loading, refresh: loadAvailability };
}
