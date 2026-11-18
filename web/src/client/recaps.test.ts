import { describe, expect, it } from 'vitest';
import { RecapViewFromJSON } from '../api/generated/models/RecapView';
import {
  monthlyRecapInvitation,
  recapPeriodStatus,
  recapRhythm,
  recapScenes,
} from './recaps';

const edition = (
  year = 2026,
  month = 10,
  overrides: Record<string, unknown> = {},
) =>
  RecapViewFromJSON({
    id: 'month',
    kind: 'MONTH',
    year,
    month,
    variant: 0,
    version: 1,
    startsOn: '2026-10-01',
    throughOn: '2026-10-30',
    isPartial: true,
    status: 'READY',
    theme: 'WORDS',
    generatedAt: '2026-10-30T12:00:00Z',
    savedAt: null,
    locale: 'de-DE',
    headline: null,
    introduction: null,
    sources: [
      {
        key: 'HEART_MOMENT:note',
        id: 'note',
        kind: 'HEART_MOMENT',
        title: 'Morning note',
        excerpt: null,
        available: true,
        occurredOn: '2026-10-26',
        version: 1,
        previewAttachmentId: null,
        previewIsSensitive: false,
      },
    ],
    reflections: [],
    ownDraft: null,
    ...overrides,
  });
describe('monthly recap invitation', () => {
  it('features the current month in its final three days, still explicitly partial', () => {
    const month = edition();
    expect(
      monthlyRecapInvitation([month], new Date('2026-10-28')),
    ).toBeUndefined();
    expect(monthlyRecapInvitation([month], new Date('2026-10-29'))).toBe(month);
    expect(
      monthlyRecapInvitation([month], new Date('2026-10-31'))?.isPartial,
    ).toBe(true);
  });
  it('expires after the first three days of the next month, including year rollover', () => {
    const month = edition(2025, 12, { isPartial: false });
    expect(monthlyRecapInvitation([month], new Date('2026-01-03'))).toBe(month);
    expect(
      monthlyRecapInvitation([month], new Date('2026-01-04')),
    ).toBeUndefined();
  });
  it('uses calendar month length including leap February', () => {
    const month = edition(2024, 2);
    expect(
      monthlyRecapInvitation([month], new Date('2024-02-26')),
    ).toBeUndefined();
    expect(monthlyRecapInvitation([month], new Date('2024-02-27'))).toBe(month);
  });
  it('does not promote pending, empty, annual or withdrawn-source editions', () => {
    const date = new Date('2026-10-30');
    for (const overrides of [
      { status: 'PENDING' },
      { status: 'EMPTY' },
      { kind: 'YEAR' },
      { sources: [] },
    ]) {
      expect(
        monthlyRecapInvitation([edition(2026, 10, overrides)], date),
      ).toBeUndefined();
    }
  });
  it('prefers a live edition but keeps retained editions eligible after downgrade', () => {
    const saved = edition(2026, 10, { savedAt: '2026-10-30T13:00:00Z' });
    const live = edition();
    expect(monthlyRecapInvitation([saved, live], new Date('2026-10-30'))).toBe(
      live,
    );
    expect(monthlyRecapInvitation([saved], new Date('2026-10-30'))).toBe(saved);
  });
  it('does not promise that a saved partial edition continues growing', () => {
    const saved = edition(2026, 10, { savedAt: '2026-10-30T13:00:00Z' });
    expect(recapPeriodStatus(saved, 'en', (key) => key)).toBe('recaps.saved');
  });
});

describe('recap rhythm scene', () => {
  const mood = (goodDays: number[], leading: number | null = null) => ({
    buckets: goodDays.map((days, index) => ({
      index: index + 1,
      mutualDays: days,
      goodDays: days,
    })),
    leading,
  });
  const facts = {
    memories: 3,
    heartMoments: 1,
    milestones: 0,
    chapters: 0,
    plans: 0,
    activeDays: 4,
    busiestMonth: null,
  };

  it('follows the counted facts and counts the good days', () => {
    const value = edition(2026, 10, { facts, mood: mood([3, 2, 4, 0, 0], 3) });
    expect(recapScenes(value).map((scene) => scene.type)).toEqual([
      'cover',
      'facts',
      'rhythm',
      'highlight',
      'closing',
    ]);
    expect(recapRhythm(value)).toMatchObject({ total: 9, leading: 3 });
  });

  it('is omitted without a mood and below three good days', () => {
    expect(recapRhythm(edition())).toBeNull();
    expect(
      recapRhythm(edition(2026, 10, { mood: mood([1, 1, 0]) })),
    ).toBeNull();
    expect(
      recapScenes(edition(2026, 10, { mood: mood([1, 1, 0]) })).map(
        (scene) => scene.type,
      ),
    ).not.toContain('rhythm');
  });
});
