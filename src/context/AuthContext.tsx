import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '../config/firebase';
import { User } from '../types';
import * as authService from '../services/authService';
import { USERS_COLLECTION } from '../utils/constants';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
    role?: 'buyer' | 'seller' | 'agent'
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

  // Real-time user data subscription
  useEffect(() => {
    if (!firebaseUser) return;

    const unsubscribe = onSnapshot(
      doc(db, USERS_COLLECTION, firebaseUser.uid),
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
      role: 'buyer' | 'seller' | 'agent' = 'buyer'
    ) => {
      await authService.register(email, password, displayName, role);
    },
    []
  );

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    setFirebaseUser(null);
  }, []);

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
