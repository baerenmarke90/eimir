import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const manifest = JSON.parse(read('public/manifest.webmanifest'));
assert(
  manifest.name === 'eimir.',
  'PWA manifest must use the canonical app name.',
);
assert(
  manifest.short_name === 'eimir.',
  'PWA manifest must define the short app name.',
);
assert(
  manifest.display === 'standalone',
  'PWA manifest must use standalone display mode.',
);
assert(
  manifest.start_url === '/',
  'PWA manifest must start at the application root.',
);
assert(
  manifest.scope === '/',
  'PWA manifest must own the application root scope.',
);

const iconSizes = new Set(manifest.icons.map((icon) => icon.sizes));
assert(iconSizes.has('192x192'), 'PWA manifest must include a 192x192 icon.');
assert(iconSizes.has('512x512'), 'PWA manifest must include a 512x512 icon.');

function assertPngDimensions(relativePath, width, height) {
  const png = readFileSync(join(webRoot, relativePath));
  assert(
    png.length >= 24 &&
      png.subarray(1, 4).toString('ascii') === 'PNG' &&
      png.readUInt32BE(16) === width &&
      png.readUInt32BE(20) === height,
    `${relativePath} must be a real ${width}x${height} PNG asset.`,
  );
}

assertPngDimensions('public/pwa-192.png', 192, 192);
assertPngDimensions('public/pwa-512.png', 512, 512);
assertPngDimensions('public/pwa-maskable.png', 512, 512);
assertPngDimensions('public/apple-touch-icon.png', 180, 180);
assert(
  manifest.icons.some(
    (icon) =>
      icon.src === '/pwa-maskable.png' &&
      icon.type === 'image/png' &&
      String(icon.purpose || '').includes('maskable'),
  ),
  'PWA manifest must expose a maskable-capable icon.',
);

const index = read('index.html');
assert(
  index.includes('rel="manifest" href="/manifest.webmanifest"'),
  'index.html must link the Web App Manifest.',
);
assert(
  index.includes('viewport-fit=cover'),
  'index.html must opt into iOS safe-area viewport handling.',
);
assert(
  index.includes('apple-mobile-web-app-capable'),
  'index.html must retain installed iOS metadata.',
);

const serviceWorker = read('public/service-worker.js');
for (const prefix of ['/api/', '/media/', '/uploads/', '/attachments/']) {
  assert(
    serviceWorker.includes(`'${prefix}'`),
    `Service worker must exclude private prefix ${prefix}.`,
  );
}
assert(
  serviceWorker.includes("request.headers.has('authorization')"),
  'Authenticated requests must be excluded from caching.',
);
assert(
  serviceWorker.includes("request.mode === 'navigate'"),
  'Navigation must have an explicit offline path.',
);
assert(
  serviceWorker.includes("OFFLINE_URL = '/offline.html'"),
  'Service worker must define the offline fallback.',
);
assert(
  !serviceWorker.includes('skipWaiting('),
  'PWA updates must not force-activate over active work.',
);
assert(
  !serviceWorker.includes("addEventListener('sync'"),
  'Offline/background write synchronization is out of scope.',
);

const serviceWorkerHandlers = new Map();
const offlineResponse = { kind: 'offline' };
const networkResponse = { kind: 'network' };
let rejectNetwork = false;

const serviceWorkerContext = {
  URL,
  Response: {
    error: () => ({ kind: 'error' }),
  },
  self: {
    location: { origin: 'https://eimir.test' },
    addEventListener(type, handler) {
      serviceWorkerHandlers.set(type, handler);
    },
  },
  caches: {
    open: async () => ({
      addAll: async () => undefined,
      match: async () => undefined,
      put: async () => undefined,
      keys: async () => [],
      delete: async () => true,
    }),
    keys: async () => [],
    delete: async () => true,
    match: async (key) =>
      key === '/offline.html' ? offlineResponse : undefined,
  },
  fetch: async () => {
    if (rejectNetwork) {
      throw new Error('offline');
    }
    return networkResponse;
  },
};

runInNewContext(serviceWorker, serviceWorkerContext, {
  filename: 'service-worker.js',
});

const fetchHandler = serviceWorkerHandlers.get('fetch');
assert(
  typeof fetchHandler === 'function',
  'Service worker must register a fetch handler.',
);

