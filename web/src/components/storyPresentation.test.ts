import type { StoryItem } from '../api/generated/models/StoryItem';
import { i18n } from '../i18n';
import {
  distributeIntoTapestryColumns,
  formatStoryDate,
  groupStoryItems,
  resolveStoryKindLabel,
  storyAuthorLabel,
  storyItemPresentation,
  tapestryItemRole,
  tapestryRoleWeight,
} from './storyPresentation';

function memory(
  id: string,
  date: string,
  title: string,
  attachmentCount = 0,
): StoryItem {
  return {
    kind: 'MEMORY',
    effectiveDate: new Date(`${date}T00:00:00Z`),
    memory: {
      id,
      title,
      author: { id: 'author-1', displayName: 'Anna' },
      attachments: Array.from({ length: attachmentCount }, (_, position) => ({
        id: `a-${position}`,
        position,
      })),
    },
  } as unknown as StoryItem;
}

function heart(
  id: string,
  date: string,
  visibility: 'SHARED' | 'PRIVATE' = 'SHARED',
): StoryItem {
  return {
    kind: 'HEART_MOMENT',
    effectiveDate: new Date(`${date}T00:00:00Z`),
    heartMoment: {
      id,
      text: 'Danke für den schönen Abend.',
      emotion: 'GRATEFUL',
      author: { id: 'author-2', displayName: 'Ben' },
      attachment: null,
      visibility,
    },
  } as unknown as StoryItem;
}

function milestone(id: string, date: string, title: string): StoryItem {
  return {
    kind: 'MILESTONE',
    effectiveDate: new Date(`${date}T00:00:00Z`),
    milestone: {
      id,
      title,
      author: { id: 'author-1', displayName: 'Anna' },
    },
  } as unknown as StoryItem;
}

describe('groupStoryItems', () => {
  it('groups the existing timeline order by calendar month', () => {
    const groups = groupStoryItems(
      [
        memory('m-1', '2026-08-26', 'Sommerabend'),
        heart('h-1', '2026-08-12'),
        memory('m-2', '2026-07-31', 'Ausflug'),
      ],
      'de',
    );

    expect(groups.map((group) => group.key)).toEqual(['2026-08', '2026-07']);
    expect(groups[0].label).toBe('August 2026');
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });

  it('formats dates through the requested locale instead of a fixed de-DE value', () => {
    expect(formatStoryDate(new Date('2026-08-26T00:00:00Z'), 'de')).toContain(
      '2026',
    );
    expect(formatStoryDate(new Date('2026-08-26T00:00:00Z'), 'en')).toContain(
      '2026',
    );
  });
});

describe('storyAuthorLabel (#1019)', () => {
  const author = { id: 'author-1', displayName: 'Alex Winter' };

  it('uses localized viewer-relative copy for the current account', () => {
    expect(storyAuthorLabel(author, 'author-1')).toBe('dir');
  });

  it('keeps the partner first-name treatment for another account', () => {
    expect(storyAuthorLabel(author, 'author-2')).toBe('Alex');
  });
});

describe('storyItemPresentation', () => {
  it('keeps Memory cards concise and exposes locale-aware media count', () => {
    expect(
      storyItemPresentation(memory('m-1', '2026-08-26', 'Am See', 2), i18n.t),
    ).toEqual({
      kindLabel: 'Erinnerung',
      title: 'Am See',
      author: 'Anna',
      mediaCount: 2,
      mediaLabel: '2 Fotos',
    });
    expect(
      storyItemPresentation(memory('m-2', '2026-08-26', 'Am See', 1), i18n.t)
        .mediaLabel,
    ).toBe('1 Foto');
  });

  it('marks a shared HeartMoment with the existing shared label', () => {
    expect(
      storyItemPresentation(heart('h-1', '2026-08-12', 'SHARED'), i18n.t),
    ).toMatchObject({
      kindLabel: 'Herzmoment',
      title: 'Danke für den schönen Abend.',
      preview: 'Dankbar',
      author: 'Ben',
      visibility: 'SHARED',
      visibilityLabel: i18n.t('story.shared'),
    });
  });

  it("marks the caller's own private HeartMoment with the real PRIVATE visibility (#1021)", () => {
    expect(
      storyItemPresentation(heart('h-2', '2026-08-12', 'PRIVATE'), i18n.t),
    ).toMatchObject({
      visibility: 'PRIVATE',
      visibilityLabel: i18n.t('visibilityPrivate'),
    });
  });

  it('states visibility only where it is a per-item choice (#969)', () => {
    expect(
      storyItemPresentation(memory('m-3', '2026-08-26', 'Am See', 0), i18n.t)
        .visibility,
    ).toBeUndefined();
    expect(
      storyItemPresentation(
        milestone('ms-2', '2026-08-01', 'Eingezogen'),
        i18n.t,
      ).visibility,
    ).toBeUndefined();
    expect(
      storyItemPresentation(memory('m-4', '2026-08-26', 'Am See', 0), i18n.t)
        .mediaCount,
    ).toBeUndefined();
  });

  it('shows only the first name on relationship-facing surfaces, never the full display name (#791 second follow-up)', () => {
    const item = {
      kind: 'MEMORY',
      effectiveDate: new Date('2026-08-26T00:00:00Z'),
      memory: {
        id: 'm-full-name',
        title: 'Am See',
        author: { id: 'author-3', displayName: 'Alex Winter' },
        attachments: [],
      },
    } as unknown as StoryItem;

    expect(storyItemPresentation(item, i18n.t).author).toBe('Alex');
  });

  it('maps all story kind enums to human readable localized labels without raw translation keys', () => {
    expect(resolveStoryKindLabel('MILESTONE', i18n.t)).toBe('Meilenstein');
    expect(resolveStoryKindLabel('MEMORY', i18n.t)).toBe('Erinnerung');
    expect(resolveStoryKindLabel('HEART_MOMENT', i18n.t)).toBe('Herzmoment');
    expect(resolveStoryKindLabel('milestone', i18n.t)).toBe('Meilenstein');
    expect(resolveStoryKindLabel('memory', i18n.t)).toBe('Erinnerung');
    expect(resolveStoryKindLabel('heartMoment', i18n.t)).toBe('Herzmoment');
  });
});

