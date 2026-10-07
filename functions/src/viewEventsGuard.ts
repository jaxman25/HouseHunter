/**
 * Pure validation for view-event counting (no Firebase imports — so it can be
 * unit-tested directly in functions/test/viewEventsGuard.test.js).
 *
 * An event `properties/{propertyId}/viewEvents/{eventId}` only increments the
 * parent's `views` when the doc-id, payload, and event time agree:
 *
 *   1. `{eventId}` is exactly `{uid}_{yyyy-mm-dd}` (exactly one underscore —
 *      uids containing `_` fail closed, matching the firestore.rules
 *      `split('_')` shape check);
 *   2. the day in the id equals the day (UTC) the event was created, so
 *      pre-forged or stale ids (`uid_2099-01-01`) never count;
 *   3. the payload `userId` equals the id's `{uid}` prefix.
 *
 * Combined with rules' create-only semantics (one doc id per user per
 * property per UTC day), this caps counting at one +1 per user per property
 * per day. Kept in sync with `viewEventIsValid()` in firestore.rules — the
 * rules gate client writes, this guards the Admin-SDK-triggered increment
 * (which bypasses rules entirely).
 */

/** Exactly `{uid}_{yyyy-mm-dd}`. */
const EVENT_ID_PATTERN = /^([^_]+)_(\d{4}-\d{2}-\d{2})$/;

export interface ViewEventVerdict {
  /** Whether the event may increment the parent property's `views`. */
  count: boolean;
  /** Human-readable explanation when `count` is false (logged by the trigger). */
  reason?: string;
}

const ACCEPTED: ViewEventVerdict = { count: true };

/**
 * Decide whether a created view-event document should be counted.
 *
 * @param eventId Doc id — `{uid}_{yyyy-mm-dd}`.
 * @param payloadUserId The event doc's `userId` field (must equal the id's
 *                      `{uid}` prefix; non-strings never count).
 * @param eventTimeIso The create event's timestamp (RFC3339/ISO-8601 —
 *                     `CloudEvent.time` in the v2 trigger; any offset is
 *                     normalized to UTC before extracting the day).
 */
export function viewEventShouldCount(
  eventId: string,
  payloadUserId: unknown,
  eventTimeIso: string
): ViewEventVerdict {
  const match = EVENT_ID_PATTERN.exec(eventId);
  if (!match) {
    return { count: false, reason: `malformed event id "${eventId}"` };
  }
  const [, idUid, idDay] = match;

  const eventDate = new Date(eventTimeIso);
  if (Number.isNaN(eventDate.getTime())) {
    return { count: false, reason: `unparseable event time "${eventTimeIso}"` };
  }
  const createdDay = eventDate.toISOString().slice(0, 10);
  if (idDay !== createdDay) {
    return {
      count: false,
      reason: `event ${eventId} was not created on ${createdDay}`,
    };
  }

  if (payloadUserId !== idUid) {
    return {
      count: false,
      reason: `event ${eventId} payload userId ${JSON.stringify(
        payloadUserId
      )} does not match id uid "${idUid}"`,
    };
  }

  return ACCEPTED;
}
