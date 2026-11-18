import { useQueryClient } from '@tanstack/react-query';
import {
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { DateIdea } from '../api/generated/models/DateIdea';
import {
  createDateIdeasApi,
  type DateIdeasFilterState,
  filterDateIdeas,
  sanitizeDateIdeasFilter,
  savedDateIdeaWishes,
  useDateIdeasCatalog,
  useDateInspirationCapability,
} from '../client/dateIdeas';
import {
  PLAN_CREATE_ROUTE,
  proPaywallPath,
  WISH_CREATE_ROUTE,
  wishDetailPath,
} from '../client/routes';
import { type TaskOriginMetadata, useTaskOrigin } from '../client/taskOrigin';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionLink } from './AddAction';
import { DateIdeaCard } from './DateIdeaCard';
import { DateIdeaFilters } from './DateIdeaFilters';
import { EimirIcon } from './EimirIcon';
import { OverviewCacheNotice } from './OverviewCacheNotice';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { ProMark } from './ProMark';
import { UiState } from './UiState';
import './PlanningReference.css';
import './DateIdeas.css';

interface Props {
  accountId: string;
  spaceId: string;
  apiBaseUrl?: string;
  accessToken?: string;
}

/** Ideas rendered per step; keeps the Compact DOM and first paint light. */
const PAGE_SIZE = 24;

