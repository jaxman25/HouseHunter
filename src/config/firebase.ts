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
const storage = getStorage(app);// ─── App Check ────────────────────────────────────────────────────────────
// SECURITY: App Check protects Firestore and Storage from unauthenticated
// client abuse (script kiddies, cost attacks, data exfiltration).
//
// IMPORTANT: Initialization alone does NOT enforce anything. You must also
// enable enforcement in the Firebase console:
//   Firebase Console → App Check → APIs → Enable for Firestore & Storage
//
// Web: reCAPTCHA v3 or Enterprise provider (env site keys).
// Native: requires @react-native-firebase/app-check with Play Integrity
//   (Android) or App Attest (iOS) — not available in Expo Go.
//   Production builds MUST use a dev client, not Expo Go.
//
// If enforcement is enabled for a platform with no provider, all requests
// from that platform are DENIED. Never enable enforcement until providers
// are active on all target platforms.

let appCheckActive = false;

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
    appCheckActive = true;
  } else if (__DEV__) {
    console.warn(
      '[app-check] ⚠️  SECURITY: App Check is NOT active on web. '
        + 'Firestore and Storage are unprotected. '
        + 'Set EXPO_PUBLIC_RECAPTCHA_SITE_KEY in .env and enable '
        + 'enforcement in Firebase Console → App Check → APIs.'
    );
  } else {
    console.error(
      '[app-check] 🚨 CRITICAL: App Check is NOT active in production! '
        + 'Firestore and Storage are vulnerable to unauthenticated abuse. '
        + 'Set EXPO_PUBLIC_RECAPTCHA_SITE_KEY and enable enforcement NOW.'
    );
  }
} else if (__DEV__) {
  console.info(
    '[app-check] App Check on iOS/Android requires the native SDK '
      + '(@react-native-firebase/app-check) — not active in Expo Go. '
      + 'Use a dev build for production testing.'
  );
} else {
  // Production native build without App Check — log loudly.
  console.error(
    '[app-check] 🚨 WARNING: App Check is not initialized on native. '
      + 'If enforcement is enabled in the console, all requests will fail. '
      + 'Ensure @react-native-firebase/app-check is configured.'
  );
}

/** Whether App Check tokens are being minted on this platform. */
export { appCheckActive };

export { app, auth, db, storage };
export default app;