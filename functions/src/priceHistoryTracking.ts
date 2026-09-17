/**
 * Server-side price history tracking.
 *
 * Triggered whenever a property document is updated. If the price changed,
 * appends a history entry to the properties/{id}/priceHistory subcollection.
 *
 * This replaces the previous client-side write (which was in the same batch as
 * the property edit). The server-side approach is more reliable because it
 * cannot be skipped by misbehaving clients and always records the change
 * regardless of which field was edited.
 *
 * Deploy with:  firebase deploy --only functions
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

export const trackPriceHistory = onDocumentUpdated(
  'properties/{propertyId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const oldPrice = before.price as number | undefined;
    const newPrice = after.price as number | undefined;

    // Only record when the price actually changed.
    if (
      oldPrice == null ||
      newPrice == null ||
      newPrice === oldPrice
    ) {
      return;
    }

    const propertyId = event.params.propertyId;

    // Write a history entry to the subcollection.
    await db
      .collection(`properties/${propertyId}/priceHistory`)
      .add({
        price: newPrice,
        previousPrice: oldPrice,
        changedAt: FieldValue.serverTimestamp(),
        // The userId who performed the edit is on the property doc itself.
        changedBy: after.userId ?? 'unknown',
      })
      .catch((err) => {
        console.error(
          `[priceHistory] failed to record history for ${propertyId}:`,
          err
        );
      });
  }
);
