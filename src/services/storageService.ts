import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../config/firebase';
import { storageCircuitBreaker } from '../utils/network/circuitBreaker';
import { withRetry } from '../utils/network/retry';
import { withTimeout, UPLOAD_TIMEOUT_MS } from '../utils/network/timeout';
import { trackMetric } from '../utils/monitoring/metrics';

export async function uploadImage(
  uri: string,
  path: string
): Promise<string> {
  // Uploads get a 30s budget and retry with backoff on transient failures.
  const url = await storageCircuitBreaker.execute(() =>
    withRetry(() =>
      withTimeout(
        trackMetric('storage.upload', async () => {
          const response = await fetch(uri);
          const blob = await response.blob();
          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, blob);
          return getDownloadURL(storageRef);
        }),
        UPLOAD_TIMEOUT_MS
      )
    )
  );
  return url;
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
    await storageCircuitBreaker.execute(() =>
      withRetry(() => withTimeout(deleteObject(imageRef), UPLOAD_TIMEOUT_MS))
    );
  } catch (error) {
    console.warn('Failed to delete image:', error);
  }
}

export async function deleteImages(urls: string[]): Promise<void> {
  for (const url of urls) {
    await deleteImage(url);
  }
}