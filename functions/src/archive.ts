/**
 * Auto-archive job — closes out stale listings on a schedule.
 *
 * Runs daily at 02:00 (scheduler). A listing becomes an archive candidate
 * once it has sat in a closing state past its window:
 *
 *   sold / rented  → after 30 days  (anchored on soldDate, else updatedAt)
 *   pending        → after 60 days  (anchored on pendingDate, else updatedAt)
 *   inactive       → after 90 days  (anchored on updatedAt)
 *
 * Archiving is a soft-hide: `archived = true` + `archiveReason`, which the
 * app treats as permanently hidden from default browse (status is already
 * non-active). Sellers get an in-app notification for each archived listing.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

const DAY_MS = 24 * 60 * 60 * 1000;

interface ArchiveRule {
  statuses: string[];
  days: number;
  /** Field anchoring the window start (falls back to updatedAt). */
  anchorField?: string;
}

const RULES: ArchiveRule[] = [
  { statuses: ['sold', 'rented'], days: 30, anchorField: 'soldDate' },
  { statuses: ['pending'], days: 60, anchorField: 'pendingDate' },
  { statuses: ['inactive'], days: 90 },
];

export const autoArchiveProperties = onSchedule(
  'every day 02:00',
  async () => {
    const candidates: {
      ref: FirebaseFirestore.DocumentReference;
      data: Record<string, unknown>;
      reason: string;
    }[] = [];

    for (const rule of RULES) {
      const snap = await db
        .collection('properties')
        .where('status', 'in', rule.statuses)
        .get();
      const cutoff = Date.now() - rule.days * DAY_MS;

      for (const doc of snap.docs) {
        const data = doc.data() ?? {};
        if (data.archived === true) continue;

        const anchor =
          rule.anchorField && data[rule.anchorField]
            ? new Date(String(data[rule.anchorField])).getTime()
            : undefined;
        const anchorTime =
          anchor ?? (data.updatedAt ? new Date(String(data.updatedAt)).getTime() : Date.now());
        // A missing anchor means we cannot age the listing — treat as due so
        // stale closings never linger forever.
        if (anchorTime > cutoff) continue;

        candidates.push({
          ref: doc.ref,
          data,
          reason: rule.statuses[0],
        });
      }
    }

    if (candidates.length === 0) {
      console.log('[auto-archive] no candidates');
      return;
    }

    const now = new Date().toISOString();
    let writes = 0;
    let batch = db.batch();
    let archivedCount = 0;

    for (const candidate of candidates) {
      batch.update(candidate.ref, {
        archived: true,
        archivedAt: now,
        archiveReason: candidate.reason,
        expirationDate: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      // In-app notification to the seller (channel mirrors the app's
      // notifications collection; server writes bypass client rules).
      batch.set(db.collection('notifications').doc(), {
        userId: candidate.data.userId,
        title: 'Listing archived',
        body: `Your listing "${candidate.data.title ?? '…'}" was archived after closing. You can restore it from My Listings.`,
        type: 'system',
        data: { propertyId: candidate.ref.id },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      writes += 2;
      archivedCount += 1;
      if (writes >= 400) {
        await batch.commit();
        batch = db.batch();
        writes = 0;
      }
    }
    if (writes > 0) await batch.commit();

    console.log(`[auto-archive] archived ${archivedCount} properties`);
  }
);