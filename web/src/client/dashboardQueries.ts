import type { QueryClient } from '@tanstack/react-query';

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
  await queryClient.invalidateQueries({
    queryKey: dashboardQueryKey(spaceId),
  });
}
