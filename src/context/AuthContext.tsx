import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth , db } from '../config/firebase';
import { User } from '../types';
import * as authService from '../services/authService';
import { USERS_COLLECTION } from '../utils/constants';
import { doc, onSnapshot } from 'firebase/firestore';
import { persistPushToken, clearPushToken } from '../services/notificationService';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
    role?: 'buyer' | 'seller' | 'agent',
    termsAcceptedVersion?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
  isFavorite: (propertyId: string) => boolean;
  toggleFavorite: (propertyId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          let profile = await authService.getUserProfile(fbUser.uid);
          if (!profile) {
            // The email/password register() flow writes the profile document
            // only AFTER createUser resolves, so this handler can fire while
            // that write is still in flight. Poll briefly before creating a
            // default document: a blind default write could race the
            // registration write and clobber it (including the
            // termsAcceptedVersion the user just consented to), stranding a
            // brand-new account on the TermsGate. `ensureUserDocument` below
            // re-checks existence, so once registration's doc lands it
            // becomes a no-op. Accounts with no writer (Google sign-in,
            // legacy) fall through to the default profile as before.
            for (let attempt = 0; !profile && attempt < 4; attempt++) {
              await new Promise((r) => setTimeout(r, 250));
              profile = await authService.getUserProfile(fbUser.uid);
            }
          }
          if (!profile) {
            // First-time sign-in (e.g. via Google) - create a default profile
            await authService.ensureUserDocument(fbUser);
            profile = await authService.getUserProfile(fbUser.uid);
          }
          setUser(profile);
        } catch (error) {
          console.error('Error loading profile:', error);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Register for push notifications and persist the token to the user doc
  // so the scheduled saved-search Cloud Function can send pushes.
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    void persistPushToken(uid);
  }, [firebaseUser?.uid]);

  // Real-time user data subscription
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;

    const unsubscribe = onSnapshot(
      doc(db, USERS_COLLECTION, uid),
      (docSnap) => {
        if (docSnap.exists()) {
          setUser({ uid: docSnap.id, ...docSnap.data() } as User);
        }
      }
    );

    return () => unsubscribe();
  }, [firebaseUser?.uid]);

  const login = useCallback(async (email: string, password: string) => {
    await authService.login(email, password);
  }, []);

  const registerUser = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      role: 'buyer' | 'seller' | 'agent' = 'buyer',
      termsAcceptedVersion?: string
    ) => {
      await authService.register(
        email,
        password,
        displayName,
        role,
        termsAcceptedVersion
      );
    },
    []
  );

  const logout = useCallback(async () => {
    const uid = user?.uid;
    await authService.logout();
    setUser(null);
    setFirebaseUser(null);
    // Clear push token so stale tokens don't receive phantom notifications.
    if (uid) void clearPushToken(uid);
  }, [user?.uid]);

  const updateProfile = useCallback(
    async (data: Partial<User>) => {
      if (!user) throw new Error('Not authenticated');
      await authService.updateUserProfile(user.uid, data);
    },
    [user]
  );

  const refreshUser = useCallback(async () => {
    if (!firebaseUser) return;
    const profile = await authService.getUserProfile(firebaseUser.uid);
    setUser(profile);
  }, [firebaseUser]);

  const isFavorite = useCallback(
    (propertyId: string): boolean => {
      return user?.favorites?.includes(propertyId) || false;
    },
    [user]
  );

  const toggleFavorite = useCallback(
    async (propertyId: string) => {
      if (!user) throw new Error('Must be logged in to favorite');

      const isFav = user.favorites?.includes(propertyId);
      if (isFav) {
        await authService.removeFavorite(user.uid, propertyId);
      } else {
        await authService.addFavorite(user.uid, propertyId);
      }
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        login,
        register: registerUser,
        logout,
        updateProfile,
        refreshUser,
        isFavorite,
        toggleFavorite,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
