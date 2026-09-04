import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../config/firebase';

export async function uploadImage(
  uri: string,
  path: string
): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export async function uploadProfileImage(
  userId: string,
  uri: string
): Promise<string> {
  const filename = `profiles/${userId}/avatar_${Date.now()}`;
  return uploadImage(uri, filename);
}

export async function uploadMultipleImages(
  uris: string[],
  basePath: string
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const filename = `${basePath}/image_${i}_${Date.now()}`;
    const url = await uploadImage(uris[i], filename);
    urls.push(url);
  }
  return urls;
}

export async function deleteImage(url: string): Promise<void> {
  try {
    const imageRef = ref(storage, url);
    await deleteObject(imageRef);
  } catch (error) {
    console.warn('Failed to delete image:', error);
  }
}

export async function deleteImages(urls: string[]): Promise<void> {
  for (const url of urls) {
    await deleteImage(url);
  }
}
