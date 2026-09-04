import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { User as AppUser, UserProfile } from '../types';
import { USERS_COLLECTION } from '../utils/constants';
import { DEFAULT_AVATAR } from '../utils/constants';

export async function register(
  email: string,
  password: string,
  displayName: string,
  role: 'buyer' | 'seller' | 'agent' = 'buyer'
): Promise<AppUser> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(credential.user, { displayName, photoURL: DEFAULT_AVATAR });

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

  await setDoc(doc(db, USERS_COLLECTION, credential.user.uid), {
    ...userData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return userData;
}

export async function login(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInWithGoogleWeb(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  const credential = await signInWithPopup(auth, provider);
  return credential.user;
}

export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  const credential = GoogleAuthProvider.credential(idToken);
  const userCredential = await signInWithCredential(auth, credential);
  return userCredential.user;
}

export async function ensureUserDocument(fbUser: User): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, fbUser.uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) return;

  const defaultName =
    fbUser.displayName || fbUser.email?.split('@')[0] || 'User';

  await setDoc(userRef, {
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
  });
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  const docRef = doc(db, USERS_COLLECTION, uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { uid: docSnap.id, ...docSnap.data() } as AppUser;
  }
  return null;
}

export async function updateUserProfile(
  uid: string,
  data: Partial<UserProfile>
): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Unauthorized');

  if (data.displayName || data.photoURL) {
    await updateProfile(user, {
      displayName: data.displayName || user.displayName || '',
      photoURL: data.photoURL || user.photoURL || '',
    });
  }

  await updateDoc(doc(db, USERS_COLLECTION, uid), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Not authenticated');

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function addFavorite(uid: string, propertyId: string): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;

  const favorites = userSnap.data().favorites || [];
  if (!favorites.includes(propertyId)) {
    await updateDoc(userRef, {
      favorites: [...favorites, propertyId],
      updatedAt: serverTimestamp(),
    });
  }
}

export async function removeFavorite(uid: string, propertyId: string): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;

  const favorites = (userSnap.data().favorites || []).filter(
    (id: string) => id !== propertyId
  );
  await updateDoc(userRef, {
    favorites,
    updatedAt: serverTimestamp(),
  });
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}
