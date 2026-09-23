/**
 * Mortgage math — pure, client-side, no Firebase.
 *
 * Standard fixed-rate amortization. All functions are deterministic so the
 * unit test file mirrors them exactly (see
 * src/utils/__tests__/mortgage.test.js — same mirror pattern as
 * propertyService.test.js).
 */

/** Monthly payment for a fixed-rate loan. Returns 0 for zero/negative principal. */
export function calculateMonthlyPayment(
  principal: number,
  annualRatePercent: number,
  termYears: number
): number {
  if (!(principal > 0) || !(termYears > 0)) return 0;
  const n = Math.round(termYears * 12);
  if (n <= 0) return 0;
  const r = annualRatePercent / 100 / 12;
  if (r <= 0) return principal / n;
  const factor = Math.pow(1 + r, n);
  return (principal * r * factor) / (factor - 1);
}

/** Round a dollar amount to whole currency units (display precision). */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface MortgageBreakdown {
  /** Total borrowed (price − down payment). */
  loanAmount: number;
  /** Fixed monthly principal + interest payment. */
  monthlyPayment: number;
  /** Interest paid over the whole term (0-term → 0). */
  totalInterest: number;
  /** Down payment + loan payments = total cost of the home. */
  totalCost: number;
}

/**
 * Full fixed-rate breakdown. All values rounded to cents; monthlyPayment is
 * rounded to cents for display and reused for totals so the numbers shown
 * always add up.
 */
export function calculateMortgage(options: {
  price: number;
  downPaymentPercent: number;
  annualRatePercent: number;
  termYears: number;
}): MortgageBreakdown {
  const { price, downPaymentPercent, annualRatePercent, termYears } = options;
  const down = Math.max(0, Math.min(100, downPaymentPercent));
  const loanAmount = Math.max(0, price * (1 - down / 100));
  const monthlyPayment = roundCurrency(calculateMonthlyPayment(loanAmount, annualRatePercent, termYears));
  const months = Math.round(termYears * 12);
  const totalPaid = monthlyPayment * months;
  // Interest can never be negative; clamp for zero-rate edge cases where
  // rounding could produce a tiny negative.
  const totalInterest = Math.max(0, roundCurrency(totalPaid - loanAmount));
  const totalCost = roundCurrency(loanAmount + totalInterest + price * (down / 100));
  return { loanAmount, monthlyPayment, totalInterest, totalCost };
}

/**
 * Affordability: the largest loan principal whose monthly payment fits a
 * budget, using the standard annuity formula solved for principal.
 * Returns 0 for a zero/negative rate-less budget edge (see below).
 */
export function maxAffordableLoan(
  maxMonthlyPayment: number,
  annualRatePercent: number,
  termYears: number
): number {
  if (!(maxMonthlyPayment > 0) || !(termYears > 0)) return 0;
  const n = Math.round(termYears * 12);
  const r = annualRatePercent / 100 / 12;
  if (r <= 0) return maxMonthlyPayment * n;
  const factor = Math.pow(1 + r, n);
  return (maxMonthlyPayment * (factor - 1)) / (r * factor);
}

/**
 * Inverse of the down-payment calculator: given a monthly budget, rate and
 * term, returns the maximum home price the buyer can afford assuming the
 * given down payment percentage.
 */
export function maxAffordablePrice(
  maxMonthlyPayment: number,
  annualRatePercent: number,
  termYears: number,
  downPaymentPercent: number
): number {
  const down = Math.max(0, Math.min(100, downPaymentPercent));
  if (down >= 100) return Number.POSITIVE_INFINITY;
  const loan = maxAffordableLoan(maxMonthlyPayment, annualRatePercent, termYears);
  return loan / (1 - down / 100);
}
