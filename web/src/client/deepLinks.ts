import { matchPath } from 'react-router-dom';
import {
  PRIVATE_COLLECTIONS_PATH,
  PRIVATE_GIFT_IDEAS_PATH,
  PRIVATE_NOTES_PATH,
  privateCollectionPath,
  privateGiftIdeaPath,
  privateNotePath,
} from './privateArea';
import {
  ACTIVITY_ROUTE,
  appRoutePath,
  CHAPTER_DETAIL_ROUTE_PATTERN,
  COLLECTION_DETAIL_ROUTE_PATTERN,
  GAMES_MOMENTS_ROUTE,
  HEART_MOMENT_DETAIL_ROUTE_PATTERN,
  MEMORY_DETAIL_ROUTE_PATTERN,
  MILESTONE_DETAIL_ROUTE_PATTERN,
  MORE_NOTIFICATIONS_ROUTE,
  MORE_PEOPLE_ROUTE,
  MORE_PROFILE_ROUTE,
  MORE_SETTINGS_ROUTE,
  PLAN_DETAIL_ROUTE_PATTERN,
  PLACE_DETAIL_ROUTE_PATTERN,
  SEARCH_ROUTE,
  WISH_DETAIL_ROUTE_PATTERN,
  chapterDetailPath,
  collectionDetailPath,
  heartMomentDetailPath,
  memoryDetailPath,
  milestoneDetailPath,
  planDetailPath,
  placeDetailPath,
  wishDetailPath,
} from './routes';

export type CanonicalDeepLinkKind =
  | 'memory'
  | 'heartMoment'
  | 'milestone'
  | 'wish'
  | 'plan'
  | 'place'
  | 'chapter'
  | 'collection'
  | 'privateNote'
  | 'giftIdea'
  | 'privateCollection';

const AUTH_RETURN_STORAGE_KEY = 'eimir-auth-return-v1';
const LEGACY_AUTH_RETURN_STORAGE_KEY = 'sidebyside-auth-return-v1';
const AUTH_RETURN_MAX_AGE_MS = 30 * 60 * 1000;

export const SETTINGS_AUTH_RETURN_HASHES = [
  '#settings-connection',
  '#settings-notifications',
  '#settings-dashboard',
  '#settings-appearance',
  '#settings-data',
  '#settings-account',
] as const;

const CANONICAL_RETURN_PATTERNS = [
  appRoutePath('today'),
  ACTIVITY_ROUTE,
  appRoutePath('story'),
  MEMORY_DETAIL_ROUTE_PATTERN,
  '/story/memories/:memoryId/edit',
  HEART_MOMENT_DETAIL_ROUTE_PATTERN,
  '/story/heart-moments/:heartMomentId/edit',
  MILESTONE_DETAIL_ROUTE_PATTERN,
  '/story/milestones/:milestoneId/edit',
  appRoutePath('plan'),
  WISH_DETAIL_ROUTE_PATTERN,
  PLAN_DETAIL_ROUTE_PATTERN,
  PLACE_DETAIL_ROUTE_PATTERN,
  CHAPTER_DETAIL_ROUTE_PATTERN,
  COLLECTION_DETAIL_ROUTE_PATTERN,
  appRoutePath('games'),
  GAMES_MOMENTS_ROUTE,
  SEARCH_ROUTE,
  appRoutePath('more'),
  MORE_PEOPLE_ROUTE,
  MORE_NOTIFICATIONS_ROUTE,
  MORE_PROFILE_ROUTE,
  MORE_SETTINGS_ROUTE,
  PRIVATE_NOTES_PATH,
  `${PRIVATE_NOTES_PATH}/new`,
  `${PRIVATE_NOTES_PATH}/:noteId`,
  `${PRIVATE_NOTES_PATH}/:noteId/edit`,
  PRIVATE_GIFT_IDEAS_PATH,
  `${PRIVATE_GIFT_IDEAS_PATH}/new`,
  `${PRIVATE_GIFT_IDEAS_PATH}/:giftIdeaId`,
  `${PRIVATE_GIFT_IDEAS_PATH}/:giftIdeaId/edit`,
  PRIVATE_COLLECTIONS_PATH,
  `${PRIVATE_COLLECTIONS_PATH}/new`,
  `${PRIVATE_COLLECTIONS_PATH}/:collectionId`,
  `${PRIVATE_COLLECTIONS_PATH}/:collectionId/edit`,
] as const;