describe('tapestryItemRole', () => {
  it('gives Memory + media, Heart Moment, Milestone, and text-only Memory distinct roles (#790)', () => {
    expect(tapestryItemRole(memory('m-1', '2026-08-26', 'Am See', 1))).toBe(
      'media',
    );
    expect(tapestryItemRole(memory('m-2', '2026-08-26', 'Notiz', 0))).toBe(
      'text',
    );
    expect(tapestryItemRole(heart('h-1', '2026-08-12'))).toBe('note');
    expect(
      tapestryItemRole(milestone('ms-1', '2026-08-01', 'Eingezogen')),
    ).toBe('milestone');
  });
});

describe('distributeIntoTapestryColumns', () => {
  it('keeps columns close to equal weight instead of filling the first column first (regression #790)', () => {
    // 7 heavy "media" entries and 5 light "milestone" entries: naive
    // sequential/count-based filling would leave a much lighter last column.
    const entries = [
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `media-${i}`,
        role: 'media' as const,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `milestone-${i}`,
        role: 'milestone' as const,
      })),
    ];

    const columns = distributeIntoTapestryColumns(entries, 3, (entry) =>
      tapestryRoleWeight(entry.role),
    );

    expect(columns).toHaveLength(3);
    expect(columns.flat()).toHaveLength(entries.length);

    const columnWeights = columns.map((column) =>
      column.reduce((sum, entry) => sum + tapestryRoleWeight(entry.role), 0),
    );
    const spread = Math.max(...columnWeights) - Math.min(...columnWeights);
    // The heaviest single item (a "media" entry) bounds how close a greedy
    // algorithm can get; anything wider than that would indicate the old
    // "dump items into the first column" behavior returned.
    expect(spread).toBeLessThanOrEqual(tapestryRoleWeight('media'));
  });

  it('preserves original order within each column and never drops or duplicates entries', () => {
    const entries = [1, 2, 3, 4, 5, 6];
    const columns = distributeIntoTapestryColumns(entries, 2, () => 1);

    expect(columns.flat().slice().sort()).toEqual(entries);
    for (const column of columns) {
      const sorted = [...column].sort((a, b) => a - b);
      expect(column).toEqual(sorted);
    }
  });

  it('degrades to a single column (plain order, no reshuffling) on mobile', () => {
    const entries = ['a', 'b', 'c', 'd'];
    const columns = distributeIntoTapestryColumns(entries, 1, () => 1);

    expect(columns).toEqual([entries]);
  });

  it('never folds a sparse, weight-skewed month all the way down to one column (#791 second follow-up)', () => {
    // 1 heavy "media" item + 2 light "milestone" markers: the balance-ratio
    // fold previously walked 3 -> 2 -> 1 for this exact shape, turning the
    // whole band into a single narrow feed instead of a photo column next
    // to a packed marker column.
    const entries = [
      { id: 'media-1', role: 'media' as const },
      { id: 'milestone-1', role: 'milestone' as const },
      { id: 'milestone-2', role: 'milestone' as const },
    ];

    const columns = distributeIntoTapestryColumns(entries, 3, (entry) =>
      tapestryRoleWeight(entry.role),
    );
    const nonEmptyColumns = columns.filter((column) => column.length > 0);

    expect(nonEmptyColumns).toHaveLength(2);
    expect(columns.flat()).toHaveLength(entries.length);
  });

  it('still collapses to one column when only one entry exists, since there is nothing to spread', () => {
    const columns = distributeIntoTapestryColumns(['only'], 3, () => 1);

    expect(columns.filter((column) => column.length > 0)).toHaveLength(1);
  });
});
