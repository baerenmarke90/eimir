import type { ChapterPeriodSummary } from '../api/generated/models/ChapterPeriodSummary';
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

function entryIdentity(entry: DiaryEntry): string {
  if (entry.type === 'chapter') return `chapter:${entry.chapter.id}`;
  const { item } = entry;
  switch (item.kind) {
    case 'MEMORY':
      return `memory:${item.memory.id}`;
    case 'HEART_MOMENT':
      return `heart:${item.heartMoment.id}`;
    case 'MILESTONE':
      return `milestone:${item.milestone.id}`;
  }
}

/**
 * The ordered identity of the rendered diary, for the first-entry reveal.
 * A count is not enough: the first page has a fixed size, so a new entry
 * pushes the oldest one off and remounts the list at the same length.
 */
export function diaryRevealRevision(
  groups: readonly { key: string; entries: readonly DiaryEntry[] }[],
): string {
  return groups
    .flatMap((group) => [
      `month:${group.key}`,
      ...group.entries.map(entryIdentity),
    ])
    .join('|');
}

/** Group the diary-only projection without re-sorting or broadening Story kinds. */
export function groupDiaryEntries(
  items: StoryItem[],
  chapters: ChapterTimelineMarker[],
  locale: string,
  periods: ChapterPeriodSummary[] = [],
  year?: number | null,
) {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      entries: DiaryEntry[];
      periods: ChapterPeriodSummary[];
    }
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
        periods: [],
      });
    groups.get(month)?.entries.push(entry);
  }
  // A covered year can have no events. Show one period context, not invented
  // entries for every intervening day or month.
  if (groups.size === 0 && periods.length) {
    const month = year ? `${year}-01` : new Date().toISOString().slice(0, 7);
    groups.set(month, {
      key: month,
      label: formatter.format(new Date(`${month}-01T00:00:00Z`)),
      entries: [],
      periods: [],
    });
  }
  for (const group of groups.values()) {
    group.periods = periods.filter((chapter) => {
      const start = chapter.startOn.toISOString().slice(0, 7);
      const end = chapter.endOn?.toISOString().slice(0, 7);
      return start < group.key && (!end || end >= group.key);
    });
  }
  return [...groups.values()];
}
