import { doc } from 'firebase/firestore';
import { db } from '../config/firebase';

import { trackedGetDoc } from '../utils/firestore/tracked';

/** Seller portfolio summary doc (written nightly + incrementally on writes). */
export interface SellerStats {
  totalListings: number;
  activeListings: number;
  totalViews: number;
  totalInquiries: number;
  avgDaysOnMarket: number;
  staleCount: number;
  updatedAt: string;
}

/** Agent commission doc (written nightly + incrementally on deal writes). */
export interface AgentStats {
  ytdCommission: number;
  avgDealSize: number;
  closedCount: number;
  pipelineValue: number;
  updatedAt: string;
}

/**
 * Read a single precomputed stats doc. The SellerPerformanceScreen and
 * AgentDashboardScreen each perform exactly one read of this shape.
 */
export async function getUserStats(uid: string): Promise<SellerStats> {
  const docRef = doc(db, 'users', uid, 'stats', 'seller');
  const snap = await trackedGetDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Seller stats not found');
  }
  const data = snap.data() as SellerStats;
  return {
    totalListings: data.totalListings ?? 0,
    activeListings: data.activeListings ?? 0,
    totalViews: data.totalViews ?? 0,
    totalInquiries: data.totalInquiries ?? 0,
    avgDaysOnMarket: data.avgDaysOnMarket ?? 0,
    staleCount: data.staleCount ?? 0,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Read a single precomputed agent stats doc (deal/commission summary).
 */
export async function getAgentStats(uid: string): Promise<AgentStats> {
  const docRef = doc(db, 'users', uid, 'stats', 'agent');
  const snap = await trackedGetDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Agent stats not found');
  }
  const data = snap.data() as AgentStats;
  return {
    ytdCommission: data.ytdCommission ?? 0,
    avgDealSize: data.avgDealSize ?? 0,
    closedCount: data.closedCount ?? 0,
    pipelineValue: data.pipelineValue ?? 0,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}
