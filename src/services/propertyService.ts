import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  increment,
  serverTimestamp,
  DocumentSnapshot,
  QueryConstraint,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { Property, PropertyFilter } from '../types';
import { PROPERTIES_COLLECTION, ITEMS_PER_PAGE } from '../utils/constants';

export async function createProperty(
  property: Omit<Property, 'id' | 'views' | 'inquiries' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const docRef = await addDoc(collection(db, PROPERTIES_COLLECTION), {
    ...property,
    views: 0,
    inquiries: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateProperty(
  id: string,
  data: Partial<Property>
): Promise<void> {
  const docRef = doc(db, PROPERTIES_COLLECTION, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProperty(id: string): Promise<void> {
  // Delete associated images from storage
  const propDoc = await getDoc(doc(db, PROPERTIES_COLLECTION, id));
  if (propDoc.exists()) {
    const images = propDoc.data().images || [];
    for (const imageUrl of images) {
      try {
        const imageRef = ref(storage, imageUrl);
        await deleteObject(imageRef);
      } catch {
        // Image might not be in storage (external URLs)
      }
    }
  }
  await deleteDoc(doc(db, PROPERTIES_COLLECTION, id));
}

export async function getProperty(id: string): Promise<Property | null> {
  const docRef = doc(db, PROPERTIES_COLLECTION, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    // Increment views
    await updateDoc(docRef, { views: increment(1) });
    return { id: docSnap.id, ...docSnap.data() } as Property;
  }
  return null;
}

export async function getProperties(
  filter: PropertyFilter = {},
  pageSize: number = ITEMS_PER_PAGE,
  lastDoc?: DocumentSnapshot
): Promise<{ properties: Property[]; lastDoc: DocumentSnapshot | null }> {
  const constraints: QueryConstraint[] = [];

  if (filter.listingType) {
    constraints.push(where('listingType', '==', filter.listingType));
  }
  if (filter.propertyType && filter.propertyType.length > 0) {
    constraints.push(where('propertyType', 'in', filter.propertyType));
  }
  if (filter.status) {
    constraints.push(where('status', '==', filter.status));
  } else {
    constraints.push(where('status', '==', 'active'));
  }
  if (filter.minPrice !== undefined) {
    constraints.push(where('price', '>=', filter.minPrice));
  }
  if (filter.maxPrice !== undefined) {
    constraints.push(where('price', '<=', filter.maxPrice));
  }
  if (filter.city) {
    constraints.push(where('city', '==', filter.city));
  }
  if (filter.state) {
    constraints.push(where('state', '==', filter.state));
  }

  // Sorting
  switch (filter.sortBy) {
    case 'price_asc':
      constraints.push(orderBy('price', 'asc'));
      break;
    case 'price_desc':
      constraints.push(orderBy('price', 'desc'));
      break;
    case 'popular':
      constraints.push(orderBy('views', 'desc'));
      break;
    case 'oldest':
      constraints.push(orderBy('createdAt', 'asc'));
      break;
    case 'newest':
    default:
      constraints.push(orderBy('createdAt', 'desc'));
      break;
  }

  constraints.push(limit(pageSize));
  if (lastDoc) {
    constraints.push(startAfter(lastDoc));
  }

  const q = query(collection(db, PROPERTIES_COLLECTION), ...constraints);
  const querySnapshot = await getDocs(q);

  const properties: Property[] = [];
  querySnapshot.forEach((doc) => {
    properties.push({ id: doc.id, ...doc.data() } as Property);
  });

  // Client-side filtering for fields that can't be indexed easily
  let filtered = properties;
  if (filter.minBedrooms !== undefined) {
    filtered = filtered.filter((p) => p.bedrooms >= filter.minBedrooms!);
  }
  if (filter.maxBedrooms !== undefined) {
    filtered = filtered.filter((p) => p.bedrooms <= filter.maxBedrooms!);
  }
  if (filter.minBathrooms !== undefined) {
    filtered = filtered.filter((p) => p.bathrooms >= filter.minBathrooms!);
  }
  if (filter.maxBathrooms !== undefined) {
    filtered = filtered.filter((p) => p.bathrooms <= filter.maxBathrooms!);
  }
  if (filter.features && filter.features.length > 0) {
    filtered = filtered.filter((p) =>
      filter.features!.every((f) => p.features.includes(f))
    );
  }

  const lastVisible =
    querySnapshot.docs.length > 0
      ? querySnapshot.docs[querySnapshot.docs.length - 1]
      : null;

  return { properties: filtered, lastDoc: lastVisible };
}

export async function searchProperties(
  searchTerm: string
): Promise<Property[]> {
  // Firestore doesn't support full-text search natively,
  // so we search on the client side
  const q = query(
    collection(db, PROPERTIES_COLLECTION),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  const querySnapshot = await getDocs(q);
  const term = searchTerm.toLowerCase();

  const results: Property[] = [];
  querySnapshot.forEach((doc) => {
    const data = doc.data() as Property;
    if (
      data.title.toLowerCase().includes(term) ||
      data.address.toLowerCase().includes(term) ||
      data.city.toLowerCase().includes(term) ||
      data.state.toLowerCase().includes(term) ||
      data.description.toLowerCase().includes(term)
    ) {
      results.push({ ...data, id: doc.id });
    }
  });

  return results;
}

export async function getUserProperties(userId: string): Promise<Property[]> {
  const q = query(
    collection(db, PROPERTIES_COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const querySnapshot = await getDocs(q);
  const properties: Property[] = [];
  querySnapshot.forEach((doc) => {
    properties.push({ id: doc.id, ...doc.data() } as Property);
  });
  return properties;
}

export async function getPropertiesByIds(ids: string[]): Promise<Property[]> {
  if (ids.length === 0) return [];
  const properties: Property[] = [];

  // Firestore 'in' queries are limited to 30 items
  const chunks = [];
  for (let i = 0; i < ids.length; i += 30) {
    chunks.push(ids.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    const q = query(
      collection(db, PROPERTIES_COLLECTION),
      where('__name__', 'in', chunk)
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      properties.push({ id: doc.id, ...doc.data() } as Property);
    });
  }

  return properties;
}

export async function uploadPropertyImage(
  uri: string,
  propertyId: string,
  index: number
): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const filename = `properties/${propertyId}/image_${index}_${Date.now()}`;
  const storageRef = ref(storage, filename);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export async function deletePropertyImage(imageUrl: string): Promise<void> {
  try {
    const imageRef = ref(storage, imageUrl);
    await deleteObject(imageRef);
  } catch {
    // Image might not be in storage
  }
}
