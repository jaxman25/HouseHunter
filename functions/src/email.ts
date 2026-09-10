/**
 * Transactional email via Resend (https://resend.com).
 *
 * Uses plain `fetch` (Node 20 has a global fetch) so the functions package
 * stays dependency-light. Configure in the functions environment:
 *
 *   RESEND_API_KEY            — API key from resend.com (required)
 *   NOTIFICATION_FROM_EMAIL   — verified sender, e.g. "House Hunter <no-reply@yourdomain.com>"
 */

const RESEND_URL = 'https://api.resend.com/emails';

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
}

/**
 * Confirmation email sent to a user right before their account is deleted.
 * Pure builder so the wording can be unit-tested without hitting Resend.
 */
export function buildDeletionConfirmationMessage(email: string): EmailMessage {
  return {
    to: email,
    subject: 'Your House Hunter account has been deleted',
    text:
      'This confirms that your House Hunter account and the data associated '
      + 'with it (profile, listings, photos, messages, notifications) have '
      + 'been permanently deleted.\n\n'
      + 'If you did not request this deletion, please contact us immediately '
      + 'at support@househunter.com.\n\n'
      + 'Thank you for having used House Hunter.',
  };
}

/** Inputs to the seller-inquiry email (contact seller via email). */
export interface SellerInquiryInput {
  sellerEmail: string;
  propertyTitle: string;
  propertyPrice: string;
  propertyCity: string;
  propertyState: string;
  propertyUrl: string;
  buyerName: string;
  buyerEmail: string;
  buyerMessage: string;
}

/**
 * Email sent to a seller when a buyer submits an inquiry about a listing.
 * Pure builder (unit-testable); sent through Resend by the callable.
 */
export function buildSellerInquiryMessage(data: SellerInquiryInput): EmailMessage {
  return {
    to: data.sellerEmail,
    subject: `New inquiry: ${data.propertyTitle}`,
    text:
      `You received a new inquiry about your listing on House Hunter.\n\n`
      + `Property: ${data.propertyTitle}\n`
      + `Price: ${data.propertyPrice}\n`
      + `Location: ${data.propertyCity}, ${data.propertyState}\n`
      + `View your listing: ${data.propertyUrl}\n\n`
      + `Message from ${data.buyerName} (${data.buyerEmail}):\n`
      + `"${data.buyerMessage}"\n\n`
      + `Reply to ${data.buyerEmail} to continue the conversation, or open `
      + `the House Hunter app to chat with ${data.buyerName} directly.`,
  };
}

/** Inputs to the on-call security alert email. */
export interface SecurityAlertInput {
  severity?: string;
  title?: string;
  body?: string;
  source?: string;
}

/**
 * Plain-text body of the security alert email sent to the on-call inbox.
 * Pure builder (unit-tested); recipients are added by the trigger.
 */
export function formatSecurityAlertText(data: SecurityAlertInput): string {
  const severity = data.severity ?? 'unknown';
  const title = data.title ?? 'Security alert';
  const body = data.body ?? 'No details provided.';
  const source = data.source ? `\n\nSource: ${data.source}` : '';
  return `[${severity.toUpperCase()}] ${title}\n\n${body}${source}\n\n`
    + 'Investigate per docs/BREACH_NOTIFICATION.md: confirm scope, contain, '
    + 'then decide whether users must be notified.';
}

/** Escape text for safe embedding in the lightweight HTML wrapper. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlBody(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1F2937;max-width:560px;margin:0 auto">' +
    '<div style="padding:20px 24px;background:#1B6EF3;border-radius:8px 8px 0 0">' +
    '<span style="color:#fff;font-size:18px;font-weight:bold">House Hunter</span></div>' +
    `<div style="padding:24px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px">${paragraphs}</div>` +
    '<p style="font-size:12px;color:#6B7280;padding:12px 4px 4px">' +
    'Questions? Reply to this email or contact support@househunter.com.</p></div>'
  );
}

/**
 * Send one transactional email through Resend. Throws on missing config or a
 * non-2xx API response so callers can record failures.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set in the functions environment');
  }
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (!from) {
    // SECURITY (LOW 12): Do not fall back to a potentially unverified email.
    // If the env var is missing, fail explicitly instead of silently using
    // an address that may bounce or fail SPF/DKIM checks.
    throw new Error(
      'NOTIFICATION_FROM_EMAIL is not set. Configure a verified sender address '
      + 'in the Cloud Functions environment (e.g. "House Hunter <no-reply@yourdomain.com>").'
    );
  }

  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      text: message.text,
      html: htmlBody(message.text),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend request failed (${response.status}): ${detail}`);
  }
}
