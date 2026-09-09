import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  onSnapshot,
  DocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Tour, TourAvailability, TourStatus } from '../types';
import {
  TOURS_COLLECTION,
  TOUR_AVAILABILITY_COLLECTION,
  PROPERTIES_COLLECTION,
  USERS_COLLECTION,
} from '../utils/constants';
import { firestoreCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../utils/network/timeout';

function toISO(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  const t = value as { seconds?: unknown; nanoseconds?: unknown };
  if (typeof t.seconds === 'number' && typeof t.nanoseconds === 'number') {
    return new Date(t.seconds * 1000 + t.nanoseconds / 1_000_000).toISOString();
  }
  return new Date().toISOString();
}

function toTour(docSnap: DocumentSnapshot): Tour {
  const data = docSnap.data()!;
  return {
    id: docSnap.id,
    propertyId: data.propertyId,
    propertyTitle: data.propertyTitle,
    propertyImage: data.propertyImage,
    buyerId: data.buyerId,
    buyerName: data.buyerName,
    sellerId: data.sellerId,
    sellerName: data.sellerName,
    status: data.status,
    datetime: toISO(data.datetime),
    duration: data.duration,
    attendees: data.attendees,
    notes: data.notes,
    reminderSent: data.reminderSent || false,
    confirmedAt: data.confirmedAt ? toISO(data.confirmedAt) : undefined,
    canceledBy: data.canceledBy,
    cancelReason: data.cancelReason,
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt),
  };
}

// ─── Availability Management ────────────────────────────────

/** Set or update seller availability settings. */
export async function setAvailability(availability: Omit<TourAvailability, 'createdAt' | 'updatedAt'>): Promise<void> {
  const docRef = doc(db, TOUR_AVAILABILITY_COLLECTION, availability.sellerId);
  await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        updateDoc(docRef, {
          sellerId: availability.sellerId,
          daysOfWeek: availability.daysOfWeek,
          startTime: availability.startTime,
          endTime: availability.endTime,
          maxToursPerDay: availability.maxToursPerDay,
          bufferMinutes: availability.bufferMinutes,
          updatedAt: serverTimestamp(),
        }).catch(() =>
          addDoc(collection(db, TOUR_AVAILABILITY_COLLECTION), {
            sellerId: availability.sellerId,
            daysOfWeek: availability.daysOfWeek,
            startTime: availability.startTime,
            endTime: availability.endTime,
            maxToursPerDay: availability.maxToursPerDay,
            bufferMinutes: availability.bufferMinutes,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
}

/** Get seller availability settings. */
export async function getAvailability(sellerId: string): Promise<TourAvailability | null> {
  const docSnap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDoc(doc(db, TOUR_AVAILABILITY_COLLECTION, sellerId)), DEFAULT_TIMEOUT_MS))
  );

  if (!docSnap.exists()) return null;
  const data = docSnap.data()!;
  return {
    id: docSnap.id,
    sellerId: data.sellerId,
    daysOfWeek: data.daysOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
    maxToursPerDay: data.maxToursPerDay,
    bufferMinutes: data.bufferMinutes,
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt),
  };
}

