/**
 * Scheduled Cloud Function — runs saved searches and notifies owners of new
 * matching listings.
 *
 * Runs daily at 03:00 UTC.  For each user with active saved searches where
 * `notificationFrequency` is daily or weekly:
 *
 *   1. Check cadence (lastRunAt older than 20 h for daily, 6 d for weekly).
 *   2. Execute the saved search's stored filters against `properties`.
 *   3. Exclude listings created before lastRunAt (only NEW matches).
 *   4. Write one notification doc per saved search per run.
 *   5. Send one aggregated Expo push per user per run (even if multiple
 *      saved searches matched).
 *   6. Update lastRunAt / lastNotifiedAt on the saved search doc.
 *
 * Deploy with:  firebase deploy --only functions
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  FieldValue,
  Timestamp,
} from 'firebase-admin/firestore';
import { executeSavedSearch } from './savedSearchFilters';

initializeApp();
const db = getFirestore();

// ─── Constants ─────────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
/** A daily search runs if lastRunAt is older than this. */
const DAILY_CADENCE_MS = 20 * HOUR_MS;
/** A weekly search runs if lastRunAt is older than this. */
const WEEKLY_CADENCE_MS = 6 * 24 * HOUR_MS;

/** Firestore batch commit limit (max 500 ops per batch). */
const BATCH_LIMIT = 500;
/** Max listing ids included in a notification payload. */
const MAX_LISTING_IDS = 10;

// ─── Types ─────────────────────────────────────────────────────────────────

interface SavedSearchDoc {
  name: string;
  filters: Record<string, unknown>;
  notificationFrequency: string;
  isActive: boolean;
  matchCount: number;
  newMatchCount: number;
  lastRunAt?: Timestamp;
  lastNotifiedAt?: Timestamp;
}

interface UserDoc {
  expoPushToken?: string;
  displayName?: string;
}

interface RunSummary {
  usersScanned: number;
  searchesRun: number;
  notificationsWritten: number;
  pushesSent: number;
  errors: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Returns true if the saved search is due for a run based on its cadence. */
function isDueForRun(search: SavedSearchDoc): boolean {
  if (!search.isActive) return false;
  if (search.notificationFrequency === 'instant') return false; // instant handled elsewhere

  const now = Date.now();
  const lastRun = search.lastRunAt?.toMillis?.() ?? 0;
  const elapsed = now - lastRun;

  switch (search.notificationFrequency) {
    case 'daily':
      return elapsed >= DAILY_CADENCE_MS;
    case 'weekly':
      return elapsed >= WEEKLY_CADENCE_MS;
    default:
      return false;
  }
}

/**
 * Send a batch of Expo push notifications via the push API.
 * Each message is { to: token, title, body, data, sound: 'default' }.
 * We fire them sequentially to avoid throttling; Expo handles batching.
 */
async function sendPushBatch(
  messages: {
    to: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }[]
): Promise<number> {
  if (messages.length === 0) return 0;

  const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

  let sent = 0;
  // Send in chunks of 100 (Expo batch limit)
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (res.ok) sent += chunk.length;
    } catch (err) {
      console.error('[runSavedSearches] push batch failed:', err);
    }
  }
  return sent;
}

// ─── Main Function ─────────────────────────────────────────────────────────

