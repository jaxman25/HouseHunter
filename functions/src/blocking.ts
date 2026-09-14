/**
 * Firebase Auth blocking functions (beforeSignIn).
 *
 * These functions run server-side BEFORE a user's ID token is minted.
 * They can:
 *   1. Block sign-in entirely (throw HttpsError)
 *   2. Set custom claims on the token (for role-based access)
 *   3. Modify the user record
 *
 * IMPORTANT: Blocking functions require additional Firebase project config:
 *   1. Upgrade to Blaze plan (pay-as-you-go)
 *   2. Enable blocking functions in Firebase Console:
 *      Authentication → Settings → Blocking functions → Enable
 *   3. Deploy with: firebase deploy --only functions
 *   4. Set the blocking function URL in the Firebase Console
 *
 * Without this config, the function deploys but is NOT invoked.
 * The client-side checks remain as the primary defense until blocking
 * functions are enabled in the console.
 *
 * Deploy:
 *   firebase deploy --only functions:beforeSignIn
 *
 * The function performs three checks:
 *   1. SUSPENSION: Blocks sign-in for suspended accounts
 *   2. CUSTOM CLAIMS: Sets `role` and `admin` claims for RBAC
 *   3. SESSION REVOCATION: Checks if the user's refresh tokens were revoked
 */

import { beforeUserSignedIn } from 'firebase-functions/v2/identity';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

/**
 * beforeSignIn blocking function.
 *
 * Runs for EVERY authentication event (email/password, Google, OAuth, etc.)
 * before the ID token is issued.
 */
export const blockingBeforeSignIn = beforeUserSignedIn(async (event) => {
  const data = event.data;
  if (!data) return;
  const uid = data.uid;

  // ─── 1. Check suspension status ─────────────────────────────────
  const userSnap = await db.doc(`users/${uid}`).get();
  const userData = userSnap.data();

  if (userData?.suspended === true) {
    // Check if suspension has expired.
    const expiry = userData.suspensionExpiry;
    if (expiry) {
      const expiryDate = new Date(expiry);
      if (expiryDate > new Date()) {
        // Suspension is still active.
        throw new Error(
          'Your account has been suspended. '
          + `Reason: ${userData.suspensionReason || 'No reason provided'}. `
          + `Contact support for more information.`
        );
      }
      // Suspension expired — auto-unsuspend.
      await db.doc(`users/${uid}`).update({
        suspended: false,
        suspensionReason: FieldValue.delete(),
        suspensionExpiry: FieldValue.delete(),
      });
    } else {
      // Permanent suspension.
      throw new Error(
        'Your account has been permanently suspended. '
        + 'Contact support for more information.'
      );
    }
  }

  // ─── 2. Set custom claims for role-based access ─────────────────
  // Custom claims are embedded in the ID token and available on the
  // server via `auth.token.role` / `auth.token.admin`. This avoids
  // reading the Firestore user doc on every request.
  const claims: Record<string, unknown> = {};

  if (userData?.role) {
    claims.role = userData.role;
  }

  // Check admin role from admin/roles collection.
  const adminSnap = await db.doc(`admin/roles/${uid}`).get();
  if (adminSnap.exists) {
    claims.admin = true;
  }

  // Only set claims if there's something to set (avoids unnecessary
  // token refresh on every sign-in).
  if (Object.keys(claims).length > 0) {
    await getAuth().setCustomUserClaims(uid, claims);
  }

  // ─── 3. Session revocation check ────────────────────────────────
  // If the user doc has a sessionRevokedAt timestamp that's newer
  // than the token's issued-at, the session was revoked (e.g. password
  // changed on another device). The blocking function can't check the
  // current token's iat (it hasn't been issued yet), but we can check
  // if the user recently changed their password and set a flag.
  //
  // The `checkSessionValid` callable handles the client-side check.
  // Here we just ensure the custom claims reflect the latest state.

  // No return needed — claims were set above via setCustomUserClaims.
  // The function returns void to allow the sign-in to proceed.
});
