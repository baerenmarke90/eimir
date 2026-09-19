const CACHE_PREFIX = 'eimir-pwa-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-v1`;
const STATIC_CACHE = `${CACHE_PREFIX}static-v1`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/offline.css',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/pwa-192.png',
  '/pwa-512.png',
  '/theme-bootstrap.js',
];

const PRIVATE_PREFIXES = ['/api/', '/media/', '/uploads/', '/attachments/'];

function isPrivateRequest(request, url) {
  return (
    request.headers.has('authorization') ||
    PRIVATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  );
}

function isStaticAsset(url) {
  if (url.search) {
    return false;
  }

  return (
    PRECACHE_URLS.includes(url.pathname) ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/fonts/')
  );
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_URL)) ?? Response.error();
  }
}

async function staleWhileRevalidateStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === 'basic') {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  return cached ?? (await network) ?? Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(CACHE_PREFIX) &&
                key !== SHELL_CACHE &&
                key !== STATIC_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivateRequest(request, url)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidateStatic(request));
  }
});
