import { useQuery } from '@tanstack/react-query';
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { PeopleApi } from '../api/generated/apis/PeopleApi';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { planListTitle } from '../client/discreetPlans';
import { formatCalendarDate } from '../client/formatRecency';
import { groupPlanningOverviewPlans } from '../client/planningOverview';
import { planScheduleLabel } from '../client/planningPresentation';
import { normalizeClientError } from '../client/problemDetails';
import { sortByProductLabel } from '../client/productLabelOrder';
import {
  MEMORY_CREATE_ROUTE,
  PLAN_CREATE_ROUTE,
  planDetailPath,
  WISH_CREATE_ROUTE,
  wishDetailPath,
} from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { handleTabKeyDown } from '../client/tabKeyboard';
import { useTaskOrigin } from '../client/taskOrigin';
import { textExcerpt } from '../client/textExcerpt';
import { useWarmInfiniteQuery } from '../client/useWarmInfiniteQuery';
import { OVERVIEW_STALE_TIME } from '../client/useWarmOverviewQuery';
import {
  sortPlannedWishes,
  wishJourneyHint,
  wishPlanDateLabel,
} from '../client/wishJourney';
import { groupCompletedSeries, type WishSeriesRow } from '../client/wishSeries';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionLink } from './AddAction';
import { AutoLoadMore } from './AutoLoadMore';
import { DiscreetLock, DiscreetPlaceholderLines } from './DiscreetPlan';
import { EimirIcon } from './EimirIcon';
import { OverviewCacheNotice } from './OverviewCacheNotice';
import { PageHeader } from './PageHeader';
import { PlanCover } from './PlanCover';
import { PlanningOccasions } from './PlanningOccasions';
import {
  type PlanningScope,
  PlanningStatusScope,
  type WishScope,
} from './PlanningStatusScope';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import { WishOriginMark } from './WishJourney';
import { WishSelectionEntry } from './WishSelectionEntry';
import './SharedPlanningPages.css';
import './PlanningReference.css';

const PAGE_SIZE = 20;
const JOURNEY_PAGE_SIZE = 100;
const JOURNEY_MAX_PAGES = 10;
type PlanenSegment = 'wishes' | 'plans' | 'dates';
type PageShape<T> = { items: T[]; nextCursor: string | null };

function searchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase(resolvedLocale())
    .replace(/ß/g, 'ss');
}

function matchesSearch(query: string, ...content: (string | null)[]) {
  const text = searchText(content.filter(Boolean).join(' '));
  return searchText(query)
    .trim()
    .split(/\s+/u)
    .every((word) => text.includes(word));
}

function wishInitial(title: string): string {
  const initial = Array.from(searchText(title.trim()))[0] ?? '#';
  return /\p{L}/u.test(initial)
    ? initial.toLocaleUpperCase(resolvedLocale())
    : '#';
}

function PlanningSearch({
  kind,
  value,
  onChange,
}: {
  kind: PlanenSegment;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const label = t(
    kind === 'plans'
      ? 'm5s3.overview.searchPlans'
      : 'm5s3.overview.searchWishes',
  );
  return (
    <search className="planen-search">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <div className="planen-search-field">
        <EimirIcon name="suche" />
        <input
          ref={inputRef}
          id={id}
          type="search"
          placeholder={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            className="tertiary"
            aria-label={t('m5s3.overview.clearSearch')}
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
          >
            <EimirIcon name="close" className="inline-icon" />
          </button>
        ) : null}
      </div>
    </search>
  );
}

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

function nextCursor<T>(
  page: PageShape<T>,
  _pages: PageShape<T>[],
  previous: string | null,
  cursors: (string | null)[],
): string | undefined {
  const next = page.nextCursor;
  return next && next !== previous && !cursors.includes(next)
    ? next
    : undefined;
}

function segmentForHash(hash: string): PlanenSegment | null {
  if (hash === '#dates') return 'dates';
  if (
    hash === '#plan-title' ||
    hash === '#plans' ||
    hash === '#experienced-plans'
  )
    return 'plans';
  if (
    hash === '#wish-title' ||
    hash === '#wishes' ||
    hash === '#planned-wishes' ||
    hash === '#fulfilled-wishes'
  )
    return 'wishes';
  return null;
}

function wishScopeForHash(hash: string): WishScope | null {
  if (hash === '#fulfilled-wishes') return 'COMPLETED';
  if (hash === '#planned-wishes') return 'PLANNED';
  if (hash === '#wishes' || hash === '#wish-title') return 'OPEN';
  return null;
}

