import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import {
  ensureGoogleWebPersistence,
  signInWithGoogleWeb,
  signInWithGoogleIdToken,
} from '../services/authService';

/** Firebase error codes that mean the user cancelled the popup on purpose. */
const CANCELLED_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]);

interface CodedError extends Error {
  code?: string;
}

function errorCode(error: unknown): string {
  return (error as { code?: string } | null)?.code ?? '';
}

/** Current browser host (with port), used for popup-permission messages. */
function currentHost(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'this site';
  return window.location.host;
}

/** Hostname only (no port), matching Firebase's Authorized domains entries. */
function currentDomain(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'this domain';
  return window.location.hostname;
}

/**
 * Turn a Firebase/Google error into a message a user can act on.
 *
 * Raw SDK errors ("FirebaseError: …") are not shown to users; the Firebase
 * error code is preserved on the returned Error for callers/logging, and is
 * logged in development (never tokens, emails, or passwords).
 */
function describeGoogleSignInError(error: unknown): CodedError {
  const code = errorCode(error);
  const host = currentHost();
  const domain = currentDomain();
  let message: string;

  switch (code) {
    case 'auth/popup-blocked':
      message =
        `Your browser blocked the Google sign-in popup. Allow popups for ${host} and try again.`;
      break;
    case 'auth/unauthorized-domain':
      message =
        `${domain} is not an authorized domain for Google sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.`;
      break;
    case 'auth/operation-not-allowed':
      message =
        'Google sign-in is not enabled for this Firebase project. Enable Google under Authentication → Sign-in method.';
      break;
    case 'auth/account-exists-with-different-credential':
      message =
        'An account with this email already exists. Sign in with your email and password instead.';
      break;
    case 'auth/network-request-failed':
      message = 'Network error. Check your internet connection and try again.';
      break;
    case 'auth/too-many-requests':
      message = 'Too many attempts. Please wait a moment and try again.';
      break;
    case 'auth/api-key-not-valid':
    case 'auth/invalid-api-key':
    case 'auth/configuration-not-found':
    case 'auth/internal-error':
      message =
        'Firebase rejected the sign-in configuration. Check the Firebase API key and Google provider settings.';
      break;
    default:
      if (error instanceof Error && error.name === 'TimeoutError') {
        message = error.message;
      } else if (error instanceof Error && !code && error.message) {
        // Errors raised by this hook (e.g. missing native client IDs).
        message = error.message;
      } else {
        message = 'Google sign-in failed. Please try again.';
      }
      break;
  }

  if (__DEV__ && code) {
    // Codes only — never tokens, emails, or passwords.
    console.warn('[google-signin] Firebase error code:', code);
  }

  const friendly = new Error(message) as CodedError;
  if (code) friendly.code = code;
  return friendly;
}

export function useGoogleSignIn() {
  // Native (iOS/Android) flow exchanges an idToken from Google Sign-In.
  // On web we use the Firebase popup flow instead, which needs no client IDs.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  const [loading, setLoading] = useState(false);
  // A ref (not the state flag) guards against a second tap that fires before
  // React re-renders the button as disabled/loading.
  const inFlight = useRef(false);

  // Configure web persistence on mount — never inside the click handler, so
  // the popup is opened while the browser's user activation is still valid.
  useEffect(() => {
    if (Platform.OS === 'web') void ensureGoogleWebPersistence();
  }, []);

  const signInWithGoogle = async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        await signInWithGoogleWeb();
        return;
      }

      if (!request) {
        throw new Error(
          'Google sign-in is not configured. Add your Google client IDs to .env.'
        );
      }

      const result = await promptAsync();
      if (result.type === 'success' && result.params?.id_token) {
        await signInWithGoogleIdToken(result.params.id_token);
      } else if (result.type === 'error') {
        throw new Error(
          result.error?.message || 'Google sign-in failed. Please try again.'
        );
      }
      // result.type === 'cancel' is a no-op.
    } catch (error) {
      // Closing the popup is a deliberate user action, not an error. Do not
      // show an error banner (and never retry — a retry would reopen it).
      if (CANCELLED_CODES.has(errorCode(error))) return;
      throw describeGoogleSignInError(error);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return { signInWithGoogle, loading, googleRequest: request, googleResponse: response };
}
