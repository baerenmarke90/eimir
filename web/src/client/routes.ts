/*
 * Route registry.
 *
 * The model is decided in
 * `docs/decisions/0003-primary-navigation-and-route-model.md` and mirrored by
 * `docs/INFORMATION-ARCHITECTURE.md` section 5. Web and Android use the same
 * stable route IDs, so this file is the Web half of a cross-client contract
 * rather than a client-local convention.
 */

export type AppRouteId = 'today' | 'story' | 'plan' | 'games' | 'more';

export type AppRouteIcon =
  | 'today'
  | 'story'
  | 'plan'
  | 'games'
  | 'more'
  | 'search'
  | 'activity'
  | 'notifications'
  | 'people'
  | 'places'
  | 'collections'
  | 'chapter'
  | 'birthday'
  | 'private'
  | 'profile'
  | 'settings'
  | 'add'
  | 'milestone'
  | 'wish'
  | 'gift';

export interface AppRouteDefinition {
  id: AppRouteId;
  path: string;
  labelKey: string;
  icon: AppRouteIcon;
  /** False where the destination owns sub-routes and must stay active in them. */
  end: boolean;
}

/** Stable top-level route registry. Primary shell destinations are derived below. */
export const APP_ROUTES = [
  {
    id: 'today',
    path: '/today',
    labelKey: 'navigation.today',
    icon: 'today',
    end: false,
  },
  {
    id: 'story',
    path: '/story',
    labelKey: 'navigation.story',
    icon: 'story',
    end: false,
  },
  {
    id: 'plan',
    path: '/plan',
    labelKey: 'navigation.plan',
    icon: 'plan',
    end: false,
  },
  {
    id: 'games',
    path: '/games',
    labelKey: 'navigation.games',
    icon: 'games',
    end: false,
  },
  {
    id: 'more',
    path: '/more',
    labelKey: 'navigation.more',
    icon: 'more',
    end: false,
  },
] as const satisfies readonly AppRouteDefinition[];

/** Primary shell destinations. Games is intentionally discovered through More. */
export const PRIMARY_APP_ROUTES = APP_ROUTES.filter(
  (route) => route.id !== 'games',
);

export const DEFAULT_APP_ROUTE = APP_ROUTES[0].path;

export function appRoutePath(id: AppRouteId): string {
  const route = APP_ROUTES.find((candidate) => candidate.id === id);
  if (!route) throw new Error(`Unknown app route: ${id}`);
  return route.path;
}

/* Secondary destinations ------------------------------------------------- */

/** A global utility rather than an area; reachable from the Web app bar. */
export const SEARCH_ROUTE = '/search';

/**
 * Stable Activity route. The Web shell exposes it from the personal account
 * tree; route placement remains under `today` for Deep-Link compatibility and
 * domain ownership.
 */
export const ACTIVITY_ROUTE = '/today/activity';

export const MORE_PEOPLE_ROUTE = '/more/people';
export const MORE_PLACES_ROUTE = '/more/places';
export const MORE_COLLECTIONS_ROUTE = '/more/collections';
/** Existing surface; the Web shell exposes it as the header bell utility. */
export const MORE_NOTIFICATIONS_ROUTE = '/more/notifications';
/** Existing surface; the Web shell exposes it through the avatar/account tree. */
export const MORE_PROFILE_ROUTE = '/more/profile';
export const MORE_SETTINGS_ROUTE = '/more/settings';

export const SETTINGS_CATEGORY_IDS = [
  'relationship',
  'notifications',
  'today',
  'appearance',
  'data',
  'account',
] as const;

export type SettingsCategoryId = (typeof SETTINGS_CATEGORY_IDS)[number];

export const MORE_SETTINGS_CATEGORY_ROUTE_PATTERN = `${MORE_SETTINGS_ROUTE}/:settingsCategory`;

export const SETTINGS_CATEGORY_ROUTES = {
  relationship: `${MORE_SETTINGS_ROUTE}/relationship`,
  notifications: `${MORE_SETTINGS_ROUTE}/notifications`,
  today: `${MORE_SETTINGS_ROUTE}/today`,
  appearance: `${MORE_SETTINGS_ROUTE}/appearance`,
  data: `${MORE_SETTINGS_ROUTE}/data`,
  account: `${MORE_SETTINGS_ROUTE}/account`,
} as const satisfies Record<SettingsCategoryId, string>;

