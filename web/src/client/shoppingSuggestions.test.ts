import { describe, expect, it } from 'vitest';
import type { CollectionSuggestion } from '../api/generated/models/CollectionSuggestion';
import {
  SUGGESTIONS_SHOWN,
  suggestionKey,
  visibleSuggestions,
} from './shoppingSuggestions';

const AT = new Date('2026-11-14T10:00:00Z');
const suggestion = (id: string, title: string): CollectionSuggestion => ({
  id,
  title,
  quantity: null,
  lastBoughtAt: AT,
  timesBought: 1,
});

describe('suggestionKey', () => {
  it('ignores case and spacing', () => {
    expect(suggestionKey('  Hafer   Milch ')).toBe(
      suggestionKey('hafer milch'),
    );
  });
});

describe('visibleSuggestions', () => {
  it('leaves out what is already on the list, open or in the cart', () => {
    const shown = visibleSuggestions(
      [
        suggestion('1', 'Milch'),
        suggestion('2', 'Brot'),
        suggestion('3', 'Käse'),
      ],
      [{ title: ' milch ' }, { title: 'KÄSE' }],
    );
    expect(shown.map((entry) => entry.title)).toEqual(['Brot']);
  });

  it('keeps the order it was given and shows only the most recent ones', () => {
    const many = Array.from({ length: SUGGESTIONS_SHOWN + 5 }, (_, index) =>
      suggestion(String(index), `Ding ${index}`),
    );
    const shown = visibleSuggestions(many, []);
    expect(shown).toHaveLength(SUGGESTIONS_SHOWN);
    expect(shown[0].title).toBe('Ding 0');
  });

  it('shows everything when the list is empty', () => {
    expect(visibleSuggestions([suggestion('1', 'Milch')], [])).toHaveLength(1);
  });
});
