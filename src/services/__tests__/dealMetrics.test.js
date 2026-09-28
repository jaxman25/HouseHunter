/**
 * Unit tests for the deal commission metric helpers.
 *
 * Mirrors the pure functions from src/services/dealService.ts (no TS loader
 * in the Node runner — same convention as the other tests in this directory).
 * Locks the commission math and the YTD/pipeline window logic.
 *
 * Run with: node src/services/__tests__/dealMetrics.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Mirrors of dealService.ts helpers ──────────────────────────────────────

function dealCommission(deal) {
  return Math.round(deal.salePrice * (deal.commissionRate / 100));
}

function computeDealMetrics(deals, now = new Date()) {
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

// ── dealCommission ─────────────────────────────────────────────────────────

describe('dealCommission', () => {
  test('computes percentage of sale price', () => {
    assert.equal(dealCommission({ salePrice: 400000, commissionRate: 2.5 }), 10000);
    assert.equal(dealCommission({ salePrice: 1000000, commissionRate: 3 }), 30000);
  });

  test('handles zero rate and zero price', () => {
    assert.equal(dealCommission({ salePrice: 500000, commissionRate: 0 }), 0);
    assert.equal(dealCommission({ salePrice: 0, commissionRate: 2.5 }), 0);
  });

  test('rounds fractional results', () => {
    assert.equal(dealCommission({ salePrice: 333333, commissionRate: 2.5 }), 8333);
  });
});

// ── computeDealMetrics ─────────────────────────────────────────────────────

const NOW = new Date('2026-09-15T12:00:00Z');

describe('computeDealMetrics', () => {
  test('empty input yields zeroed metrics', () => {
    const m = computeDealMetrics([], NOW);
    assert.deepEqual(m, {
      ytdCommission: 0,
      totalCommission: 0,
      closedCount: 0,
      avgDealSize: 0,
      pipelineValue: 0,
      pipelineCount: 0,
    });
  });

  test('sums YTD and all-time commission separately', () => {
    const deals = [
      { salePrice: 400000, commissionRate: 2.5, status: 'closed', closedAt: '2026-03-01' }, // 10000, this year
      { salePrice: 600000, commissionRate: 3, status: 'closed', closedAt: '2025-11-01' }, // 18000, last year
    ];
    const m = computeDealMetrics(deals, NOW);
    assert.equal(m.ytdCommission, 10000);
    assert.equal(m.totalCommission, 28000);
    assert.equal(m.closedCount, 2);
    assert.equal(m.avgDealSize, 500000);
  });

  test('counts pipeline value without touching commission totals', () => {
    const deals = [
      { salePrice: 500000, commissionRate: 2, status: 'closed', closedAt: '2026-02-01' },
      { salePrice: 800000, commissionRate: 3, status: 'pipeline', closedAt: '2026-10-01' },
      { salePrice: 200000, commissionRate: 2, status: 'lost', closedAt: '2026-01-01' },
    ];
    const m = computeDealMetrics(deals, NOW);
    assert.equal(m.ytdCommission, 10000);
    assert.equal(m.pipelineValue, 24000);
    assert.equal(m.pipelineCount, 1);
    assert.equal(m.closedCount, 1);
  });

  test('lost deals are excluded from every metric', () => {
    const m = computeDealMetrics(
      [{ salePrice: 900000, commissionRate: 3, status: 'lost', closedAt: '2026-05-01' }],
      NOW
    );
    assert.deepEqual(m, {
      ytdCommission: 0,
      totalCommission: 0,
      closedCount: 0,
      avgDealSize: 0,
      pipelineValue: 0,
      pipelineCount: 0,
    });
  });

  test('YTD boundary: close on Jan 1 of the current year counts', () => {
    const deals = [
      { salePrice: 100000, commissionRate: 10, status: 'closed', closedAt: '2026-01-01' },
    ];
    const m = computeDealMetrics(deals, NOW);
    assert.equal(m.ytdCommission, 10000);
  });

  test('invalid closedAt falls back safely (all-time only)', () => {
    const deals = [
      { salePrice: 100000, commissionRate: 10, status: 'closed', closedAt: 'not-a-date' },
    ];
    const m = computeDealMetrics(deals, NOW);
    assert.equal(m.totalCommission, 10000);
    assert.equal(m.ytdCommission, 0);
  });
});
