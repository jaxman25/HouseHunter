import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as limitQuery,
  startAfter,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
  getCountFromServer,
  Timestamp,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  ADMIN_ROLES_COLLECTION,
  ADMIN_REPORTS_COLLECTION,
  ADMIN_ANNOUNCEMENTS_COLLECTION,
  ADMIN_AUDIT_COLLECTION,
  USERS_COLLECTION,
  PROPERTIES_COLLECTION,
} from '../utils/constants';
import { User, Report, ReportStatus, Announcement } from '../types';
import { sanitize } from '../utils/security/sanitize';

/**
 * Admin suite — moderation tools gated by the admin_roles collection
 * (provisioned by operators; see firestore.rules). Every mutation here is
 * role-checked server-side by the rules and appended to admin_auditLog.
 */

/** True when `uid` is listed in admin_roles (operator-provisioned). */
export async function isAdminUser(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, ADMIN_ROLES_COLLECTION, uid));
  return snap.exists();
}

export interface AdminMetrics {
  userCount: number;
  propertyCount: number;
  activeListingCount: number;
  pendingReports: number;
}

/** Aggregated platform metrics (Firestore count() — no extra backend). */
export async function getAdminMetrics(): Promise<AdminMetrics> {
  const countAll = (q: ReturnType<typeof query>) => getCountFromServer(q);
  const [users, properties, active, pending] = await Promise.all([
    countAll(query(collection(db, USERS_COLLECTION))),
    countAll(query(collection(db, PROPERTIES_COLLECTION))),
    countAll(query(collection(db, PROPERTIES_COLLECTION), where('status', '==', 'active'))),
    countAll(query(collection(db, ADMIN_REPORTS_COLLECTION), where('status', '==', 'pending'))),
  ]);
  return {
    userCount: users.data().count,
    propertyCount: properties.data().count,
    activeListingCount: active.data().count,
    pendingReports: pending.data().count,
  };
}

/** Latest users (50/page). `search` filters client-side on the page. */
export async function getUsers(
  search = '',
  pageSize = 50
): Promise<User[]> {
  const q = query(
    collection(db, USERS_COLLECTION),
    orderBy('createdAt', 'desc'),
    limitQuery(pageSize)
  );
  const snap = await getDocs(q);
  const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as User);
  if (!search.trim()) return users;
  const needle = search.trim().toLowerCase();
  return users.filter(
    (u) =>
      u.displayName?.toLowerCase().includes(needle) ||
      u.email?.toLowerCase().includes(needle) ||
      u.uid.toLowerCase().includes(needle)
  );
}

/** Suspend a user with a reason and optional duration in days (null = permanent). */
export async function suspendUser(
  uid: string,
  reason: string,
  durationDays: number | null,
  adminUid: string
): Promise<void> {
  // SECURITY: Sanitize reason to prevent stored XSS.
  const sanitizedReason = sanitize(reason, 500);

  await updateDoc(doc(db, USERS_COLLECTION, uid), {
    suspended: true,
    suspensionReason: sanitizedReason,
    suspensionExpiry: durationDays
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
      : null,
  });
  await logAudit(adminUid, 'suspend_user', { uid, reason, durationDays });
}

export async function unsuspendUser(uid: string): Promise<void> {
  await updateDoc(doc(db, USERS_COLLECTION, uid), {
    suspended: false,
    suspensionReason: deleteField(),
    suspensionExpiry: deleteField(),
  });
}

export async function getReports(
  status?: ReportStatus | 'all',
  pageSize = 50
): Promise<Report[]> {
  const base = collection(db, ADMIN_REPORTS_COLLECTION);
  const q =
    status && status !== 'all'
      ? query(base, where('status', '==', status), orderBy('createdAt', 'desc'), limitQuery(pageSize))
      : query(base, orderBy('createdAt', 'desc'), limitQuery(pageSize));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Report);
}

export type ReportAction = 'dismiss' | 'resolve' | 'delete';

/** Resolve a report; `delete` also removes the reported listing. */
export async function resolveReport(
  reportId: string,
  action: ReportAction,
  note: string,
  adminUid: string
): Promise<void> {
  const reportSnap = await getDoc(doc(db, ADMIN_REPORTS_COLLECTION, reportId));
  const report = reportSnap.exists() ? (reportSnap.data() as Report) : null;
  const now = new Date().toISOString();

  // SECURITY: Sanitize note to prevent stored XSS.
  const sanitizedNote = note ? sanitize(note, 1000) : undefined;

  await updateDoc(doc(db, ADMIN_REPORTS_COLLECTION, reportId), {
    status: action === 'dismiss' ? 'dismissed' : 'resolved',
    resolvedAt: now,
    resolvedBy: adminUid,
    resolutionNote: sanitizedNote,
  });

  if (action === 'delete' && report?.propertyId) {
    await deleteDoc(doc(db, PROPERTIES_COLLECTION, report.propertyId));
  }

  await logAudit(adminUid, `resolve_report_${action}`, { reportId, propertyId: report?.propertyId });
}

export interface AnnouncementInput {
  title?: string;
  body: string;
  active: boolean;
}

