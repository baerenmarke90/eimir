import { describe, expect, it } from 'vitest';
import {
  assertBuildIdentity,
  BuildIdentityError,
  resolveBuildIdentityEnv,
  shortRevision,
} from './build-identity.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('resolveBuildIdentityEnv', () => {
  it('derives version and short revision from release inputs', () => {
    expect(
      resolveBuildIdentityEnv({
        EIMIR_APP_VERSION: '0.2.0',
        EIMIR_BUILD_REVISION: SHA,
      }),
    ).toEqual({
      VITE_EIMIR_APP_VERSION: '0.2.0',
      VITE_EIMIR_BUILD: '0123456789ab',
    });
  });

  it('lets explicit Vite values win', () => {
    expect(
      resolveBuildIdentityEnv({
        VITE_EIMIR_APP_VERSION: '1.0.0',
        EIMIR_APP_VERSION: '0.2.0',
        VITE_EIMIR_BUILD: 'ci-42',
        EIMIR_BUILD_REVISION: SHA,
      }),
    ).toEqual({ VITE_EIMIR_APP_VERSION: '1.0.0', VITE_EIMIR_BUILD: 'ci-42' });
  });

  it('leaves local builds unresolved instead of inventing values', () => {
    expect(
      resolveBuildIdentityEnv({
        EIMIR_BUILD_REVISION: 'unverified-local-checkout',
      }),
    ).toEqual({});
    expect(shortRevision('main')).toBeUndefined();
  });
});

describe('assertBuildIdentity', () => {
  const valid = {
    VITE_EIMIR_APP_VERSION: '0.2.0',
    VITE_EIMIR_BUILD: 'abc1234',
  };

  it('never rejects local builds', () => {
    expect(() => assertBuildIdentity({})).not.toThrow();
  });

  it('accepts a complete release identity', () => {
    expect(() =>
      assertBuildIdentity({ ...valid, EIMIR_REQUIRE_BUILD_IDENTITY: 'true' }),
    ).not.toThrow();
  });

  it.each([
    [{ ...valid, VITE_EIMIR_APP_VERSION: '' }],
    [{ ...valid, VITE_EIMIR_BUILD: undefined }],
    [{ ...valid, VITE_EIMIR_BUILD: 'unknown' }],
    [{ ...valid, VITE_EIMIR_APP_VERSION: 'x'.repeat(33) }],
    [{ ...valid, VITE_EIMIR_BUILD: 'a b' }],
  ])('rejects an unusable release identity %#', (env) => {
    expect(() =>
      assertBuildIdentity({ ...env, EIMIR_REQUIRE_BUILD_IDENTITY: 'true' }),
    ).toThrow(BuildIdentityError);
  });
});
