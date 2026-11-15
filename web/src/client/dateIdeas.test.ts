import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { DateIdea } from '../api/generated/models/DateIdea';
import {
  filterDateIdeas,
  formatEuros,
  formatMinutes,
  hasDateIdeasFilter,
  rememberDateIdeaWish,
  sanitizeDateIdeasFilter,
  savedDateIdeaWishes,
  secondaryFilterCount,
} from './dateIdeas';

function idea(id: string, overrides: Partial<DateIdea> = {}): DateIdea {
  return {
    id,
    category: 'food_drink',
    placeType: 'home',
    minutes: 30,
    budgetEurForTwo: 0,
    title: id,
    description: 'Description',
    wishTitle: `Wish ${id}`,
    planTitle: `Plan ${id}`,
    prerequisites: [],
    contentLocale: 'de',
    image: {
      id: `category-${'food_drink'}`,
      width: 1200,
      height: 800,
      alt: `Alt ${id}`,
    },
    ...overrides,
  };
}

const ideas = [
  idea('home-free-30'),
  idea('home-paid-20', { minutes: 20, budgetEurForTwo: 5 }),
  idea('out-nature-45', {
    category: 'nature',
    placeType: 'out',
    minutes: 45,
    budgetEurForTwo: 10,
  }),
  idea('out-nature-60', {
    category: 'nature',
    placeType: 'out',
    minutes: 60,
    budgetEurForTwo: 20,
  }),
];

const ids = (filter: Parameters<typeof filterDateIdeas>[1]) =>
  filterDateIdeas(ideas, filter).map((item) => item.id);

describe('date idea filters', () => {
  it('treats upper bounds as inclusive and zero euros as free', () => {
    expect(ids({ maxMinutes: 30 })).toEqual(['home-free-30', 'home-paid-20']);
    expect(ids({ maxMinutes: 45 })).toContain('out-nature-45');
    expect(ids({ maxBudget: 0 })).toEqual(['home-free-30']);
    expect(ids({ maxBudget: 5 })).toEqual(['home-free-30', 'home-paid-20']);
    expect(ids({ maxBudget: 20 })).toHaveLength(4);
  });

  it('combines every group with AND; no place means anywhere', () => {
    expect(ids({})).toEqual(ideas.map((item) => item.id));
    expect(ids({ category: 'nature', maxMinutes: 45, maxBudget: 10 })).toEqual([
      'out-nature-45',
    ]);
    expect(ids({ place: 'home', category: 'nature' })).toEqual([]);
    expect(
      [...ids({ place: 'home' }), ...ids({ place: 'out' })].sort(),
    ).toEqual(ids({}).sort());
  });

  it('counts only the disclosed groups, including a zero budget', () => {
    expect(secondaryFilterCount({ category: 'nature' })).toBe(0);
    expect(secondaryFilterCount({ maxBudget: 0 })).toBe(1);
    expect(secondaryFilterCount({ maxMinutes: 20, place: 'out' })).toBe(2);
    expect(hasDateIdeasFilter({})).toBe(false);
    expect(hasDateIdeasFilter({ maxBudget: 0 })).toBe(true);
  });

  it('drops restored values the current catalog does not offer', () => {
    expect(
      sanitizeDateIdeasFilter(
        {
          category: 'nature',
          maxMinutes: 25 as never,
          maxBudget: 0,
          place: 'anywhere' as never,
        },
        ['nature'],
      ),
    ).toEqual({
      category: 'nature',
      maxMinutes: undefined,
      maxBudget: 0,
      place: undefined,
    });
    expect(sanitizeDateIdeasFilter({ category: 'play' }, ['nature'])).toEqual(
      expect.objectContaining({ category: undefined }),
    );
  });
});

describe('date idea formatting and session links', () => {
  it('formats minutes and whole euros per locale', () => {
    expect(formatMinutes(40, 'de')).toBe('40 Min.');
    expect(formatMinutes(40, 'en')).toBe('40 min');
    expect(formatEuros(10, 'de')).toMatch(/^10\s€$/);
    expect(formatEuros(10, 'en')).toBe('€10');
  });

  it('remembers Wishes per Account and Space only', () => {
    const client = new QueryClient();
    rememberDateIdeaWish(client, 'a', 's1', 'eimir-date-001', 'wish-1');
    expect(savedDateIdeaWishes(client, 'a', 's1')).toEqual({
      'eimir-date-001': 'wish-1',
    });
    expect(savedDateIdeaWishes(client, 'a', 's2')).toEqual({});
    expect(savedDateIdeaWishes(client, 'b', 's1')).toEqual({});
    client.clear();
    expect(savedDateIdeaWishes(client, 'a', 's1')).toEqual({});
  });
});