function wishScopeHash(status: WishScope): string {
  if (status === 'COMPLETED') return '#fulfilled-wishes';
  if (status === 'PLANNED') return '#planned-wishes';
  return '#wishes';
}

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function PlanenSegmentedControl({
  active,
  onChange,
  wishesTabId,
  plansTabId,
  datesTabId,
  wishesPanelId,
  plansPanelId,
  datesPanelId,
}: {
  active: PlanenSegment;
  onChange: (segment: PlanenSegment) => void;
  wishesTabId: string;
  plansTabId: string;
  datesTabId: string;
  wishesPanelId: string;
  plansPanelId: string;
  datesPanelId: string;
}) {
  const { t } = useTranslation();
  const tabs = [
    {
      key: 'plans',
      id: plansTabId,
      panel: plansPanelId,
      label: t('m5s3.overview.segmentPlans'),
    },
    {
      key: 'wishes',
      id: wishesTabId,
      panel: wishesPanelId,
      label: t('m5s3.overview.segmentWishes'),
    },
    {
      key: 'dates',
      id: datesTabId,
      panel: datesPanelId,
      label: t('importantDates.heading'),
    },
  ] as const;
  return (
    <div
      className="planen-segmented planen-segmented-occasions"
      role="tablist"
      aria-label={t('m5s3.overview.segmentedLabel')}
      onKeyDown={(event) =>
        handleTabKeyDown(event, (tab) =>
          onChange(tabs.find((t) => t.id === tab.id)?.key ?? 'plans'),
        )
      }
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          id={tab.id}
          aria-selected={active === tab.key}
          aria-controls={tab.panel}
          tabIndex={active === tab.key ? 0 : -1}
          className={`planen-segment ${active === tab.key ? 'is-active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function PlanenPanel({
  id,
  labelledBy,
  hidden,
  children,
}: {
  id: string;
  labelledBy: string;
  hidden: boolean;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      hidden={hidden}
      className="planen-panel"
    >
      {children}
    </div>
  );
}

export function SharedPlanningOverviewPage({
  apis,
  spaceId,
  apiBaseUrl,
  accessToken,
  peopleApi,
  profilesApi,
  accountId,
}: {
  peopleApi?: PeopleApi;
  profilesApi?: ProfilesApi;
  apis: SharedPlanningApis;
  spaceId: string;
  accountId?: string;
  apiBaseUrl?: string;
  accessToken?: string;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { captureOrigin, registerOriginMetadata, resolveOrigin } =
    useTaskOrigin();
  const wishesTabId = useId();
  const plansTabId = useId();
  const wishesPanelId = useId();
  const plansPanelId = useId();
  const datesTabId = useId();
  const datesPanelId = useId();
  const [activeSegment, setActiveSegment] = useState<PlanenSegment>(
    () => segmentForHash(location.hash) ?? 'plans',
  );
  const [wishStatus, setWishStatus] = useState<WishScope>(
    () => wishScopeForHash(location.hash) ?? 'OPEN',
  );
  const [planStatus, setPlanStatus] = useState<PlanningScope>(() =>
    location.hash === '#experienced-plans' ? 'COMPLETED' : 'OPEN',
  );
  const [planSearch, setPlanSearch] = useState('');
  const [wishSearch, setWishSearch] = useState('');
  const [occasionActionHost, setOccasionActionHost] =
    useState<HTMLSpanElement | null>(null);
  const restoredOrigin = useRef<unknown>(null);
  function changeStatus(kind: PlanenSegment, status: WishScope) {
    if (kind === 'plans')
      setPlanStatus(status === 'COMPLETED' ? status : 'OPEN');
    else setWishStatus(status);
    const hash =
      kind === 'plans'
        ? status === 'COMPLETED'
          ? '#experienced-plans'
          : '#plans'
        : wishScopeHash(status);
    void navigate(
      { pathname: location.pathname, search: location.search, hash },
      { replace: true, state: location.state },
    );
  }
  function changeSegment(segment: PlanenSegment) {
    setActiveSegment(segment);
    if (segment === 'dates') {
      void navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: '#dates',
        },
        { replace: true, state: location.state },
      );
      return;
    }
    changeStatus(segment, segment === 'plans' ? planStatus : wishStatus);
  }

  useLayoutEffect(() => {
    const segment = segmentForHash(location.hash);
    if (segment) setActiveSegment(segment);
    if (location.hash === '#experienced-plans') setPlanStatus('COMPLETED');
    else if (location.hash === '#plans' || location.hash === '#plan-title')
      setPlanStatus('OPEN');
    const hashWishScope = wishScopeForHash(location.hash);
    if (hashWishScope) setWishStatus(hashWishScope);
  }, [location.hash]);

  useEffect(
    () =>
      registerOriginMetadata({
        planningSegment: activeSegment,
        planningWishStatus: wishStatus,
        planningPlanStatus: planStatus,
        planningPlanSearch: planSearch,
        planningWishSearch: wishSearch,
      }),
    [
      activeSegment,
      wishStatus,
      planStatus,
      planSearch,
      wishSearch,
      registerOriginMetadata,
    ],
  );

  useLayoutEffect(() => {
    const state = location.state as { taskReturnKey?: unknown } | null;
    const originKey = state?.taskReturnKey;
    const origin = resolveOrigin(originKey);
    if (!origin) {
      if (
        !location.hash &&
        (location.state as { primaryRootEntry?: boolean } | null)
          ?.primaryRootEntry
      ) {
        setActiveSegment('plans');
        setPlanStatus('OPEN');
        setWishStatus('OPEN');
        setPlanSearch('');
        setWishSearch('');
      }
      return;
    }
    if (restoredOrigin.current === originKey) return;
    restoredOrigin.current = originKey;
    setPlanSearch(origin.planningPlanSearch ?? '');
    setWishSearch(origin.planningWishSearch ?? '');
    const segment = segmentForHash(location.hash) ?? origin.planningSegment;
    if (segment) setActiveSegment(segment);
    if (location.hash === '#experienced-plans') setPlanStatus('COMPLETED');
    else if (location.hash === '#plans' || location.hash === '#plan-title')
      setPlanStatus('OPEN');
    else if (origin.planningPlanStatus)
      setPlanStatus(origin.planningPlanStatus);
    const hashWishScope = wishScopeForHash(location.hash);
    if (hashWishScope) setWishStatus(hashWishScope);
    else if (origin.planningWishStatus)
      setWishStatus(origin.planningWishStatus);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: origin.scrollY });
      if (origin.selectedKey) {
        document
          .querySelector<HTMLElement>(
            `[data-planning-key="${CSS.escape(origin.selectedKey)}"]`,
          )
          ?.focus({ preventScroll: true });
      }
    });
  }, [location.state, location.hash, resolveOrigin]);

  const wishes = useWarmInfiniteQuery({
    queryKey: [
      'm5-s3',
      'wishes',
      spaceId,
      ...(wishStatus === 'OPEN' ? [] : [wishStatus]),
    ],
    enabled: activeSegment === 'wishes',
    queryFn: ({ pageParam, signal }) =>
      apiCall(() =>
        apis.wishes.listWishes(
          {
            spaceId,
            cursor: pageParam,
            limit: PAGE_SIZE,
            status: wishStatus,
          },
          { signal },
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor<WishDetail>,
    retry: false,
  });

  // The API cursor intentionally sorts by creation, preserving protected titles.
  // Complete this lightweight metadata snapshot before presenting an alphabet;
  // sorting separate pages would insert earlier letters above the user's scroll.
  useEffect(() => {
    if (
      activeSegment !== 'wishes' ||
      !wishes.hasNextPage ||
      wishes.isFetching ||
      wishes.error
    )
      return;
    void wishes.fetchNextPage({ cancelRefetch: false });
  }, [
    activeSegment,
    wishes.hasNextPage,
    wishes.isFetching,
    wishes.error,
    wishes.fetchNextPage,
  ]);
  const assemblingWishes = Boolean(wishes.hasNextPage && !wishes.error);

  const plans = useWarmInfiniteQuery(
    {
      queryKey: ['m5-s3', 'plans', spaceId, 'overview', planStatus],
      staleTime: OVERVIEW_STALE_TIME,
      enabled: activeSegment === 'plans',
      queryFn: ({ pageParam, signal }) =>
        apiCall(() =>
          apis.plans.listPlans(
            {
              spaceId,
              cursor: pageParam,
              limit: PAGE_SIZE,
              overviewScope: planStatus,
            },
            { signal },
          ),
        ),
      initialPageParam: null as string | null,
      getNextPageParam: nextCursor<PlanDetail>,
      retry: false,
    },
    { revalidateOnRestore: true },
  );

  // #1790 F2: one quiet hint above the Plans list, derived from the wishes
  // that left OPEN. Both lifecycle lists are small, so read them completely.
  const journeyWishes = useQuery({
    queryKey: ['m5-s3', 'wishes', spaceId, 'journey-hint'],
    staleTime: OVERVIEW_STALE_TIME,
    enabled: activeSegment === 'plans' && planStatus === 'OPEN',
    retry: false,
    queryFn: async ({ signal }) => {
      const items: WishDetail[] = [];
      for (const status of ['PLANNED', 'COMPLETED'] as const) {
        let cursor: string | null = null;
        for (let page = 0; page < JOURNEY_MAX_PAGES; page += 1) {
          const result = await apiCall(() =>
            apis.wishes.listWishes(
              { spaceId, cursor, limit: JOURNEY_PAGE_SIZE, status },
              { signal },
            ),
          );
          items.push(...result.items);
          if (!result.hasMore || !result.nextCursor) break;
          cursor = result.nextCursor;
        }
      }
      return items;
    },
  });
  const journeyHint = journeyWishes.data
    ? wishJourneyHint(journeyWishes.data)
    : null;

  // A search must inspect the whole authorized scope, not just visible pages.
  useEffect(() => {
    if (
      activeSegment !== 'plans' ||
      !planSearch.trim() ||
      !plans.hasNextPage ||
      plans.isFetching ||
      plans.error
    )
      return;
    void plans.fetchNextPage({ cancelRefetch: false });
  }, [
    activeSegment,
    planSearch,
    plans.hasNextPage,
    plans.isFetching,
    plans.error,
    plans.fetchNextPage,
  ]);
  const assemblingPlanSearch = Boolean(
    planSearch.trim() && plans.hasNextPage && !plans.error,
  );

  const alphabeticalWishes = sortByProductLabel(
    [
      ...new Map(
        (wishes.data?.pages.flatMap((page) => page.items) ?? [])
          .filter((wish) => wish.status === wishStatus)
          .filter((wish) =>
            matchesSearch(wishSearch, wish.title, ...(wish.tags ?? [])),
          )
          .map((wish) => [wish.id, wish]),
      ).values(),
    ],
    (wish) => wish.title,
    resolvedLocale(),
  );
  // Planned wishes read in the order they will happen; the others by title.
  const wishItems =
    wishStatus === 'PLANNED'
      ? sortPlannedWishes(
          alphabeticalWishes,
          (left, right) =>
            alphabeticalWishes.indexOf(left) -
            alphabeticalWishes.indexOf(right),
        )
      : alphabeticalWishes;
  const wishGroups = new Map<string, WishDetail[]>();
  for (const wish of wishItems) {
    const initial = wishInitial(wish.title);
    const group = wishGroups.get(initial) ?? [];
    group.push(wish);
    wishGroups.set(initial, group);
  }
  const planItems = [
    ...new Map(
      (plans.data?.pages.flatMap((page) => page.items) ?? []).map((plan) => [
        plan.id,
        plan,
      ]),
    ).values(),
  ].filter((plan) =>
    matchesSearch(
      planSearch,
      plan.title,
      plan.description,
      ...(plan.tags ?? []),
    ),
  );
  const planGroups = groupPlanningOverviewPlans(planItems);
  const hasPlans =
    planStatus === 'COMPLETED'
      ? planGroups.completed.length > 0
      : Boolean(
          planGroups.focal ||
            planGroups.later.length ||
            planGroups.undated.length ||
            planGroups.past.length,
        );

  function openFromOverview(
    event: MouseEvent<HTMLAnchorElement>,
    to: string,
    segment: PlanenSegment,
    selectedKey?: string,
    extraState?: Record<string, unknown>,
  ) {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    const taskOriginKey = captureOrigin({
      planningSegment: segment,
      planningWishStatus: wishStatus,
      planningPlanStatus: planStatus,
      planningPlanSearch: planSearch,
      planningWishSearch: wishSearch,
      selectedKey,
    });
    void navigate(to, {
      state:
        taskOriginKey || extraState
          ? { ...(taskOriginKey ? { taskOriginKey } : {}), ...extraState }
          : undefined,
    });
  }

  function openWishScope(
    event: MouseEvent<HTMLAnchorElement>,
    status: WishScope,
  ) {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    setActiveSegment('wishes');
    changeStatus('wishes', status);
    window.requestAnimationFrame(() =>
      document.getElementById(wishesTabId)?.focus(),
    );
  }

  function seriesTimeLabel(wish: WishDetail) {
    const experiencedOn = wish.plan?.experiencedOn;
    if (!experiencedOn)
      return t('wishRepeat.series.nthTime', { position: wish.seriesPosition });
    return t('wishRepeat.series.timeOn', {
      position: wish.seriesPosition,
      date: new Intl.DateTimeFormat(resolvedLocale(), {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(experiencedOn),
    });
  }

  function renderCompletedRow(row: WishSeriesRow) {
    const wish = row.latest;
    return (
      <li key={row.seriesId} className="planen-wish-journey-card">
        <Link
          className="planen-wish-link"
          {...planningLinkProps(wishDetailPath(wish.id), 'wishes', wish.id)}
        >
          <span className="planen-wish-copy">
            <strong>{wish.title}</strong>
          </span>
        </Link>
        {row.times.length > 1 ? (
          <span className="planen-wish-series-mark">
            <WishOriginMark>
              {t('wishRepeat.series.experienced', { count: row.times.length })}
            </WishOriginMark>
          </span>
        ) : null}
        {renderWishJourneyLink(wish)}
        {row.times.length > 1 ? (
          <details className="planen-wish-series">
            <summary>{t('wishRepeat.series.showAll')}</summary>
            <ul aria-label={t('wishRepeat.series.timesLabel')}>
              {row.times.map((time) => (
                <li key={time.id}>
                  <Link
                    {...planningLinkProps(
                      wishDetailPath(time.id),
                      'wishes',
                      time.id,
                    )}
                  >
                    {seriesTimeLabel(time)}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </li>
    );
  }

  function renderWishJourneyLink(wish: WishDetail) {
    const selectedKey = `${wish.id}:journey`;
    if (wish.status === 'PLANNED') {
      const date = wishPlanDateLabel(wish.plan);
      const label = date
        ? t('wishJourney.plannedOn', { date })
        : t('wishJourney.plannedUndated');
      const to = wish.plan
        ? planDetailPath(wish.plan.id)
        : wishDetailPath(wish.id);
      return (
        <Link
          className="planen-wish-journey-link"
          aria-label={`${label} – ${wish.title}`}
          {...planningLinkProps(to, 'wishes', selectedKey)}
        >
          <span>{label}</span>
          <EimirIcon name="chevron-right" />
        </Link>
      );
    }
    if (wish.hasMemory) {
      const label = t('wishJourney.remembered');
      const to = wish.plan
        ? planDetailPath(wish.plan.id)
        : wishDetailPath(wish.id);
      return (
        <Link
          className="planen-wish-journey-link is-warm"
          aria-label={`${label} – ${wish.title}`}
          {...planningLinkProps(to, 'wishes', selectedKey)}
        >
          <span>{label}</span>
          <EimirIcon name="chevron-right" />
        </Link>
      );
    }
    const label = t('wishJourney.captureMoment');
    // The Plan's memory capture links the new Memory to the Plan, which is
    // exactly what moves this wish on to "remembered".
    const sourcePlan =
      wish.plan && accountId && apiBaseUrl
        ? {
            sourcePlan: {
              id: wish.plan.id,
              spaceId,
              accountId,
              instance: apiBaseUrl,
            },
          }
        : undefined;
    return (
      <Link
        className="planen-wish-journey-link is-warm"
        aria-label={`${label} – ${wish.title}`}
        to={MEMORY_CREATE_ROUTE}
        data-planning-key={selectedKey}
        onClick={(event) =>
          openFromOverview(
            event,
            MEMORY_CREATE_ROUTE,
            'wishes',
            selectedKey,
            sourcePlan,
          )
        }
      >
        <span>{label}</span>
        <EimirIcon name="chevron-right" />
      </Link>
    );
  }

  function planningLinkProps(
    to: string,
    segment: PlanenSegment,
    selectedKey?: string,
  ) {
    return {
      to,
      'data-planning-key': selectedKey,
      onClick: (event: MouseEvent<HTMLAnchorElement>) =>
        openFromOverview(event, to, segment, selectedKey),
    };
  }

  function renderPlanPreview(plan: PlanDetail, focal = false) {
    // Discreet: list title, date and neutral lines only (#1790 F3).
    const discreet = Boolean(plan.discreet);
    const coverLock = discreet && Boolean(plan.coverAttachment);
    const title = (
      <strong className={focal ? undefined : 'planen-agenda-title'}>
        {planListTitle(plan, t)}
      </strong>
    );
    return (
      <Link
        className={`${focal ? 'planen-next-link' : 'planen-agenda-link'}${plan.coverAttachment ? ' planen-preview-has-cover' : ''}`}
        {...planningLinkProps(planDetailPath(plan.id), 'plans', plan.id)}
      >
        <PlanCover
          plan={plan}
          spaceId={spaceId}
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          interactive={false}
          presentation="preview"
          discreet={discreet}
        />
        <span className={focal ? 'planen-next-copy' : 'planen-agenda-copy'}>
          {plan.sourceWishId && plan.status !== 'COMPLETED' ? (
            <WishOriginMark>{t('wishJourney.planOrigin')}</WishOriginMark>
          ) : null}
          {discreet && !coverLock ? (
            <span className="discreet-title-row">
              {title}
              <DiscreetLock />
            </span>
          ) : (
            title
          )}
          <span
            className={
              focal ? 'planen-next-schedule' : 'planen-agenda-schedule'
            }
          >
            {plan.status === 'COMPLETED'
              ? plan.experiencedOn
                ? t('m5s3.overview.experiencedOn', {
                    date: formatCalendarDate(plan.experiencedOn),
                  })
                : t('m5s3.overview.completedLabel')
              : planScheduleLabel(plan)}
          </span>
          {discreet ? (
            <>
              <DiscreetPlaceholderLines />
              {focal ? (
                <span className="discreet-open-hint">
                  {t('discreetPlans.openHint')}
                </span>
              ) : null}
            </>
          ) : plan.description ? (
            <span
              className={
                focal ? 'planen-next-description' : 'planen-agenda-description'
              }
            >
              {textExcerpt(plan.description)}
            </span>
          ) : null}
        </span>
      </Link>
    );
  }

  return (
    <div className="page planning-page planning-sanctuary planen-overview">
      <PageHeader
        variant="root"
        className="content-overview-heading"
        title={t('m5s3.overview.title')}
        action={
          activeSegment === 'dates' ? (
            <span ref={setOccasionActionHost} />
          ) : (
            <AddActionLink
              floating
              label={t(
                activeSegment === 'plans'
                  ? 'm5s3.overview.addPlan'
                  : 'm5s3.overview.addWish',
              )}
              {...planningLinkProps(
                activeSegment === 'plans'
                  ? PLAN_CREATE_ROUTE
                  : WISH_CREATE_ROUTE,
                activeSegment,
                'planning-create',
              )}
            />
          )
        }
      />
      <PlanenSegmentedControl
        active={activeSegment}
        onChange={changeSegment}
        wishesTabId={wishesTabId}
        plansTabId={plansTabId}
        wishesPanelId={wishesPanelId}
        plansPanelId={plansPanelId}
        datesTabId={datesTabId}
        datesPanelId={datesPanelId}
      />

      <PlanenPanel
        id={plansPanelId}
        labelledBy={plansTabId}
        hidden={activeSegment !== 'plans'}
      >
        <PlanningSearch
          kind="plans"
          value={planSearch}
          onChange={setPlanSearch}
        />
        <PlanningStatusScope
          kind="plans"
          value={planStatus}
          onChange={(status) => changeStatus('plans', status)}
        />
        {plans.isLoading && !plans.data ? (
          <UiState kind="loading" title={t('states.loading.title')} />
        ) : null}
        {plans.error ? (
          <ProblemState
            error={plans.error}
            onRetry={() => void plans.refetch()}
          />
        ) : null}
        {plans.data &&
        (plans.isCached ||
          plans.fetchStatus === 'paused' ||
          (typeof navigator !== 'undefined' && navigator.onLine === false)) ? (
          <OverviewCacheNotice
            cachedAt={plans.cachedAt ?? new Date(plans.dataUpdatedAt)}
          />
        ) : null}
        {assemblingPlanSearch ? (
          <UiState kind="loading" title={t('states.loading.title')} />
        ) : null}
        {planSearch.trim() &&
        !plans.isLoading &&
        !assemblingPlanSearch &&
        !plans.error ? (
          <p className="planen-search-result" role="status">
            {t('m5s3.overview.searchResults', { count: planItems.length })}
          </p>
        ) : null}
        {!plans.isLoading &&
        !assemblingPlanSearch &&
        !plans.error &&
        !hasPlans ? (
          <div className="planen-empty-state">
            <h2>
              {t(
                planSearch.trim()
                  ? 'm5s3.overview.noSearchResults'
                  : planStatus === 'COMPLETED'
                    ? 'm5s3.overview.experiencedPlansEmpty'
                    : 'm5s3.overview.openPlansEmpty',
              )}
            </h2>
            {!planSearch.trim() && planStatus === 'OPEN' ? (
              <p>{t('m5s3.plan.createIntro')}</p>
            ) : null}
          </div>
        ) : null}

        {planStatus === 'OPEN' &&
        journeyHint &&
        !planSearch.trim() &&
        !plans.error ? (
          <a
            className="planen-wish-journey-hint"
            href={
              journeyHint.kind === 'underway'
                ? '#planned-wishes'
                : '#fulfilled-wishes'
            }
            onClick={(event) =>
              openWishScope(
                event,
                journeyHint.kind === 'underway' ? 'PLANNED' : 'COMPLETED',
              )
            }
          >
            <WishOriginMark trailing>
              {t(
                journeyHint.kind === 'underway'
                  ? 'wishJourney.hintUnderway'
                  : 'wishJourney.hintAwaitingMemory',
                { count: journeyHint.count },
              )}
            </WishOriginMark>
          </a>
        ) : null}

        {planStatus === 'OPEN' && planGroups.focal ? (
          <section
            className="planen-next"
            aria-labelledby="planen-next-heading"
          >
            <h2 id="planen-next-heading">{t('m5s3.overview.nextHeading')}</h2>
            {renderPlanPreview(planGroups.focal, true)}
          </section>
        ) : null}

        {planStatus === 'OPEN' && planGroups.later.length ? (
          <section
            className="planen-agenda"
            aria-labelledby="planen-later-heading"
          >
            <h2 id="planen-later-heading">{t('m5s3.overview.laterHeading')}</h2>
            <ul>
              {planGroups.later.map((plan) => (
                <li key={plan.id} className="planen-agenda-item">
                  {renderPlanPreview(plan)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {planStatus === 'OPEN' && planGroups.undated.length ? (
          <section
            className="planen-undated"
            aria-labelledby="planen-undated-heading"
          >
            <div className="planen-section-heading">
              <h2 id="planen-undated-heading">
                {t('m5s3.overview.undatedHeading')}
              </h2>
            </div>
            <ul>
              {planGroups.undated.map((plan) => (
                <li key={plan.id}>
                  <Link
                    className="planen-undated-link"
                    {...planningLinkProps(
                      planDetailPath(plan.id),
                      'plans',
                      plan.id,
                    )}
                  >
                    <span className="planen-undated-copy">
                      {plan.sourceWishId ? (
                        <WishOriginMark>
                          {t('wishJourney.planOrigin')}
                        </WishOriginMark>
                      ) : null}
                      {plan.discreet ? (
                        <span className="discreet-title-row">
                          <strong>{planListTitle(plan, t)}</strong>
                          <DiscreetLock />
                        </span>
                      ) : (
                        <strong>{plan.title}</strong>
                      )}
                    </span>
                    <span>{t('m5s3.overview.undatedHeading')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {planStatus === 'OPEN' && planGroups.past.length ? (
          <section
            className="planen-agenda"
            aria-labelledby="planen-past-heading"
          >
            <h2 id="planen-past-heading">{t('m5s3.overview.pastOpenPlans')}</h2>
            <ul>
              {planGroups.past.map((plan) => (
                <li key={plan.id} className="planen-agenda-item">
                  {renderPlanPreview(plan)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {planStatus === 'COMPLETED' && planGroups.completed.length ? (
          <section
            className="planen-agenda"
            aria-label={t('m5s3.overview.experiencedPlans')}
          >
            <ul>
              {planGroups.completed.map((plan) => (
                <li key={plan.id} className="planen-agenda-item">
                  {renderPlanPreview(plan)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {activeSegment === 'plans' && plans.hasNextPage ? (
          <AutoLoadMore query={plans} className="tertiary compact-action">
            {plans.isFetchingNextPage
              ? t('m5s3.common.loadingMore')
              : t('m5s3.common.loadMore')}
          </AutoLoadMore>
        ) : null}
      </PlanenPanel>

      <PlanenPanel
        id={wishesPanelId}
        labelledBy={wishesTabId}
        hidden={activeSegment !== 'wishes'}
      >
        <PlanningSearch
          kind="wishes"
          value={wishSearch}
          onChange={setWishSearch}
        />
        <PlanningStatusScope
          kind="wishes"
          value={wishStatus}
          onChange={(status) => changeStatus('wishes', status)}
        />
        {wishStatus === 'OPEN' ? (
          <WishSelectionEntry segment="wishes" compact />
        ) : null}
        {(wishes.isLoading && !wishes.data) || assemblingWishes ? (
          <UiState kind="loading" title={t('states.loading.title')} />
        ) : null}
        {wishes.error ? (
          <ProblemState
            error={wishes.error}
            onRetry={() => void wishes.refetch()}
          />
        ) : null}
        {wishes.data &&
        (wishes.isCached ||
          wishes.fetchStatus === 'paused' ||
          (typeof navigator !== 'undefined' && navigator.onLine === false)) ? (
          <OverviewCacheNotice
            cachedAt={wishes.cachedAt ?? new Date(wishes.dataUpdatedAt)}
          />
        ) : null}
        {wishSearch.trim() &&
        !wishes.isLoading &&
        !assemblingWishes &&
        !wishes.error ? (
          <p className="planen-search-result" role="status">
            {t('m5s3.overview.searchResults', { count: wishItems.length })}
          </p>
        ) : null}
        {!wishes.isLoading &&
        !assemblingWishes &&
        !wishes.error &&
        wishItems.length === 0 ? (
          <div className="planen-empty-state">
            <h2>
              {t(
                wishSearch.trim()
                  ? 'm5s3.overview.noSearchResults'
                  : wishStatus === 'COMPLETED'
                    ? 'm5s3.overview.fulfilledWishesEmpty'
                    : wishStatus === 'PLANNED'
                      ? 'wishJourney.plannedEmpty'
                      : 'm5s3.overview.wishesEmpty',
              )}
            </h2>
          </div>
        ) : null}
        {!assemblingWishes && wishItems.length && wishStatus !== 'OPEN' ? (
          <div className="planen-wish-groups planen-wish-journey">
            {wishStatus === 'PLANNED' && !wishSearch.trim() ? (
              <p className="planen-wish-journey-intro">
                {t('wishJourney.plannedIntro')}
              </p>
            ) : null}
            <ul className="planen-wish-list">
              {wishStatus === 'COMPLETED'
                ? groupCompletedSeries(wishItems).map(renderCompletedRow)
                : wishItems.map((wish) => (
                    <li key={wish.id} className="planen-wish-journey-card">
                      <Link
                        className="planen-wish-link"
                        {...planningLinkProps(
                          wishDetailPath(wish.id),
                          'wishes',
                          wish.id,
                        )}
                      >
                        <span className="planen-wish-copy">
                          <strong>{wish.title}</strong>
                        </span>
                      </Link>
                      {renderWishJourneyLink(wish)}
                    </li>
                  ))}
            </ul>
          </div>
        ) : null}
        {!assemblingWishes && wishItems.length && wishStatus === 'OPEN' ? (
          <div className="planen-wish-groups">
            {[...wishGroups].map(([initial, items]) => (
              <section
                className="planen-wish-group"
                key={initial}
                aria-label={initial}
              >
                <h2>{initial}</h2>
                <ul className="planen-wish-list">
                  {items.map((wish) => (
                    <li key={wish.id}>
                      <Link
                        className="planen-wish-link"
                        {...planningLinkProps(
                          wishDetailPath(wish.id),
                          'wishes',
                          wish.id,
                        )}
                      >
                        <span className="planen-wish-copy">
                          <strong>{wish.title}</strong>
                          {wish.seriesPosition > 1 ? (
                            <WishOriginMark>
                              {t('wishRepeat.series.nthTime', {
                                position: wish.seriesPosition,
                              })}
                            </WishOriginMark>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : null}
        {activeSegment === 'wishes' && wishes.hasNextPage && wishes.error ? (
          <AutoLoadMore
            query={wishes}
            className="tertiary compact-action"
            blocked={wishes.isFetchingNextPage}
          >
            {wishes.isFetchingNextPage
              ? t('m5s3.common.loadingMore')
              : t('m5s3.common.loadMore')}
          </AutoLoadMore>
        ) : null}
      </PlanenPanel>
      <PlanenPanel
        id={datesPanelId}
        labelledBy={datesTabId}
        hidden={activeSegment !== 'dates'}
      >
        {activeSegment === 'dates' && peopleApi ? (
          <PlanningOccasions
            createActionContainer={occasionActionHost}
            peopleApi={peopleApi}
            profilesApi={profilesApi}
            spaceId={spaceId}
            accountId={accountId}
            apiBaseUrl={apiBaseUrl}
            accessToken={accessToken}
          />
        ) : null}
      </PlanenPanel>
    </div>
  );
}
