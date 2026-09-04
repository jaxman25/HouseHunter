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
  const from =
    process.env.NOTIFICATION_FROM_EMAIL ?? 'House Hunter <no-reply@househunter.com>';

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
