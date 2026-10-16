import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { surfaceRefreshDecision } from '../client/surfaceRefreshPolicy';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { usePullToRefresh } from './usePullToRefresh';

/**
 * Default refresh contract for safe authenticated product surfaces.
 *
 * Query ownership stays with each mounted page. Refetching only active
 * observers means the shell does not encode domain query keys or wake unrelated
 * inactive caches, while still refreshing the complete visible surface.
 */
export function AppSurfacePullToRefresh({ pathname }: { pathname: string }) {
  const queryClient = useQueryClient();
  const activeFetches = useIsFetching();
  const decision = surfaceRefreshDecision(pathname);
  const enabled = decision.mode === 'pull_to_refresh';

  const refreshActiveSurface = useCallback(async () => {
    await queryClient.refetchQueries({ type: 'active' });
  }, [queryClient]);

  const state = usePullToRefresh({
    enabled,
    blocked: activeFetches > 0,
    onRefresh: refreshActiveSurface,
  });

  if (!enabled) return null;
  return <PullToRefreshIndicator state={state} />;
}
