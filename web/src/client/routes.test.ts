import {
  ACTIVITY_ROUTE,
  APP_ROUTES,
  PRIMARY_APP_ROUTES,
  CHAPTER_CREATE_ROUTE,
  CHAPTER_DETAIL_ROUTE_PATTERN,
  COLLECTION_DETAIL_ROUTE_PATTERN,
  DEFAULT_APP_ROUTE,
  GAMES_MOMENTS_ROUTE,
  GAMES_WISH_DETECTIVE_ROUTE,
  HEART_MOMENT_CREATE_ROUTE,
  HEART_MOMENT_DETAIL_ROUTE_PATTERN,
  HEART_MOMENT_EDIT_ROUTE_PATTERN,
  MEMORY_CREATE_ROUTE,
  MEMORY_DETAIL_ROUTE_PATTERN,
  MEMORY_EDIT_ROUTE_PATTERN,
  MILESTONE_CREATE_ROUTE,
  MILESTONE_DETAIL_ROUTE_PATTERN,
  MILESTONE_EDIT_ROUTE_PATTERN,
  MORE_NOTIFICATIONS_ROUTE,
  MORE_PEOPLE_ROUTE,
  MORE_PRIVATE_ROUTE,
  MORE_PROFILE_ROUTE,
  PLAN_DETAIL_ROUTE_PATTERN,
  PLAN_CREATE_ROUTE,
  PLACE_DETAIL_ROUTE_PATTERN,
  SEARCH_ROUTE,
  WISH_DETAIL_ROUTE_PATTERN,
  WISH_CREATE_ROUTE,
  activeNavigationArea,
  appRoutePath,
  chapterDetailPath,
  collectionDetailPath,
  heartMomentDetailPath,
  heartMomentEditPath,
  memoryDetailPath,
  memoryEditPath,
  milestoneDetailPath,
  milestoneEditPath,
  planDetailPath,
  placeDetailPath,
  rewriteLegacyPath,
  wishDetailPath,
} from './routes';

describe('primary navigation', () => {
  it('keeps four primary destinations while preserving the stable Games route', () => {
    expect(PRIMARY_APP_ROUTES.map((route) => route.id)).toEqual([
      'today',
      'story',
      'plan',
      'more',
    ]);
    expect(PRIMARY_APP_ROUTES).toHaveLength(4);
    expect(APP_ROUTES.map((route) => route.id)).toEqual([
      'today',
      'story',
      'plan',
      'games',
      'more',
    ]);
    expect(DEFAULT_APP_ROUTE).toBe('/today');
  });

  it('resolves primary route paths from stable ids', () => {
    expect(appRoutePath('today')).toBe('/today');
    expect(appRoutePath('story')).toBe('/story');
    expect(appRoutePath('plan')).toBe('/plan');
    expect(appRoutePath('games')).toBe('/games');
    expect(GAMES_MOMENTS_ROUTE).toBe('/games/our-moments');
    expect(GAMES_WISH_DETECTIVE_ROUTE).toBe('/games/wish-detective');
    expect(appRoutePath('more')).toBe('/more');
  });

  it('keeps destinations with sub-routes active inside them', () => {
    const withSubRoutes = APP_ROUTES.filter((route) => !route.end).map(
      (route) => route.id,
    );
    expect(withSubRoutes).toEqual(['today', 'story', 'plan', 'games', 'more']);
  });

  it('keeps Games out of the primary shell while preserving its canonical route', () => {
    const primaryPaths: readonly string[] = PRIMARY_APP_ROUTES.map(
      (route) => route.path,
    );
    expect(primaryPaths).not.toContain('/games');
    expect(primaryPaths).not.toContain('/discover');
    expect(appRoutePath('games')).toBe('/games');
  });

  it('keeps Search and Activity out of primary navigation', () => {
    const paths: readonly string[] = APP_ROUTES.map((route) => route.path);
    expect(paths).not.toContain(SEARCH_ROUTE);
    expect(paths).not.toContain(ACTIVITY_ROUTE);
    expect(SEARCH_ROUTE).toBe('/search');
    expect(ACTIVITY_ROUTE).toBe('/today/activity');
  });

  it('places non-primary areas under More', () => {
    for (const path of [
      MORE_PEOPLE_ROUTE,
      MORE_NOTIFICATIONS_ROUTE,
      MORE_PROFILE_ROUTE,
      MORE_PRIVATE_ROUTE,
    ]) {
      expect(path.startsWith('/more/')).toBe(true);
    }
  });
});

