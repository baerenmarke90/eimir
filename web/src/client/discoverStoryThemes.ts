import type { StoryItem } from '../api/generated/models/StoryItem';
import { galleryCover } from './galleryCover';
import { storyItemKey } from './storyProduct';

/**
 * Momente > Erinnerungen "Fotostory" (direction C): the curated Discover
 * selection is regrouped into a few themes that play one after another.
 * Order of the themes is fixed; inside a theme the backend's canonical order
 * is preserved. A theme without entries is omitted.
 */
export const DISCOVER_STORY_THEME_ORDER = [
  'photos',
  'heartMoments',
  'milestones',
  'words',
] as const;

export type DiscoverStoryThemeKey = (typeof DISCOVER_STORY_THEME_ORDER)[number];

export interface DiscoverStoryTheme {
  key: DiscoverStoryThemeKey;
  items: StoryItem[];
}

/** Position of the visible slide: theme index and slide index inside it. */
export interface DiscoverStoryPosition {
  theme: number;
  slide: number;
}

/**
 * A Memory with an authorized cover photo is a photo slide; a Memory without
 * one is told in words. Heart Moments and Milestones keep their own themes.
 */
export function discoverStoryThemeOf(item: StoryItem): DiscoverStoryThemeKey {
  switch (item.kind) {
    case 'MEMORY':
      return galleryCover(item.memory) ? 'photos' : 'words';
    case 'HEART_MOMENT':
      return 'heartMoments';
    case 'MILESTONE':
      return 'milestones';
  }
}

export function buildDiscoverStoryThemes(
  items: readonly StoryItem[],
): DiscoverStoryTheme[] {
  const buckets = new Map<DiscoverStoryThemeKey, StoryItem[]>(
    DISCOVER_STORY_THEME_ORDER.map((key) => [key, []]),
  );
  const seen = new Set<string>();
  for (const item of items) {
    // A curated selection never repeats an entry; guard against a duplicate
    // anyway so one entry cannot occupy two slides with the same React key.
    const key = storyItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    buckets.get(discoverStoryThemeOf(item))?.push(item);
  }
  return DISCOVER_STORY_THEME_ORDER.flatMap((key) => {
    const themeItems = buckets.get(key) ?? [];
    return themeItems.length > 0 ? [{ key, items: themeItems }] : [];
  });
}

/**
 * Next or previous slide across theme boundaries. The last slide of a theme
 * continues with the next theme; going back from a theme's first slide shows
 * the previous theme's last slide. `wrap` lets an explicit "next" on the very
 * last slide start again; autoplay stops there instead (returns null).
 */
export function stepDiscoverStory(
  themes: readonly { items: readonly unknown[] }[],
  position: DiscoverStoryPosition,
  direction: 1 | -1,
  { wrap = false }: { wrap?: boolean } = {},
): DiscoverStoryPosition | null {
  const theme = themes[position.theme];
  if (!theme) return themes.length > 0 ? { theme: 0, slide: 0 } : null;
  if (direction === 1) {
    if (position.slide + 1 < theme.items.length)
      return { theme: position.theme, slide: position.slide + 1 };
    if (position.theme + 1 < themes.length)
      return { theme: position.theme + 1, slide: 0 };
    if (!wrap) return null;
    const start = { theme: 0, slide: 0 };
    return start.theme === position.theme && start.slide === position.slide
      ? null
      : start;
  }
  if (position.slide > 0)
    return { theme: position.theme, slide: position.slide - 1 };
  if (position.theme > 0) {
    const previous = themes[position.theme - 1];
    return { theme: position.theme - 1, slide: previous.items.length - 1 };
  }
  return null;
}
