import { describe, expect, it } from 'vitest';
import { surfaceRefreshDecision } from './surfaceRefreshPolicy';

describe('surfaceRefreshDecision', () => {
  it.each([
    '/today',
    '/today/activity',
    '/plan',
    '/story/years',
    '/story/years/2026',
    '/story/chapters',
    '/more/places',
    '/more/collections',
    '/more/notifications',
    '/story/memories/abc',
    '/story/heart-moments/abc',
    '/story/milestones/abc',
  ])('enables pull-to-refresh on safe dynamic surface %s', (pathname) => {
    expect(surfaceRefreshDecision(pathname).mode).toBe('pull_to_refresh');
  });

  it('lets Momente keep its surface-specific pagination refresh contract', () => {
    expect(surfaceRefreshDecision('/story').mode).toBe('surface_owned');
  });

  it.each([
    '/search',
    '/games/our-moments',
    '/more/people',
    '/more/profile',
    '/more/settings',
    '/more/private/notes',
    '/plan/wishes/abc',
    '/plan/plans/abc',
    '/plan/chapters/abc',
    '/plan/places/abc',
    '/plan/collections/abc',
    '/story/memories/abc/edit',
    '/story/memories/new',
  ])('keeps interaction-sensitive surface %s on automatic revalidation', (pathname) => {
    expect(surfaceRefreshDecision(pathname).mode).toBe('automatic_only');
  });

  it('does not add a refresh gesture to the static More hub', () => {
    expect(surfaceRefreshDecision('/more').mode).toBe('none');
  });
});