export function canonicalDeepLink(
  kind: CanonicalDeepLinkKind,
  resourceId: string,
): string {
  switch (kind) {
    case 'memory':
      return memoryDetailPath(resourceId);
    case 'heartMoment':
      return heartMomentDetailPath(resourceId);
    case 'milestone':
      return milestoneDetailPath(resourceId);
    case 'wish':
      return wishDetailPath(resourceId);
    case 'plan':
      return planDetailPath(resourceId);
    case 'place':
      return placeDetailPath(resourceId);
    case 'chapter':
      return chapterDetailPath(resourceId);
    case 'collection':
      return collectionDetailPath(resourceId);
    case 'privateNote':
      return privateNotePath(resourceId);
    case 'giftIdea':
      return privateGiftIdeaPath(resourceId);
    case 'privateCollection':
      return privateCollectionPath(resourceId);
  }
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

export function validateAppRelativeReturnTarget(target: string): string | null {
  if (!target.startsWith('/') || target.startsWith('//')) return null;
  if (target.includes('\\') || containsControlCharacter(target)) return null;
  if (target.includes('?')) return null;

  let parsed: URL;
  try {
    parsed = new URL(target, 'https://eimir.invalid');
  } catch {
    return null;
  }

  if (parsed.origin !== 'https://eimir.invalid') return null;
  if (parsed.search) return null;

  const canonicalTarget = `${parsed.pathname}${parsed.hash}`;
  if (canonicalTarget !== target) return null;
  if (
    parsed.hash &&
    (parsed.pathname !== MORE_SETTINGS_ROUTE ||
      !SETTINGS_AUTH_RETURN_HASHES.some((hash) => hash === parsed.hash))
  ) {
    return null;
  }

  const canonicalPattern = CANONICAL_RETURN_PATTERNS.find((pattern) =>
    Boolean(matchPath({ path: pattern, end: true }, parsed.pathname)),
  );
  return canonicalPattern ? canonicalTarget : null;
}

/**
 * Whether a canonical return pattern names a specific resource (carries a
 * route param, e.g. `:memoryId`) rather than an account-global list/nav
 * route (e.g. `/today`, `/more/private/notes`). Only resource-specific
 * routes are bound to the originating Space -- an account-global route is
 * safe to restore for the same Account regardless of which Space is
 * currently active (#689).
 */
function isResourceSpecificPattern(target: string): boolean {
  const pathname = target.split('#', 1)[0];
  const canonicalPattern = CANONICAL_RETURN_PATTERNS.find((pattern) =>
    Boolean(matchPath({ path: pattern, end: true }, pathname)),
  );
  return canonicalPattern?.includes(':') ?? false;
}

interface StoredAuthReturnTarget {
  path: string;
  createdAt: number;
  accountId: string;
  spaceId: string | null;
}

/**
 * Remember the current path as an authentication return target, bound to
 * the Account (and, for resource-specific routes, the Space) that owns it.
 *
 * Without this provenance, a private/resource-specific route remembered
 * after one Account's session expires could be restored after a different
 * Account signs in on the same shared browser: the server denies the
 * content, but the second Account's browser still receives the first
 * Account's opaque resource id and navigation state (#689).
 */
export function rememberCurrentAuthReturnTarget(
  accountId: string,
  spaceId: string | null = null,
): string | null {
  if (typeof window === 'undefined') return null;
  const { pathname, search = '', hash = '' } = window.location;
  const target = validateAppRelativeReturnTarget(`${pathname}${search}${hash}`);
  if (!target) {
    window.localStorage.removeItem(AUTH_RETURN_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_AUTH_RETURN_STORAGE_KEY);
    return null;
  }

  const record: StoredAuthReturnTarget = {
    path: target,
    createdAt: Date.now(),
    accountId,
    spaceId: isResourceSpecificPattern(target) ? spaceId : null,
  };
  window.localStorage.setItem(AUTH_RETURN_STORAGE_KEY, JSON.stringify(record));
  return target;
}

/**
 * Consume (always removing) the stored return target, restoring it only
 * when its provenance matches the just-authenticated context.
 *
 * - A different Account than the one that stored it never gets it back,
 *   even though the path/id itself is only ever privacy-safe opaque data.
 * - A resource-specific route bound to a Space is not restored into a
 *   different active Space, even for the same Account.
 * - `spaceId: undefined` means the caller does not yet know the active
 *   Space (Space membership resolves after sign-in); a non-resource-
 *   specific stored target still restores in that case, but a Space-bound
 *   one does not, since it cannot be proven safe yet.
 */
export function consumeAuthReturnTarget(
  accountId: string,
  spaceId?: string | null,
  now = Date.now(),
): string | null {
  if (typeof window === 'undefined') return null;
  const raw =
    window.localStorage.getItem(AUTH_RETURN_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_AUTH_RETURN_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_RETURN_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_AUTH_RETURN_STORAGE_KEY);
  if (!raw) return null;

  try {
    const stored = JSON.parse(raw) as {
      path?: unknown;
      createdAt?: unknown;
      accountId?: unknown;
      spaceId?: unknown;
    };
    if (
      typeof stored.path !== 'string' ||
      typeof stored.createdAt !== 'number' ||
      typeof stored.accountId !== 'string'
    ) {
      return null;
    }
    if (
      stored.createdAt > now ||
      now - stored.createdAt > AUTH_RETURN_MAX_AGE_MS
    ) {
      return null;
    }
    if (stored.accountId !== accountId) return null;

    const storedSpaceId =
      typeof stored.spaceId === 'string' ? stored.spaceId : null;
    if (storedSpaceId !== null && storedSpaceId !== spaceId) return null;

    return validateAppRelativeReturnTarget(stored.path);
  } catch {
    return null;
  }
}

export function restoreAuthReturnTarget(
  accountId: string,
  spaceId?: string | null,
): string | null {
  if (typeof window === 'undefined') return null;
  const target = consumeAuthReturnTarget(accountId, spaceId);
  const currentTarget = `${window.location.pathname}${window.location.hash ?? ''}`;
  if (!target || target === currentTarget) return target;

  window.history.replaceState(window.history.state, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
  return target;
}
