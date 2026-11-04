import { useWarmInfiniteQuery } from '../client/useWarmInfiniteQuery';
import { AutoLoadMore } from './AutoLoadMore';
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { authorDisplayName } from '../client/authorPresentation';
import { formatCalendarDate } from '../client/formatRecency';
import { usePartnerNickname } from '../client/partnerNickname';
import { groupPlanningOverviewPlans } from '../client/planningOverview';
import { planScheduleLabel } from '../client/planningPresentation';
import { normalizeClientError } from '../client/problemDetails';
import {
  PLAN_CREATE_ROUTE,
  planDetailPath,
  WISH_CREATE_ROUTE,
  wishDetailPath,
} from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { handleTabKeyDown } from '../client/tabKeyboard';
import { textExcerpt } from '../client/textExcerpt';
import { useTranslation } from '../i18n';
import { OVERVIEW_STALE_TIME } from '../client/useWarmOverviewQuery';
import { OverviewCacheNotice } from './OverviewCacheNotice';
import { PageHeader } from './PageHeader';
import { PlanCover } from './PlanCover';
import { PlanningStatusScope, type PlanningScope } from './PlanningStatusScope';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import { WishSelectionEntry } from './WishSelectionEntry';
import './SharedPlanningPages.css';
import './PlanningReference.css';

