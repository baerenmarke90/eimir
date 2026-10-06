import { describe, expect, it } from 'vitest';
import {
  CapacitorBuildConfigurationError,
  resolveCapacitorBuildEnvironment,
} from './capacitor-build-environment.mjs';

const PRODUCTION_API = 'https://api.example.test';
const DEMO_API = 'https://demo.example.test';

function resolve(env) {
  return resolveCapacitorBuildEnvironment(env).buildEnv;
}

function expectConfigurationError(env, message) {
  expect(() => resolveCapacitorBuildEnvironment(env)).toThrow(
    CapacitorBuildConfigurationError,
  );
  expect(() => resolveCapacitorBuildEnvironment(env)).toThrow(message);
}

describe('resolveCapacitorBuildEnvironment', () => {
  it('keeps an ordinary production bundle out of Demo presentation', () => {
    expect(resolve({ VITE_EIMIR_API_BASE_URL: PRODUCTION_API })).toEqual({
      VITE_EIMIR_API_BASE_URL: PRODUCTION_API,
      VITE_EIMIR_DEMO_MODE: 'false',
      VITE_EIMIR_DEMO_RESET_TIMER: 'false',
      VITE_EIMIR_DEMO_RESET_INTERVAL: '6h',
      VITE_EIMIR_DEMO_URL: '',
    });
  });

  it('infers Demo mode from a demo. API host without inferring a reset timer', () => {
    const buildEnv = resolve({ VITE_EIMIR_API_BASE_URL: DEMO_API });
    expect(buildEnv.VITE_EIMIR_DEMO_MODE).toBe('true');
    expect(buildEnv.VITE_EIMIR_DEMO_RESET_TIMER).toBe('false');
  });

  it('does not treat a host that only contains demo as a Demo host', () => {
    for (const apiBaseUrl of [
      'https://nodemo.example.test',
      'https://api.demo.example.test',
      'https://demo-api.example.test',
    ]) {
      expect(
        resolve({ VITE_EIMIR_API_BASE_URL: apiBaseUrl }).VITE_EIMIR_DEMO_MODE,
      ).toBe('false');
    }
  });

  it('lets an explicit flag override host inference in both directions', () => {
    expect(
      resolve({
        VITE_EIMIR_API_BASE_URL: DEMO_API,
        VITE_EIMIR_DEMO_MODE: 'false',
      }).VITE_EIMIR_DEMO_MODE,
    ).toBe('false');
    expect(
      resolve({
        VITE_EIMIR_API_BASE_URL: PRODUCTION_API,
        VITE_EIMIR_DEMO_MODE: 'true',
      }).VITE_EIMIR_DEMO_MODE,
    ).toBe('true');
  });

  it('prefers canonical over legacy flags and accepts legacy alone', () => {
    expect(
      resolve({
        VITE_EIMIR_API_BASE_URL: DEMO_API,
        VITE_EIMIR_DEMO_MODE: 'false',
        VITE_SBS_DEMO_MODE: 'true',
      }).VITE_EIMIR_DEMO_MODE,
    ).toBe('false');
    expect(
      resolve({
        VITE_SBS_API_BASE_URL: PRODUCTION_API,
        VITE_SBS_DEMO_MODE: 'true',
        VITE_SBS_DEMO_RESET_TIMER: 'true',
        VITE_SBS_DEMO_RESET_INTERVAL: '30m',
      }),
    ).toMatchObject({
      VITE_EIMIR_API_BASE_URL: PRODUCTION_API,
      VITE_EIMIR_DEMO_MODE: 'true',
      VITE_EIMIR_DEMO_RESET_TIMER: 'true',
      VITE_EIMIR_DEMO_RESET_INTERVAL: '30m',
    });
  });

  it('forwards an explicit reset timer and normalizes its interval', () => {
    expect(
      resolve({
        VITE_EIMIR_API_BASE_URL: DEMO_API,
        VITE_EIMIR_DEMO_RESET_TIMER: 'true',
        VITE_EIMIR_DEMO_RESET_INTERVAL: ' 12H ',
      }),
    ).toMatchObject({
      VITE_EIMIR_DEMO_RESET_TIMER: 'true',
      VITE_EIMIR_DEMO_RESET_INTERVAL: '12h',
    });
  });

  it('always clears the Web-demo launch link, including a legacy one', () => {
    expect(
      resolve({
        VITE_EIMIR_API_BASE_URL: PRODUCTION_API,
        VITE_EIMIR_DEMO_URL: 'https://demo.example.test',
        VITE_SBS_DEMO_URL: 'https://demo.example.test',
      }).VITE_EIMIR_DEMO_URL,
    ).toBe('');
  });

  it('rejects non-boolean flags', () => {
    expectConfigurationError(
      { VITE_EIMIR_API_BASE_URL: DEMO_API, VITE_EIMIR_DEMO_MODE: 'yes' },
      'VITE_EIMIR_DEMO_MODE',
    );
    expectConfigurationError(
      { VITE_EIMIR_API_BASE_URL: DEMO_API, VITE_SBS_DEMO_RESET_TIMER: 'TRUE' },
      'VITE_EIMIR_DEMO_RESET_TIMER',
    );
  });

  it('rejects a reset timer without Demo mode', () => {
    expectConfigurationError(
      {
        VITE_EIMIR_API_BASE_URL: PRODUCTION_API,
        VITE_EIMIR_DEMO_RESET_TIMER: 'true',
      },
      'requires Demo mode',
    );
  });

  it('rejects reset intervals the backend would reject', () => {
    for (const interval of ['6 hours', '0h', '4m', '8d', '90s', 'h']) {
      expectConfigurationError(
        {
          VITE_EIMIR_API_BASE_URL: DEMO_API,
          VITE_EIMIR_DEMO_RESET_INTERVAL: interval,
        },
        'VITE_EIMIR_DEMO_RESET_INTERVAL',
      );
    }
    for (const interval of ['5m', '7d', '168h']) {
      expect(
        resolve({
          VITE_EIMIR_API_BASE_URL: DEMO_API,
          VITE_EIMIR_DEMO_RESET_INTERVAL: interval,
        }).VITE_EIMIR_DEMO_RESET_INTERVAL,
      ).toBe(interval);
    }
  });

  it('keeps the existing API base URL guards', () => {
    expectConfigurationError(
      {},
      'requires an explicit VITE_EIMIR_API_BASE_URL',
    );
    expectConfigurationError(
      { VITE_EIMIR_API_BASE_URL: 'not a url' },
      'Must be a valid HTTP or HTTPS URL',
    );
    expectConfigurationError(
      { VITE_EIMIR_API_BASE_URL: 'ftp://demo.example.test' },
      'Must be http: or https:',
    );
    expectConfigurationError(
      { VITE_EIMIR_API_BASE_URL: 'http://localhost:8000' },
      'cannot point to localhost',
    );
    expect(
      resolve({
        VITE_EIMIR_API_BASE_URL: 'http://localhost:8000',
        ALLOW_LOCALHOST_API: 'true',
      }).VITE_EIMIR_DEMO_MODE,
    ).toBe('false');
  });
});
