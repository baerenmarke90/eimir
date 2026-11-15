import type { DateIdea } from '../api/generated/models/DateIdea';
import { formatEuros, formatMinutes } from '../client/dateIdeas';
import { resolvedLocale, useTranslation } from '../i18n';

/** Editorial facts of one curated idea: duration, budget for two and place. */
export function DateIdeaFacts({
  idea,
  placeLabel,
}: {
  idea: Pick<DateIdea, 'minutes' | 'budgetEurForTwo'>;
  placeLabel?: string;
}) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  return (
    <ul
      className="date-idea-facts"
      aria-label={t('dateIdeas.card.detailsLabel')}
    >
      <li>
        {t('dateIdeas.card.duration', {
          value: formatMinutes(idea.minutes, locale),
        })}
      </li>
      <li>
        {idea.budgetEurForTwo > 0
          ? t('dateIdeas.card.budget', {
              value: formatEuros(idea.budgetEurForTwo, locale),
            })
          : t('dateIdeas.card.budgetFree')}
      </li>
      {placeLabel ? <li>{placeLabel}</li> : null}
    </ul>
  );
}
