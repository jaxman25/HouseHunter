import { useState, useEffect, useCallback } from 'react';
import { Review, ReviewRatingBreakdown } from '../types';
import {
  getPropertyReviews,
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
  const [loading, setLoading] = useState(true);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSellerReviews(sellerId);
      setReviews(data);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    if (!sellerId) return;
    loadReviews();
  }, [sellerId, loadReviews]);

  return { reviews, loading, refresh: loadReviews };
}

export function useSellerRating(sellerId: string) {
  const [rating, setRating] = useState<ReviewRatingBreakdown>({
    averageRating: 0,
    totalReviews: 0,
    breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
  const [loading, setLoading] = useState(true);

  const loadRating = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSellerRating(sellerId);
      setRating(data);
    } catch {
      // Keep default
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    if (!sellerId) return;
    loadRating();
  }, [sellerId, loadRating]);

  return { rating, loading, refresh: loadRating };
}

export function useCanReview(propertyId: string, userId: string | undefined) {
  const [canReview, setCanReview] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const result = await canUserReview(propertyId, userId!);
      setCanReview(result.canReview);
      setReason(result.reason);
    } catch {
      setCanReview(false);
    } finally {
      setLoading(false);
    }
  }, [propertyId, userId]);

  useEffect(() => {
    if (!propertyId || !userId) {
      setLoading(false);
      return;
    }
    check();
  }, [propertyId, userId, check]);

  return { canReview, reason, loading, refresh: check };
}
