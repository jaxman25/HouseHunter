import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
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
import { USERS_COLLECTION, DEFAULT_AVATAR } from '../utils/constants';
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

export async function register(
  email: string,
  password: string,
  displayName: string,
  role: 'buyer' | 'seller' | 'agent' = 'buyer'
): Promise<AppUser> {
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
        updateProfile(credential.user, { displayName, photoURL: DEFAULT_AVATAR }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  const userData: AppUser = {
    uid: credential.user.uid,
    email,
    displayName,
    phoneNumber: '',
    photoURL: DEFAULT_AVATAR,
    bio: '',
    role,
    favorites: [],
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

  return userData;
}

export async function login(email: string, password: string): Promise<User> {
  const credential = await authCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(signInWithEmailAndPassword(auth, email, password), DEFAULT_TIMEOUT_MS)
    )
  );
  return credential.user;
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

  const defaultName =
    fbUser.displayName || fbUser.email?.split('@')[0] || 'User';

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

  if (data.displayName || data.photoURL) {
    await authCircuitBreaker.execute(() =>
      withRetry(() =>
        withTimeout(
          updateProfile(user, {
            displayName: data.displayName || user.displayName || '',
            photoURL: data.photoURL || user.photoURL || '',
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
          ...data,
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
}

export async function addFavorite(uid: string, propertyId: string): Promise<void> {
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