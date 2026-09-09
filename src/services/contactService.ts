import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../config/firebase';

/**
 * Email inquiries to sellers.
 *
 * The actual send happens server-side (functions/src/callables/sendInquiry.ts)
 * through Resend, so the seller's email address never reaches the client.
 * The callable enforces: property exists + Active, the buyer isn't the owner,
 * the seller hasn't disabled contact, the buyer's email is verified, and a
 * per-user daily rate limit.
 */

let functionsInstance: ReturnType<typeof getFunctions> | null = null;

function getFunctionsInstance() {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app);
  }
  return functionsInstance;
}

export interface SendInquiryResult {
  /** Present when the daily inquiry limit was hit (5/day). */
  limitReached?: boolean;
}

/**
 * Send an email inquiry about `propertyId` to its seller.
 * Throws on failure; `error.code` may be 'functions/inquiry-limit' when the
 * daily budget is exhausted.
 */
export async function sendEmailInquiry(
  propertyId: string,
  message: string
): Promise<SendInquiryResult> {
  const callable = httpsCallable(getFunctionsInstance(), 'sendSellerInquiry');
  await callable({ propertyId, message });
  return {};
}