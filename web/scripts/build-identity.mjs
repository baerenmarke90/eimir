/**
 * Resolves and validates the product version and source build that the Web
 * bundle reports in support reports (`VITE_EIMIR_APP_VERSION`,
 * `VITE_EIMIR_BUILD`, read by `src/client/supportReport.ts`).
 *
 * The product version is the release version (`EIMIR_APP_VERSION`, the
 * `release_version` workflow input) and the build is the short source revision
 * derived from `EIMIR_BUILD_REVISION`, the same revision the Web image reports at
 * `/.well-known/eimir-revision`. Kept free of side effects so the build scripts
 * and their tests share one implementation.
 */

export class BuildIdentityError extends Error {}

// The support-report API accepts at most 32 characters per value.
export const MAX_BUILD_IDENTITY_LENGTH = 32;
const SHORT_REVISION_LENGTH = 12;
const FULL_REVISION_PATTERN = /^[0-9a-f]{40}$/;
const UNKNOWN = 'unknown';

function trimmed(value) {
  return value?.trim() || undefined;
}

/**
 * Short form of a full 40-character source revision. Refs and placeholder
 * values such as `main` or `unverified-local-checkout` are not revisions.
 *
 * @param {string | undefined} revision
 * @returns {string | undefined}
 */
export function shortRevision(revision) {
  const value = trimmed(revision)?.toLowerCase();
  return value && FULL_REVISION_PATTERN.test(value)
    ? value.slice(0, SHORT_REVISION_LENGTH)
    : undefined;
}

/**
 * Build variables derived from the release inputs. Only resolvable values are
 * returned, so a local build keeps the support-report fallback `unknown`.
 * Explicit `VITE_EIMIR_*` values win over the release inputs.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
export function resolveBuildIdentityEnv(env) {
  const appVersion =
    trimmed(env.VITE_EIMIR_APP_VERSION) ?? trimmed(env.EIMIR_APP_VERSION);
  const build =
    trimmed(env.VITE_EIMIR_BUILD) ?? shortRevision(env.EIMIR_BUILD_REVISION);
  return {
    ...(appVersion ? { VITE_EIMIR_APP_VERSION: appVersion } : {}),
    ...(build ? { VITE_EIMIR_BUILD: build } : {}),
  };
}

/**
 * Fails a release/production build whose bundle would report a missing,
 * default or oversized version or build. Local builds (no
 * `EIMIR_REQUIRE_BUILD_IDENTITY=true`) are never rejected.
 *
 * @param {Record<string, string | undefined>} env
 */
export function assertBuildIdentity(env) {
  if (env.EIMIR_REQUIRE_BUILD_IDENTITY !== 'true') return;
  for (const [name, label] of [
    ['VITE_EIMIR_APP_VERSION', 'product version'],
    ['VITE_EIMIR_BUILD', 'source build'],
  ]) {
    const value = trimmed(env[name]);
    if (!value || value.toLowerCase() === UNKNOWN) {
      throw new BuildIdentityError(
        `Release builds need ${name} (${label}) for support reports; it is missing or "${UNKNOWN}".`,
      );
    }
    if (value.length > MAX_BUILD_IDENTITY_LENGTH || /\s/.test(value)) {
      throw new BuildIdentityError(
        `${name} must be at most ${MAX_BUILD_IDENTITY_LENGTH} characters without whitespace.`,
      );
    }
  }
}
