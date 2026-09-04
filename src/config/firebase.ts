import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
import { Platform } from 'react-native';

// Firebase config is loaded from environment variables (see .env / .env.example)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ─── App Check ────────────────────────────────────────────────────────────
// Protects Firestore/Storage from unauthenticated client abuse. Enforcement
// is enabled per API in the Firebase console (App Check → APIs) AFTER the
// reCAPTCHA site key is registered there — see docs/PRODUCTION_READINESS.md §4.1.
//
// Web: reCAPTCHA v3 (or Enterprise) provider, driven by env site keys.
// Native: the JS SDK has no Play Integrity / App Attest provider, so App Check
// in Expo Go is skipped — production iOS/Android builds need a dev build with
// `@react-native-firebase/app-check`. If enforcement is enabled for a platform
// with no provider, requests are denied, so never enable enforcement for
// platforms that don't mint tokens.
if (Platform.OS === 'web') {
  const enterpriseKey = process.env.EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const v3Key = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY;
  if (enterpriseKey || v3Key) {
    initializeAppCheck(app, {
      provider: enterpriseKey
        ? new ReCaptchaEnterpriseProvider(enterpriseKey)
        : new ReCaptchaV3Provider(v3Key as string),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (__DEV__) {
    console.info(
      '[app-check] No reCAPTCHA site key set — App Check disabled on web ' +
        '(add EXPO_PUBLIC_RECAPTCHA_SITE_KEY to .env to enable)'
    );
  }
} else if (__DEV__) {
  console.info(
    '[app-check] App Check on iOS/Android requires the native SDK ' +
      '(@react-native-firebase/app-check) — not active in Expo Go'
  );
}

export { app, auth, db, storage };
export default app;