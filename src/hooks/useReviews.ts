import { useState, useEffect, useCallback } from 'react';
import { Review, ReviewRatingBreakdown } from '../types';
import {
  getSellerReviews,
  getSellerRating,
  canUserReview,
  subscribeToPropertyReviews,
} from '../services/reviewService';

export function usePropertyReviews(propertyId: string) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) return;
    const unsubscribe = subscribeToPropertyReviews(propertyId, (data) => {
      setReviews(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [propertyId]);

  return { reviews, loading };
}

export function useSellerReviews(sellerId: string) {
  const [reviews, setReviews] = useState<Review[]>([]);
  // `loading` is derived, not stored: true until the fetch for the current
  // sellerId has landed (and while a manual refresh is in flight).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Pure fetcher (no state): an empty array means "this read failed".
  const loadReviews = useCallback(
    () => getSellerReviews(sellerId).catch(() => [] as Review[]),
    [sellerId]
  );

  useEffect(() => {
    if (!sellerId) return;
    let active = true;
    loadReviews().then((data) => {
      if (!active) return;
      setReviews(data);
      setLoadedFor(sellerId);
    });
    return () => {
      active = false;
    };
  }, [sellerId, loadReviews]);

  /** Manual refresh: clears the marker so the spinner shows again. */
  const refresh = useCallback(async () => {
    setLoadedFor(null);
    const data = await loadReviews();
    setReviews(data);
    setLoadedFor(sellerId);
  }, [loadReviews, sellerId]);

  return { reviews, loading: loadedFor !== sellerId, refresh };
}

export function useSellerRating(sellerId: string) {
  const [rating, setRating] = useState<ReviewRatingBreakdown>({
    averageRating: 0,
    totalReviews: 0,
    breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
  // `loading` is derived: true until the fetch for the current sellerId lands.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Pure fetcher (no state): null means "this read failed" (keep the default).
  const loadRating = useCallback(
    () => getSellerRating(sellerId).catch(() => null),
    [sellerId]
  );

  useEffect(() => {
    if (!sellerId) return;
    let active = true;
    loadRating().then((data) => {
      if (!active) return;
      if (data !== null) setRating(data);
      setLoadedFor(sellerId);
    });
    return () => {
      active = false;
    };
  }, [sellerId, loadRating]);

  /** Manual refresh: clears the marker so the spinner shows again. */
  const refresh = useCallback(async () => {
    setLoadedFor(null);
    const data = await loadRating();
    if (data !== null) setRating(data);
    setLoadedFor(sellerId);
  }, [loadRating, sellerId]);

  return { rating, loading: loadedFor !== sellerId, refresh };
}

export function useCanReview(propertyId: string, userId: string | undefined) {
  const [canReview, setCanReview] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  // Without both ids there is nothing to check — never report "loading".
  const enabled = Boolean(propertyId && userId);
  const key = `${propertyId}:${userId ?? ''}`;
  // `loading` is derived: true only while enabled and still awaiting this pair.
  const [checkedFor, setCheckedFor] = useState<string | null>(null);

  // Pure fetcher (no state): null means "this check failed".
  const check = useCallback(
    () => canUserReview(propertyId, userId!).catch(() => null),
    [propertyId, userId]
  );

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    check().then((result) => {
      if (!active) return;
      if (result) {
        setCanReview(result.canReview);
        setReason(result.reason);
      } else {
        setCanReview(false);
      }
      setCheckedFor(key);
    });
    return () => {
      active = false;
    };
  }, [enabled, check, key]);

  /** Manual refresh: clears the marker so the spinner shows again. */
  const refresh = useCallback(async () => {
    setCheckedFor(null);
    const result = await check();
    if (result) {
      setCanReview(result.canReview);
      setReason(result.reason);
    } else {
      setCanReview(false);
    }
    setCheckedFor(key);
  }, [check, key]);

  return { canReview, reason, loading: enabled && checkedFor !== key, refresh };
}
