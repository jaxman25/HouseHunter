/**
 * Session security Cloud Functions.
 *
 * Provides two callable functions that the client invokes after security-
 * sensitive operations to invalidate stale sessions:
 *
 *   1. revokeRefreshTokens — called after password change/change-password.
 *      Revokes ALL refresh tokens for the user so every other device/session
 *      is forced to re-authenticate. Uses the Firebase Admin SDK which
 *      bypasses Firestore rules.
 *
 *   2. checkSessionValid — a lightweight callable the client can ping on
 *      app foreground to verify the session hasn't been revoked server-side.
 *      Returns { valid: true } or throws if the token was revoked.
 *
 * Deploy:
 *   firebase deploy --only functions:revokeRefreshTokens,functions:checkSessionValid
 *
 * Firebase Console configuration (manual):
 *   1. Go to Authentication → Settings → Session lifetime
 *   2. Set "ID token expiration" to 1 hour (default)
 *   3. Set "Refresh token expiration" to 30 days (or your policy)
 *   4. Enable "Force token refresh on password change" is NOT a built-in
 *      toggle — this function achieves the same result programmatically.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();

/**
 * Revoke all refresh tokens for the calling user.
 *
 * After calling this, every device except the current one will be logged
 * out on their next network request (the ID token will still be valid for
 * up to 1 hour, but the refresh token is revoked, so they can't get a
 * new ID token).
 *
 * The current device keeps working because the client calls this after
 * a successful password change, and the new credential is already active.
 */
export const revokeRefreshTokens = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const uid = auth.uid;

  try {
    // Revoke all refresh tokens. This sets the token's `revoked` field
    // on the server; any subsequent token refresh attempt will fail.
    await getAuth().revokeRefreshTokens(uid);

    // Record the revocation in the user doc so clients can detect it.
    await getFirestore().doc(`users/${uid}`).update({
      sessionRevokedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Audit log entry.
    await getFirestore().collection('admin_auditLog').add({
      action: 'session.revoked',
      uid,
      reason: 'password_changed',
      createdAt: FieldValue.serverTimestamp(),
    });

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HttpsError('internal', `Failed to revoke tokens: ${message}`);
  }
});

/**
 * Verify the calling user's session is still valid (not revoked).
 *
 * The client calls this on app foreground. If the token was revoked
 * (e.g. password changed on another device), the client should force
 * a re-login.
 */
export const checkSessionValid = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const uid = auth.uid;

  try {
    // Check if the user doc has a recent revocation.
    // When revokeRefreshTokens is called, it writes sessionRevokedAt to
    // the user doc. If that timestamp is newer than the token's issued-at
    // (iat), the session was revoked after this token was minted.
    const userSnap = await getFirestore().doc(`users/${uid}`).get();
    const userData = userSnap.data();
    const sessionRevokedAt = userData?.sessionRevokedAt?.toDate?.();

    if (sessionRevokedAt && sessionRevokedAt.getTime() > (auth.token.iat ?? 0) * 1000) {
      return { valid: false, reason: 'revoked' };
    }

    return { valid: true };
  } catch (error) {
    // If we can't check, assume valid to avoid locking out users on
    // transient errors. Log the error for investigation.
    console.error('[checkSessionValid] error:', error);
    return { valid: true };
  }
});