describe('content deep links', () => {
  it('builds encoded Story content paths under the Story area', () => {
    expect(MEMORY_CREATE_ROUTE).toBe('/story/memories/new');
    expect(MEMORY_DETAIL_ROUTE_PATTERN).toBe('/story/memories/:memoryId');
    expect(MEMORY_EDIT_ROUTE_PATTERN).toBe('/story/memories/:memoryId/edit');
    expect(memoryDetailPath('memory/with slash')).toBe(
      '/story/memories/memory%2Fwith%20slash',
    );
    expect(memoryEditPath('memory-1')).toBe('/story/memories/memory-1/edit');

    expect(HEART_MOMENT_CREATE_ROUTE).toBe('/story/heart-moments/new');
    expect(HEART_MOMENT_DETAIL_ROUTE_PATTERN).toBe(
      '/story/heart-moments/:heartMomentId',
    );
    expect(HEART_MOMENT_EDIT_ROUTE_PATTERN).toBe(
      '/story/heart-moments/:heartMomentId/edit',
    );
    expect(heartMomentDetailPath('heart/moment')).toBe(
      '/story/heart-moments/heart%2Fmoment',
    );
    expect(heartMomentEditPath('heart-1')).toBe(
      '/story/heart-moments/heart-1/edit',
    );

    expect(MILESTONE_CREATE_ROUTE).toBe('/story/milestones/new');
    expect(MILESTONE_DETAIL_ROUTE_PATTERN).toBe(
      '/story/milestones/:milestoneId',
    );
    expect(MILESTONE_EDIT_ROUTE_PATTERN).toBe(
      '/story/milestones/:milestoneId/edit',
    );
    expect(milestoneDetailPath('mile/stone')).toBe(
      '/story/milestones/mile%2Fstone',
    );
    expect(milestoneEditPath('milestone-1')).toBe(
      '/story/milestones/milestone-1/edit',
    );
  });

  it('builds encoded planning deep links under the Plan area', () => {
    expect(WISH_CREATE_ROUTE).toBe('/plan/wishes/new');
    expect(PLAN_CREATE_ROUTE).toBe('/plan/plans/new');
    expect(WISH_DETAIL_ROUTE_PATTERN).toBe('/plan/wishes/:wishId');
    expect(PLAN_DETAIL_ROUTE_PATTERN).toBe('/plan/plans/:planId');
    expect(PLACE_DETAIL_ROUTE_PATTERN).toBe('/plan/places/:placeId');
    expect(CHAPTER_CREATE_ROUTE).toBe('/plan/chapters/new');
    expect(CHAPTER_DETAIL_ROUTE_PATTERN).toBe('/plan/chapters/:chapterId');
    expect(COLLECTION_DETAIL_ROUTE_PATTERN).toBe(
      '/plan/collections/:collectionId',
    );
    expect(wishDetailPath('wish/one')).toBe('/plan/wishes/wish%2Fone');
    expect(planDetailPath('plan one')).toBe('/plan/plans/plan%20one');
    expect(placeDetailPath('place-1')).toBe('/plan/places/place-1');
    expect(chapterDetailPath('chapter-1')).toBe('/plan/chapters/chapter-1');
    expect(collectionDetailPath('collection-1')).toBe(
      '/plan/collections/collection-1',
    );
  });

  it('resolves active navigation area with corrected domain semantics', () => {
    expect(activeNavigationArea('/today')).toBe('today');
    expect(activeNavigationArea('/today/activity')).toBe('today');
    expect(activeNavigationArea('/story')).toBe('story');
    expect(activeNavigationArea('/story/chapters')).toBe('story');
    expect(activeNavigationArea('/plan/chapters/c1')).toBe('story');
    expect(activeNavigationArea('/games')).toBe('more');
    expect(activeNavigationArea('/games/our-moments')).toBe('more');
    expect(activeNavigationArea('/games/wish-detective')).toBe('more');
    expect(activeNavigationArea('/more')).toBe('more');
    expect(activeNavigationArea('/more/places')).toBe('more');
    expect(activeNavigationArea('/plan/places/p1')).toBe('more');
    expect(activeNavigationArea('/more/collections')).toBe('more');
    expect(activeNavigationArea('/plan/collections/k1')).toBe('more');
    expect(activeNavigationArea('/more/people')).toBe('more');
    expect(activeNavigationArea('/more/private/notes')).toBe('more');
    expect(activeNavigationArea('/plan')).toBe('plan');
    expect(activeNavigationArea('/plan/plans/p1')).toBe('plan');
    expect(activeNavigationArea('/plan/wishes/w1')).toBe('plan');
  });
});

describe('legacy paths', () => {
  it('rewrites every destination that moved', () => {
    expect(rewriteLegacyPath('/dashboard')).toBe('/today');
    expect(rewriteLegacyPath('/activity')).toBe('/today/activity');
    expect(rewriteLegacyPath('/planning')).toBe('/plan');
    expect(rewriteLegacyPath('/people')).toBe('/more/people');
    expect(rewriteLegacyPath('/notifications')).toBe('/more/notifications');
    expect(rewriteLegacyPath('/profile')).toBe('/more/profile');
  });

  it('keeps shared content deep links working', () => {
    expect(rewriteLegacyPath('/memory/memory-1')).toBe(
      '/story/memories/memory-1',
    );
    expect(rewriteLegacyPath('/memory/memory-1/edit')).toBe(
      '/story/memories/memory-1/edit',
    );
    expect(rewriteLegacyPath('/memory/new')).toBe('/story/memories/new');
    expect(rewriteLegacyPath('/heart-moment/heart-1')).toBe(
      '/story/heart-moments/heart-1',
    );
    expect(rewriteLegacyPath('/milestone/milestone-1')).toBe(
      '/story/milestones/milestone-1',
    );
    expect(rewriteLegacyPath('/planning/wishes/wish-1')).toBe(
      '/plan/wishes/wish-1',
    );
    expect(rewriteLegacyPath('/private/notes/note-1')).toBe(
      '/more/private/notes/note-1',
    );
  });

  it('only replaces whole leading segments', () => {
    // A path that merely starts with the same letters is not a legacy path.
    expect(rewriteLegacyPath('/memory-of-us')).toBeNull();
    expect(rewriteLegacyPath('/planningboard')).toBeNull();
  });

  it('leaves current paths untouched', () => {
    for (const path of [
      '/today',
      '/story',
      '/plan',
      '/games',
      '/more',
      '/search',
      '/story/memories/memory-1',
      '/more/private/notes/note-1',
    ]) {
      expect(rewriteLegacyPath(path)).toBeNull();
    }
  });
});
