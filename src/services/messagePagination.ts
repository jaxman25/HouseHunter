/**
 * Pure message-pagination helpers for ChatScreen (no Firebase imports —
 * unit-tested in src/services/__tests__/messagePagination.test.js).
 *
 * ChatScreen keeps two slices of a thread:
 *   - `window`  — the live onSnapshot slice (newest `MESSAGE_WINDOW` docs);
 *   - `older`   — history pages fetched on scroll-up (30 at a time).
 * Both arrive ascending; these helpers keep them deduped, gapless, and
 * correctly ordered when rendered together.
 */

interface Identified {
  id: string;
}

interface Timed extends Identified {
  createdAt?: string;
}

/**
 * Messages that slid OUT of the live window (the top-30 slice moves up as
 * new messages arrive) — they must be absorbed into `older`, otherwise the
 * merged thread would show a hole between `older` and the new window.
 */
export function droppedFromWindow<T extends Identified>(
  prevWindow: T[],
  nextWindow: T[]
): T[] {
  const nextIds = new Set(nextWindow.map((m) => m.id));
  return prevWindow.filter((m) => !nextIds.has(m.id));
}

/** Append an incoming (ascending) page to `older`, deduped by id. */
export function appendOlder<T extends Identified>(older: T[], incoming: T[]): T[] {
  const seen = new Set(older.map((m) => m.id));
  const merged = [...older];
  for (const message of incoming) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    merged.push(message);
  }
  return merged;
}

/**
 * Merge every loaded slice into the rendered thread: dedupe by id (first
 * occurrence wins) then order ascending by `createdAt` (ISO strings sort
 * lexicographically), so out-of-order arrivals — a page fetched after the
 * window slid — still interleave correctly.
 */
export function mergeMessages<T extends Timed>(...parts: T[][]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const part of parts) {
    for (const message of part) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      merged.push(message);
    }
  }
  merged.sort((a, b) =>
    String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
  );
  return merged;
}

/**
 * Whether pagination should continue after a fetched page: a page that came
 * back full MAY have more history behind it; a short page is the end.
 */
export function pageHasMore(fetchedCount: number, pageSize: number): boolean {
  return fetchedCount === pageSize;
}
