import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as limitQuery,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
  getCountFromServer,
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

/**
 * Admin suite — moderation tools gated by the admin/roles collection
 * (provisioned by operators; see firestore.rules). Every mutation here is
 * role-checked server-side by the rules and appended to admin/auditLog.
 */

/** True when `uid` is listed in admin/roles (operator-provisioned). */
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
  durationDays: number | null
): Promise<void> {
  await updateDoc(doc(db, USERS_COLLECTION, uid), {
    suspended: true,
    suspensionReason: reason,
    suspensionExpiry: durationDays
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
      : null,
  });
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

  await updateDoc(doc(db, ADMIN_REPORTS_COLLECTION, reportId), {
    status: action === 'dismiss' ? 'dismissed' : 'resolved',
    resolvedAt: now,
    resolvedBy: adminUid,
    resolutionNote: note || undefined,
  });

  if (action === 'delete' && report?.propertyId) {
    await deleteDoc(doc(db, PROPERTIES_COLLECTION, report.propertyId));
  }
}

export interface AnnouncementInput {
  title?: string;
  body: string;
  active: boolean;
}

export async function createAnnouncement(input: AnnouncementInput): Promise<void> {
  await addDoc(collection(db, ADMIN_ANNOUNCEMENTS_COLLECTION), {
    ...input,
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