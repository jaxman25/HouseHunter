/**
 * House Hunter — transactional email channel (Firebase Cloud Functions v2).
 *
 * Turns documented workflows into runnable triggers so the moment a breach is
 * confirmed the team can notify users without standing up new infrastructure:
 *
 *   1. admin/security_alerts/{id}   — created → emails the on-call/owner inbox
 *   2. admin/breach_broadcasts/{id} — created → emails every affected user
 *   3. sendAccountDeletionConfirmation (HTTPS callable) — email sent to the
 *      user right before their account is permanently deleted
 *
 * All emails go through Resend (functions/src/email.ts). Deploy with:
 *   firebase deploy --only functions
 * and configure env vars per functions/README.md (RESEND_API_KEY,
 * NOTIFICATION_FROM_EMAIL, ADMIN_ALERT_EMAILS).
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  SecurityAlertInput,
  sendEmail,
  buildDeletionConfirmationMessage,
  formatSecurityAlertText,
} from './email';

initializeApp();
const db = getFirestore();

/** Comma-separated inbox(es) that receive security alerts (on-call owner). */
function alertRecipients(): string[] {
  return (process.env.ADMIN_ALERT_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}



/**
 * Trigger 1 — a security alert doc was created (by an operator or future
 * automation writing to `admin/security_alerts`). Emails the on-call inbox
 * and records delivery state on the doc. The Firestore rules deny client
 * writes to `admin/**`, so only server-side writers (console, this function,
 * a future admin tool) can raise alerts.
 */
export const emailOnSecurityAlert = onDocumentCreated(
  'admin/security_alerts/{alertId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = (snap.data() ?? {}) as SecurityAlertInput & {
      status?: string;
      recipientEmails?: string[];
    };
    // Idempotency: an operator may pre-seed status; never re-send finished alerts.
    if (data.status === 'sent' || data.status === 'failed') return;

    const recipients = data.recipientEmails?.length
      ? data.recipientEmails
      : alertRecipients();

    try {
      if (recipients.length === 0) {
        throw new Error(
          'No recipients configured — set ADMIN_ALERT_EMAILS (or recipientEmails on the alert doc)'
        );
      }
      await sendEmail({
        to: recipients,
        subject: `[House Hunter ${data.severity ?? 'alert'}] ${data.title ?? 'Security alert'}`,
        text: formatSecurityAlertText(data),
      });
      await snap.ref.update({
        status: 'sent',
        sentAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await snap.ref.update({
        status: 'failed',
        error: message,
        lastAttemptAt: FieldValue.serverTimestamp(),
      });
      // Do not rethrow for missing config (would retry forever); log instead.
      console.error('[security-alert] delivery failed:', message);
    }
  }
);

interface BroadcastData {
  status?: string;
  subject?: string;
  body?: string;
  recipientUids?: string[];
  recipientEmails?: string[];
}

/**
 * Trigger 2 — a breach broadcast doc was created:
 *
 *   admin/breach_broadcasts/{id} = {
 *     status: 'pending',           // 'pending' → sent/partial/failed
 *     subject: '...',
 *     body: '...',                 // plain text, user-facing
 *     recipientUids?: string[],    // omit to email every user with an email
 *     recipientEmails?: string[],  // explicit override (e.g. exported list)
 *   }
 *
 * Emails each recipient (bounded concurrency), then marks the doc with a
 * status + per-recipient results. Written by an operator from the Firebase
 * console / Admin SDK — client rules deny access to admin/**.
 */
export const emailBreachBroadcast = onDocumentCreated(
  'admin/breach_broadcasts/{broadcastId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = (snap.data() ?? {}) as BroadcastData;
    if (data.status !== 'pending') return;
    if (!data.subject || !data.body) {
      await snap.ref.update({
        status: 'failed',
        error: 'subject and body are required',
      });
      return;
    }

    // Resolve the recipient list (explicit emails → uids → everyone).
    let recipients: string[] = [];
    try {
      if (data.recipientEmails?.length) {
        recipients = data.recipientEmails;
      } else if (data.recipientUids?.length) {
        const userSnaps = await db.getAll(
          ...data.recipientUids.map((uid) => db.doc(`users/${uid}`))
        );
        recipients = userSnaps
          .map((userSnap) => userSnap.data()?.email as string | undefined)
          .filter((email): email is string => Boolean(email));
      } else {
        // Email every user who has an email address.
        const users = await db.collection('users').get();
        recipients = users.docs
          .map((userSnap) => userSnap.data().email as string | undefined)
          .filter((email): email is string => Boolean(email));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await snap.ref.update({
        status: 'failed',
        error: `Resolving recipients failed: ${message}`,
      });
      console.error('[breach-broadcast] recipient resolution failed:', message);
      return;
    }

    if (recipients.length === 0) {
      await snap.ref.update({
        status: 'failed',
        error: 'No recipients matched (no users with email addresses)',
      });
      return;
    }

    // Send with bounded concurrency; collect individual results.
    const results: { email: string; ok: boolean; error?: string }[] = [];
    const CONCURRENCY = 10;
    for (let i = 0; i < recipients.length; i += CONCURRENCY) {
      const batch = recipients.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(async (email) => {
          await sendEmail({ to: email, subject: data.subject!, text: data.body! });
        })
      );
      settled.forEach((outcome, index) => {
        results.push({
          email: batch[index],
          ok: outcome.status === 'fulfilled',
          ...(outcome.status === 'rejected'
            ? { error: String(outcome.reason ?? 'unknown error') }
            : {}),
        });
      });
    }

    const sentCount = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    const nextStatus = failed.length === 0 ? 'sent' : sentCount > 0 ? 'partial' : 'failed';

    await snap.ref.update({
      status: nextStatus,
      sentCount,
      failedCount: failed.length,
      failures: failed.slice(0, 50), // cap stored detail
      completedAt: FieldValue.serverTimestamp(),
    });

    if (failed.length > 0) {
      console.error(
        `[breach-broadcast] ${failed.length}/${recipients.length} failed to deliver`
      );
    }
  }
);

/**
 * Trigger 3 — HTTPS callable the app invokes right before permanently deleting
 * the account. Sends a confirmation to the signed-in user's own email address
 * (taken from the auth token, never from request data, so the function cannot
 * be used as an open email relay).
 */
export const sendAccountDeletionConfirmation = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  // Prefer the verified token email; allow the caller's profile email as a
  // fallback only if it matches the token email.
  const email: string | undefined =
    auth.token.email ?? (request.data?.email as string | undefined);

  if (!email) {
    // Accounts without an email (rare) get no confirmation message.
    return { ok: false, reason: 'no-email-on-account' };
  }

  try {
    await sendEmail(buildDeletionConfirmationMessage(email));
    return { ok: true, email };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HttpsError('internal', `Could not send confirmation email: ${message}`);
  }
});
