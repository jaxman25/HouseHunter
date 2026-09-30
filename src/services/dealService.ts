/**
 * Agent deals / commission tracking service.
 *
 * Deals are agent-owned records against their own listings: CRUD is strictly
 * owner-scoped (firestore.rules mirrors this), and the dashboard metrics are
 * computed client-side in AgentDashboardScreen with the same useMemo patterns
 * as SellerPerformanceScreen (plus trackMetric wrappers from src/utils/
 * monitoring/).
 */

import {
  collection,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Deal, DealStatus } from '../types';
import { firestoreCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../utils/network/timeout';
import { sanitize } from '../utils/security/sanitize';
import { trackMetric } from '../utils/monitoring/metrics';
import {
  trackedGetDocs,
  trackedAddDoc,
  trackedUpdateDoc,
} from '../utils/firestore/tracked';

export const DEALS_COLLECTION = 'deals';

/** Commission amount for a deal: salePrice * rate%. */
export function dealCommission(deal: Pick<Deal, 'salePrice' | 'commissionRate'>): number {
  return Math.round(deal.salePrice * (deal.commissionRate / 100));
}

/** Normalize a Firestore timestamp to an ISO string. */
function toISO(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  const t = value as { seconds?: unknown; nanoseconds?: unknown };
  if (typeof t.seconds === 'number' && typeof t.nanoseconds === 'number') {
    return new Date(t.seconds * 1000 + t.nanoseconds / 1_000_000).toISOString();
  }
  return new Date().toISOString();
}

function toDeal(data: DocumentData, id: string): Deal {
  return {
    id,
    agentId: data.agentId,
    propertyId: data.propertyId,
    buyerId: data.buyerId || undefined,
    buyerName: data.buyerName || undefined,
    salePrice: Number(data.salePrice) || 0,
    commissionRate: Number(data.commissionRate) || 0,
    closedAt: toISO(data.closedAt),
    status: (data.status as DealStatus) ?? 'pipeline',
    notes: data.notes || undefined,
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt),
  };
}

/** All deals for an agent, newest close date first. */
export async function getAgentDeals(agentId: string): Promise<Deal[]> {
  return trackMetric('deals.list', () =>
    firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          (async () => {
            const snap = await trackedGetDocs(
              query(
                collection(db, DEALS_COLLECTION),
                where('agentId', '==', agentId),
                orderBy('closedAt', 'desc')
              ),
              DEALS_COLLECTION
            );
            return snap.docs.map((d) => toDeal(d.data(), d.id));
          })(),
          DEFAULT_TIMEOUT_MS
        )
      )
    )
  );
}

/** Log a new deal. Server-side bounds mirrored by firestore.rules. */
export async function createDeal(input: {
  agentId: string;
  propertyId: string;
  buyerName?: string;
  buyerId?: string;
  salePrice: number;
  commissionRate: number;
  closedAt: string;
  status: DealStatus;
  notes?: string;
}): Promise<string> {
  const payload = {
    agentId: input.agentId,
    propertyId: input.propertyId,
    ...(input.buyerId ? { buyerId: input.buyerId } : {}),
    ...(input.buyerName ? { buyerName: sanitize(input.buyerName, 100) } : {}),
    salePrice: Math.max(0, Math.round(input.salePrice)),
    commissionRate: Math.max(0, Math.min(100, input.commissionRate)),
    closedAt: input.closedAt,
    status: input.status,
    ...(input.notes ? { notes: sanitize(input.notes, 500) } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await trackMetric('deals.create', () =>
    firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(trackedAddDoc(collection(db, DEALS_COLLECTION), payload), DEFAULT_TIMEOUT_MS)
      )
    )
  );
  return docRef.id;
}

/** Update status/amount fields of an existing deal (owner-only per rules). */
export async function updateDeal(
  dealId: string,
  changes: Partial<Pick<Deal, 'status' | 'salePrice' | 'commissionRate' | 'closedAt' | 'notes' | 'buyerName'>>
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (changes.status !== undefined) payload.status = changes.status;
  if (changes.salePrice !== undefined) {
    payload.salePrice = Math.max(0, Math.round(changes.salePrice));
  }
  if (changes.commissionRate !== undefined) {
    payload.commissionRate = Math.max(0, Math.min(100, changes.commissionRate));
  }
  if (changes.closedAt !== undefined) payload.closedAt = changes.closedAt;
  if (changes.notes !== undefined) payload.notes = sanitize(changes.notes, 500);
  if (changes.buyerName !== undefined) payload.buyerName = sanitize(changes.buyerName, 100);

  await trackMetric('deals.update', () =>
    firestoreCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(trackedUpdateDoc(doc(db, DEALS_COLLECTION, dealId), payload), DEFAULT_TIMEOUT_MS)
      )
    )
  );
}

// ─── Metrics (pure helpers, unit-testable) ────────────────────────────────

export interface DealMetrics {
  /** Σ commission of deals closed in the current calendar year. */
  ytdCommission: number;
  /** Σ commission of all closed deals (all time). */
  totalCommission: number;
  /** Count of closed deals (all time). */
  closedCount: number;
  /** Average sale price of closed deals. */
  avgDealSize: number;
  /** Σ expected commission of open pipeline deals. */
  pipelineValue: number;
  /** Count of pipeline deals. */
  pipelineCount: number;
}

/**
 * Compute dashboard metrics. `now` is injected so callers control "today"
 * (and tests stay deterministic).
 */
export function computeDealMetrics(
  deals: Deal[],
  now: Date = new Date()
): DealMetrics {
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

  let ytdCommission = 0;
  let totalCommission = 0;
  let closedCount = 0;
  let closedSaleSum = 0;
  let pipelineValue = 0;
  let pipelineCount = 0;

  for (const deal of deals) {
    if (deal.status === 'closed') {
      const commission = dealCommission(deal);
      totalCommission += commission;
      closedCount += 1;
      closedSaleSum += deal.salePrice;
      const closedMs = new Date(deal.closedAt).getTime();
      if (Number.isFinite(closedMs) && closedMs >= yearStart) {
        ytdCommission += commission;
      }
    } else if (deal.status === 'pipeline') {
      pipelineValue += dealCommission(deal);
      pipelineCount += 1;
    }
  }

  return {
    ytdCommission,
    totalCommission,
    closedCount,
    avgDealSize: closedCount > 0 ? Math.round(closedSaleSum / closedCount) : 0,
    pipelineValue,
    pipelineCount,
  };
}
