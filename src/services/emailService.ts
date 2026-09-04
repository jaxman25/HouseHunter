import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../config/firebase';

let functionsInstance: ReturnType<typeof getFunctions> | null = null;

function getFunctionsInstance() {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app);
  }
  return functionsInstance;
}

/**
 * Ask the backend to email the signed-in user a confirmation that their
 * account and data were deleted (functions/src/index.ts →
 * `sendAccountDeletionConfirmation`).
 *
 * Must be called BEFORE the Firebase Auth account is deleted — the callable
 * authenticates with the still-valid session token and sends only to the
 * email on that token (never caller-supplied), so it cannot be abused as a
 * relay. Returns true when the email was dispatched.
 *
 * Best-effort: throws when the function is unreachable (e.g. not deployed),
 * and the caller decides whether that should block deletion (it should not).
 */
export async function sendAccountDeletionConfirmationEmail(): Promise<boolean> {
  const callable = httpsCallable(getFunctionsInstance(), 'sendAccountDeletionConfirmation');
  const result = await callable();
  const data = result.data as { ok?: boolean } | undefined;
  return data?.ok === true;
}
