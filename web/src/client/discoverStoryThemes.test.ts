import { describe, expect, it } from 'vitest';
import type { StoryItem } from '../api/generated/models/StoryItem';
import {
  buildDiscoverStoryThemes,
  type DiscoverStoryTheme,
  discoverStoryThemeOf,
  stepDiscoverStory,
} from './discoverStoryThemes';
import { storyItemKey } from './storyProduct';

function memory(id: string, photos = 0): StoryItem {
  return {
    kind: 'MEMORY',
    effectiveDate: new Date('2026-08-24T00:00:00Z'),
    memory: {
      id,
      title: id,
      author: { id: 'a', displayName: 'Lea' },
      attachments: Array.from({ length: photos }, (_, position) => ({
        id: `${id}-${position}`,
        position,
      })),
    },
  } as unknown as StoryItem;
}

function heart(id: string): StoryItem {
  return {
    kind: 'HEART_MOMENT',
    effectiveDate: new Date('2026-08-12T00:00:00Z'),
    heartMoment: {
      id,
      text: 'Danke',
      emotion: 'LOVED',
      author: { id: 'b', displayName: 'Alex' },
      attachment: null,
    },
  } as unknown as StoryItem;
}

function milestone(id: string): StoryItem {
  return {
    kind: 'MILESTONE',
    effectiveDate: new Date('2026-08-01T00:00:00Z'),
    milestone: { id, title: id, author: { id: 'a', displayName: 'Lea' } },
  } as unknown as StoryItem;
}

function keys(themes: DiscoverStoryTheme[]) {
  return themes.map((theme) => [theme.key, theme.items.map(storyItemKey)]);
}

describe('discoverStoryThemeOf', () => {
  it('classifies photo memories, text memories, heart moments and milestones', () => {
    expect(discoverStoryThemeOf(memory('m', 2))).toBe('photos');
    expect(discoverStoryThemeOf(memory('m', 0))).toBe('words');
    expect(discoverStoryThemeOf(heart('h'))).toBe('heartMoments');
    expect(discoverStoryThemeOf(milestone('s'))).toBe('milestones');
  });
});

describe('buildDiscoverStoryThemes', () => {
  it('groups in fixed theme order and keeps the canonical order inside a theme', () => {
    const themes = buildDiscoverStoryThemes([
      heart('h-1'),
      memory('m-1', 1),
      milestone('s-1'),
      memory('m-2', 0),
      heart('h-2'),
      memory('m-3', 3),
      milestone('s-2'),
      memory('m-4', 0),
    ]);
    expect(keys(themes)).toEqual([
      ['photos', ['memory-m-1', 'memory-m-3']],
      ['heartMoments', ['heart-h-1', 'heart-h-2']],
      ['milestones', ['milestone-s-1', 'milestone-s-2']],
      ['words', ['memory-m-2', 'memory-m-4']],
    ]);
  });

  it('omits empty themes and returns nothing for an empty selection', () => {
    expect(
      keys(buildDiscoverStoryThemes([milestone('s-1'), heart('h-1')])),
    ).toEqual([
      ['heartMoments', ['heart-h-1']],
      ['milestones', ['milestone-s-1']],
    ]);
    expect(buildDiscoverStoryThemes([])).toEqual([]);
  });

  it('never shows one entry twice', () => {
    expect(
      keys(buildDiscoverStoryThemes([heart('h-1'), heart('h-1')])),
    ).toEqual([['heartMoments', ['heart-h-1']]]);
  });
});

describe('stepDiscoverStory', () => {
  const themes = buildDiscoverStoryThemes([
    memory('m-1', 1),
    memory('m-2', 1),
    heart('h-1'),
    milestone('s-1'),
  ]);

  it('moves inside a theme and continues with the next theme', () => {
    expect(stepDiscoverStory(themes, { theme: 0, slide: 0 }, 1)).toEqual({
      theme: 0,
      slide: 1,
    });
    expect(stepDiscoverStory(themes, { theme: 0, slide: 1 }, 1)).toEqual({
      theme: 1,
      slide: 0,
    });
  });

  it('goes back to the previous theme and stops at the very first slide', () => {
    expect(stepDiscoverStory(themes, { theme: 1, slide: 0 }, -1)).toEqual({
      theme: 0,
      slide: 1,
    });
    expect(stepDiscoverStory(themes, { theme: 0, slide: 0 }, -1)).toBeNull();
  });

  it('stops after the last slide unless an explicit step may wrap', () => {
    expect(stepDiscoverStory(themes, { theme: 2, slide: 0 }, 1)).toBeNull();
    expect(
      stepDiscoverStory(themes, { theme: 2, slide: 0 }, 1, { wrap: true }),
    ).toEqual({ theme: 0, slide: 0 });
    const single = buildDiscoverStoryThemes([heart('h-1')]);
    expect(
      stepDiscoverStory(single, { theme: 0, slide: 0 }, 1, { wrap: true }),
    ).toBeNull();
  });

  it('recovers from a stale position after the selection changed', () => {
    expect(stepDiscoverStory(themes, { theme: 9, slide: 3 }, 1)).toEqual({
      theme: 0,
      slide: 0,
    });
    expect(stepDiscoverStory([], { theme: 0, slide: 0 }, 1)).toBeNull();
  });
});
