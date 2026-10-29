import type { QueryClient } from '@tanstack/react-query';
import { loadStoredSession } from './sessionPersistence';
import { loadReferenceClientConfig } from './config';
import {
  clearProductReadCacheInBackground,
  deleteProductReadCacheEntry,
} from './productReadCache';

/**
 * Canonical React Query key for the authoritative derived space Dashboard.
 */
export function dashboardQueryKey(
  spaceId: string,
): readonly ['m5-s5', 'dashboard', string] {
  return ['m5-s5', 'dashboard', spaceId] as const;
}

/**
 * Invalidate the authoritative server Dashboard projection for the given space.
 *
 * The spaceId parameter is strictly mandatory so callers always target the
 * exact relationship context and never perform ambiguous global invalidations.
 */
export async function invalidateDashboard(
  queryClient: QueryClient,
  spaceId: string,
): Promise<void> {
  // The memory query may already have been collected, or never mounted in
  // this process. A confirmed mutation still revokes its durable snapshot.
  const session = loadStoredSession();
  let purge: Promise<unknown> = Promise.resolve();
  if (session?.spaceId === spaceId) {
    try {
      const resourceId = new URL(
        loadReferenceClientConfig().apiBaseUrl || '/',
        window.location.origin,
      ).href;
      purge = Promise.all(
        (['dashboard-overview', 'plans-overview'] as const).map((kind) =>
          deleteProductReadCacheEntry(
            session.account.id,
            spaceId,
            kind,
            resourceId,
          ),
        ),
      ).catch(() => clearProductReadCacheInBackground());
    } catch {
      clearProductReadCacheInBackground();
    }
  }
  await Promise.all([
    purge,
    queryClient.invalidateQueries({ queryKey: dashboardQueryKey(spaceId) }),
    queryClient.invalidateQueries({
      queryKey: ['relationship-passport'],
      predicate: (query) => query.queryKey[3] === spaceId,
    }),
  ]);
}
