/* House Hunter web service worker (PWA).
 *
 * Deliberately conservative — aggressive service workers are a common source
 * of "stuck on an old version" bugs, so:
 *   - navigations are NETWORK-FIRST (a new deploy is picked up immediately;
 *     the cached shell is only a fallback when offline),
 *   - remote images (Firebase Storage, Google avatars — long-lived URLs) are
 *     cache-first,
 *   - same-origin bundle assets (content-hashed, immutable) are
 *     stale-while-revalidate.
 *
 * Bump CACHE_VERSION when a deploy must sweep the caches clean.
 */
const CACHE_VERSION = 'househunter-v1';
const REMOTE_IMAGE_HOSTS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'lh3.googleusercontent.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(['/']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Cache a response (best-effort, never throws). */
function cachePut(request, response) {
  if (!response || response.status !== 200) return;
  const copy = response.clone();
  caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // App navigations: always try the network first; serve the cached shell only
  // when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut('/', response);
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Remote images: cache-first, fetch + store on miss.
  if (REMOTE_IMAGE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            cachePut(request, response);
            return response;
          })
      )
    );
    return;
  }

  // Same-origin static assets (hashed bundles, fonts): stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            cachePut(request, response);
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});