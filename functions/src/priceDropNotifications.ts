/**
 * Price-drop notification producer.
 *
 * Triggered whenever a property document is updated. If the new price is lower
 * than the old price, we query every user whose `favorites` array contains
 * this property ID and create an in-app `price_drop` notification for each
 * (respecting their notification preferences and global pause).
 *
 * Deploy with:  firebase deploy --only functions
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

/** Default prefs for legacy users who haven't set notificationPrefs. */
const DEFAULT_PREFS = {
  message: true,
  inquiry: true,
  price_drop: true,
  new_listing: true,
  favorite: true,
  system: true,
};

export const notifyOnPriceDrop = onDocumentUpdated(
  'properties/{propertyId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only fire when the price actually decreased.
    const oldPrice = before.price as number | undefined;
    const newPrice = after.price as number | undefined;
    if (
      oldPrice == null ||
      newPrice == null ||
      newPrice >= oldPrice
    ) {
      return;
    }

    const propertyId = event.params.propertyId;
    const title = after.title as string ?? 'A listing';
    const city = after.city as string ?? '';

    // Find every user who has this property in their favorites array.
    const usersSnap = await db
      .collection('users')
      .where('favorites', 'array-contains', propertyId)
      .get();

    if (usersSnap.empty) return;

    const discount = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
    const body = `Price dropped ${discount}% on "${title}"${city ? ` in ${city}` : ''} — now $${newPrice.toLocaleString()}`;

    // Write notifications in batches (Firestore batch cap is 500).
    const writes: Promise<void>[] = [];
    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data();

      // Respect global pause.
      if (userData.notificationsPaused === true) continue;

      // Respect per-type toggle (legacy users default to all-on).
      const prefs = userData.notificationPrefs ?? DEFAULT_PREFS;
      if (prefs.price_drop === false) continue;

      writes.push(
        db
          .collection('notifications')
          .add({
            userId: uid,
            title: 'Price drop',
            body,
            type: 'price_drop',
            data: { propertyId },
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          })
          .then(() => {})
          .catch((err) => {
            console.error(`[priceDrop] notification for ${uid} failed:`, err);
          })
      );
    }

    await Promise.allSettled(writes);

    // Also send a push notification if the user has an expo push token.
    // Fire-and-forget: push failures should not block the in-app writes.
    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data();
      const pushToken = userData.expoPushToken as string | undefined;
      if (!pushToken) continue;
      if (userData.notificationsPaused === true) continue;
      const prefs = userData.notificationPrefs ?? DEFAULT_PREFS;
      if (prefs.price_drop === false) continue;

      // Best-effort Expo push (requires the Expo access token env var).
      // The push is non-critical; failures are silently logged.
      void sendExpoPush(pushToken, 'Price drop', body, { propertyId }).catch(
        () => {}
      );
    }
  }
);

/**
 * Best-effort Expo push notification. Uses the Expo HTTP v2 API.
 * Requires EXPO_ACCESS_TOKEN in the function's environment.
 */
async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<void> {
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (!accessToken) return; // not configured — skip silently

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      to: token,
      title,
      body,
      data,
      sound: 'default',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Expo push failed (${response.status}): ${text}`);
  }
}
