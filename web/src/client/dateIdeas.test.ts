import { describe, expect, it } from 'vitest';
import type { DateIdea } from '../api/generated/models/DateIdea';
import {
  filterDateIdeas,
  formatBudgetRange,
  formatDurationRange,
  hasDateIdeasFilter,
  sanitizeDateIdeasFilter,
  secondaryFilterCount,
} from './dateIdeas';

function idea(id: string, overrides: Partial<DateIdea> = {}): DateIdea {
  return {
    id,
    title: id,
    description: 'Description',
    requirements: [],
    categoryId: 'cozy',
    contentLocale: 'de',
    durationMinMinutes: 30,
    durationMaxMinutes: 60,
    durationBand: 'SHORT',
    budgetMin: 0,
    budgetMax: 0,
    budgetBand: 'FREE',
    setting: 'HOME',
    ...overrides,
  };
}

const ideas = [
  idea('home-free'),
  idea('either-low', { setting: 'EITHER', budgetBand: 'LOW' }),
  idea('out-long-high', {
    setting: 'OUT',
    categoryId: 'outdoors',
    durationBand: 'LONG',
    budgetBand: 'HIGH',
  }),
  idea('out-short-free', { setting: 'OUT', categoryId: 'outdoors' }),
];

const ids = (filter: Parameters<typeof filterDateIdeas>[1]) =>
  filterDateIdeas(ideas, filter).map((item) => item.id);

describe('date idea filters', () => {
  it('combines groups with AND and keeps the editorial order', () => {
    expect(ids({})).toEqual([
      'home-free',
      'either-low',
      'out-long-high',
      'out-short-free',
    ]);
    expect(ids({ category: 'outdoors' })).toEqual([
      'out-long-high',
      'out-short-free',
    ]);
    expect(ids({ category: 'outdoors', budget: 'FREE' })).toEqual([
      'out-short-free',
    ]);
    expect(
      ids({ category: 'outdoors', duration: 'LONG', budget: 'HIGH' }),
    ).toEqual(['out-long-high']);
    expect(ids({ setting: 'HOME', duration: 'LONG' })).toEqual([]);
  });

  it('lets ideas for both settings match either setting filter', () => {
    expect(ids({ setting: 'HOME' })).toEqual(['home-free', 'either-low']);
    expect(ids({ setting: 'OUT' })).toEqual([
      'either-low',
      'out-long-high',
      'out-short-free',
    ]);
  });

  it('counts only the disclosed groups and recognizes any active filter', () => {
    expect(secondaryFilterCount({ category: 'cozy' })).toBe(0);
    expect(secondaryFilterCount({ duration: 'SHORT', setting: 'OUT' })).toBe(2);
    expect(hasDateIdeasFilter({})).toBe(false);
    expect(hasDateIdeasFilter({ category: 'cozy' })).toBe(true);
  });

  it('drops restored values the current catalog does not know', () => {
    expect(
      sanitizeDateIdeasFilter(
        {
          category: 'retired',
          duration: 'FOREVER' as never,
          budget: 'LOW',
          setting: 'HOME',
        },
        ['cozy'],
      ),
    ).toEqual({
      category: undefined,
      duration: undefined,
      budget: 'LOW',
      setting: 'HOME',
    });
    expect(sanitizeDateIdeasFilter(undefined, null)).toEqual({});
  });
});

describe('date idea formatting', () => {
  it('formats localized duration ranges in minutes, hours and days', () => {
    expect(formatDurationRange(30, 45, 'en')).toMatch(/30.*45 min/);
    expect(formatDurationRange(90, 150, 'de')).toMatch(/1,5.*2,5 Std/);
    expect(formatDurationRange(60, 60, 'en')).toBe('1 hr');
    expect(formatDurationRange(1440, 2880, 'en')).toMatch(/1.*2 days/);
  });

  it('formats budgets without fractions and treats zero as free', () => {
    expect(formatBudgetRange(0, 0, 'EUR', 'de')).toBeNull();
    expect(formatBudgetRange(10, 30, 'EUR', 'de')).toMatch(/10.*30\s?€/);
    expect(formatBudgetRange(10, 30, 'EUR', 'en')).toMatch(/€10.*€?30/);
    expect(formatBudgetRange(20, 20, 'EUR', 'en')).toBe('€20');
  });
});