/** Check if a time slot is available for a seller. */
export async function isSlotAvailable(
  sellerId: string,
  datetime: string,
  duration: number
): Promise<boolean> {
  const availability = await getAvailability(sellerId);
  if (!availability) return false;

  const date = new Date(datetime);
  const dayOfWeek = date.getDay();
  if (!availability.daysOfWeek.includes(dayOfWeek)) return false;

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeMinutes = hours * 60 + minutes;
  const [startH, startM] = availability.startTime.split(':').map(Number);
  const [endH, endM] = availability.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (timeMinutes < startMinutes || timeMinutes + duration > endMinutes) return false;

  // Check existing tours for conflicts
  const dateStr = date.toISOString().slice(0, 10);
  const existingTours = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(
          query(
            collection(db, TOURS_COLLECTION),
            where('sellerId', '==', sellerId),
            where('status', 'in', ['pending', 'confirmed'] as TourStatus[])
          )
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  const dayTours = existingTours.docs.filter((d) => {
    const tourDate = d.data().datetime instanceof Timestamp
      ? d.data().datetime.toDate().toISOString().slice(0, 10)
      : toISO(d.data().datetime).slice(0, 10);
    return tourDate === dateStr;
  });

  if (dayTours.length >= availability.maxToursPerDay) return false;

  // Check buffer time conflicts
  const tourStart = timeMinutes;
  const tourEnd = timeMinutes + duration;
  for (const tourDoc of dayTours) {
    const existingTour = toTour(tourDoc);
    const existingStart = new Date(existingTour.datetime).getHours() * 60 + new Date(existingTour.datetime).getMinutes();
    const existingEnd = existingStart + existingTour.duration;
    const buffer = availability.bufferMinutes;

    if (tourStart < existingEnd + buffer && tourEnd + buffer > existingStart) {
      return false;
    }
  }

  return true;
}

// ─── Tour CRUD ──────────────────────────────────────────────

/** Create a tour request. */
export async function createTour(tour: Omit<Tour, 'id' | 'createdAt' | 'updatedAt' | 'reminderSent' | 'status'>): Promise<string> {
  const isAvailable = await isSlotAvailable(tour.sellerId, tour.datetime, tour.duration);
  if (!isAvailable) {
    throw new Error('This time slot is not available. Please choose another.');
  }

  const docRef = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        addDoc(collection(db, TOURS_COLLECTION), {
          ...tour,
          status: 'pending',
          reminderSent: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  return docRef.id;
}

/** Get a single tour. */
export async function getTour(tourId: string): Promise<Tour | null> {
  const docSnap = await firestoreCircuitBreaker.execute(() =>
    withRetry(() => withTimeout(getDoc(doc(db, TOURS_COLLECTION, tourId)), DEFAULT_TIMEOUT_MS))
  );
  if (!docSnap.exists()) return null;
  return toTour(docSnap);
}

/** Get tours for a user (as buyer or seller). */
export async function getUserTours(
  userId: string,
  role: 'buyer' | 'seller' = 'buyer'
): Promise<Tour[]> {
  const field = role === 'buyer' ? 'buyerId' : 'sellerId';
  const result = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(
          query(
            collection(db, TOURS_COLLECTION),
            where(field, '==', userId),
            orderBy('datetime', 'desc')
          )
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  return result.docs.map(toTour);
}

/** Update tour status. */
export async function updateTourStatus(
  tourId: string,
  status: TourStatus,
  userId?: string,
  reason?: string
): Promise<void> {
  const updateData: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };

  if (status === 'confirmed') {
    updateData.confirmedAt = serverTimestamp();
  }
  if (status === 'canceled' && userId) {
    updateData.canceledBy = userId;
    updateData.cancelReason = reason || '';
  }
  if (status === 'completed') {
    updateData.status = 'completed';
  }
  if (status === 'no_show') {
    updateData.status = 'no_show';
  }

  await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(updateDoc(doc(db, TOURS_COLLECTION, tourId), updateData), DEFAULT_TIMEOUT_MS)
    )
  );
}

/** Reschedule a tour. */
export async function rescheduleTour(
  tourId: string,
  newDatetime: string
): Promise<void> {
  const tour = await getTour(tourId);
  if (!tour) throw new Error('Tour not found');

  const isAvailable = await isSlotAvailable(tour.sellerId, newDatetime, tour.duration);
  if (!isAvailable) {
    throw new Error('The new time slot is not available.');
  }

  await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        updateDoc(doc(db, TOURS_COLLECTION, tourId), {
          datetime: newDatetime,
          status: 'rescheduled',
          updatedAt: serverTimestamp(),
        }),
        DEFAULT_TIMEOUT_MS
      )
    )
  );
}

/** Get upcoming tours for a seller (used for reminders). */
export async function getUpcomingTours(sellerId: string): Promise<Tour[]> {
  const now = new Date().toISOString();
  const result = await firestoreCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        getDocs(
          query(
            collection(db, TOURS_COLLECTION),
            where('sellerId', '==', sellerId),
            where('status', 'in', ['confirmed', 'pending'] as TourStatus[])
          )
        ),
        DEFAULT_TIMEOUT_MS
      )
    )
  );

  return result.docs
    .map(toTour)
    .filter((tour) => new Date(tour.datetime) > new Date(now))
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
}

/** Real-time subscription to tours for a user. */
export function subscribeToUserTours(
  userId: string,
  role: 'buyer' | 'seller' = 'buyer',
  callback: (tours: Tour[]) => void
): () => void {
  const field = role === 'buyer' ? 'buyerId' : 'sellerId';
  const q = query(
    collection(db, TOURS_COLLECTION),
    where(field, '==', userId),
    orderBy('datetime', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const tours = snapshot.docs.map(toTour);
    callback(tours);
  });
}
