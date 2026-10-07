/**
 * House Hunter — view-count tracking (Firebase Cloud Functions v2).
 *
 * The client records a counted view as a create-only document
 * `properties/{propertyId}/viewEvents/{uid}_{yyyy-mm-dd}` (UTC day; see
 * `recordViewEvent` in src/services/propertyService.ts and the `viewEvents`
 * rule in firestore.rules). This trigger turns each ACCEPTED event into
 * exactly one `views` +1 on the parent property.
 *
 * Anti-abuse — an event only counts when ALL of the following hold:
 *   1. the doc-id is exactly `{uid}_{yyyy-mm-dd}` (rules also enforce this
 *      against `request.auth.uid`, but the Admin SDK bypasses rules, so the
 *      check is repeated here — console/SDK writes cannot sneak past it);
 *   2. the day in the id equals the day (UTC) the event was created, so
 *      pre-forged or stale ids (`uid_2099-01-01`) never count;
 *   3. the payload `userId` matches the id's `{uid}` prefix;
 *   4. the parent property still exists.
 * Combined with rules' create-only semantics, counting is capped at one
 * increment per user per property per UTC day.
 *
 * `views` grows only via `FieldValue.increment(1)` — a pure +1 per accepted
 * event that serializes correctly under concurrent triggers (no blind
 * read-modify-write).
 *
 * Failures are logged and deliberately NOT retried: a retry could
 * double-count if the first attempt actually committed, and dropping one
 * view is the safer error for a seller-facing metric.
 *
 * Deploy with: firebase deploy --only functions
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { viewEventShouldCount } from './viewEventsGuard';

const db = getFirestore();

/**
 * Trigger — a view event was created. Validates the `uid_yyyy-mm-dd` doc-id
 * against the event's own timestamp and the payload's `userId`, then bumps
 * the parent property's `views` by +1.
 */
export const countViewEvent = onDocumentCreated(
  'properties/{propertyId}/viewEvents/{eventId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { propertyId, eventId } = event.params;

    // Validate doc-id + payload + event-time day (pure helper — unit-tested
    // in functions/test/viewEventsGuard.test.js).
    const verdict = viewEventShouldCount(
      eventId,
      (snap.data() as { userId?: unknown }).userId,
      event.time
    );
    if (!verdict.count) {
      console.warn(
        `[countViewEvent] ${propertyId}/${eventId} not counted: ${verdict.reason}`
      );
      return;
    }

    const propertyRef = db.collection('properties').doc(propertyId);
    const propertySnap = await propertyRef.get();
    if (!propertySnap.exists) {
      // Property deleted between the client's write and this trigger — the
      // event is orphaned and counts nothing.
      console.warn(
        `[countViewEvent] property ${propertyId} vanished; leaving event ${eventId} in place`
      );
      return;
    }

    try {
      await propertyRef.update({
        views: FieldValue.increment(1),
      });
    } catch (error) {
      console.error(
        `[countViewEvent] failed to bump views on ${propertyId}:`,
        error
      );
    }
  }
);
