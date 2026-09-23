/**
 * Unit tests for mortgage math (mirrors src/utils/mortgage.ts).
 *
 * Run with: node src/utils/__tests__/mortgage.test.js
 * Same mirror pattern as propertyService.test.js — the logic under test is
 * re-implemented here so the test has no Firebase/TS dependencies.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Re-implement the pure logic under test (mirrors mortgage.ts) ─────────

function calculateMonthlyPayment(principal, annualRatePercent, termYears) {
  if (!(principal > 0) || !(termYears > 0)) return 0;
  const n = Math.round(termYears * 12);
  if (n <= 0) return 0;
  const r = annualRatePercent / 100 / 12;
  if (r <= 0) return principal / n;
  const factor = Math.pow(1 + r, n);
  return (principal * r * factor) / (factor - 1);
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function calculateMortgage({ price, downPaymentPercent, annualRatePercent, termYears }) {
  const down = Math.max(0, Math.min(100, downPaymentPercent));
  const loanAmount = Math.max(0, price * (1 - down / 100));
  const monthlyPayment = roundCurrency(calculateMonthlyPayment(loanAmount, annualRatePercent, termYears));
  const months = Math.round(termYears * 12);
  const totalPaid = monthlyPayment * months;
  const totalInterest = Math.max(0, roundCurrency(totalPaid - loanAmount));
  const totalCost = roundCurrency(loanAmount + totalInterest + price * (down / 100));
  return { loanAmount, monthlyPayment, totalInterest, totalCost };
}

function maxAffordableLoan(maxMonthlyPayment, annualRatePercent, termYears) {
  if (!(maxMonthlyPayment > 0) || !(termYears > 0)) return 0;
  const n = Math.round(termYears * 12);
  const r = annualRatePercent / 100 / 12;
  if (r <= 0) return maxMonthlyPayment * n;
  const factor = Math.pow(1 + r, n);
  return (maxMonthlyPayment * (factor - 1)) / (r * factor);
}

function maxAffordablePrice(maxMonthlyPayment, annualRatePercent, termYears, downPaymentPercent) {
  const down = Math.max(0, Math.min(100, downPaymentPercent));
  if (down >= 100) return Number.POSITIVE_INFINITY;
  const loan = maxAffordableLoan(maxMonthlyPayment, annualRatePercent, termYears);
  return loan / (1 - down / 100);
}

// ── calculateMonthlyPayment ──────────────────────────────────────────────

describe('calculateMonthlyPayment', () => {
  test('standard $300k loan, 6% for 30 years ≈ $1,798.65', () => {
    const pmt = calculateMonthlyPayment(300_000, 6, 30);
    assert.ok(Math.abs(pmt - 1798.65) < 0.01, `got ${pmt}`);
  });

  test('zero-rate loan is straight-line principal division', () => {
    assert.equal(calculateMonthlyPayment(120_000, 0, 10), 1000);
  });

  test('zero principal returns 0', () => {
    assert.equal(calculateMonthlyPayment(0, 6, 30), 0);
  });

  test('negative principal returns 0', () => {
    assert.equal(calculateMonthlyPayment(-1000, 6, 30), 0);
  });

  test('zero term returns 0', () => {
    assert.equal(calculateMonthlyPayment(100_000, 6, 0), 0);
  });

  test('shorter term raises the payment', () => {
    const long = calculateMonthlyPayment(300_000, 6, 30);
    const short = calculateMonthlyPayment(300_000, 6, 15);
    assert.ok(short > long);
  });

  test('higher rate raises the payment', () => {
    const low = calculateMonthlyPayment(300_000, 5, 30);
    const high = calculateMonthlyPayment(300_000, 7, 30);
    assert.ok(high > low);
  });

  test('15-year $200k at 5% ≈ $1,581.59', () => {
    const pmt = calculateMonthlyPayment(200_000, 5, 15);
    assert.ok(Math.abs(pmt - 1581.59) < 0.01, `got ${pmt}`);
  });
});

// ── roundCurrency ────────────────────────────────────────────────────────

describe('roundCurrency', () => {
  test('rounds to cents', () => {
    assert.equal(roundCurrency(10.005), 10.01);
    assert.equal(roundCurrency(10.004), 10);
  });

  test('handles large values', () => {
    assert.equal(roundCurrency(1_234_567.891), 1_234_567.89);
  });
});

// ── calculateMortgage ────────────────────────────────────────────────────

describe('calculateMortgage', () => {
  test('30y fixed $400k, 20% down, 6%: payment ≈ $1,918.56', () => {
    const r = calculateMortgage({ price: 400_000, downPaymentPercent: 20, annualRatePercent: 6, termYears: 30 });
    assert.ok(Math.abs(r.monthlyPayment - 1918.56) < 0.01, `got ${r.monthlyPayment}`);
    assert.equal(r.loanAmount, 320_000);
  });

  test('total interest = payments − loan', () => {
    const r = calculateMortgage({ price: 400_000, downPaymentPercent: 20, annualRatePercent: 6, termYears: 30 });
    const expected = roundCurrency(r.monthlyPayment * 360 - 320_000);
    assert.equal(r.totalInterest, expected);
  });

  test('total cost = down payment + loan + interest', () => {
    const r = calculateMortgage({ price: 400_000, downPaymentPercent: 20, annualRatePercent: 6, termYears: 30 });
    const expected = roundCurrency(80_000 + 320_000 + r.totalInterest);
    assert.equal(r.totalCost, expected);
  });

  test('100% down means no loan, no interest', () => {
    const r = calculateMortgage({ price: 500_000, downPaymentPercent: 100, annualRatePercent: 6, termYears: 30 });
    assert.equal(r.loanAmount, 0);
    assert.equal(r.monthlyPayment, 0);
    assert.equal(r.totalInterest, 0);
    assert.equal(r.totalCost, 500_000);
  });

  test('0% down borrows the full price', () => {
    const r = calculateMortgage({ price: 250_000, downPaymentPercent: 0, annualRatePercent: 6, termYears: 30 });
    assert.equal(r.loanAmount, 250_000);
  });

  test('down payment is clamped to [0, 100]', () => {
    const neg = calculateMortgage({ price: 100_000, downPaymentPercent: -20, annualRatePercent: 6, termYears: 30 });
    assert.equal(neg.loanAmount, 100_000);
    const over = calculateMortgage({ price: 100_000, downPaymentPercent: 150, annualRatePercent: 6, termYears: 30 });
    assert.equal(over.loanAmount, 0);
  });

  test('zero-rate mortgage: interest = 0 and cost = price', () => {
    const r = calculateMortgage({ price: 120_000, downPaymentPercent: 10, annualRatePercent: 0, termYears: 10 });
    assert.equal(r.totalInterest, 0);
    assert.equal(r.totalCost, 120_000);
  });
});

// ── maxAffordableLoan / maxAffordablePrice ──────────────────────────────

describe('maxAffordableLoan', () => {
  test('is the inverse of the payment formula', () => {
    const loan = maxAffordableLoan(1798.65, 6, 30);
    assert.ok(Math.abs(loan - 300_000) < 1, `got ${loan}`);
  });

  test('zero budget returns 0', () => {
    assert.equal(maxAffordableLoan(0, 6, 30), 0);
  });

  test('negative budget returns 0', () => {
    assert.equal(maxAffordableLoan(-500, 6, 30), 0);
  });

  test('zero rate is straight-line division', () => {
    assert.equal(maxAffordableLoan(1000, 0, 10), 120_000);
  });
});

describe('maxAffordablePrice', () => {
  test('adds down payment headroom on top of the loan', () => {
    // $2,000/mo, 6%, 30y, 20% down → loan ≈ $334k, price ≈ $417k
    const price = maxAffordablePrice(2000, 6, 30, 20);
    assert.ok(price > 400_000 && price < 430_000, `got ${price}`);
  });

  test('100% down returns Infinity (cash buyer)', () => {
    assert.equal(maxAffordablePrice(2000, 6, 30, 100), Number.POSITIVE_INFINITY);
  });

  test('0% down equals the max loan', () => {
    const loan = maxAffordableLoan(2000, 6, 30);
    const price = maxAffordablePrice(2000, 6, 30, 0);
    assert.ok(Math.abs(price - loan) < 0.01);
  });
});
