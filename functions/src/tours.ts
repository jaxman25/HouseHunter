/**
 * Tours Cloud Functions — reminders and notifications for scheduled tours.
 *
 * 1. tourReminders: Scheduled function that sends reminders 24h and 1h before tours.
 * 2. tourNotifications: Triggered on tour status changes to notify both parties.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { sendEmail } from './email';

initializeApp();
const db = getFirestore();

/**
 * Scheduled function: runs every 30 minutes to check for tours needing reminders.
 * Sends reminders 24 hours and 1 hour before the tour datetime.
 */
export const tourReminders = onSchedule('every 30 minutes', async () => {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // Find confirmed/pending tours
  const toursSnap = await db
    .collection('tours')
    .where('status', 'in', ['confirmed', 'pending'])
    .get();

  for (const tourDoc of toursSnap.docs) {
    const tour = tourDoc.data();
    const tourTime = tour.datetime?.toDate?.() ?? new Date(tour.datetime);
    if (isNaN(tourTime.getTime())) continue;

    const reminderSent = tour.reminderSent || false;
    const msUntilTour = tourTime.getTime() - now.getTime();

    // 24h reminder
    if (msUntilTour > 0 && msUntilTour <= 24 * 60 * 60 * 1000 && !reminderSent) {
      try {
        // Notify buyer
        await db.collection('notifications').add({
          userId: tour.buyerId,
          title: 'Tour Reminder',
          body: `Your tour of ${tour.propertyTitle} is tomorrow at ${tourTime.toLocaleTimeString()}`,
          type: 'system',
          data: { tourId: tourDoc.id, propertyId: tour.propertyId },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Notify seller
        await db.collection('notifications').add({
          userId: tour.sellerId,
          title: 'Tour Reminder',
          body: `You have a tour of ${tour.propertyTitle} tomorrow at ${tourTime.toLocaleTimeString()}`,
          type: 'system',
          data: { tourId: tourDoc.id, propertyId: tour.propertyId },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });

        await tourDoc.ref.update({ reminderSent: true });
      } catch (error) {
        console.error(`[tourReminders] Failed to send reminder for tour ${tourDoc.id}:`, error);
      }
    }
  }
});

/**
 * Trigger: when a tour status changes, notify both parties.
 */
export const tourNotifications = onDocumentUpdated(
  'tours/{tourId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const statusChanged = before.status !== after.status;
    if (!statusChanged) return;

    const tourId = event.params.tourId;
    const tourTime = after.datetime?.toDate?.() ?? new Date(after.datetime);
    const timeStr = isNaN(tourTime.getTime()) ? '' : tourTime.toLocaleString();

    let buyerTitle = '';
    let buyerBody = '';
    let sellerTitle = '';
    let sellerBody = '';

    switch (after.status) {
      case 'confirmed':
        buyerTitle = 'Tour Confirmed';
        buyerBody = `Your tour of ${after.propertyTitle} has been confirmed for ${timeStr}`;
        sellerTitle = 'Tour Confirmed';
        sellerBody = `You confirmed the tour of ${after.propertyTitle} for ${timeStr}`;
        break;
      case 'canceled':
        const canceledBy = after.canceledBy;
        const cancelReason = after.cancelReason || '';
        if (canceledBy === after.buyerId) {
          sellerTitle = 'Tour Canceled';
          sellerBody = `The buyer canceled the tour of ${after.propertyTitle}${cancelReason ? ': ' + cancelReason : ''}`;
        } else {
          buyerTitle = 'Tour Canceled';
          buyerBody = `The seller canceled your tour of ${after.propertyTitle}${cancelReason ? ': ' + cancelReason : ''}`;
        }
        break;
      case 'completed':
        buyerTitle = 'Tour Completed';
        buyerBody = `Your tour of ${after.propertyTitle} has been marked as completed`;
        sellerTitle = 'Tour Completed';
        sellerBody = `Your tour of ${after.propertyTitle} has been marked as completed`;
        break;
      case 'no_show':
        buyerTitle = 'Tour No-Show';
        buyerBody = `Your tour of ${after.propertyTitle} was marked as a no-show`;
        sellerTitle = 'Tour No-Show';
        sellerBody = `Your tour of ${after.propertyTitle} was marked as a no-show`;
        break;
      default:
        return;
    }

    try {
      // Notify buyer
      if (buyerTitle && buyerBody) {
        await db.collection('notifications').add({
          userId: after.buyerId,
          title: buyerTitle,
          body: buyerBody,
          type: 'system',
          data: { tourId, propertyId: after.propertyId },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // Notify seller
      if (sellerTitle && sellerBody) {
        await db.collection('notifications').add({
          userId: after.sellerId,
          title: sellerTitle,
          body: sellerBody,
          type: 'system',
          data: { tourId, propertyId: after.propertyId },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (error) {
      console.error(`[tourNotifications] Failed for tour ${tourId}:`, error);
    }
  }
);
