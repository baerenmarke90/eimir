import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
assert(manifest.name === 'eimir.', 'PWA manifest must use the canonical app name.');
assert(manifest.short_name === 'eimir.', 'PWA manifest must define the short app name.');
assert(manifest.display === 'standalone', 'PWA manifest must use standalone display mode.');
assert(manifest.start_url === '/', 'PWA manifest must start at the application root.');
assert(manifest.scope === '/', 'PWA manifest must own the application root scope.');

const iconSizes = new Set(manifest.icons.map((icon) => icon.sizes));
assert(iconSizes.has('192x192'), 'PWA manifest must include a 192x192 icon.');
assert(iconSizes.has('512x512'), 'PWA manifest must include a 512x512 icon.');
assert(
  manifest.icons.some((icon) => String(icon.purpose || '').includes('maskable')),
  'PWA manifest must expose a maskable-capable icon.',
);

const index = read('index.html');
assert(index.includes('rel="manifest" href="/manifest.webmanifest"'), 'index.html must link the Web App Manifest.');
assert(index.includes('viewport-fit=cover'), 'index.html must opt into iOS safe-area viewport handling.');
assert(index.includes('apple-mobile-web-app-capable'), 'index.html must retain installed iOS metadata.');

const serviceWorker = read('public/service-worker.js');
for (const prefix of ['/api/', '/media/', '/uploads/', '/attachments/']) {
  assert(serviceWorker.includes(`'${prefix}'`), `Service worker must exclude private prefix ${prefix}.`);
}
assert(serviceWorker.includes("request.headers.has('authorization')"), 'Authenticated requests must be excluded from caching.');
assert(serviceWorker.includes("request.mode === 'navigate'"), 'Navigation must have an explicit offline path.');
assert(serviceWorker.includes("OFFLINE_URL = '/offline.html'"), 'Service worker must define the offline fallback.');
assert(!serviceWorker.includes('skipWaiting('), 'PWA updates must not force-activate over active work.');
assert(!serviceWorker.includes("addEventListener('sync'"), 'Offline/background write synchronization is out of scope.');

const registration = read('src/pwa.ts');
assert(registration.includes('import.meta.env.PROD'), 'Service worker registration must be production-only.');
assert(registration.includes("register('/service-worker.js'"), 'Production registration must target the first-party service worker.');

console.log('PWA foundation checks passed.');
