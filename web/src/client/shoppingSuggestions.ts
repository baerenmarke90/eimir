import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import type { CollectionSuggestion } from '../api/generated/models/CollectionSuggestion';

/** How many suggestions are offered at once: the most recently bought. */
export const SUGGESTIONS_SHOWN = 12;

/** Two spellings of one thing (case, spacing) are one entry, as on the server. */
export function suggestionKey(title: string): string {
  return title.trim().split(/\s+/u).join(' ').toLocaleLowerCase();
}

/**
 * The suggestions worth offering now: what is already on the list, open or in
 * the cart, is not suggested again, and only the most recent ones are shown.
 */
export function visibleSuggestions(
  suggestions: readonly CollectionSuggestion[],
  items: readonly Pick<CollectionItemDetail, 'title'>[],
): CollectionSuggestion[] {
  const onList = new Set(items.map((item) => suggestionKey(item.title)));
  return suggestions
    .filter((suggestion) => !onList.has(suggestionKey(suggestion.title)))
    .slice(0, SUGGESTIONS_SHOWN);
}
