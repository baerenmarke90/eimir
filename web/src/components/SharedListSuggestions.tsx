import type { CollectionSuggestion } from '../api/generated/models/CollectionSuggestion';
import { useTranslation } from '../i18n';
import './SharedListSuggestions.css';

/**
 * What the couple bought on earlier trips, one tap to add it again (#1808).
 * The note says where the chips come from and who sees them; a chip can be
 * removed on its own, so nothing stays that the couple does not want.
 */
export function SharedListSuggestions({
  suggestions,
  disabled,
  onAdd,
  onRemove,
}: {
  suggestions: readonly CollectionSuggestion[];
  disabled: boolean;
  onAdd: (suggestion: CollectionSuggestion) => void;
  onRemove: (suggestion: CollectionSuggestion) => void;
}) {
  const { t } = useTranslation();
  if (suggestions.length === 0) return null;
  const label = (suggestion: CollectionSuggestion) =>
    suggestion.quantity
      ? `${suggestion.title} · ${suggestion.quantity}`
      : suggestion.title;
  return (
    <section
      className="shared-list-suggestions"
      aria-labelledby="shared-list-suggestions-heading"
    >
      <h3 id="shared-list-suggestions-heading">
        {t('m5s3.collection.suggestions.heading')}
      </h3>
      <ul className="shared-list-suggestions-chips">
        {suggestions.map((suggestion) => (
          <li key={suggestion.id} className="shared-list-suggestion">
            <button
              type="button"
              className="shared-list-suggestion-add"
              disabled={disabled}
              aria-label={t('m5s3.collection.suggestions.add', {
                title: label(suggestion),
              })}
              onClick={() => onAdd(suggestion)}
            >
              {label(suggestion)}
            </button>
            <button
              type="button"
              className="shared-list-suggestion-remove"
              aria-label={t('m5s3.collection.suggestions.remove', {
                title: suggestion.title,
              })}
              onClick={() => onRemove(suggestion)}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M7 7l10 10M17 7 7 17" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <p className="shared-list-suggestions-note">
        {t('m5s3.collection.suggestions.note')}
      </p>
    </section>
  );
}
