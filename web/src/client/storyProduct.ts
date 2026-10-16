import type { GetStoryTimelineRequest } from '../api/generated/apis/StoryApi';
import {
  StoryKind,
  type StoryKind as StoryKindValue,
} from '../api/generated/models/StoryKind';
import {
  StoryOrder,
  type StoryOrder as StoryOrderValue,
} from '../api/generated/models/StoryOrder';
import type { StoryItem } from '../api/generated/models/StoryItem';
import type { StoryPage } from '../api/generated/models/StoryPage';

export interface StoryFilters {
  kind: StoryKindValue | null;
  year: number | null;
  order: StoryOrderValue;
}

export const DEFAULT_STORY_FILTERS: StoryFilters = {
  kind: null,
  year: null,
  order: StoryOrder.DESC,
};

function isStoryKind(value: string | null): value is StoryKindValue {
  return (
    value !== null && Object.values(StoryKind).includes(value as StoryKindValue)
  );
}

export function parseStoryFilters(search: URLSearchParams): StoryFilters {
  const kindValue = search.get('type');
  const yearValue = search.get('year');
  const parsedYear = yearValue ? Number(yearValue) : Number.NaN;
  const order =
    search.get('order') === StoryOrder.ASC ? StoryOrder.ASC : StoryOrder.DESC;

  return {
    kind: isStoryKind(kindValue) ? kindValue : null,
    year: Number.isInteger(parsedYear) && parsedYear > 0 ? parsedYear : null,
    order,
  };
}

export function storyFiltersToSearch(filters: StoryFilters): URLSearchParams {
  const search = new URLSearchParams();
  if (filters.kind) search.set('type', filters.kind);
  if (filters.year) search.set('year', String(filters.year));
  if (filters.order === StoryOrder.ASC) search.set('order', StoryOrder.ASC);
  return search;
}

export function storyCacheResourceId(filters: StoryFilters): string {
  return [
    'timeline',
    filters.kind ?? 'ALL',
    filters.year ?? 'ALL',
    filters.order,
  ].join(':');
}

export function storyRequest(
  spaceId: string,
  filters: StoryFilters,
  cursor: string | null,
): GetStoryTimelineRequest {
  return {
    spaceId,
    type: filters.kind ? [filters.kind] : undefined,
    year: filters.year ?? undefined,
    order: filters.order,
    cursor: cursor ?? undefined,
    limit: 25,
  };
}

export function aggregateStoryPages(pages: StoryPage[]): StoryPage {
  const lastPage = pages.at(-1);
  return {
    items: pages.flatMap((page) => page.items),
    hasMore: lastPage?.hasMore ?? false,
    nextCursor: lastPage?.nextCursor ?? null,
    availableYears: pages[0]?.availableYears ?? [],
  };
}

export function storyItemKey(item: StoryItem): string {
  switch (item.kind) {
    case 'MEMORY':
      return `memory-${item.memory.id}`;
    case 'HEART_MOMENT':
      return `heart-${item.heartMoment.id}`;
    case 'MILESTONE':
      return `milestone-${item.milestone.id}`;
  }
}

export function selectFeaturedStoryItem(
  items: StoryItem[],
  date: Date = new Date(),
): StoryItem | null {
  if (!items || items.length === 0) return null;

  const memoriesWithMedia = items.filter(
    (item) => item.kind === 'MEMORY' && item.memory.attachments.length > 0,
  );
  const heartMoments = items.filter((item) => item.kind === 'HEART_MOMENT');

  let pool: StoryItem[];
  if (memoriesWithMedia.length > 0) {
    pool = memoriesWithMedia;
  } else if (heartMoments.length > 0) {
    pool = heartMoments;
  } else {
    pool = items;
  }

  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  const sortedPool = [...pool].sort((a, b) =>
    storyItemKey(a).localeCompare(storyItemKey(b)),
  );

  const dayOrdinal = Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      86_400_000,
  );

  const index =
    ((dayOrdinal % sortedPool.length) + sortedPool.length) % sortedPool.length;
  return sortedPool[index];
}
