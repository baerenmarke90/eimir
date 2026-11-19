import type { ReactNode } from 'react';
import type { DateIdeasApi } from '../api/generated/apis/DateIdeasApi';
import type { DateIdea } from '../api/generated/models/DateIdea';
import { resolvedLocale, useTranslation } from '../i18n';
import { DateIdeaFacts } from './DateIdeaFacts';
import { DateIdeaImage } from './DateIdeaImage';

/**
 * One curated date idea as a full card (#1892): image, category, title,
 * description, facts and prerequisites. Discovery and the shared selection's
 * pick mode (#1907 J1) render the same card and differ only in `actions`.
 */
export function DateIdeaCard({
  api,
  accountId,
  spaceId,
  idea,
  titleId,
  categoryLabel,
  placeLabel,
  catalogLocale,
  heading: Heading = 'h2',
  actions,
}: {
  api: Pick<DateIdeasApi, 'getDateIdeaImage'>;
  accountId: string;
  spaceId: string;
  idea: DateIdea;
  titleId: string;
  categoryLabel?: string;
  placeLabel?: string;
  catalogLocale: string;
  heading?: 'h2' | 'h3';
  actions: ReactNode;
}) {
  const { t } = useTranslation();
  const lang =
    idea.contentLocale !== catalogLocale ? idea.contentLocale : undefined;
  const listFormat = new Intl.ListFormat(resolvedLocale(), {
    style: 'long',
    type: 'conjunction',
  });
  return (
    <article aria-labelledby={titleId}>
      <DateIdeaImage
        api={api}
        accountId={accountId}
        spaceId={spaceId}
        image={idea.image}
        lang={lang}
      />
      <div className="date-idea-body">
        <p className="date-idea-category">{categoryLabel}</p>
        <Heading id={titleId} lang={lang}>
          {idea.title}
        </Heading>
        <p className="date-idea-description" lang={lang}>
          {idea.description}
        </p>
        <DateIdeaFacts idea={idea} placeLabel={placeLabel} />
        {idea.prerequisites.length ? (
          <p className="date-idea-requirements" lang={lang}>
            {t('dateIdeas.card.requirements', {
              items: listFormat.format(idea.prerequisites),
            })}
          </p>
        ) : null}
        <div className="date-idea-actions">{actions}</div>
      </div>
    </article>
  );
}
