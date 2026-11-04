import type { ChapterTimelineMarker } from '../api/generated/models/ChapterTimelineMarker';
import type { StoryItem } from '../api/generated/models/StoryItem';

export type DiaryEntry =
  | { type: 'chapter'; chapter: ChapterTimelineMarker }
  | { type: 'story'; item: StoryItem };

/** Preserve the server's complete key order, including sub-millisecond ties. */
export function interleaveDiaryEntries(
  items: StoryItem[],
  chapters: ChapterTimelineMarker[],
): DiaryEntry[] {
  const entries: DiaryEntry[] = [];
  let sourceIndex = 0;
  for (const chapter of chapters) {
    while (entries.length < chapter.position && sourceIndex < items.length) {
      entries.push({ type: 'story', item: items[sourceIndex++] });
    }
    entries.push({ type: 'chapter', chapter });
  }
  for (; sourceIndex < items.length; sourceIndex++)
    entries.push({ type: 'story', item: items[sourceIndex] });
  return entries;
}

/** Group the diary-only projection without re-sorting or broadening Story kinds. */
export function groupDiaryEntries(
  items: StoryItem[],
  chapters: ChapterTimelineMarker[],
  locale: string,
) {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const groups = new Map<
    string,
    { key: string; label: string; entries: DiaryEntry[] }
  >();
  for (const entry of interleaveDiaryEntries(items, chapters)) {
    const date =
      entry.type === 'chapter'
        ? entry.chapter.startOn
        : entry.item.effectiveDate;
    const month = date.toISOString().slice(0, 7);
    if (!groups.has(month))
      groups.set(month, {
        key: month,
        label: formatter.format(date),
        entries: [],
      });
    groups.get(month)?.entries.push(entry);
  }
  return [...groups.values()];
}
