import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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
  // storageBucket removed: Firebase Storage was replaced by Cloudinary
  // unsigned uploads (see src/services/storageService.ts).
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ─── App Check ────────────────────────────────────────────────────────────
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

// (The web SDK only exposes this global from its internal types, so it is
// re-declared here to keep strict mode happy.)
declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

if (Platform.OS === 'web') {
  // ─── App Check debug provider (DEVELOPMENT ONLY) ────────────────────────
  // reCAPTCHA v3 often rejects localhost / low-score requests, so App Check
  // answers with 403. Setting this global BEFORE initializeAppCheck() makes
  // the SDK mint a debug token instead of calling reCAPTCHA.
  //
  // A token is NOT trusted until it is registered for this web app in
  // Firebase Console → App Check → Apps → Manage debug tokens. Until then
  // the token exchange itself returns the 403 you see in the terminal.
  // Set EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN to a fixed, registered dev token to
  // keep it stable across browsers/profiles; otherwise the SDK generates one
  // and prints it on first run. SECURITY: debug mode is ignored when __DEV__
  // is false, so production builds always use the real provider below.
  if (__DEV__) {
    const configuredDebugToken =
      process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN?.trim();
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = configuredDebugToken || true;
    console.info(
      configuredDebugToken
        ? '[app-check] Using the debug token from EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN. '
          + 'It must be registered for this web app in Firebase Console → App Check → Apps.'
        : '[app-check] Debug provider enabled. Copy the "AppCheck debug token" printed '
          + 'by the SDK and register it once in Firebase Console → App Check → Apps → '
          + 'Manage debug tokens (or set EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN).'
    );
  }

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

// Create the service instances AFTER App Check initialization. The modular
// SDK resolves the App Check provider lazily, but keeping this order makes
// the requirement explicit and avoids surprises if a service starts a
// request during module evaluation.
const auth = getAuth(app);
const db = getFirestore(app);

/** Whether App Check tokens are being minted on this platform. */
export { appCheckActive };

export { app, auth, db };
export default app;