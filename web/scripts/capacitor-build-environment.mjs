/**
 * Resolves the Vite build variables for the Capacitor Android Web bundle.
 *
 * Kept free of side effects so the build script and its tests share one
 * implementation. The backend stays authoritative for Demo entry and
 * destructive-action restrictions; these values only select presentation.
 */

export class CapacitorBuildConfigurationError extends Error {}

// Mirrors the backend's EIMIR_DEMO_MODE_RESET_INTERVAL contract so the banner
// can never announce an interval the backend would reject.
const DEMO_RESET_INTERVAL_PATTERN = /^([1-9][0-9]*)([mhd])$/;
const MINUTES_PER_UNIT = { m: 1, h: 60, d: 24 * 60 };
const MIN_DEMO_RESET_MINUTES = 5;
const MAX_DEMO_RESET_MINUTES = 7 * 24 * 60;

function configuredValue(env, name) {
  return (
    env[`VITE_EIMIR_${name}`]?.trim() ||
    env[`VITE_SBS_${name}`]?.trim() ||
    undefined
  );
}

function resolveApiBaseUrl(env) {
  const apiBaseUrl = configuredValue(env, 'API_BASE_URL');
  if (!apiBaseUrl) {
    throw new CapacitorBuildConfigurationError(
      'Capacitor Android packaging requires an explicit VITE_EIMIR_API_BASE_URL.\n' +
        'In native Capacitor containers, the app origin is https://localhost;\n' +
        'falling back to window.location.origin would point to an unroutable endpoint.\n\n' +
        'Example:\n' +
        '  VITE_EIMIR_API_BASE_URL="https://demo.sbs.ur-cloud.de" npm run cap:build:android',
    );
  }

  let parsed;
  try {
    parsed = new URL(apiBaseUrl);
  } catch {
    throw new CapacitorBuildConfigurationError(
      `Invalid VITE_EIMIR_API_BASE_URL "${apiBaseUrl}". Must be a valid HTTP or HTTPS URL.`,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new CapacitorBuildConfigurationError(
      `Invalid protocol "${parsed.protocol}" in VITE_EIMIR_API_BASE_URL. Must be http: or https:.`,
    );
  }

  if (
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
    env.ALLOW_LOCALHOST_API !== 'true'
  ) {
    throw new CapacitorBuildConfigurationError(
      'VITE_EIMIR_API_BASE_URL cannot point to localhost/127.0.0.1 inside a native Android container.\n' +
        'Android devices/emulators cannot reach the host machine via localhost.\n' +
        '(Set ALLOW_LOCALHOST_API=true to override for local emulator loopback tests if needed.)',
    );
  }

  return { apiBaseUrl, hostname: parsed.hostname };
}

function resolveBoolean(env, name) {
  const value = configuredValue(env, name);
  if (value !== undefined && value !== 'true' && value !== 'false') {
    throw new CapacitorBuildConfigurationError(
      `Invalid VITE_EIMIR_${name} value "${value}". Must be true or false.`,
    );
  }
  return value;
}

function resolveResetInterval(env) {
  const value = (configuredValue(env, 'DEMO_RESET_INTERVAL') ?? '6h')
    .toLowerCase()
    .trim();
  const match = DEMO_RESET_INTERVAL_PATTERN.exec(value);
  const minutes = match
    ? Number(match[1]) * MINUTES_PER_UNIT[match[2]]
    : Number.NaN;
  if (
    !(minutes >= MIN_DEMO_RESET_MINUTES && minutes <= MAX_DEMO_RESET_MINUTES)
  ) {
    throw new CapacitorBuildConfigurationError(
      `Invalid VITE_EIMIR_DEMO_RESET_INTERVAL value "${value}". ` +
        'Must look like 30m, 6h or 1d and be between 5m and 7d, matching the backend.',
    );
  }
  return value;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ apiBaseUrl: string, demoMode: boolean, buildEnv: Record<string, string> }}
 */
export function resolveCapacitorBuildEnvironment(env) {
  const { apiBaseUrl, hostname } = resolveApiBaseUrl(env);
  const declaredDemoMode = resolveBoolean(env, 'DEMO_MODE');
  const declaredResetTimer = resolveBoolean(env, 'DEMO_RESET_TIMER');
  const resetInterval = resolveResetInterval(env);

  // An explicit flag always wins; otherwise only a dedicated `demo.` API host
  // selects the Demo presentation.
  const demoMode =
    declaredDemoMode === 'true' ||
    (declaredDemoMode === undefined && hostname.startsWith('demo.'));

  if (!demoMode && declaredResetTimer === 'true') {
    throw new CapacitorBuildConfigurationError(
      'VITE_EIMIR_DEMO_RESET_TIMER=true requires Demo mode.',
    );
  }

  return {
    apiBaseUrl,
    demoMode,
    buildEnv: {
      VITE_EIMIR_API_BASE_URL: apiBaseUrl,
      VITE_EIMIR_DEMO_MODE: demoMode ? 'true' : 'false',
      // The reset timer is never inferred from the hostname.
      VITE_EIMIR_DEMO_RESET_TIMER: declaredResetTimer ?? 'false',
      VITE_EIMIR_DEMO_RESET_INTERVAL: resetInterval,
      // The Web-demo launch link belongs to Web deployments. Inside the native
      // wrapper it would hand the user to the system browser, so it is cleared
      // here, which also shadows any legacy VITE_SBS_DEMO_URL.
      VITE_EIMIR_DEMO_URL: '',
    },
  };
}
