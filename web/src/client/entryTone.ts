import type { DashboardItem } from '../api/generated/models/DashboardItem';
import type { StoryItem } from '../api/generated/models/StoryItem';

/**
 * How playful an entry may look (Handmade Diary, scrapbook presentation).
 *
 * The paper, tape and swinging motion are warm and light-hearted. They must
 * not decorate a serious memory, so playfulness is opt-in: only an explicit
 * positive signal in the data earns it. Anything unknown stays calm.
 */
export type EntryTone = 'playful' | 'calm';

/**
 * Timeline entries carry real signals:
 * - Heart Moments are always positive (every HeartEmotion is: loved, seen,
 *   appreciated, supported, grateful, happy);
 * - Milestones are celebrations the couple created on purpose;
 * - a Memory marked as shared happiness is positive; a Time Travel answer is
 *   reflective, so it stays calm;
 * - a plain Memory with a photo is an album page, so it is playful; a plain
 *   text-only Memory has no signal and stays calm.
 *
 * Limitation: a photo of a hard moment still reads as playful, because the
 * data has no mood for ordinary memories.
 */
export function storyEntryTone(item: StoryItem, hasImage: boolean): EntryTone {
  switch (item.kind) {
    case 'HEART_MOMENT':
    case 'MILESTONE':
      return 'playful';
    case 'MEMORY':
      if (item.memory.experienceKind === 'HAPPINESS') return 'playful';
      if (item.memory.experienceKind === 'TIME_TRAVEL') return 'calm';
      return hasImage ? 'playful' : 'calm';
  }
}

/**
 * The Wir rediscovery card works from a DashboardItem, which has no emotion or
 * memory kind. The only signal is a photo, so a photo memory may hang on the
 * line; text-only items stay calm. Adding a mood to the dashboard contract
 * would replace this heuristic.
 */
export function retrospectiveTone(
  item: Pick<DashboardItem, 'previewAttachmentId'>,
): EntryTone {
  return item.previewAttachmentId ? 'playful' : 'calm';
}
