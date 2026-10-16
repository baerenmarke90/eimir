import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const apiBaseUrl = (
  process.env.VITE_EIMIR_API_BASE_URL ||
  process.env.VITE_SBS_API_BASE_URL ||
  ''
).trim();

if (!apiBaseUrl) {
  console.error(
    '\n❌ ERROR: Capacitor Android packaging requires an explicit VITE_EIMIR_API_BASE_URL.\n' +
      'In native Capacitor containers, the app origin is https://localhost;\n' +
      'falling back to window.location.origin would point to an unroutable endpoint.\n\n' +
      'Example:\n' +
      '  VITE_EIMIR_API_BASE_URL="https://demo.sbs.ur-cloud.de" npm run cap:build:android\n',
  );
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(apiBaseUrl);
} catch {
  console.error(
    `\n❌ ERROR: Invalid VITE_EIMIR_API_BASE_URL "${apiBaseUrl}". Must be a valid HTTP or HTTPS URL.\n`,
  );
  process.exit(1);
}

if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
  console.error(
    `\n❌ ERROR: Invalid protocol "${parsed.protocol}" in VITE_EIMIR_API_BASE_URL. Must be http: or https:.\n`,
  );
  process.exit(1);
}

if (
  (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
  process.env.ALLOW_LOCALHOST_API !== 'true'
) {
  console.error(
    `\n❌ ERROR: VITE_EIMIR_API_BASE_URL cannot point to localhost/127.0.0.1 inside a native Android container.\n` +
      'Android devices/emulators cannot reach the host machine via localhost.\n' +
      '(Set ALLOW_LOCALHOST_API=true to override for local emulator loopback tests if needed.)\n',
  );
  process.exit(1);
}

console.log(`Building Web bundle for Capacitor with API base: ${apiBaseUrl}`);
execSync('npm run build', {
  cwd: webRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_EIMIR_API_BASE_URL: apiBaseUrl,
  },
});
