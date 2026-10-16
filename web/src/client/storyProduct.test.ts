import { StoryKind } from '../api/generated/models/StoryKind';
import { StoryOrder } from '../api/generated/models/StoryOrder';
import type { StoryItem } from '../api/generated/models/StoryItem';
import type { StoryPage } from '../api/generated/models/StoryPage';
import {
  aggregateStoryPages,
  parseStoryFilters,
  selectFeaturedStoryItem,
  storyCacheResourceId,
  storyFiltersToSearch,
  storyRequest,
} from './storyProduct';

describe('EIMIR-M5-Web-S2-SCOPE Story product query', () => {
  it('parses only supported Story filters and preserves a stable cache identity', () => {
    const filters = parseStoryFilters(
      new URLSearchParams('type=HEART_MOMENT&year=2026&order=ASC'),
    );

    expect(filters).toEqual({
      kind: StoryKind.HEART_MOMENT,
      year: 2026,
      order: StoryOrder.ASC,
    });
    expect(storyCacheResourceId(filters)).toBe(
      'timeline:HEART_MOMENT:2026:ASC',
    );
    expect(storyFiltersToSearch(filters).toString()).toBe(
      'type=HEART_MOMENT&year=2026&order=ASC',
    );
  });

  it('maps filters and cursor directly to the generated Story API request', () => {
    expect(
      storyRequest(
        'space-1',
        {
          kind: StoryKind.MEMORY,
          year: 2025,
          order: StoryOrder.DESC,
        },
        'cursor-2',
      ),
    ).toEqual({
      spaceId: 'space-1',
      type: [StoryKind.MEMORY],
      year: 2025,
      order: StoryOrder.DESC,
      cursor: 'cursor-2',
      limit: 25,
    });
  });

  it('aggregates loaded cursor pages without inventing pagination state', () => {
    const first = {
      items: [{ kind: 'MEMORY' }],
      hasMore: true,
      nextCursor: 'cursor-2',
    } as unknown as StoryPage;
    const second = {
      items: [{ kind: 'MILESTONE' }],
      hasMore: false,
      nextCursor: null,
    } as unknown as StoryPage;

    const combined = aggregateStoryPages([first, second]);
    expect(combined.items).toHaveLength(2);
    expect(combined.hasMore).toBe(false);
    expect(combined.nextCursor).toBeNull();
  });
});

describe('selectFeaturedStoryItem', () => {
  function makeMemory(id: string, hasAttachment = true) {
    return {
      kind: 'MEMORY',
      effectiveDate: new Date('2026-06-01T12:00:00Z'),
      memory: {
        id,
        spaceId: 's1',
        title: `Memory ${id}`,
        attachments: hasAttachment
          ? [
              {
                id: `att-${id}`,
                spaceId: 's1',
                fileName: 'photo.jpg',
                contentType: 'image/jpeg',
                fileSize: 1024,
                createdAt: new Date(),
              },
            ]
          : [],
      },
    } as unknown as StoryItem;
  }

  function makeHeart(id: string) {
    return {
      kind: 'HEART_MOMENT',
      effectiveDate: new Date('2026-06-01T12:00:00Z'),
      heartMoment: {
        id,
        spaceId: 's1',
        emotion: 'LOVED',
      },
    } as unknown as StoryItem;
  }

  function makeMilestone(id: string) {
    return {
      kind: 'MILESTONE',
      effectiveDate: new Date('2026-06-01T12:00:00Z'),
      milestone: {
        id,
        spaceId: 's1',
        title: `Milestone ${id}`,
      },
    } as unknown as StoryItem;
  }

  it('returns null for empty items', () => {
    expect(selectFeaturedStoryItem([])).toBeNull();
  });

  it('remains stable when exactly one eligible item exists', () => {
    const item = makeMemory('m1');
    const day1 = new Date('2026-09-04T10:00:00Z');
    const day2 = new Date('2026-09-05T14:00:00Z');

    expect(selectFeaturedStoryItem([item], day1)).toBe(item);
    expect(selectFeaturedStoryItem([item], day2)).toBe(item);
  });

  it('produces deterministic daily selection for the same date and items', () => {
    const items = [makeMemory('m1'), makeMemory('m2'), makeMemory('m3')];
    const date = new Date('2026-09-04T08:00:00Z');

    const firstCall = selectFeaturedStoryItem(items, date);
    const secondCall = selectFeaturedStoryItem(items, date);
    const thirdCall = selectFeaturedStoryItem(
      [...items].reverse(),
      new Date('2026-09-04T22:30:00Z'),
    );

    expect(firstCall).toBeDefined();
    expect(secondCall).toBe(firstCall);
    // Invariant to input array ordering and time of day
    expect(thirdCall).toEqual(firstCall);
  });

  it('rotates to different highlight on consecutive days when pool size permits', () => {
    const items = [makeMemory('m1'), makeMemory('m2'), makeMemory('m3')];
    const day1 = new Date('2026-09-04T12:00:00Z');
    const day2 = new Date('2026-09-05T12:00:00Z');
    const day3 = new Date('2026-09-06T12:00:00Z');

    const sel1 = selectFeaturedStoryItem(items, day1);
    const sel2 = selectFeaturedStoryItem(items, day2);
    const sel3 = selectFeaturedStoryItem(items, day3);

    expect(sel1).toBeDefined();
    expect(sel2).toBeDefined();
    expect(sel3).toBeDefined();
    expect(sel1).not.toBe(sel2);
    expect(sel2).not.toBe(sel3);
  });

  it('prefers memories with media over heart moments and milestones', () => {
    const mediaMemory = makeMemory('media-1', true);
    const textMemory = makeMemory('text-1', false);
    const heart = makeHeart('heart-1');
    const milestone = makeMilestone('mile-1');

    const items = [textMemory, heart, milestone, mediaMemory];
    const date = new Date('2026-09-04T12:00:00Z');

    const selected = selectFeaturedStoryItem(items, date);
    expect(selected).toBe(mediaMemory);
  });

  it('falls back to heart moments when no media memory exists', () => {
    const textMemory = makeMemory('text-1', false);
    const heart1 = makeHeart('heart-1');
    const heart2 = makeHeart('heart-2');
    const milestone = makeMilestone('mile-1');

    const items = [textMemory, milestone, heart1, heart2];
    const day1 = new Date('2026-09-04T12:00:00Z');
    const selected = selectFeaturedStoryItem(items, day1);

    expect(selected?.kind).toBe('HEART_MOMENT');
  });

  it('falls back to general items when no media memories or heart moments exist', () => {
    const textMemory = makeMemory('text-1', false);
    const milestone = makeMilestone('mile-1');

    const items = [textMemory, milestone];
    const date = new Date('2026-09-04T12:00:00Z');
    const selected = selectFeaturedStoryItem(items, date);

    expect(selected).toBeDefined();
    expect(['MEMORY', 'MILESTONE']).toContain(selected?.kind);
  });

  it('remains valid when an item disappears from the pool', () => {
    const m1 = makeMemory('m1');
    const m2 = makeMemory('m2');
    const m3 = makeMemory('m3');
    const date = new Date('2026-09-04T12:00:00Z');

    const withAll = selectFeaturedStoryItem([m1, m2, m3], date);
    expect(withAll).toBeDefined();

    // Remove whichever item was selected
    const remaining = [m1, m2, m3].filter((it) => it !== withAll);
    const afterRemoval = selectFeaturedStoryItem(remaining, date);
    expect(afterRemoval).toBeDefined();
    expect(remaining).toContain(afterRemoval);
  });
});
