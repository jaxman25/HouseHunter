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
import { autoArchiveProperties } from './archive';
import { updateRatings } from './reviews';
import { tourReminders, tourNotifications } from './tours';
import { updateNeighborhoodData } from './neighborhood';
import { exportUserData } from './exportData';
import { runSavedSearches } from './savedSearchNotifications';

export { autoArchiveProperties, updateRatings, tourReminders, tourNotifications, updateNeighborhoodData, exportUserData, runSavedSearches };
import {
  SecurityAlertInput,
  sendEmail,
  buildDeletionConfirmationMessage,
  buildSellerInquiryMessage,
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

  // SECURITY: Only use the verified auth token email. Never accept
  // email from request.data — that would allow an attacker to use
  // this callable as an open email relay.
  const email: string | undefined = auth.token.email;

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

/** Per-user daily email-inquiry budget (mirrors DAILY_INQUIRY_LIMIT in src). */
const DAILY_INQUIRY_LIMIT = 5;

/**
 * Trigger 4 — HTTPS callable for "Contact Seller via Email". The app calls
 * this with { propertyId, message }; the function validates the listing is
 * still Active, checks the seller hasn't disabled email contact, enforces a
 * per-user daily rate limit, and sends the inquiry through Resend. The
 * seller's email address is resolved server-side and is never exposed to the
 * client (the client only ever sees the callable's success/failure).
 */
export const sendSellerInquiry = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const uid = auth.uid;

  const data = (request.data ?? {}) as { propertyId?: string; message?: string };
  const propertyId =
    typeof data.propertyId === 'string' ? data.propertyId.trim() : '';
  const message = typeof data.message === 'string' ? data.message.trim() : '';

  if (!propertyId) {
    throw new HttpsError('invalid-argument', 'propertyId is required.');
  }
  if (message.length < 20 || message.length > 1000) {
    throw new HttpsError(
      'invalid-argument',
      'Message must be between 20 and 1000 characters.'
    );
  }
  // Buyer must have a verified email before contacting sellers (anti-spam).
  if (auth.token.email_verified !== true) {
    throw new HttpsError(
      'failed-precondition',
      'Please verify your email address before contacting sellers.'
    );
  }

  const propertySnap = await db.doc(`properties/${propertyId}`).get();
  if (!propertySnap.exists) {
    throw new HttpsError('not-found', 'Property not found.');
  }
  const property = propertySnap.data() ?? {};

  if (property.status !== 'active') {
    throw new HttpsError(
      'failed-precondition',
      'This property is no longer available for inquiries.'
    );
  }
  if (property.contactEnabled === false) {
    throw new HttpsError(
      'failed-precondition',
      'The seller has disabled email inquiries for this listing.'
    );
  }
  if (property.userId === uid) {
    throw new HttpsError(
      'invalid-argument',
      'You cannot inquire about your own listing.'
    );
  }

  // Daily rate limit: one counter doc per user per day, incremented in a
  // transaction so concurrent submits cannot exceed the budget.
  const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const counterRef = db.doc(`users/${uid}/inquiryCounters/${dateKey}`);
  let limitReached = false;
  try {
    await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const count = counterSnap.exists
        ? ((counterSnap.data()?.count as number) ?? 0)
        : 0;
      if (count >= DAILY_INQUIRY_LIMIT) {
        limitReached = true;
        return;
      }
      tx.set(counterRef, { count: count + 1 }, { merge: true });
    });
  } catch (error) {
    throw new HttpsError(
      'unavailable',
      'Could not check inquiry limits. Please try again.'
    );
  }
  if (limitReached) {
    throw new HttpsError(
      'resource-exhausted',
      'Daily inquiry limit reached (5). Please try again tomorrow.'
    );
  }

  // Resolve the seller's email server-side — never return it to the client.
  const explicitEmail =
    typeof property.contactEmail === 'string' && property.contactEmail
      ? property.contactEmail
      : undefined;
  let sellerEmail = explicitEmail;
  if (!sellerEmail) {
    const ownerSnap = await db.doc(`users/${property.userId}`).get();
    sellerEmail = ownerSnap.exists
      ? (ownerSnap.data()?.email as string | undefined)
      : undefined;
  }
  if (!sellerEmail) {
    throw new HttpsError(
      'failed-precondition',
      'The seller has not set up email contact.'
    );
  }

  const buyerSnap = await db.doc(`users/${uid}`).get();
  const buyerName = buyerSnap.exists
    ? (buyerSnap.data()?.displayName as string | undefined) || 'A House Hunter user'
    : 'A House Hunter user';
  const buyerEmail: string = auth.token.email ?? '';

  const origin = process.env.APP_ORIGIN ?? 'https://househunter.app';
  const propertyUrl = `${origin}/property/${propertyId}`;

  await sendEmail(
    buildSellerInquiryMessage({
      sellerEmail,
      propertyTitle: property.title ?? 'Property',
      propertyPrice:
        property.price != null
          ? `$${Number(property.price).toLocaleString()}`
          : '—',
      propertyCity: property.city ?? '',
      propertyState: property.state ?? '',
      propertyUrl,
      buyerName,
      buyerEmail,
      buyerMessage: message,
    })
  );

  // Record the inquiry and notify the seller in-app (fire-and-forget; a
  // failure here should not fail the send the user already saw succeed).
  await db
    .doc(`properties/${propertyId}`)
    .update({ inquiries: FieldValue.increment(1) })
    .catch((error: unknown) => {
      console.error('[sendSellerInquiry] inquiry counter update failed:', error);
    });
  await db
    .collection('notifications')
    .add({
      userId: property.userId,
      title: 'New inquiry',
      body: `${buyerName} is interested in your listing: ${property.title}`,
      type: 'inquiry',
      data: { propertyId, buyerId: uid },
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    })
    .catch((error: unknown) => {
      console.error('[sendSellerInquiry] seller notification failed:', error);
    });

  return { ok: true };
});