function plainActivation(event: MouseEvent): boolean {
  return !(
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

/** Account/Space changes remount the task so no state crosses contexts. */
export function DateIdeasPage(props: Props) {
  return (
    <DateIdeasView
      key={JSON.stringify([props.apiBaseUrl, props.accountId, props.spaceId])}
      {...props}
    />
  );
}

function DateIdeasView({ accountId, spaceId, apiBaseUrl, accessToken }: Props) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const client = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { captureOrigin, registerOriginMetadata, resolveOrigin } =
    useTaskOrigin();
  const api = useMemo(
    () => createDateIdeasApi(apiBaseUrl ?? '', accessToken ?? ''),
    [apiBaseUrl, accessToken],
  );
  const capability = useDateInspirationCapability({
    apiBaseUrl,
    accessToken,
    accountId,
    spaceId,
  });
  const allowed = capability.data === true;

  const { catalog, denied } = useDateIdeasCatalog({
    api,
    accountId,
    spaceId,
    locale,
    capability: capability.data,
    enabled: Boolean(apiBaseUrl && accessToken),
  });

  const [filter, setFilter] = useState<DateIdeasFilterState>({});
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const restored = useRef<unknown>(null);
  const categoryIds = useMemo(
    () => catalog.data?.categories.map((item) => item.id) ?? null,
    [catalog.data],
  );

  // Return from a composer, Wish or Plan restores filters, scroll and focus.
  useLayoutEffect(() => {
    const key = (location.state as { taskReturnKey?: unknown } | null)
      ?.taskReturnKey;
    const origin = resolveOrigin(key);
    if (!origin || restored.current === key || !categoryIds) return;
    restored.current = key;
    const value = sanitizeDateIdeasFilter(origin.dateIdeasFilter, categoryIds);
    setFilter(value);
    // Keep the idea the couple came back from rendered.
    const index = filterDateIdeas(catalog.data?.ideas ?? [], value).findIndex(
      (item) => item.id === origin.selectedKey,
    );
    setVisibleCount(
      Math.max(PAGE_SIZE, Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE),
    );
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: origin.scrollY });
      if (origin.selectedKey)
        document
          .querySelector<HTMLElement>(
            `[data-date-idea-key="${CSS.escape(origin.selectedKey)}"]`,
          )
          ?.focus({ preventScroll: true });
    });
  }, [location.state, resolveOrigin, categoryIds, catalog.data]);

  useEffect(
    () => registerOriginMetadata({ dateIdeasFilter: filter }),
    [filter, registerOriginMetadata],
  );

  const ideas = useMemo(
    () => filterDateIdeas(catalog.data?.ideas ?? [], filter),
    [catalog.data, filter],
  );
  const savedWishes = savedDateIdeaWishes(client, accountId, spaceId);

  // Every adoption opens an existing composer with editable catalog text;
  // nothing is saved before the couple confirms there.
  const open = (idea: DateIdea, to: string, extra: TaskOriginMetadata) => {
    const key = captureOrigin({
      selectedKey: idea.id,
      dateIdeasFilter: filter,
      ...extra,
    });
    void navigate(to, { state: { taskOriginKey: key } });
  };

  const header = (
    <PageHeader
      title={t('dateIdeas.title')}
      description={t('dateIdeas.intro')}
    />
  );

  if (capability.isPending)
    return (
      <div className="page date-ideas-page">
        {header}
        <UiState kind="loading" title={t('dateIdeas.loading')} />
      </div>
    );
  if (capability.error)
    return (
      <div className="page date-ideas-page">
        {header}
        <ProblemState
          error={capability.error}
          onRetry={() => void capability.refetch()}
        />
      </div>
    );
  if (!allowed || denied)
    return (
      <div className="page date-ideas-page">
        {header}
        <section
          className="date-ideas-locked"
          aria-labelledby="date-ideas-locked-title"
        >
          <EimirIcon name="sparkle" className="date-ideas-locked-icon" />
          <h2 id="date-ideas-locked-title">
            {t('dateIdeas.locked.title')}
            <ProMark label={t('dateIdeas.pro')} />
          </h2>
          <p>{t('dateIdeas.locked.body')}</p>
          <p className="date-ideas-locked-retained">
            {t('dateIdeas.locked.retained')}
          </p>
          <Link
            className="button-link secondary-link"
            to={proPaywallPath('dateIdeas')}
          >
            {t('dateIdeas.locked.action')}
          </Link>
        </section>
      </div>
    );

  const data = catalog.data;
  const categoryLabels = new Map(
    (data?.categories ?? []).map((item) => [item.id, item.label]),
  );
  const placeLabels = new Map(
    (data?.placeTypes ?? []).map((item) => [item.id, item.label]),
  );
  const reset = () => {
    setFilter({});
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <div className="page date-ideas-page">
      {header}
      {catalog.isPending && catalog.fetchStatus !== 'paused' ? (
        <UiState kind="loading" title={t('dateIdeas.loading')} />
      ) : null}
      {catalog.isPending && catalog.fetchStatus === 'paused' ? (
        <UiState kind="offline" title={t('dateIdeas.offline')} />
      ) : null}
      {catalog.error && !data ? (
        <ProblemState
          error={catalog.error}
          onRetry={() => void catalog.refetch()}
        />
      ) : null}
      {data && (catalog.isError || catalog.fetchStatus === 'paused') ? (
        <OverviewCacheNotice cachedAt={new Date(catalog.dataUpdatedAt)} />
      ) : null}
      {data && data.totalCount > 0 ? (
        <DateIdeaFilters
          catalog={data}
          filter={filter}
          matchCount={ideas.length}
          onChange={(next) => {
            setVisibleCount(PAGE_SIZE);
            setFilter(next);
          }}
        />
      ) : null}
      {data && data.totalCount === 0 ? (
        <UiState
          kind="empty"
          title={t('dateIdeas.catalogEmpty.title')}
          body={t('dateIdeas.catalogEmpty.body')}
        />
      ) : null}
      {data && data.totalCount > 0 && ideas.length === 0 ? (
        <div className="date-ideas-no-match">
          <UiState
            kind="empty"
            title={t('dateIdeas.empty.title')}
            body={t('dateIdeas.empty.body')}
            action={
              <button type="button" className="secondary" onClick={reset}>
                {t('dateIdeas.filters.reset')}
              </button>
            }
          />
        </div>
      ) : null}
      {ideas.length ? (
        <ul className="date-ideas-list">
          {ideas.slice(0, visibleCount).map((idea) => {
            const titleId = `date-idea-${idea.id}`;
            const savedWishId = savedWishes[idea.id];
            return (
              <li
                key={idea.id}
                className="date-idea"
                data-date-idea-key={idea.id}
                tabIndex={-1}
              >
                <DateIdeaCard
                  api={api}
                  accountId={accountId}
                  spaceId={spaceId}
                  idea={idea}
                  titleId={titleId}
                  categoryLabel={categoryLabels.get(idea.category)}
                  placeLabel={placeLabels.get(idea.placeType)}
                  catalogLocale={data?.locale ?? locale}
                  actions={
                    <>
                      {savedWishId ? (
                        <Link
                          className="button-link secondary-link date-idea-saved"
                          to={wishDetailPath(savedWishId)}
                          aria-describedby={titleId}
                          onClick={(event) => {
                            if (!plainActivation(event)) return;
                            event.preventDefault();
                            open(idea, wishDetailPath(savedWishId), {});
                          }}
                        >
                          <EimirIcon name="check" />
                          {t('dateIdeas.card.saved')}
                        </Link>
                      ) : (
                        <Link
                          className="button-link secondary-link date-idea-save"
                          to={WISH_CREATE_ROUTE}
                          aria-describedby={titleId}
                          onClick={(event) => {
                            if (!plainActivation(event)) return;
                            event.preventDefault();
                            open(idea, WISH_CREATE_ROUTE, {
                              planningCreateDraft: {
                                title: idea.wishTitle,
                                description: idea.description,
                                dateIdeaId: idea.id,
                              },
                            });
                          }}
                        >
                          <EimirIcon name="wuensche" />
                          {t('dateIdeas.card.save')}
                        </Link>
                      )}
                      <AddActionLink
                        icon="kalender"
                        className="date-idea-plan"
                        label={t('dateIdeas.card.plan')}
                        aria-describedby={titleId}
                        to={
                          savedWishId
                            ? wishDetailPath(savedWishId)
                            : PLAN_CREATE_ROUTE
                        }
                        onClick={(event) => {
                          if (!plainActivation(event)) return;
                          event.preventDefault();
                          const draft = {
                            title: idea.planTitle,
                            description: idea.description,
                          };
                          // A Wish saved from this idea continues through the
                          // canonical Wish-to-Plan conversion (with If-Match).
                          if (savedWishId)
                            open(idea, wishDetailPath(savedWishId), {
                              planningConvertDraft: draft,
                            });
                          else
                            open(idea, PLAN_CREATE_ROUTE, {
                              planningCreateDraft: draft,
                            });
                        }}
                      />
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : null}
      {ideas.length > visibleCount ? (
        <button
          type="button"
          className="secondary date-ideas-show-more"
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
