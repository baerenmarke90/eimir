import { afterEach, describe, expect, it, vi } from 'vitest';
import { identityBuildVariable } from './identityEnvironment';

describe('identity build environment compatibility', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('accepts the deprecated VITE_SBS alias', () => {
    vi.stubEnv('VITE_SBS_API_BASE_URL', 'https://legacy.example');

    expect(identityBuildVariable('API_BASE_URL')).toBe(
      'https://legacy.example',
    );
  });

  it('gives the canonical value precedence', () => {
    vi.stubEnv('VITE_SBS_API_BASE_URL', 'https://legacy.example');
    vi.stubEnv('VITE_EIMIR_API_BASE_URL', 'https://canonical.example');

    expect(identityBuildVariable('API_BASE_URL')).toBe(
      'https://canonical.example',
    );
  });
});
