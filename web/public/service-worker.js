const CACHE_PREFIX = 'eimir-pwa-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-v3`;
const STATIC_CACHE = `${CACHE_PREFIX}static-v3`;
const MAP_CACHE = `${CACHE_PREFIX}map-v1`;
const PUSH_CACHE = 'eimir-browser-push-v1';
const PUSH_BINDING = '/_eimir/browser-push-binding';
const PUSH_VERSION = 1;
const PUSH_UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const OFFLINE_URL = '/offline.html';

// Public basemap data (no account, space or media information). Vector tiles
// live under a versioned, immutable path, so they are cached for good, bounded
// by an entry limit. There is no prefetching or bulk/offline download.
const MAP_ORIGIN = 'https://tiles.openfreemap.org';
const MAP_CACHE_MAX_ENTRIES = 1500;
// The style and TileJSON are the mutable pointers to the versioned tiles.
const MAP_TILEJSON_PATH = '/planet';
const MAP_STYLE_PREFIX = '/styles/';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/offline.css',
  '/offline-language.js',
  '/manifest.webmanifest',
  '/identity/app-icon-light.png',
  '/identity/app-icon-dark.png',
  '/apple-touch-icon.png',
  '/pwa-192.png',
  '/pwa-512.png',
  '/pwa-maskable.png',
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

function isMapRequest(request, url) {
  return (
    url.origin === MAP_ORIGIN &&
    request.method === 'GET' &&
    !request.headers.has('authorization')
  );
}

async function trimMapCache(cache) {
  const keys = await cache.keys();
  // Insertion order approximates age: drop the oldest entries first.
  await Promise.all(
    keys
      .slice(0, Math.max(0, keys.length - MAP_CACHE_MAX_ENTRIES))
      .map((key) => cache.delete(key)),
  );
}

function storeMapResponse(cache, request, response) {
  if (response.ok && response.type !== 'opaque') {
    void cache
      .put(request, response.clone())
      .then(() => trimMapCache(cache))
      .catch(() => undefined);
  }
  return response;
}

async function mapAsset(request, url) {
  const cache = await caches.open(MAP_CACHE);
  const cached = await cache.match(request);
  const pointer =
    url.pathname === MAP_TILEJSON_PATH ||
    url.pathname.startsWith(MAP_STYLE_PREFIX);

  if (cached && !pointer) {
    return cached;
  }

  try {
    return storeMapResponse(cache, request, await fetch(request));
  } catch {
    return cached ?? Response.error();
  }
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
                key !== STATIC_CACHE &&
                key !== MAP_CACHE,
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
  if (isMapRequest(request, url)) {
    event.respondWith(mapAsset(request, url));
    return;
  }

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

async function currentPush(data) {
  if (
    typeof data?.notificationId !== 'string' ||
    !PUSH_UUID.test(data.notificationId) ||
    typeof data.activationId !== 'string' ||
    !PUSH_UUID.test(data.activationId)
  )
    return false;
  const cached = await (await caches.open(PUSH_CACHE)).match(PUSH_BINDING);
  return cached && (await cached.json()).activationId === data.activationId;
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data;
      try {
        data = event.data?.json();
        if (data?.type !== 'wake' || !(await currentPush(data))) return;
      } catch {
        return;
      }
      await self.registration.showNotification('eimir.', {
        body:
          data.locale === 'de'
            ? 'Du hast neue Nachrichten.'
            : 'You have new messages.',
        icon: '/pwa-192.png',
        tag: `eimir-push:${data.notificationId}`,
        data: {
          notificationId: data.notificationId,
          activationId: data.activationId,
        },
      });
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'eimir-browser-push-version') {
    event.ports[0]?.postMessage(PUSH_VERSION);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const data = event.notification.data;
      if (!(await currentPush(data))) return;
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        const received = await new Promise((resolve) => {
          const channel = new MessageChannel();
          const timeout = setTimeout(() => {
            channel.port1.close();
            resolve(false);
          }, 250);
          channel.port1.onmessage = (message) => {
            clearTimeout(timeout);
            channel.port1.close();
            resolve(message.data === 'received');
          };
          try {
            client.postMessage({ type: 'eimir-notification-open', ...data }, [
              channel.port2,
            ]);
          } catch {
            clearTimeout(timeout);
            channel.port1.close();
            channel.port2.close();
            resolve(false);
          }
        });
        if (received) {
          try {
            await client.focus();
            return;
          } catch {
            // The acknowledged tab can close before focus reaches it.
          }
        }
      }
      const hint = `${data.activationId}.${data.notificationId}`;
      await self.clients.openWindow(`/more/notifications#eimir-push=${hint}`);
    })().catch(() => undefined),
  );
});
