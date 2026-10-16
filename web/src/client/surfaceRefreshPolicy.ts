export type SurfaceRefreshMode =
  | 'pull_to_refresh'
  | 'surface_owned'
  | 'automatic_only'
  | 'none';

export interface SurfaceRefreshDecision {
  mode: SurfaceRefreshMode;
  reason: string;
}

function matchesDetail(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) return false;
  const rest = pathname.slice(prefix.length);
  return Boolean(rest && !rest.includes('/') && rest !== 'new');
}

/**
 * Route-level interaction policy for #1027.
 *
 * This deliberately decides only whether the shared document-level gesture is
 * safe. Domain query selection remains with the mounted surface/query layer.
 */
export function surfaceRefreshDecision(
  pathname: string,
): SurfaceRefreshDecision {
  if (pathname === '/story') {
    return {
      mode: 'surface_owned',
      reason:
        'Momente owns refresh because Timeline must reset progressive-pagination state after a successful refresh.',
    };
  }

  if (
    pathname === '/today' ||
    pathname === '/today/activity' ||
    pathname === '/story/years' ||
    /^\/story\/years\/[^/]+$/.test(pathname) ||
    pathname === '/plan' ||
    pathname === '/story/chapters' ||
    pathname === '/more/places' ||
    pathname === '/more/collections' ||
    pathname === '/more/notifications' ||
    matchesDetail(pathname, '/story/memories/') ||
    matchesDetail(pathname, '/story/heart-moments/') ||
    matchesDetail(pathname, '/story/milestones/')
  ) {
    return {
      mode: 'pull_to_refresh',
      reason:
        'Dynamic server-backed vertical surface with no primary unsaved editor in this route.',
    };
  }

  if (
    pathname === '/search' ||
    pathname === '/games' ||
    pathname.startsWith('/games/') ||
    pathname === '/more/people' ||
    pathname === '/more/profile' ||
    pathname === '/more/settings' ||
    pathname.startsWith('/more/private') ||
    /^\/plan\/(?:wishes|plans|chapters|places|collections)\/[^/]+$/.test(
      pathname,
    ) ||
    pathname.endsWith('/edit') ||
    pathname.endsWith('/new')
  ) {
    return {
      mode: 'automatic_only',
      reason:
        'Dynamic surface contains an editor, task gesture, search input, or mutable form where a document pull must not refetch underneath local input.',
    };
  }

  if (pathname === '/more') {
    return {
      mode: 'none',
      reason: 'Navigation hub has no authoritative mutable dataset to refresh.',
    };
  }

  return {
    mode: 'automatic_only',
    reason:
      'Unclassified authenticated surface keeps automatic stale/focus/reconnect revalidation until its interaction contract is explicitly audited.',
  };
}
