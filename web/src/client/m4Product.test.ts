import {
  dashboardItemPath,
  engagementTargetPath,
  opaqueNextCursor,
  searchResultPath,
} from './m4Product';

describe('M5 S5/S3 product navigation', () => {
  it('links shared and private search targets to canonical product routes', () => {
    expect(searchResultPath('MEMORY', 'memory/with space')).toBe(
      '/story/memories/memory%2Fwith%20space',
    );
    expect(searchResultPath('HEART_MOMENT', 'heart-id')).toBe(
      '/story/heart-moments/heart-id',
    );
    expect(searchResultPath('MILESTONE', 'milestone-id')).toBe(
      '/story/milestones/milestone-id',
    );
    expect(searchResultPath('WISH', 'wish-id')).toBe('/plan/wishes/wish-id');
    expect(searchResultPath('PLAN', 'plan-id')).toBe('/plan/plans/plan-id');
    expect(searchResultPath('PLACE', 'place-id')).toBe('/plan/places/place-id');
    expect(searchResultPath('CHAPTER', 'chapter-id')).toBe(
      '/plan/chapters/chapter-id',
    );
    expect(searchResultPath('COLLECTION', 'collection-id')).toBe(
      '/plan/collections/collection-id',
    );
    expect(searchResultPath('COLLECTION_ITEM', 'item-id')).toBe('/more');

    expect(searchResultPath('PRIVATE_NOTE', 'private/id')).toBe(
      '/more/private/notes/private%2Fid',
    );
    expect(searchResultPath('GIFT_IDEA', 'gift-id')).toBe(
      '/more/private/gift-ideas/gift-id',
    );
    expect(
      searchResultPath('PRIVATE_COLLECTION', 'private-collection-id'),
    ).toBe('/more/private/collections/private-collection-id');
    expect(
      searchResultPath(
        'PRIVATE_COLLECTION_ITEM',
        'item-id',
        'private-collection-id',
      ),
    ).toBe('/more/private/collections/private-collection-id');
    expect(searchResultPath('PRIVATE_COLLECTION_ITEM', 'item-id')).toBeNull();
  });

  it('routes engagement targets to canonical detail routes and guards null targets', () => {
    expect(engagementTargetPath('MEMORY', 'memory-id')).toBe(
      '/story/memories/memory-id',
    );
    expect(engagementTargetPath('HEART_MOMENT', 'heart-id')).toBe(
      '/story/heart-moments/heart-id',
    );
    expect(engagementTargetPath('MILESTONE', 'milestone-id')).toBe(
      '/story/milestones/milestone-id',
    );
    expect(engagementTargetPath('WISH', 'wish-id')).toBe(
      '/plan/wishes/wish-id',
    );
    expect(engagementTargetPath('PLAN', 'plan-id')).toBe('/plan/plans/plan-id');
    expect(engagementTargetPath('PLACE', 'place-id')).toBe(
      '/plan/places/place-id',
    );
    expect(engagementTargetPath('CHAPTER', 'chapter-id')).toBe(
      '/plan/chapters/chapter-id',
    );
    expect(engagementTargetPath('COLLECTION', 'collection-id')).toBe(
      '/plan/collections/collection-id',
    );

    expect(engagementTargetPath(null, 'memory-id')).toBeNull();
    expect(engagementTargetPath('MEMORY', null)).toBeNull();
  });

  it('routes dashboard entries through the productized domain surfaces', () => {
    expect(dashboardItemPath('MEMORY', 'memory-id')).toBe(
      '/story/memories/memory-id',
    );
    expect(dashboardItemPath('HEART_MOMENT', 'heart-id')).toBe(
      '/story/heart-moments/heart-id',
    );
    expect(dashboardItemPath('MILESTONE', 'milestone-id')).toBe(
      '/story/milestones/milestone-id',
    );
    expect(dashboardItemPath('IMPORTANT_DATE', 'date-id')).toBe('/more/people');
    expect(dashboardItemPath('BIRTHDAY', 'birthday-id')).toBe('/more/people');
    expect(dashboardItemPath('ANNIVERSARY', 'anniversary-id')).toBe(
      '/more/people',
    );
    expect(dashboardItemPath('WISH', 'wish-id')).toBe('/plan/wishes/wish-id');
    expect(dashboardItemPath('PLAN', 'plan-id')).toBe('/plan/plans/plan-id');
    expect(dashboardItemPath('PLACE', 'place-id')).toBe(
      '/plan/places/place-id',
    );
    expect(dashboardItemPath('CHAPTER', 'chapter-id')).toBe(
      '/plan/chapters/chapter-id',
    );
    expect(dashboardItemPath('COLLECTION', 'collection-id')).toBe(
      '/plan/collections/collection-id',
    );
  });
});

describe('M5 S5 cursor handling', () => {
  it('passes opaque cursors through unchanged', () => {
    const cursor = 'opaque+/=cursor.with:punctuation';
    expect(opaqueNextCursor({ nextCursor: cursor })).toBe(cursor);
  });

  it('stops pagination only when the server omits the next cursor', () => {
    expect(opaqueNextCursor({ nextCursor: null })).toBeUndefined();
  });
});
