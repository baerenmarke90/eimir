import { ClientProblemError } from './problemDetails';
import { mayUseOfflineProductCache } from './productReadCache';
import {
  HEART_MOMENT_CREATE_ROUTE,
  HEART_MOMENT_DETAIL_ROUTE_PATTERN,
  HEART_MOMENT_EDIT_ROUTE_PATTERN,
  MEMORY_DETAIL_ROUTE_PATTERN,
  MEMORY_EDIT_ROUTE_PATTERN,
  MILESTONE_CREATE_ROUTE,
  MILESTONE_DETAIL_ROUTE_PATTERN,
  MILESTONE_EDIT_ROUTE_PATTERN,
} from './routes';

describe('EIMIR-M5-Web-S2-SCOPE', () => {
  it('keeps all story product deep-link surfaces registered', () => {
    expect([
      MEMORY_DETAIL_ROUTE_PATTERN,
      MEMORY_EDIT_ROUTE_PATTERN,
      HEART_MOMENT_CREATE_ROUTE,
      HEART_MOMENT_DETAIL_ROUTE_PATTERN,
      HEART_MOMENT_EDIT_ROUTE_PATTERN,
      MILESTONE_CREATE_ROUTE,
      MILESTONE_DETAIL_ROUTE_PATTERN,
      MILESTONE_EDIT_ROUTE_PATTERN,
    ]).toEqual([
      '/story/memories/:memoryId',
      '/story/memories/:memoryId/edit',
      '/story/heart-moments/new',
      '/story/heart-moments/:heartMomentId',
      '/story/heart-moments/:heartMomentId/edit',
      '/story/milestones/new',
      '/story/milestones/:milestoneId',
      '/story/milestones/:milestoneId/edit',
    ]);
  });

  it('fails closed instead of exposing a cached resource after authorization failures', () => {
    expect(mayUseOfflineProductCache(new ClientProblemError('offline'))).toBe(
      true,
    );
    expect(
      mayUseOfflineProductCache(new ClientProblemError('server', 503)),
    ).toBe(true);
    expect(
      mayUseOfflineProductCache(new ClientProblemError('unauthorized', 401)),
    ).toBe(false);
    expect(
      mayUseOfflineProductCache(new ClientProblemError('permission', 403)),
    ).toBe(false);
    expect(
      mayUseOfflineProductCache(new ClientProblemError('notFound', 404)),
    ).toBe(false);
  });
});
