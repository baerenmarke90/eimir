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
const offlineStylesheetResponse = { kind: 'offline-stylesheet' };
const offlineLanguageResponse = { kind: 'offline-language' };
const networkResponse = { kind: 'network' };
let rejectNetwork = false;

// Only the install-time shell precache holds entries; the runtime static cache
// starts empty, as it does on the first offline visit after installation.
const shellResponses = new Map([
  ['/offline.html', offlineResponse],
  ['/offline.css', offlineStylesheetResponse],
  ['/offline-language.js', offlineLanguageResponse],
]);
const isShellCache = (name) => name.startsWith('eimir-pwa-shell-');
const requestPath = (key) =>
  new URL(typeof key === 'string' ? key : key.url, 'https://eimir.test')
    .pathname;

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
    open: async (name) => ({
      addAll: async () => undefined,
      match: async (key) =>
        isShellCache(name) ? shellResponses.get(requestPath(key)) : undefined,
      put: async () => undefined,
    }),
    keys: async () => [],
    delete: async () => true,
    match: async (key, options = {}) =>
      options.cacheName === undefined || isShellCache(options.cacheName)
        ? shellResponses.get(requestPath(key))
        : undefined,
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
  { method = 'GET', mode = 'cors', auth = false } = {},
) {
  return {
    method,
    mode,
    url: `https://eimir.test${path}`,
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

// The offline document is controlled by the worker, so its own subresources
// must come from the shell precache instead of failing without the network.
for (const [path, expected] of [
  ['/offline.css', offlineStylesheetResponse],
  ['/offline-language.js', offlineLanguageResponse],
]) {
  const offlineSubresource = await dispatchFetch(makeRequest(path));
  assert(
    offlineSubresource.responded && offlineSubresource.response === expected,
    `Offline fallback subresource ${path} must be served from the shell precache.`,
  );
}

const offlineUncachedAsset = await dispatchFetch(makeRequest('/assets/app.js'));
assert(
  offlineUncachedAsset.responded &&
    offlineUncachedAsset.response.kind === 'error',
  'Uncached static assets must fail closed offline instead of borrowing shell entries.',
);

rejectNetwork = false;
const onlineShellAsset = await dispatchFetch(makeRequest('/offline.css'));
assert(
  onlineShellAsset.responded && onlineShellAsset.response === networkResponse,
  'Precached shell assets must stay network-fresh while online.',
);

const registration = read('src/pwa.ts');
assert(
  registration.includes('import.meta.env.PROD'),
  'Service worker registration must be production-only.',
);
assert(
  registration.includes("register('/service-worker.js'"),
  'Production registration must target the first-party service worker.',
);

// The production CSP must admit the shipped foundation. Otherwise browsers
// refuse the manifest and the service-worker registration, and the swallowed
// registration error hides that installation and the offline fallback are off.
const cspHeaders = [
  ...read('nginx.conf').matchAll(
    /add_header\s+Content-Security-Policy\s+"([^"]*)"/g,
  ),
];
assert(
  cspHeaders.length === 1,
  'nginx.conf must deliver exactly one Content-Security-Policy header.',
);
const cspDirectives = new Map();
for (const directive of cspHeaders[0][1].split(';')) {
  const [name, ...sources] = directive.trim().split(/\s+/);
  // Browsers ignore repeated directives, so only the first occurrence counts.
  if (name && !cspDirectives.has(name.toLowerCase())) {
    cspDirectives.set(name.toLowerCase(), sources);
  }
}
for (const directive of ['manifest-src', 'worker-src']) {
  const sources = cspDirectives.get(directive) ?? [];
  assert(
    sources.length === 1 && sources[0] === "'self'",
    `nginx.conf CSP must set ${directive} to exactly 'self' for the first-party PWA foundation.`,
  );
}

console.log('PWA foundation checks passed.');