function makeRequest(
  path,
  {
    method = 'GET',
    mode = 'cors',
    auth = false,
    origin = 'https://eimir.test',
  } = {},
) {
  return {
    method,
    mode,
    url: `${origin}${path}`,
    headers: {
      has(name) {
        return auth && name.toLowerCase() === 'authorization';
      },
    },
  };
}

async function dispatchFetch(request) {
  let responded = false;
  let response;

  fetchHandler({
    request,
    respondWith(value) {
      responded = true;
      response = Promise.resolve(value);
    },
  });

  return {
    responded,
    response: responded ? await response : undefined,
  };
}

for (const privatePath of [
  '/api/private',
  '/media/private.jpg',
  '/uploads/private.jpg',
  '/attachments/private.pdf',
]) {
  const result = await dispatchFetch(makeRequest(privatePath));
  assert(
    !result.responded,
    `Service worker must not intercept private request ${privatePath}.`,
  );
}

const authenticatedStatic = await dispatchFetch(
  makeRequest('/assets/app.js', { auth: true }),
);
assert(
  !authenticatedStatic.responded,
  'Service worker must not intercept authenticated requests.',
);

const mutation = await dispatchFetch(
  makeRequest('/api/private', { method: 'POST' }),
);
assert(
  !mutation.responded,
  'Service worker must not intercept mutation requests.',
);

const mapOrigin = 'https://tiles.openfreemap.org';
const mapTile = await dispatchFetch(
  makeRequest('/planet/20261101_080013_pt/12/2200/1350.pbf', {
    origin: mapOrigin,
  }),
);
assert(
  mapTile.responded,
  'Basemap tiles must use the bounded persistent map cache.',
);
for (const [label, request] of [
  [
    'authenticated',
    makeRequest('/planet/x/1/0/0.pbf', { origin: mapOrigin, auth: true }),
  ],
  [
    'mutating',
    makeRequest('/planet/x/1/0/0.pbf', { origin: mapOrigin, method: 'POST' }),
  ],
  [
    'other third-party',
    makeRequest('/tile.png', { origin: 'https://tiles.example.test' }),
  ],
]) {
  assert(
    !(await dispatchFetch(request)).responded,
    `Service worker must not intercept ${label} cross-origin requests.`,
  );
}

rejectNetwork = false;
const onlineNavigation = await dispatchFetch(
  makeRequest('/momente/42', { mode: 'navigate' }),
);
assert(
  onlineNavigation.responded && onlineNavigation.response === networkResponse,
  'Top-level navigation must remain network-first while online.',
);

rejectNetwork = true;
const offlineNavigation = await dispatchFetch(
  makeRequest('/momente/42', { mode: 'navigate' }),
);
assert(
  offlineNavigation.responded && offlineNavigation.response === offlineResponse,
  'Failed top-level navigation must return the privacy-safe offline fallback.',
);

// Basemap cache behavior, with a stateful Cache stand-in.
{
  const handlers = new Map();
  const stored = new Map();
  let online = true;
  let fetches = 0;
  const cache = {
    addAll: async () => undefined,
    match: async (request) => stored.get(request.url),
    put: async (request, response) => {
      stored.set(request.url, response);
    },
    keys: async () => [...stored.keys()].map((url) => ({ url })),
    delete: async (key) => stored.delete(key.url),
  };
  runInNewContext(
    serviceWorker,
    {
      URL,
      Response: { error: () => ({ kind: 'error' }) },
      self: {
        location: { origin: 'https://eimir.test' },
        addEventListener: (type, handler) => handlers.set(type, handler),
      },
      caches: {
        open: async () => cache,
        keys: async () => [],
        delete: async () => true,
        match: async () => undefined,
      },
      fetch: async (request) => {
        fetches += 1;
        if (!online) throw new Error('offline');
        return {
          ok: true,
          type: 'cors',
          url: request.url,
          clone() {
            return this;
          },
        };
      },
    },
    { filename: 'service-worker.js' },
  );
  const request = (path) => makeRequest(path, { origin: mapOrigin });
  const respond = async (path) => {
    let response;
    handlers.get('fetch')({
      request: request(path),
      respondWith(value) {
        response = Promise.resolve(value);
      },
    });
    const result = await response;
    await new Promise((resolve) => setTimeout(resolve, 0));
    return result;
  };
  const tile = '/planet/20261101_080013_pt/12/2200/1350.pbf';
  const style = '/styles/liberty';

  await respond(tile);
  await respond(style);
  assert(stored.size === 2, 'Basemap tiles and style must be stored.');
  const afterWarm = fetches;
  await respond(tile);
  assert(fetches === afterWarm, 'A cached versioned tile must not refetch.');
  await respond(style);
  assert(
    fetches === afterWarm + 1,
    'The mutable style must revalidate online.',
  );

  online = false;
  assert(
    (await respond(tile)).url?.endsWith(tile),
    'A cached tile must be available offline.',
  );
  assert(
    (await respond(style)).url?.endsWith(style),
    'The last cached style must be available offline.',
  );
  assert(
    (await respond('/planet/20261101_080013_pt/12/9/9.pbf')).kind === 'error',
    'An uncached tile must fail offline instead of inventing content.',
  );
}

