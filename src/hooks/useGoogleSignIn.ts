import { useState } from 'react';
import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import {
  signInWithGoogleWeb,
  signInWithGoogleIdToken,
} from '../services/authService';

export function useGoogleSignIn() {
  // Native (iOS/Android) flow exchanges an idToken from Google Sign-In.
  // On web we use the Firebase popup flow instead, which needs no client IDs.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  const [loading, setLoading] = useState(false);

  const signInWithGoogle = async (): Promise<void> => {
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
      // result.type === 'cancel' is a no-op
    } finally {
      setLoading(false);
    }
  };

  return { signInWithGoogle, loading, googleRequest: request, googleResponse: response };
}