const PAGE_SIZE = 20;
type PlanenSegment = 'wishes' | 'plans';
type PageShape<T> = { items: T[]; nextCursor: string | null };

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
  if (
    hash === '#plan-title' ||
    hash === '#plans' ||
    hash === '#experienced-plans'
  )
    return 'plans';
  if (
    hash === '#wish-title' ||
    hash === '#wishes' ||
    hash === '#fulfilled-wishes'
  )
    return 'wishes';
  return null;
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
  wishesPanelId,
  plansPanelId,
}: {
  active: PlanenSegment;
  onChange: (segment: PlanenSegment) => void;
  wishesTabId: string;
  plansTabId: string;
  wishesPanelId: string;
  plansPanelId: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="planen-segmented"
      role="tablist"
      aria-label={t('m5s3.overview.segmentedLabel')}
      onKeyDown={(event) =>
        handleTabKeyDown(event, (tab) =>
          onChange(tab.id === plansTabId ? 'plans' : 'wishes'),
        )
      }
    >
      <button
        type="button"
        role="tab"
        id={plansTabId}
        aria-selected={active === 'plans'}
        aria-controls={plansPanelId}
        tabIndex={active === 'plans' ? 0 : -1}
        className={`planen-segment ${active === 'plans' ? 'is-active' : ''}`}
        onClick={() => onChange('plans')}
      >
        {t('m5s3.overview.segmentPlans')}
      </button>
      <button
        type="button"
        role="tab"
        id={wishesTabId}
        aria-selected={active === 'wishes'}
        aria-controls={wishesPanelId}
        tabIndex={active === 'wishes' ? 0 : -1}
        className={`planen-segment ${active === 'wishes' ? 'is-active' : ''}`}
        onClick={() => onChange('wishes')}
      >
        {t('m5s3.overview.segmentWishes')}
      </button>
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
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  accountId?: string;
  apiBaseUrl?: string;
  accessToken?: string;
}) {
  const { t } = useTranslation();
  const { relationshipLabel } = usePartnerNickname();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    captureOrigin,
    registerOriginMetadata,
    resolveOrigin,
    primaryDestination,
  } = useTaskOrigin();
  const wishesTabId = useId();
  const plansTabId = useId();
  const wishesPanelId = useId();
  const plansPanelId = useId();
  const [activeSegment, setActiveSegment] = useState<PlanenSegment>(
    () => segmentForHash(location.hash) ?? 'plans',
  );
  const [wishStatus, setWishStatus] = useState<PlanningScope>(() =>
    location.hash === '#fulfilled-wishes' ? 'COMPLETED' : 'OPEN',
  );
  const [planStatus, setPlanStatus] = useState<PlanningScope>(() =>
    location.hash === '#experienced-plans' ? 'COMPLETED' : 'OPEN',
  );
  function changeStatus(kind: PlanenSegment, status: PlanningScope) {
    if (kind === 'plans') setPlanStatus(status);
    else setWishStatus(status);
    const hash =
      kind === 'plans'
        ? status === 'COMPLETED'
          ? '#experienced-plans'
          : '#plans'
        : status === 'COMPLETED'
          ? '#fulfilled-wishes'
          : '#wishes';
    void navigate(
      { pathname: location.pathname, search: location.search, hash },
      { replace: true, state: location.state },
    );
  }

  useLayoutEffect(() => {
    const segment = segmentForHash(location.hash);
    if (segment) setActiveSegment(segment);
    if (location.hash === '#experienced-plans') setPlanStatus('COMPLETED');
    else if (location.hash === '#plans' || location.hash === '#plan-title')
      setPlanStatus('OPEN');
    if (location.hash === '#fulfilled-wishes') setWishStatus('COMPLETED');
    else if (location.hash === '#wishes' || location.hash === '#wish-title')
      setWishStatus('OPEN');
  }, [location.hash]);

  useEffect(
    () =>
      registerOriginMetadata({
        planningSegment: activeSegment,
        planningWishStatus: wishStatus,
        planningPlanStatus: planStatus,
      }),
    [activeSegment, wishStatus, planStatus, registerOriginMetadata],
  );

  useLayoutEffect(() => {
    const state = location.state as { taskReturnKey?: unknown } | null;
    const origin = resolveOrigin(
      state?.taskReturnKey ?? primaryDestination('/plan').returnKey,
    );
    if (!origin) return;
    const segment = segmentForHash(location.hash) ?? origin.planningSegment;
    if (segment) setActiveSegment(segment);
    if (location.hash === '#experienced-plans') setPlanStatus('COMPLETED');
    else if (location.hash === '#plans' || location.hash === '#plan-title')
      setPlanStatus('OPEN');
    else if (origin.planningPlanStatus)
      setPlanStatus(origin.planningPlanStatus);
    if (location.hash === '#fulfilled-wishes') setWishStatus('COMPLETED');
    else if (location.hash === '#wishes' || location.hash === '#wish-title')
      setWishStatus('OPEN');
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
  }, [location.state, location.hash, resolveOrigin, primaryDestination]);

  const wishes = useWarmInfiniteQuery({
    queryKey: [
      'm5-s3',
      'wishes',
      spaceId,
      ...(wishStatus === 'COMPLETED' ? [wishStatus] : []),
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

  const wishItems = [
    ...new Map(
      (wishes.data?.pages.flatMap((page) => page.items) ?? [])
        .filter((wish) => wish.status === wishStatus)
        .map((wish) => [wish.id, wish]),
    ).values(),
  ];
  const planGroups = groupPlanningOverviewPlans([
    ...new Map(
      (plans.data?.pages.flatMap((page) => page.items) ?? []).map((plan) => [
        plan.id,
        plan,
      ]),
    ).values(),
  ]);
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
  ) {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    const taskOriginKey = captureOrigin({
      planningSegment: segment,
      planningWishStatus: wishStatus,
      planningPlanStatus: planStatus,
      selectedKey,
    });
    void navigate(to, {
      state: taskOriginKey ? { taskOriginKey } : undefined,
    });
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
        />
        <span className={focal ? 'planen-next-copy' : 'planen-agenda-copy'}>
          <strong className={focal ? undefined : 'planen-agenda-title'}>
            {plan.title}
          </strong>
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
          {plan.description ? (
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
      <PageHeader variant="root" title={t('m5s3.overview.title')} />
      <PlanenSegmentedControl
        active={activeSegment}
        onChange={setActiveSegment}
        wishesTabId={wishesTabId}
        plansTabId={plansTabId}
        wishesPanelId={wishesPanelId}
        plansPanelId={plansPanelId}
      />

      <PlanenPanel
        id={plansPanelId}
        labelledBy={plansTabId}
        hidden={activeSegment !== 'plans'}
      >
        <Link
          className="planen-local-add"
          {...planningLinkProps(PLAN_CREATE_ROUTE, 'plans')}
        >
          <span aria-hidden="true">+</span>
          {t('m5s3.overview.addPlan')}
        </Link>
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
          navigator.onLine === false) ? (
          <OverviewCacheNotice
            cachedAt={plans.cachedAt ?? new Date(plans.dataUpdatedAt)}
          />
        ) : null}
        {!plans.isLoading && !plans.error && !hasPlans ? (
          <div className="planen-empty-state">
            <h2>
              {t(
                planStatus === 'COMPLETED'
                  ? 'm5s3.overview.experiencedPlansEmpty'
                  : 'm5s3.overview.openPlansEmpty',
              )}
            </h2>
            {planStatus === 'OPEN' ? <p>{t('m5s3.plan.createIntro')}</p> : null}
          </div>
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

        {planStatus === 'OPEN' ? <WishSelectionEntry segment="plans" /> : null}

        {planStatus === 'OPEN' && planGroups.undated.length ? (
          <section
            className="planen-undated"
            aria-labelledby="planen-undated-heading"
          >
            <div className="planen-section-heading">
              <h2 id="planen-undated-heading">
                {t('m5s3.overview.undatedHeading')}
              </h2>
              <p>{t('m5s3.overview.undatedIntro')}</p>
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
                    <strong>{plan.title}</strong>
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
        <Link
          className="planen-local-add"
          {...planningLinkProps(WISH_CREATE_ROUTE, 'wishes')}
        >
          <span aria-hidden="true">+</span>
          {t('m5s3.overview.addWish')}
        </Link>
        <PlanningStatusScope
          kind="wishes"
          value={wishStatus}
          onChange={(status) => changeStatus('wishes', status)}
        />
        <WishSelectionEntry segment="wishes" compact />
        {wishes.isLoading && !wishes.data ? (
          <UiState kind="loading" title={t('states.loading.title')} />
        ) : null}
        {wishes.error ? (
          <ProblemState
            error={wishes.error}
            onRetry={() => void wishes.refetch()}
          />
        ) : null}
        {!wishes.isLoading && !wishes.error && wishItems.length === 0 ? (
          <div className="planen-empty-state">
            <h2>
              {t(
                wishStatus === 'COMPLETED'
                  ? 'm5s3.overview.fulfilledWishesEmpty'
                  : 'm5s3.overview.wishesEmpty',
              )}
            </h2>
          </div>
        ) : null}
        {wishItems.length ? (
          <ul className="planen-wish-list">
            {wishItems.map((wish) => (
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
                    {wishStatus === 'COMPLETED' ? (
                      <span>{t('m5s3.wish.status.COMPLETED')}</span>
                    ) : null}
                    <span>
                      {t('m5s3.overview.createdBy', {
                        name: wish.creator.isFormerMember
                          ? authorDisplayName(wish.creator)
                          : relationshipLabel(
                              wish.creator.id,
                              wish.creator.displayName,
                              t('couplePresencePartnerFallback'),
                            ),
                      })}
                    </span>
                  </span>
                  <span className="planen-wish-chevron" aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {activeSegment === 'wishes' && wishes.hasNextPage ? (
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
    </div>
  );
}
