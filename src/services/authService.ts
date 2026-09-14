import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  User,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { User as AppUser, UserProfile } from '../types';
import {
  USERS_COLLECTION,
  DEFAULT_AVATAR,
  TERMS_VERSION,
} from '../utils/constants';
import { authCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../utils/network/timeout';
import {
  getCachedOrFetch,
  buildCacheKey,
  PROFILE_CACHE_TTL_MS,
} from '../utils/cache/cacheService';
import {
  invalidateUserProfile,
  invalidateFavorites,
} from '../utils/cache/cacheInvalidation';
import { trackMetric } from '../utils/monitoring/metrics';
import {
  getLoginCooldownMs,
  recordLoginFailure,
  clearLoginFailures,
} from '../utils/auth/loginRateLimiter';
import {
  revokeAllTokens,
  logFailedLogin as logFailedLoginServer,
  logSuccessfulLogin as logSuccessfulLoginServer,
} from './sessionService';
import {
  logLoginSuccess,
  logLoginFailure,
  logRegistration,
  logPasswordReset,
} from './securityLogService';
import { sanitize, sanitizeStrict } from '../utils/security/sanitize';

export async function register(
  email: string,
  password: string,
  displayName: string,
  role: 'buyer' | 'seller' | 'agent' = 'buyer',
  /** Terms version the user agreed to (undefined = did not agree). */
  termsAcceptedVersion?: string
): Promise<AppUser> {
  // SECURITY: Sanitize displayName to prevent stored XSS.
  const sanitizedDisplayName = sanitize(displayName, 100);

  const credential = await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        createUserWithEmailAndPassword(auth, email, password),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        updateProfile(credential.user, { displayName: sanitizedDisplayName, photoURL: DEFAULT_AVATAR }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  const userData: AppUser = {
    uid: credential.user.uid,
    email,
    displayName: sanitizedDisplayName,
    phoneNumber: '',
    photoURL: DEFAULT_AVATAR,
    bio: '',
    role,
    favorites: [],
    ...(termsAcceptedVersion
      ? {
          termsAcceptedAt: new Date().toISOString(),
          termsAcceptedVersion,
        }
      : {}),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        setDoc(doc(db, USERS_COLLECTION, credential.user.uid), {
          ...userData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  // SECURITY: Send a verification email immediately after registration.
  // This is fire-and-forget — a failure here should not block account
  // creation; the user can always resend from the verification screen.
  sendEmailVerification(credential.user).catch((err) =>
    console.warn('[register] Failed to send verification email:', err)
  );

  // SECURITY: Log registration for security monitoring.
  logRegistration(credential.user.uid).catch(() => {});

  return userData;
}

export async function login(email: string, password: string): Promise<User> {
  // SECURITY: Enforce client-side rate limiting before hitting Firebase.
  // This adds an exponential backoff delay after consecutive failures,
  // reducing brute-force velocity at the client layer.
  const cooldownMs = getLoginCooldownMs(email);
  if (cooldownMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, cooldownMs));
  }

  try {
    const credential = await authCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(signInWithEmailAndPassword(auth, email, password), DEFAULT_TIMEOUT_MS)
      )
    );
    // SECURITY: Clear failure state on successful login.
    clearLoginFailures(email);
    // SECURITY: Log successful login server-side for anomaly detection.
    logSuccessfulLoginServer().catch(() => {});
    logLoginSuccess(credential.user.uid).catch(() => {});
    return credential.user;
  } catch (error) {
    // SECURITY: Record failure for rate limiting on auth errors.
    const code = (error as { code?: string })?.code;
    if (
      code === 'auth/user-not-found' ||
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-login-credentials'
    ) {
      recordLoginFailure(email);
      // SECURITY: Log failed attempt server-side for audit trail.
      logFailedLoginServer(email).catch(() => {});
      logLoginFailure(email, code).catch(() => {});
    }
    throw error;
  }
}

export async function signInWithGoogleWeb(): Promise<User> {
  const credential = await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        (async () => {
          const provider = new GoogleAuthProvider();
          provider.addScope('email');
          provider.addScope('profile');
          return signInWithPopup(auth, provider);
        })(),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
  return credential.user;
}

export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  const credential = await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        (async () => {
          const provider = GoogleAuthProvider.credential(idToken);
          const userCredential = await signInWithCredential(auth, provider);
          return userCredential.user;
        })(),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
  return credential;
}

export async function ensureUserDocument(fbUser: User): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, fbUser.uid);
  const userSnap = await authCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDoc(userRef), DEFAULT_TIMEOUT_MS))
  );
  if (userSnap.exists()) return;

  // SECURITY: Sanitize display name to prevent stored XSS.
  const defaultName = sanitize(
    fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
    100
  );

  await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        setDoc(userRef, {
          uid: fbUser.uid,
          email: fbUser.email || '',
          displayName: defaultName,
          phoneNumber: fbUser.phoneNumber || '',
          photoURL: fbUser.photoURL || DEFAULT_AVATAR,
          bio: '',
          role: 'buyer',
          favorites: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
}

export async function logout(): Promise<void> {
  await authCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(signOut(auth), DEFAULT_TIMEOUT_MS))
  );
}

