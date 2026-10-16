import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { dashboardQueryKey, invalidateDashboard } from './dashboardQueries';

describe('dashboardQueries', () => {
  it('builds canonical query key with spaceId', () => {
    expect(dashboardQueryKey('space-123')).toEqual([
      'm5-s5',
      'dashboard',
      'space-123',
    ]);
  });

  it('invalidates dashboard query with exact spaceId', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateDashboard(queryClient, 'space-456');

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['m5-s5', 'dashboard', 'space-456'],
    });
  });
});
