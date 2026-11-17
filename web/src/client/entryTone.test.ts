import { describe, expect, it } from 'vitest';
import type { StoryItem } from '../api/generated/models/StoryItem';
import { retrospectiveTone, storyEntryTone } from './entryTone';

function memory(experienceKind?: 'HAPPINESS' | 'TIME_TRAVEL'): StoryItem {
  return {
    kind: 'MEMORY',
    memory: { experienceKind },
  } as unknown as StoryItem;
}

describe('storyEntryTone', () => {
  it('lets Heart Moments and Milestones be playful', () => {
    expect(storyEntryTone({ kind: 'HEART_MOMENT' } as StoryItem, false)).toBe(
      'playful',
    );
    expect(storyEntryTone({ kind: 'MILESTONE' } as StoryItem, false)).toBe(
      'playful',
    );
  });

  it('treats shared happiness as playful and Time Travel as calm', () => {
    expect(storyEntryTone(memory('HAPPINESS'), false)).toBe('playful');
    expect(storyEntryTone(memory('TIME_TRAVEL'), true)).toBe('calm');
  });

  it('keeps a plain text-only memory calm and a plain photo memory playful', () => {
    expect(storyEntryTone(memory(), false)).toBe('calm');
    expect(storyEntryTone(memory(), true)).toBe('playful');
  });
});

describe('retrospectiveTone', () => {
  it('only a photo earns the hanging presentation', () => {
    expect(retrospectiveTone({ previewAttachmentId: 'a1' })).toBe('playful');
    expect(retrospectiveTone({ previewAttachmentId: null })).toBe('calm');
    expect(retrospectiveTone({})).toBe('calm');
  });
});