export function isSettingsCategoryId(
  value: string | undefined,
): value is SettingsCategoryId {
  return SETTINGS_CATEGORY_IDS.includes(value as SettingsCategoryId);
}

export function settingsCategoryPath(category: SettingsCategoryId): string {
  return SETTINGS_CATEGORY_ROUTES[category];
}

const SETTINGS_CATEGORY_HASHES: Readonly<Record<string, SettingsCategoryId>> = {
  'settings-connection': 'relationship',
  'settings-notifications': 'notifications',
  'settings-dashboard': 'today',
  'settings-appearance': 'appearance',
  'settings-appearance-panel': 'appearance',
  'settings-data': 'data',
  'settings-account': 'account',
};

export function settingsCategoryIdFromHash(
  hash: string,
): SettingsCategoryId | null {
  const normalized = hash.replace(/^#/, '');
  return SETTINGS_CATEGORY_HASHES[normalized] ?? null;
}

export const MORE_PRIVATE_ROUTE = '/more/private';

/**
 * Instance-wide operational administration. It is deliberately outside the
 * partner/product navigation tree and never derives authorization from a Space.
 */
export const SERVER_ADMIN_ROUTE = '/server-admin';

/* Games content ---------------------------------------------------------- */

export const GAMES_MOMENTS_ROUTE = '/games/our-moments';
export const GAMES_WISH_DETECTIVE_ROUTE = '/games/wish-detective';

/* Story content ---------------------------------------------------------- */

export const STORY_CHAPTERS_ROUTE = '/story/chapters';
export const STORY_YEARS_ROUTE = '/story/years';
export const STORY_YEAR_ROUTE_PATTERN = '/story/years/:year';
export const MEMORY_CREATE_ROUTE = '/story/memories/new';
export const MEMORY_DETAIL_ROUTE_PATTERN = '/story/memories/:memoryId';
export const MEMORY_EDIT_ROUTE_PATTERN = '/story/memories/:memoryId/edit';
export const HEART_MOMENT_CREATE_ROUTE = '/story/heart-moments/new';
export const HEART_MOMENT_DETAIL_ROUTE_PATTERN =
  '/story/heart-moments/:heartMomentId';
export const HEART_MOMENT_EDIT_ROUTE_PATTERN =
  '/story/heart-moments/:heartMomentId/edit';
export const MILESTONE_CREATE_ROUTE = '/story/milestones/new';
export const MILESTONE_DETAIL_ROUTE_PATTERN = '/story/milestones/:milestoneId';
export const MILESTONE_EDIT_ROUTE_PATTERN =
  '/story/milestones/:milestoneId/edit';
export const CHAPTER_CREATE_ROUTE = '/plan/chapters/new';
export const CHAPTER_DETAIL_ROUTE_PATTERN = '/plan/chapters/:chapterId';

/* Planning content -------------------------------------------------------- */

export const WISH_DETAIL_ROUTE_PATTERN = '/plan/wishes/:wishId';
export const PLAN_DETAIL_ROUTE_PATTERN = '/plan/plans/:planId';
export const WISH_CREATE_ROUTE = '/plan/wishes/new';
export const PLAN_CREATE_ROUTE = '/plan/plans/new';

/* More / Organisieren content --------------------------------------------- */

export const PLACE_DETAIL_ROUTE_PATTERN = '/plan/places/:placeId';
export const COLLECTION_DETAIL_ROUTE_PATTERN =
  '/plan/collections/:collectionId';

/* Legacy paths ------------------------------------------------------------ */

/**
 * Paths the client shipped before the route model was decided. They are
 * rewritten by prefix and kept permanently: Deep Links to them have already
 * been shared, and a shared link that stops working is a broken promise rather
 * than a tidy-up.
 */
export const LEGACY_ROUTE_REWRITES = [
  { from: '/dashboard', to: '/today' },
  { from: '/activity', to: ACTIVITY_ROUTE },
  { from: '/planning', to: '/plan' },
  { from: '/people', to: MORE_PEOPLE_ROUTE },
  { from: '/notifications', to: MORE_NOTIFICATIONS_ROUTE },
  { from: '/profile', to: MORE_PROFILE_ROUTE },
  { from: '/settings', to: MORE_SETTINGS_ROUTE },
  { from: '/private', to: MORE_PRIVATE_ROUTE },
  { from: '/memory', to: '/story/memories' },
  { from: '/heart-moment', to: '/story/heart-moments' },
  { from: '/milestone', to: '/story/milestones' },
] as const satisfies readonly { from: string; to: string }[];

/**
 * Rewrites a legacy path, or returns null when the path is already current.
 * Only a whole leading segment is replaced, so `/memory-of-us` is never
 * mistaken for the `/memory` prefix.
 */
export function rewriteLegacyPath(pathname: string): string | null {
  for (const { from, to } of LEGACY_ROUTE_REWRITES) {
    if (pathname === from) return to;
    if (pathname.startsWith(`${from}/`)) {
      return to + pathname.slice(from.length);
    }
  }
  return null;
}

/**
 * Resolves which primary navigation area is active for a given pathname.
 * Corrects active state for domains that belong to an area conceptually (e.g.
 * chapters belong to Story/Momente, places & collections belong to Mehr)
 * while keeping existing deep links stable without URL migrations.
 */
export function activeNavigationArea(pathname: string): AppRouteId | null {
  if (pathname === '/today' || pathname.startsWith('/today/')) return 'today';
  if (
    pathname === '/story' ||
    pathname.startsWith('/story/') ||
    pathname.startsWith('/plan/chapters')
  ) {
    return 'story';
  }
  if (pathname === '/games' || pathname.startsWith('/games/')) return 'more';
  if (
    pathname === '/more' ||
    pathname.startsWith('/more/') ||
    pathname.startsWith('/plan/places') ||
    pathname.startsWith('/plan/collections')
  ) {
    return 'more';
  }
  if (pathname === '/plan' || pathname.startsWith('/plan/')) {
    return 'plan';
  }
  return null;
}

/* Path builders ----------------------------------------------------------- */

export function memoryDetailPath(memoryId: string): string {
  return `/story/memories/${encodeURIComponent(memoryId)}`;
}

export function memoryEditPath(memoryId: string): string {
  return `${memoryDetailPath(memoryId)}/edit`;
}

export function heartMomentDetailPath(heartMomentId: string): string {
  return `/story/heart-moments/${encodeURIComponent(heartMomentId)}`;
}

export function heartMomentEditPath(heartMomentId: string): string {
  return `${heartMomentDetailPath(heartMomentId)}/edit`;
}

export function milestoneDetailPath(milestoneId: string): string {
  return `/story/milestones/${encodeURIComponent(milestoneId)}`;
}

export function milestoneEditPath(milestoneId: string): string {
  return `${milestoneDetailPath(milestoneId)}/edit`;
}

export function storyYearPath(year: number): string {
  return `/story/years/${encodeURIComponent(String(year))}`;
}

export function wishDetailPath(wishId: string): string {
  return `/plan/wishes/${encodeURIComponent(wishId)}`;
}

export function planDetailPath(planId: string): string {
  return `/plan/plans/${encodeURIComponent(planId)}`;
}

export function placeDetailPath(placeId: string): string {
  return `/plan/places/${encodeURIComponent(placeId)}`;
}

export function chapterDetailPath(chapterId: string): string {
  return `/plan/chapters/${encodeURIComponent(chapterId)}`;
}

export function collectionDetailPath(collectionId: string): string {
  return `/plan/collections/${encodeURIComponent(collectionId)}`;
}

/**
 * Pro Vibe/Energy insights (#1151, placement updated by #1196). Discovery and
 * all three views live under More so the Mehr destination stays active while
 * people move between week, patterns and recap.
 */
export const MORE_INSIGHTS_ROUTE = '/more/insights';
export const MORE_INSIGHTS_PATTERNS_ROUTE = `${MORE_INSIGHTS_ROUTE}/patterns`;
export const MORE_INSIGHTS_RECAP_ROUTE = `${MORE_INSIGHTS_ROUTE}/recap`;
