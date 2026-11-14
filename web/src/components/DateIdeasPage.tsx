import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { DateIdea } from '../api/generated/models/DateIdea';
import type { DateIdeaCatalog } from '../api/generated/models/DateIdeaCatalog';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import {
  type CreateRequestAttempt,
  submitCreateRequest,
} from '../client/createRequestIdentity';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  BUDGET_FILTERS,
  createDateIdeasApi,
  DATE_INSPIRATION_CAPABILITY,
  type DateIdeasFilterState,
  DURATION_FILTERS,
  dateIdeasQueryKey,
  filterDateIdeas,
  formatBudgetRange,
  formatDurationRange,
  hasDateIdeasFilter,
  SETTING_FILTERS,
  sanitizeDateIdeasFilter,
  secondaryFilterCount,
  useDateInspirationCapability,
} from '../client/dateIdeas';
import {
  type ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import {
  PLAN_CREATE_ROUTE,
  PRO_INFORMATION_ROUTE,
  wishDetailPath,
} from '../client/routes';
import { withdrawSpaceCapability } from '../client/spaceEntitlement';
import { useTaskOrigin } from '../client/taskOrigin';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionLink } from './AddAction';
import { EimirIcon } from './EimirIcon';
import { OverviewCacheNotice } from './OverviewCacheNotice';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { ProMark } from './ProMark';
import { StatusScope } from './StatusScope';
import { UiState } from './UiState';
import './PlanningReference.css';
import './DateIdeas.css';

interface Props {
  accountId: string;
  spaceId: string;
  apiBaseUrl?: string;
  accessToken?: string;
}

const ALL = '__all__';
/** Budget band upper bounds, in the catalog currency (server contract). */
const BUDGET_LIMITS = { LOW: 30, MEDIUM: 80, HIGH: 80 } as const;

