import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DateIdeasApi } from '../api/generated/apis/DateIdeasApi';
import type { DateIdeaCatalog } from '../api/generated/models/DateIdeaCatalog';
import {
  type DateIdeasFilterState,
  filterDateIdeas,
} from '../client/dateIdeas';
import { proPaywallPath } from '../client/routes';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { DateIdeaFacts } from './DateIdeaFacts';
import { DateIdeaFilters } from './DateIdeaFilters';
import { DateIdeaImage } from './DateIdeaImage';
import { EimirIcon } from './EimirIcon';
import { ProblemState } from './ProblemState';
import { ProMark } from './ProMark';
import { UiState } from './UiState';

/** Ideas rendered per step; keeps the Compact DOM light inside the task. */
const PAGE_SIZE = 12;

/**
 * Curated date ideas as candidates of the shared selection (#465 within
 * #1535). Reuses the discovery catalog read, images, facts and filters; the
 * selected IDs stay in the selection task's in-memory draft. Free Spaces see
 * the calm locked hint with the shared Pro paywall; Wishes stay usable.
 */
export function WishSelectionIdeaPicker({
  api,
  accountId,
  spaceId,
  capability,
  allowed,
  catalog,
  selectedIds,
  full,
  onToggle,
}: {
  api: Pick<DateIdeasApi, 'getDateIdeaImage'>;
  accountId: string;
  spaceId: string;
  capability: Pick<
    UseQueryResult<boolean>,
    'isPending' | 'error' | 'refetch' | 'data'
  >;
  allowed: boolean;
  catalog: Pick<
    UseQueryResult<DateIdeaCatalog>,
    'data' | 'error' | 'isPending' | 'fetchStatus' | 'refetch'
  >;
  selectedIds: string[];
  full: boolean;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<DateIdeasFilterState>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const data = catalog.data;
  const ideas = useMemo(
    () => filterDateIdeas(data?.ideas ?? [], filter),
    [data, filter],
  );

  if (capability.isPending && capability.data === undefined)
    return <UiState kind="loading" title={t('dateIdeas.loading')} />;
  if (capability.error)
    return (
      <ProblemState
        error={capability.error}
        onRetry={() => void capability.refetch()}
      />
    );
  if (!allowed)
    return (
      <section
        className="date-ideas-locked wish-selection-ideas-locked"
        aria-labelledby="wish-selection-ideas-locked"
      >
        <EimirIcon name="sparkle" className="date-ideas-locked-icon" />
        <h3 id="wish-selection-ideas-locked">
          {t('dateIdeas.locked.title')}
          <ProMark label={t('dateIdeas.pro')} />
        </h3>
        <p>{t('wishSelection.ideasLockedBody')}</p>
        <Link
          className="button-link secondary-link"
          to={proPaywallPath('dateIdeas')}
        >
          {t('dateIdeas.locked.action')}
        </Link>
      </section>
    );
  if (catalog.isPending && catalog.fetchStatus === 'paused')
    return <UiState kind="offline" title={t('dateIdeas.offline')} />;
  if (catalog.isPending)
    return <UiState kind="loading" title={t('dateIdeas.loading')} />;
  if (catalog.error || !data)
    return (
      <ProblemState
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
      />
    );

  const categoryLabels = new Map(
    data.categories.map((item) => [item.id, item.label]),
  );
  const placeLabels = new Map(
    data.placeTypes.map((item) => [item.id, item.label]),
  );
  return (
    <div className="wish-selection-ideas">
      {data.totalCount > 0 ? (
        <DateIdeaFilters
          catalog={data}
          filter={filter}
          matchCount={ideas.length}
          moreOpen={moreOpen}
          onMoreOpenChange={setMoreOpen}
          onChange={(next) => {
            setVisibleCount(PAGE_SIZE);
            setFilter(next);
          }}
        />
      ) : (
        <UiState
          kind="empty"
          title={t('dateIdeas.catalogEmpty.title')}
          body={t('dateIdeas.catalogEmpty.body')}
        />
      )}
      {data.totalCount > 0 && ideas.length === 0 ? (
        <UiState
          kind="empty"
          title={t('dateIdeas.empty.title')}
          body={t('dateIdeas.empty.body')}
          action={
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setFilter({});
                setMoreOpen(false);
              }}
            >
              {t('dateIdeas.filters.reset')}
            </button>
          }
        />
      ) : null}
      {full ? (
        <p className="wish-selection-support" role="status">
          {t('wishSelection.ideasFull')}
        </p>
      ) : null}
      <ul className="wish-selection-idea-list">
        {ideas.slice(0, visibleCount).map((idea) => {
          const titleId = `wish-selection-pick-${idea.id}`;
          const chosen = selectedIds.includes(idea.id);
          const lang =
            idea.contentLocale !== data.locale ? idea.contentLocale : undefined;
          return (
            <li key={idea.id} className="wish-selection-idea">
              <DateIdeaImage
                api={api}
                accountId={accountId}
                spaceId={spaceId}
                image={idea.image}
                lang={lang}
              />
              <div className="wish-selection-idea-body">
                <p className="date-idea-category">
                  {categoryLabels.get(idea.category)}
                </p>
                <h3 id={titleId} lang={lang}>
                  {idea.title}
                </h3>
                <DateIdeaFacts
                  idea={idea}
                  placeLabel={placeLabels.get(idea.placeType)}
                />
                <AddActionButton
                  icon={chosen ? 'check' : 'hinzufuegen'}
                  className={chosen ? 'is-chosen' : ''}
                  label={t(
                    chosen
                      ? 'wishSelection.ideaAdded'
                      : 'wishSelection.ideaAdd',
                  )}
                  aria-pressed={chosen}
                  aria-describedby={titleId}
                  disabled={!chosen && full}
                  onClick={() => onToggle(idea.id)}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {ideas.length > visibleCount ? (
        <button
          type="button"
          className="secondary"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
        >
          {t('dateIdeas.showMore', {
            count: Math.min(PAGE_SIZE, ideas.length - visibleCount),
          })}
        </button>
      ) : null}
    </div>
  );
}