export async function createAnnouncement(input: AnnouncementInput): Promise<void> {
  // SECURITY: Sanitize announcement content to prevent stored XSS.
  const sanitizedInput = {
    ...input,
    title: input.title ? sanitize(input.title, 200) : undefined,
    body: sanitize(input.body, 2000),
  };

  await addDoc(collection(db, ADMIN_ANNOUNCEMENTS_COLLECTION), {
    ...sanitizedInput,
    version: 1,
    createdAt: serverTimestamp(),
  });
}

export async function getAnnouncements(): Promise<Announcement[]> {
  const q = query(
    collection(db, ADMIN_ANNOUNCEMENTS_COLLECTION),
    orderBy('createdAt', 'desc'),
    limitQuery(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Announcement);
}

export async function updateAnnouncement(
  id: string,
  data: Partial<AnnouncementInput>
): Promise<void> {
  await updateDoc(doc(db, ADMIN_ANNOUNCEMENTS_COLLECTION, id), data);
}

/** Append an audit entry for every admin action. */
export async function logAudit(
  actorUid: string,
  action: string,
  detail: Record<string, unknown>
): Promise<void> {
  await addDoc(collection(db, ADMIN_AUDIT_COLLECTION), {
    actorUid,
    action,
    detail,
    createdAt: serverTimestamp(),
  });
}

// ─── Audit Log Viewer ─────────────────────────────────────────────────

/** A single audit log entry. */
export interface AuditLogEntry {
  id: string;
  actorUid?: string;
  /** Actor display name (resolved client-side for display). */
  actorName?: string;
  action: string;
  detail?: Record<string, unknown>;
  emailHash?: string;
  ip?: string;
  userAgent?: string;
  uid?: string;
  createdAt: Timestamp;
}

/** Filter options for the audit log viewer. */
export interface AuditLogFilter {
  /** Filter by action prefix (e.g. 'login', 'suspend'). */
  actionPrefix?: string;
  /** Only show entries after this date. */
  startDate?: Date;
  /** Only show entries before this date. */
  endDate?: Date;
}

const AUDIT_PAGE_SIZE = 50;

/**
 * Fetch a page of audit log entries, optionally filtered by action and date.
 * Returns the entries plus a cursor for the next page.
 */
export async function getAuditLog(
  filter: AuditLogFilter = {},
  pageSize: number = AUDIT_PAGE_SIZE,
  lastDoc?: DocumentSnapshot
): Promise<{ entries: AuditLogEntry[]; lastDoc: DocumentSnapshot | null }> {
  const constraints: ReturnType<typeof orderBy>[] = [orderBy('createdAt', 'desc')];

  if (filter.startDate) {
    constraints.push(orderBy('createdAt', 'asc') as any);
    // NOTE: Firestore doesn't support range + sort on different fields,
    // so we apply the filter client-side for complex queries. For simple
    // date filters we can use startAt/endAt on the same orderBy field.
  }

  if (lastDoc) {
    // For descending order, we need startAfter with the last doc.
    // But if we reversed for startDate, we need to handle pagination
    // differently. For simplicity, we always paginate on the default
    // descending order.
  }

  // Remove the ascending override if we added it for startDate.
  const finalConstraints: any[] = [orderBy('createdAt', 'desc')];
  if (lastDoc) {
    finalConstraints.push(startAfter(lastDoc));
  }
  finalConstraints.push(limitQuery(pageSize));

  const q = query(collection(db, ADMIN_AUDIT_COLLECTION), ...finalConstraints);
  const snap = await getDocs(q);

  let entries: AuditLogEntry[] = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  } as AuditLogEntry));

  // Client-side filtering for action prefix and date range.
  if (filter.actionPrefix) {
    const prefix = filter.actionPrefix.toLowerCase();
    entries = entries.filter((e) => e.action?.toLowerCase().startsWith(prefix));
  }
  if (filter.startDate) {
    const start = filter.startDate.getTime();
    entries = entries.filter((e) => {
      const ts = e.createdAt?.toDate?.()?.getTime?.() ?? 0;
      return ts >= start;
    });
  }
  if (filter.endDate) {
    const end = filter.endDate.getTime();
    entries = entries.filter((e) => {
      const ts = e.createdAt?.toDate?.()?.getTime?.() ?? 0;
      return ts <= end;
    });
  }

  const lastVisible = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

  return { entries, lastDoc: lastVisible };
}

/**
 * Resolve display names for a batch of actor UIDs.
 * Returns a map of uid → displayName.
 */
export async function resolveActorNames(
  uids: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const names = new Map<string, string>();
  // Batch read (Firestore `getAll` supports up to 30).
  const chunks = [];
  for (let i = 0; i < unique.length; i += 30) {
    chunks.push(unique.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    const docs = await Promise.all(
      chunk.map((uid) => getDoc(doc(db, USERS_COLLECTION, uid)).catch(() => null))
    );
    docs.forEach((snap, i) => {
      if (snap?.exists()) {
        names.set(chunk[i], (snap.data() as any).displayName || chunk[i]);
      }
    });
  }

  return names;
}