import { describe, expect, it } from 'vitest';
import type { ChapterTimelineMarker } from '../api/generated/models/ChapterTimelineMarker';
import type { StoryItem } from '../api/generated/models/StoryItem';
import { groupDiaryEntries } from './diaryEntries';
import {
  aggregateStoryPages,
  storyRequest,
  DEFAULT_STORY_FILTERS,
} from './storyProduct';
import { formatChapterPeriod } from './chapterPresentation';
import { i18n } from '../i18n';

const date = new Date('2026-06-01T00:00:00Z');
const chapter: ChapterTimelineMarker = {
  id: 'chapter-a',
  title: 'Our summer',
  startOn: date,
  endOn: new Date('2027-02-01T00:00:00Z'),
  position: 2,
};
const memory = {
  kind: 'MEMORY',
  effectiveDate: date,
  memory: { id: 'memory-a', createdAt: date },
} as StoryItem;
const milestone = {
  kind: 'MILESTONE',
  effectiveDate: date,
  milestone: { id: 'milestone-a', createdAt: date },
} as StoryItem;

describe('chapter diary projection', () => {
  it('preserves the authoritative combined position in either server direction', () => {
    const otherChapter = { ...chapter, id: 'chapter-b', position: 3 };
    const ascending = groupDiaryEntries(
      [memory, milestone],
      [chapter, otherChapter],
      'en-GB',
    );
    expect(ascending).toHaveLength(1);
    const entries = ascending[0].entries;
    expect(entries).toEqual([
      { type: 'story', item: memory },
      { type: 'story', item: milestone },
      { type: 'chapter', chapter },
      { type: 'chapter', chapter: otherChapter },
    ]);
    expect(
      groupDiaryEntries(
        [milestone, memory],
        [
          { ...otherChapter, position: 0 },
          { ...chapter, position: 1 },
        ],
        'en-GB',
      )[0].entries,
    ).toEqual([
      { type: 'chapter', chapter: { ...otherChapter, position: 0 } },
      { type: 'chapter', chapter: { ...chapter, position: 1 } },
      { type: 'story', item: milestone },
      { type: 'story', item: memory },
    ]);
    expect(ascending[0].key).toBe('2026-06');
  });

  it('retains marker-only pages and deduplicates independent sources and chapters', () => {
    const page = {
      items: [memory],
      chapterMarkers: [chapter],
      availableYears: [2026],
      hasMore: true,
      nextCursor: 'next',
    };
    const combined = aggregateStoryPages([
      page,
      { ...page, items: [], hasMore: false, nextCursor: null },
    ]);
    expect(combined.items).toEqual([memory]);
    expect(combined.chapterMarkers).toEqual([{ ...chapter, position: 1 }]);
    expect(combined.hasMore).toBe(false);
    expect(combined.nextCursor).toBeNull();
    expect(groupDiaryEntries([], [chapter], 'en-GB')[0].entries).toEqual([
      { type: 'chapter', chapter },
    ]);
  });

  it('opts the unfiltered diary into markers and keeps type-filtered content separate', () => {
    expect(
      storyRequest('space', DEFAULT_STORY_FILTERS, null).includeChapters,
    ).toBe(true);
    expect(
      storyRequest('space', { ...DEFAULT_STORY_FILTERS, kind: 'MEMORY' }, null)
        .includeChapters,
    ).toBeUndefined();
  });

  it('formats authored complete, open and absent calendar periods without timezone shifts', () => {
    expect(formatChapterPeriod(chapter, i18n.t.bind(i18n), 'de-DE')).toBe(
      '01.06.2026 – 01.02.2027',
    );
    expect(
      formatChapterPeriod({ startOn: date }, i18n.t.bind(i18n), 'de-DE'),
    ).toBe('Seit 01.06.2026');
    expect(
      formatChapterPeriod({ endOn: date }, i18n.t.bind(i18n), 'de-DE'),
    ).toBe('Bis 01.06.2026');
    expect(formatChapterPeriod({}, i18n.t.bind(i18n), 'de-DE')).toBeNull();
  });
});