type SaveSnapshot = { spaceId: string; ideaId: string; locale: string };

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

  const catalog = useQuery({
    queryKey: dateIdeasQueryKey(accountId, spaceId, locale),
    queryFn: async ({ signal }) => {
      try {
        return await api.listDateIdeas({ spaceId, locale }, { signal });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: allowed && Boolean(apiBaseUrl && accessToken),
    // The catalog changes only with a release; saved state is refreshed
    // through this cache after every confirmed save.
    staleTime: 5 * 60_000,
    retry: false,
  });
  const denied =
    (catalog.error as ClientProblemError | null)?.code ===
    'PREMIUM_ENTITLEMENT_REQUIRED';
  useEffect(() => {
    if (denied)
      withdrawSpaceCapability(
        client,
        accountId,
        spaceId,
        DATE_INSPIRATION_CAPABILITY,
      );
  }, [denied, client, accountId, spaceId]);

  const [filter, setFilter] = useState<DateIdeasFilterState>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const restored = useRef<unknown>(null);
  const categoryIds = catalog.data?.categories.map((item) => item.id) ?? null;

  // Return from a Wish, composer or Plan restores filters, scroll and focus.
  useLayoutEffect(() => {
    const key = (location.state as { taskReturnKey?: unknown } | null)
      ?.taskReturnKey;
    const origin = resolveOrigin(key);
    if (!origin || restored.current === key || !catalog.data) return;
    restored.current = key;
    const value = sanitizeDateIdeasFilter(origin.dateIdeasFilter, categoryIds);
    setFilter(value);
    setMoreOpen(secondaryFilterCount(value) > 0);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: origin.scrollY });
      if (origin.selectedKey)
        document
          .querySelector<HTMLElement>(
            `[data-date-idea-key="${CSS.escape(origin.selectedKey)}"]`,
          )
          ?.focus({ preventScroll: true });
    });
  }, [location.state, resolveOrigin, catalog.data, categoryIds]);

  useEffect(
    () => registerOriginMetadata({ dateIdeasFilter: filter }),
    [filter, registerOriginMetadata],
  );

  const ideas = useMemo(
    () => filterDateIdeas(catalog.data?.ideas ?? [], filter),
    [catalog.data, filter],
  );

  const attempts = useRef(
    new Map<string, CreateRequestAttempt<SaveSnapshot>>(),
  );
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, ClientProblemError>>({});
  const [announcement, setAnnouncement] = useState('');
  const save = useMutation({
    networkMode: 'always',
    gcTime: 0,
    mutationFn: (idea: DateIdea) => {
      const snapshot = { spaceId, ideaId: idea.id, locale };
      return submitCreateRequest<SaveSnapshot, WishDetail>({
        previousAttempt: attempts.current.get(idea.id) ?? null,
        snapshot,
        rememberAttempt: (attempt) => {
          if (attempt) attempts.current.set(idea.id, attempt);
          else attempts.current.delete(idea.id);
        },
        request: (idempotencyKey) => {
          assertOnlineWrite();
          return api.saveDateIdeaAsWish({
            spaceId,
            ideaId: idea.id,
            idempotencyKey,
            dateIdeaWishCreate: { locale },
          });
        },
      });
    },
    onMutate: (idea) => {
      setPendingIds((current) => new Set(current).add(idea.id));
      setErrors(({ [idea.id]: _removed, ...rest }) => rest);
    },
    onSuccess: (wish, idea) => {
      client.setQueryData(
        authorSummaryQueryKeys.wishDetail(spaceId, wish.id),
        wish,
      );
      client.setQueryData<DateIdeaCatalog>(
        dateIdeasQueryKey(accountId, spaceId, locale),
        (current) =>
          current && {
            ...current,
            ideas: current.ideas.map((item) =>
              item.id === idea.id ? { ...item, savedWishId: wish.id } : item,
            ),
          },
      );
      void client.invalidateQueries({ queryKey: ['m5-s3', 'wishes', spaceId] });
      void invalidateDashboard(client, spaceId);
      setAnnouncement(t('dateIdeas.card.savedStatus', { title: idea.title }));
    },
    onError: (error, idea) => {
      const problem = error as ClientProblemError;
      if (problem.code === 'PREMIUM_ENTITLEMENT_REQUIRED')
        withdrawSpaceCapability(
          client,
          accountId,
          spaceId,
          DATE_INSPIRATION_CAPABILITY,
        );
      setErrors((current) => ({ ...current, [idea.id]: problem }));
    },
    onSettled: (_data, _error, idea) =>
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(idea.id);
        return next;
      }),
  });

  const openWithOrigin = (
    idea: DateIdea,
    to: string,
    extra: Parameters<typeof captureOrigin>[0] = {},
  ) => {
    const key = captureOrigin({
      selectedKey: idea.id,
      dateIdeasFilter: filter,
      ...extra,
    });
    void navigate(to, { state: { taskOriginKey: key } });
  };

  const moreId = useId();
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
          <Link className="button-link secondary" to={PRO_INFORMATION_ROUTE}>
            {t('dateIdeas.locked.action')}
          </Link>
        </section>
      </div>
    );

  const data = catalog.data;
  const categories = data?.categories ?? [];
  const categoryLabels = new Map(
    categories.map((item) => [item.id, item.label]),
  );
  const moreCount = secondaryFilterCount(filter);
  const budgetAmount = (limit: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: data?.currency ?? 'EUR',
      maximumFractionDigits: 0,
    }).format(limit);
  const toggle = <K extends keyof DateIdeasFilterState>(
    key: K,
    value: string,
  ) =>
    setFilter((current) => ({
      ...current,
      [key]: value === ALL ? undefined : (value as DateIdeasFilterState[K]),
    }));
  const listFormat = new Intl.ListFormat(locale, {
    style: 'long',
    type: 'conjunction',
  });

  return (
    <div className="page date-ideas-page">
      {header}
      {data?.edition === 'development' ? (
        <p className="date-ideas-preview-note">
          {t('dateIdeas.developmentNote')}
        </p>
      ) : null}
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
        <section
          className="date-ideas-filters"
          aria-label={t('dateIdeas.filters.label')}
        >
          <StatusScope
            label={t('dateIdeas.filters.categoryLegend')}
            value={filter.category ?? ALL}
            options={[
              { value: ALL, label: t('dateIdeas.filters.all') },
              ...categories.map((item) => ({
                value: item.id,
                label: item.label,
              })),
            ]}
            onChange={(value) => toggle('category', value)}
          />
          <div className="date-ideas-filter-bar">
            <button
              type="button"
              className="tertiary date-ideas-more"
              aria-expanded={moreOpen}
              aria-controls={moreId}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <EimirIcon name="filter" />
              {moreCount
                ? t('dateIdeas.filters.moreActive', { count: moreCount })
                : t('dateIdeas.filters.more')}
            </button>
            <p className="date-ideas-count" role="status">
              {hasDateIdeasFilter(filter)
                ? t('dateIdeas.countFiltered', {
                    count: ideas.length,
                    total: data.totalCount,
                  })
                : t('dateIdeas.count', { count: data.totalCount })}
            </p>
          </div>
          <div
            id={moreId}
            className="date-ideas-more-filters eimir-motion-disclosure"
            hidden={!moreOpen}
          >
            <p className="date-ideas-filter-label" aria-hidden="true">
              {t('dateIdeas.filters.durationLegend')}
            </p>
            <StatusScope
              label={t('dateIdeas.filters.durationLegend')}
              value={filter.duration ?? ALL}
              options={[
                { value: ALL, label: t('dateIdeas.filters.all') },
                ...DURATION_FILTERS.map((value) => ({
                  value,
                  label: t(`dateIdeas.filters.duration.${value}`),
                })),
              ]}
              onChange={(value) => toggle('duration', value)}
            />
            <p className="date-ideas-filter-label" aria-hidden="true">
              {t('dateIdeas.filters.budgetLegend')}
            </p>
            <StatusScope
              label={t('dateIdeas.filters.budgetLegend')}
              value={filter.budget ?? ALL}
              options={[
                { value: ALL, label: t('dateIdeas.filters.all') },
                ...BUDGET_FILTERS.map((value) => ({
                  value,
                  label: t(`dateIdeas.filters.budget.${value}`, {
                    amount:
                      value === 'FREE'
                        ? ''
                        : budgetAmount(BUDGET_LIMITS[value]),
                  }),
                })),
              ]}
              onChange={(value) => toggle('budget', value)}
            />
            <p className="date-ideas-filter-label" aria-hidden="true">
              {t('dateIdeas.filters.settingLegend')}
            </p>
            <StatusScope
              label={t('dateIdeas.filters.settingLegend')}
              value={filter.setting ?? ALL}
              options={[
                { value: ALL, label: t('dateIdeas.filters.all') },
                ...SETTING_FILTERS.map((value) => ({
                  value,
                  label: t(`dateIdeas.filters.setting.${value}`),
                })),
              ]}
              onChange={(value) => toggle('setting', value)}
            />
          </div>
          {hasDateIdeasFilter(filter) ? (
            <button
              type="button"
              className="tertiary date-ideas-reset"
              onClick={() => {
                setFilter({});
                setMoreOpen(false);
              }}
            >
              {t('dateIdeas.filters.reset')}
            </button>
          ) : null}
        </section>
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
        </div>
      ) : null}
      {ideas.length ? (
        <ul className="date-ideas-list">
          {ideas.map((idea) => {
            const titleId = `date-idea-${idea.id}`;
            const pending = pendingIds.has(idea.id);
            const error = errors[idea.id];
            const budget = formatBudgetRange(
              idea.budgetMin,
              idea.budgetMax,
              data?.currency ?? 'EUR',
              locale,
            );
            const textLang =
              idea.contentLocale !== data?.locale
                ? idea.contentLocale
                : undefined;
            return (
              <li
                key={idea.id}
                className="date-idea"
                data-date-idea-key={idea.id}
                tabIndex={-1}
              >
                <article aria-labelledby={titleId}>
                  <p className="date-idea-category">
                    {categoryLabels.get(idea.categoryId)}
                  </p>
                  <h2 id={titleId} lang={textLang}>
                    {idea.title}
                  </h2>
                  <p className="date-idea-description" lang={textLang}>
                    {idea.description}
                  </p>
                  <ul
                    className="date-idea-facts"
                    aria-label={t('dateIdeas.card.detailsLabel')}
                  >
                    <li>
                      {t('dateIdeas.card.duration', {
                        range: formatDurationRange(
                          idea.durationMinMinutes,
                          idea.durationMaxMinutes,
                          locale,
                        ),
                      })}
                    </li>
                    <li>
                      {budget
                        ? t('dateIdeas.card.budget', { range: budget })
                        : t('dateIdeas.card.budgetFree')}
                    </li>
                    <li>{t(`dateIdeas.card.setting.${idea.setting}`)}</li>
                  </ul>
                  {idea.requirements.length ? (
                    <p className="date-idea-requirements" lang={textLang}>
                      {t('dateIdeas.card.requirements', {
                        items: listFormat.format(idea.requirements),
                      })}
                    </p>
                  ) : null}
                  <div className="date-idea-actions">
                    {idea.savedWishId ? (
                      <Link
                        className="button-link secondary-link date-idea-saved eimir-motion-context-change"
                        to={wishDetailPath(idea.savedWishId)}
                        aria-describedby={titleId}
                        onClick={(event) => {
                          if (
                            event.button !== 0 ||
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                          )
                            return;
                          event.preventDefault();
                          openWithOrigin(
                            idea,
                            wishDetailPath(idea.savedWishId as string),
                          );
                        }}
                      >
                        <EimirIcon name="check" />
                        {t('dateIdeas.card.saved')}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="secondary date-idea-save"
                        aria-describedby={titleId}
                        aria-busy={pending || undefined}
                        disabled={pending}
                        onClick={() => save.mutate(idea)}
                      >
                        <EimirIcon name="wuensche" />
                        {pending
                          ? t('dateIdeas.card.saving')
                          : t('dateIdeas.card.save')}
                      </button>
                    )}
                    <AddActionLink
                      icon="kalender"
                      className="date-idea-plan"
                      label={t('dateIdeas.card.plan')}
                      aria-describedby={titleId}
                      to={
                        idea.savedWishId
                          ? wishDetailPath(idea.savedWishId)
                          : PLAN_CREATE_ROUTE
                      }
                      onClick={(event) => {
                        if (
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        )
                          return;
                        event.preventDefault();
                        // A saved idea continues through its Wish, so the
                        // canonical Wish-to-Plan conversion keeps them linked.
                        if (idea.savedWishId)
                          openWithOrigin(
                            idea,
                            wishDetailPath(idea.savedWishId),
                          );
                        else
                          openWithOrigin(idea, PLAN_CREATE_ROUTE, {
                            planningCreateDraft: {
                              title: idea.title,
                              description: idea.description,
                            },
                          });
                      }}
                    />
                  </div>
                  {error ? (
                    <p className="date-idea-error" role="alert">
                      {t(
                        error.kind === 'offline'
                          ? 'dateIdeas.card.saveOffline'
                          : 'dateIdeas.card.saveFailed',
                      )}
                    </p>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