export const runSavedSearches = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'UTC',
  },
  async () => {
    const summary: RunSummary = {
      usersScanned: 0,
      searchesRun: 0,
      notificationsWritten: 0,
      pushesSent: 0,
      errors: 0,
    };

    const now = Timestamp.now();

    // Paginate through all users who have saved searches.
    // Firestore collectionGroup queries would be ideal but savedSearches is
    // a subcollection — we iterate users instead (users without saved searches
    // are skipped quickly).
    let lastUserId: string | undefined;

    while (true) {
      // Fetch a page of users (paginate by document id).
      let usersQuery = db
        .collection('users')
        .orderBy('__name__')
        .limit(100);
      if (lastUserId) {
        usersQuery = usersQuery.startAfter(lastUserId);
      }
      const usersSnap = await usersQuery.get();
      if (usersSnap.empty) break;

      // Batch writer for this page of users.
      let batch = db.batch();
      let batchOps = 0;

      // Per-user push aggregation: userId → { token, searches[] }
      const pushQueue: Map<
        string,
        { token: string; searches: { name: string; count: number }[] }
      > = new Map();

      for (const userDoc of usersSnap.docs) {
        summary.usersScanned++;
        const uid = userDoc.id;
        const userData = userDoc.data() as UserDoc;

        // Fetch this user's saved searches.
        const searchesSnap = await db
          .collection('users')
          .doc(uid)
          .collection('savedSearches')
          .where('isActive', '==', true)
          .where('notificationFrequency', 'in', ['daily', 'weekly'])
          .get();

        if (searchesSnap.empty) continue;

        // Determine which searches are due for a run.
        const dueSearches = searchesSnap.docs.filter((doc) => {
          const data = doc.data() as SavedSearchDoc;
          return isDueForRun(data);
        });

        if (dueSearches.length === 0) continue;

        const userPushMatches: { name: string; count: number }[] = [];

        for (const searchDoc of dueSearches) {
          summary.searchesRun++;
          const searchData = searchDoc.data() as SavedSearchDoc;

          try {
            // Build the filter from the saved search's stored filters.
            const filters = (searchData.filters ?? {}) as Record<string, unknown>;

            // The since cutoff: only match listings created after the last run.
            const since = searchData.lastRunAt ?? Timestamp.fromMillis(0);

            const result = await executeSavedSearch(filters as never, since);

            if (result.count === 0) continue;

            // Write notification doc to top-level notifications collection
            // (matches existing pattern: archive.ts, tours.ts, index.ts).
            const topIds = result.ids.slice(0, MAX_LISTING_IDS);
            const notificationRef = db.collection('notifications').doc();

            batch.set(notificationRef, {
              userId: uid,
              title: 'New listings match your search',
              body: `${result.count} new listing${result.count > 1 ? 's' : ''} match "${searchData.name}"`,
              type: 'new_listing',
              data: {
                savedSearchId: searchDoc.id,
                savedSearchName: searchData.name,
                matchCount: String(result.count),
                listingIds: topIds.join(','),
              },
              read: false,
              createdAt: FieldValue.serverTimestamp(),
            });
            batchOps++;
            summary.notificationsWritten++;

            // Update the saved search doc with run timestamps.
            batch.update(searchDoc.ref, {
              lastRunAt: FieldValue.serverTimestamp(),
              lastNotifiedAt: FieldValue.serverTimestamp(),
              matchCount: result.count,
              updatedAt: FieldValue.serverTimestamp(),
            });
            batchOps++;

            userPushMatches.push({ name: searchData.name, count: result.count });
          } catch (err) {
            summary.errors++;
            console.error(
              `[runSavedSearches] error processing search ${searchDoc.id} for user ${uid}:`,
              err
            );
            // Still update lastRunAt so we don't re-run a broken search forever.
            try {
              batch.update(searchDoc.ref, {
                lastRunAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              });
              batchOps++;
            } catch {
              // Best-effort; batch may have been committed already.
            }
          }
        }

        // Queue push notification for this user (aggregated across searches).
        if (userPushMatches.length > 0 && userData.expoPushToken) {
          const totalMatches = userPushMatches.reduce((s, m) => s + m.count, 0);
          pushQueue.set(uid, {
            token: userData.expoPushToken,
            searches: userPushMatches,
          });
          // We'll send the push after committing the batch so the notification
          // doc exists when the user taps the push.
        }

        // Commit the batch if approaching the limit.
        if (batchOps >= BATCH_LIMIT - 10) {
          await batch.commit();
          batch = db.batch();
          batchOps = 0;
        }
      }

      // Commit any remaining writes for this page.
      if (batchOps > 0) {
        await batch.commit();
      }

      // Send aggregated push notifications for this page of users.
      const pushMessages: {
        to: string;
        title: string;
        body: string;
        data: Record<string, string>;
      }[] = [];
      for (const [, { token, searches }] of pushQueue) {
        const totalMatches = searches.reduce((s, m) => s + m.count, 0);
        const searchNames = searches.map((s) => s.name).join(', ');
        pushMessages.push({
          to: token,
          title: `${totalMatches} new listing${totalMatches > 1 ? 's' : ''} found`,
          body: `Your saved searches (${searchNames}) have new matches.`,
          data: { type: 'new_listing' },
        });
      }
      summary.pushesSent += await sendPushBatch(pushMessages);

      // Advance pagination cursor.
      lastUserId = usersSnap.docs[usersSnap.docs.length - 1].id;

      // If fewer than a full page, we've reached the end.
      if (usersSnap.docs.length < 100) break;
    }

    console.log(
      `[runSavedSearches] complete —`,
      JSON.stringify(summary)
    );
  }
);