export async function resetPassword(email: string): Promise<void> {
  await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(sendPasswordResetEmail(auth, email), DEFAULT_TIMEOUT_MS)
    )
  );
  // SECURITY: Log password reset for security monitoring.
  logPasswordReset(email).catch(() => {});
}

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  const result = await getCachedOrFetch(
    buildCacheKey('users', 'profile', uid),
    () =>
      trackMetric('users.profile', () =>
        authCircuitBreaker.execute(() =>
          withRetry(() =>
            withTimeout(
              (async () => {
                const docRef = doc(db, USERS_COLLECTION, uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                  return { uid: docSnap.id, ...docSnap.data() } as AppUser;
                }
                return null;
              })(),
              DEFAULT_TIMEOUT_MS
            )
          )
        )
      ),
    PROFILE_CACHE_TTL_MS
  );
  return result.data;
}

export async function updateUserProfile(
  uid: string,
  data: Partial<UserProfile>
): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Unauthorized');

  // SECURITY: Sanitize all text fields to prevent stored XSS.
  const sanitizedData: Partial<UserProfile> = {};
  if (data.displayName !== undefined) {
    sanitizedData.displayName = sanitize(data.displayName, 100);
  }
  if (data.phoneNumber !== undefined) {
    sanitizedData.phoneNumber = sanitizeStrict(data.phoneNumber, 30);
  }
  if (data.bio !== undefined) {
    sanitizedData.bio = sanitize(data.bio, 500);
  }
  if (data.photoURL !== undefined) {
    sanitizedData.photoURL = data.photoURL;
  }

  if (sanitizedData.displayName || sanitizedData.photoURL) {
    await authCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          updateProfile(user, {
            displayName: sanitizedData.displayName || user.displayName || '',
            photoURL: sanitizedData.photoURL || user.photoURL || '',
          }),
          DEFAULT_TIMEOUT_MS
        )
      )
    );
  }

  await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        updateDoc(doc(db, USERS_COLLECTION, uid), {
          ...sanitizedData,
          updatedAt: serverTimestamp(),
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  // Profile mutated — drop the cached copy so the next read is fresh.
  await invalidateUserProfile(uid);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Not authenticated');

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(reauthenticateWithCredential(user, credential), DEFAULT_TIMEOUT_MS)
    )
  );
  await authCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(updatePassword(user, newPassword), DEFAULT_TIMEOUT_MS))
  );

  // SECURITY: Revoke all other refresh tokens after password change.
  // This forces every other device/session to re-authenticate.
  // Best-effort: if revocation fails, the password is still changed.
  revokeAllTokens().catch((err) =>
    console.warn('[changePassword] Failed to revoke tokens:', err)
  );
}

export async function addFavorite(uid: string, propertyId: string): Promise<void> {
  // SECURITY (IDOR): Verify the caller owns this UID before writing.
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Unauthorized');

  // SECURITY: Validate propertyId format (alphanumeric, hyphens, underscores).
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(propertyId)) {
    throw new Error('Invalid property ID');
  }

  // arrayUnion is an atomic server-side transform: no read-modify-write, so
  // concurrent toggles on different devices can't lose updates (and it's
  // idempotent — toggling the same favorite twice is a no-op).
  await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        updateDoc(doc(db, USERS_COLLECTION, uid), {
          favorites: arrayUnion(propertyId),
          updatedAt: serverTimestamp(),
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
  await invalidateFavorites(uid);
}

export async function removeFavorite(uid: string, propertyId: string): Promise<void> {
  // SECURITY (IDOR): Verify the caller owns this UID before writing.
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Unauthorized');

  // SECURITY: Validate propertyId format.
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(propertyId)) {
    throw new Error('Invalid property ID');
  }

  await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        updateDoc(doc(db, USERS_COLLECTION, uid), {
          favorites: arrayRemove(propertyId),
          updatedAt: serverTimestamp(),
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
  await invalidateFavorites(uid);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

/**
 * Record that the signed-in user accepted the current Terms of Service.
 * Used by the post-login consent gate for accounts created through flows
 * that have no checkbox (e.g. social sign-in).
 */
export async function acceptTerms(uid: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Unauthorized');
  await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        updateDoc(doc(db, USERS_COLLECTION, uid), {
          termsAcceptedAt: new Date().toISOString(),
          termsAcceptedVersion: TERMS_VERSION,
          updatedAt: serverTimestamp(),
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
  await invalidateUserProfile(uid);
}

/**
 * Permanently delete the Firebase Auth account. Firestore/Storage data is
 * wiped first by `accountService.deleteAccountData` (this must run last,
 * while the auth token still validates the deletions).
 *
 * For email/password accounts the current password is required so the
 * session is re-authenticated (Firebase refuses destructive calls on stale
 * sessions); social accounts rely on a recent sign-in.
 */
export async function deleteAuthAccount(password?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  if (user.email && password) {
    const credential = EmailAuthProvider.credential(user.email, password);
    await authCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          reauthenticateWithCredential(user, credential),
          DEFAULT_TIMEOUT_MS
        )
      )
    );
  }

  await authCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(deleteUser(user), DEFAULT_TIMEOUT_MS))
  );
}

// ─── Email Verification ─────────────────────────────────────────────────

/**
 * Send an email verification link to the currently signed-in user.
 * Called after registration to confirm the user owns the email address.
 */
export async function sendVerificationEmail(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(sendEmailVerification(user), DEFAULT_TIMEOUT_MS)
    )
  );
}

/**
 * Check whether the current user's email has been verified.
 * Firebase caches this client-side; call `reload()` first to get the
 * latest server state.
 */
export async function isEmailVerified(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  // Reload to pick up verification state changes from other tabs/devices.
  await authCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(user.reload(), DEFAULT_TIMEOUT_MS))
  );
  return user.emailVerified;
}