const browserNotificationId = '2f36b77e-e4f8-46a1-9600-6790e1117a05';
const browserActivationId = 'bf9184d5-5225-4891-bda6-9fcaa51c7f5d';
const pushReference = {
  notificationId: browserNotificationId,
  activationId: browserActivationId,
};
const displayed = [];
const focused = [];
const opened = [];
let browserClients = [];
let browserBinding = { activationId: browserActivationId };

serviceWorkerContext.MessageChannel = MessageChannel;
serviceWorkerContext.setTimeout = setTimeout;
serviceWorkerContext.clearTimeout = clearTimeout;
serviceWorkerContext.self.registration = {
  async showNotification(title, options) {
    displayed.push({ title, ...options });
  },
};
serviceWorkerContext.self.clients = {
  matchAll: async () => browserClients,
  async openWindow(path) {
    opened.push(path);
  },
};
serviceWorkerContext.caches.open = async (cache) => ({
  async match(key) {
    if (
      cache === 'eimir-browser-push-v1' &&
      key === '/_eimir/browser-push-binding' &&
      browserBinding
    )
      return { json: async () => browserBinding };
  },
});

function dispatchWorkerEvent(type, input) {
  let outcome;
  serviceWorkerHandlers.get(type)({
    ...input,
    waitUntil(value) {
      outcome = value;
    },
  });
  return outcome;
}

for (const [locale, body] of [
  ['de', 'Du hast neue Nachrichten.'],
  ['en', 'You have new messages.'],
]) {
  await dispatchWorkerEvent('push', {
    data: {
      json: () => ({
        type: 'wake',
        ...pushReference,
        locale,
        title: 'Private title',
        body: 'Private content',
      }),
    },
  });
  const shown = displayed.at(-1);
  assert(
    shown.title === 'eimir.' && shown.body === body,
    'Browser push must render only the neutral copy for the given locale.',
  );
  assert(
    Object.keys(shown.data).length === 2 &&
      shown.data.notificationId === browserNotificationId &&
      shown.data.activationId === browserActivationId,
    'Click data may keep only the delivery reference and its activation.',
  );
}
await dispatchWorkerEvent('push', {
  data: {
    json: () => ({ type: 'wake', ...pushReference, activationId: 'invalid' }),
  },
});
assert(displayed.length === 2, 'Malformed push references must stay silent.');

browserClients = [
  ['stale', 'ignored'],
  ['current', 'received'],
].map(([tab, response]) => ({
  url: 'https://eimir.test/today',
  postMessage(message, [port]) {
    assert(
      message.type === 'eimir-notification-open' &&
        message.notificationId === browserNotificationId,
      'The worker must hand only a reference to a candidate tab.',
    );
    port.postMessage(response);
    port.close();
  },
  async focus() {
    focused.push(tab);
  },
}));
const click = { notification: { data: displayed[0].data, close() {} } };
await dispatchWorkerEvent('notificationclick', click);
assert(
  focused.join() === 'current' && opened.length === 0,
  'Only a tab that accepts the push activation may be focused.',
);

browserClients = [];
await dispatchWorkerEvent('notificationclick', click);
assert(
  opened[0] ===
    `/more/notifications#eimir-push=${browserActivationId}.${browserNotificationId}`,
  'A cold open must go to the inbox with an opaque activation-bound hint.',
);
browserBinding = null;
await dispatchWorkerEvent('notificationclick', click);
assert(opened.length === 1, 'A click after local revocation must stay silent.');

const registration = read('src/pwa.ts');
assert(
  registration.includes('import.meta.env.PROD'),
  'Service worker registration must be production-only.',
);
assert(
  registration.includes("register('/service-worker.js'"),
  'Production registration must target the first-party service worker.',
);

console.log('PWA foundation checks passed.');
