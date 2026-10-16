import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  dashboardQueryKey,
  invalidateDashboard,
} from '../client/dashboardQueries';

describe('Today Dashboard Freshness Invalidation', () => {
  const spaceId = 'space-test-freshness';

  it('ensures dashboard query key is strictly derived from spaceId', () => {
    const key = dashboardQueryKey(spaceId);
    expect(key).toEqual(['m5-s5', 'dashboard', spaceId]);
  });

  it('invalidates dashboard query when invalidateDashboard is invoked', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateDashboard(queryClient, spaceId);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['m5-s5', 'dashboard', spaceId],
    });
  });

  it('marks cached dashboard queries as stale upon mutation invalidation', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000,
        },
      },
    });

    // Seed the cache
    queryClient.setQueryData(dashboardQueryKey(spaceId), {
      space: {
        id: spaceId,
        partner: { id: 'partner-1', displayName: 'Partner' },
      },
      relationshipDuration: { daysTogether: 50, startedOn: new Date() },
      upcoming: [
        {
          id: 'plan-later',
          type: 'PLAN',
          titleOrText: 'Later trip',
          scheduledAt: new Date('2026-09-30T10:00:00Z'),
        },
      ],
      recentShared: [],
      retrospective: null,
    });

    const queryStateBefore = queryClient.getQueryState(
      dashboardQueryKey(spaceId),
    );
    expect(queryStateBefore?.isInvalidated).toBeFalsy();

    // Trigger invalidation (simulating mutation on Plan, ImportantDate, Person, Profile, or Story)
    await invalidateDashboard(queryClient, spaceId);

    const queryStateAfter = queryClient.getQueryState(
      dashboardQueryKey(spaceId),
    );
    expect(queryStateAfter?.isInvalidated).toBe(true);
  });

  it('only invalidates the targeted space and leaves other space dashboard caches untouched', async () => {
    const queryClient = new QueryClient();
    const otherSpaceId = 'space-other';

    queryClient.setQueryData(dashboardQueryKey(spaceId), {
      space: { id: spaceId, partner: null },
      upcoming: [],
      recentShared: [],
      retrospective: null,
      relationshipDuration: null,
    });

    queryClient.setQueryData(dashboardQueryKey(otherSpaceId), {
      space: { id: otherSpaceId, partner: null },
      upcoming: [],
      recentShared: [],
      retrospective: null,
      relationshipDuration: null,
    });

    await invalidateDashboard(queryClient, spaceId);

    expect(
      queryClient.getQueryState(dashboardQueryKey(spaceId))?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(dashboardQueryKey(otherSpaceId))?.isInvalidated,
    ).toBeFalsy();
  });
});
