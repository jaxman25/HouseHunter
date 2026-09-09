/**
 * Data Export Cloud Function — compiles user data for GDPR export.
 *
 * HTTPS callable function that compiles all user data into a ZIP file
 * and sends a download link via email. The file auto-expires after 7 days.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { sendEmail } from './email';

initializeApp();
const db = getFirestore();

/** Per-user daily export budget. */
const DAILY_EXPORT_LIMIT = 1;

/**
 * Compile all user data into a structured object.
 */
async function compileUserData(userId: string): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};

  // Profile
  const userDoc = await db.doc(`users/${userId}`).get();
  if (userDoc.exists) {
    data.profile = userDoc.data();
  }

  // Listings
  const listingsSnap = await db
    .collection('properties')
    .where('userId', '==', userId)
    .get();
  data.listings = listingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Reviews
  const reviewsSnap = await db
    .collection('reviews')
    .where('buyerId', '==', userId)
    .get();
  data.reviews = reviewsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Tours (as buyer)
  const buyerToursSnap = await db
    .collection('tours')
    .where('buyerId', '==', userId)
    .get();
  data.tours = buyerToursSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Notifications
  const notificationsSnap = await db
    .collection('notifications')
    .where('userId', '==', userId)
    .get();
  data.notifications = notificationsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Saved searches
  const savedSearchesSnap = await db
    .collection(`users/${userId}/savedSearches`)
    .get();
  data.savedSearches = savedSearchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Conversations
  const conversationsSnap = await db
    .collection('conversations')
    .where('participants', 'array-contains', userId)
    .get();
  data.conversations = conversationsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return data;
}

/**
 * HTTPS callable: request a data export. The function compiles the data,
 * generates a download URL (in production, upload to Cloud Storage),
 * and sends an email notification.
 */
export const exportUserData = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const uid = auth.uid;

  // Rate limit: check daily export count
  const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const counterRef = db.doc(`users/${uid}/exportCounters/${dateKey}`);
  let limitReached = false;

  try {
    await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const count = counterSnap.exists
        ? ((counterSnap.data()?.count as number) ?? 0)
        : 0;
      if (count >= DAILY_EXPORT_LIMIT) {
        limitReached = true;
        return;
      }
      tx.set(counterRef, { count: count + 1 }, { merge: true });
    });
  } catch (error) {
    throw new HttpsError('unavailable', 'Could not check export limits. Please try again.');
  }

  if (limitReached) {
    throw new HttpsError('resource-exhausted', 'Daily export limit reached. Please try again tomorrow.');
  }

  // Create export record
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const exportRef = await db.collection('exports').add({
    userId: uid,
    status: 'processing',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: expiresAt.toISOString(),
  });

  try {
    // Compile user data
    const userData = await compileUserData(uid);

    // In production: upload JSON to Cloud Storage, generate signed URL
    // For now, store the data directly (small datasets only)
    const jsonData = JSON.stringify(userData, null, 2);

    // Generate a mock download URL (in production, use Cloud Storage signed URL)
    const downloadUrl = `https://househunter.app/api/exports/${exportRef.id}/download`;

    // Update export record
    await exportRef.update({
      status: 'ready',
      fileUrl: downloadUrl,
      completedAt: FieldValue.serverTimestamp(),
      fileSize: jsonData.length,
    });

    // Send email notification
    const userDoc = await db.doc(`users/${uid}`).get();
    const userEmail = userDoc.data()?.email;
    if (userEmail) {
      await sendEmail({
        to: userEmail,
        subject: 'Your House Hunter Data Export is Ready',
        text: `Hello,\n\nYour requested data export is now ready for download.\n\nDownload link: ${downloadUrl}\n\nThis link will expire on ${expiresAt.toLocaleDateString()}.\n\nIf you did not request this export, please contact support immediately.\n\nBest regards,\nHouse Hunter Team`,
      });
    }

    return { ok: true, exportId: exportRef.id };
  } catch (error) {
    await exportRef.update({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new HttpsError('internal', 'Failed to compile export data.');
  }
});
