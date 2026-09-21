import { authorDisplayName } from '../client/authorPresentation';
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { WishStatus } from '../api/generated/models/WishStatus';
import {
  groupPlanningOverviewPlans,
  loadPlanningOverviewPlans,
} from '../client/planningOverview';
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
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
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

function nextCursor<T>(page: PageShape<T>): string | undefined {
  return page.nextCursor ?? undefined;
}

function segmentForHash(hash: string): PlanenSegment | null {
  if (hash === '#plan-title' || hash === '#plans') return 'plans';
  if (hash === '#wish-title' || hash === '#wishes') return 'wishes';
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
  const wishesRef = useRef<HTMLButtonElement>(null);
  const plansRef = useRef<HTMLButtonElement>(null);

  function switchTo(segment: PlanenSegment, focus: boolean): void {
    onChange(segment);
    if (focus) (segment === 'plans' ? plansRef : wishesRef).current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    switchTo(active === 'plans' ? 'wishes' : 'plans', true);
  }

  return (
    <div
      className="planen-segmented"
      role="tablist"
      aria-label={t('m5s3.overview.segmentedLabel')}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={plansRef}
        type="button"
        role="tab"
        id={plansTabId}
        aria-selected={active === 'plans'}
        aria-controls={plansPanelId}
        tabIndex={active === 'plans' ? 0 : -1}
        className={`planen-segment ${active === 'plans' ? 'is-active' : ''}`}
        onClick={() => switchTo('plans', false)}
      >
        {t('m5s3.overview.segmentPlans')}
      </button>
      <button
        ref={wishesRef}
        type="button"
        role="tab"
        id={wishesTabId}
        aria-selected={active === 'wishes'}
        aria-controls={wishesPanelId}
        tabIndex={active === 'wishes' ? 0 : -1}
        className={`planen-segment ${active === 'wishes' ? 'is-active' : ''}`}
        onClick={() => switchTo('wishes', false)}
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
      className="planen-panel eimir-motion-reveal"
    >
      {children}
    </div>
  );
}

export function SharedPlanningOverviewPage({
  apis,
  spaceId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
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
  const [activeSegment, setActiveSegment] = useState<PlanenSegment>(
    () => segmentForHash(location.hash) ?? 'plans',
  );

  useLayoutEffect(() => {
    const segment = segmentForHash(location.hash);
    if (segment) setActiveSegment(segment);
  }, [location.hash]);

  useEffect(
    () => registerOriginMetadata({ planningSegment: activeSegment }),
    [activeSegment, registerOriginMetadata],
  );

  useLayoutEffect(() => {
    const state = location.state as { taskReturnKey?: unknown } | null;
    const origin = resolveOrigin(state?.taskReturnKey);
    if (!origin) return;
    if (origin.planningSegment) setActiveSegment(origin.planningSegment);
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
  }, [location.state, resolveOrigin]);

  const wishes = useInfiniteQuery({
    queryKey: ['m5-s3', 'wishes', spaceId],
    queryFn: ({ pageParam }) =>
      apiCall(() =>
        apis.wishes.listWishes({
          spaceId,
          cursor: pageParam,
          limit: PAGE_SIZE,
          status: WishStatus.OPEN,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor<WishDetail>,
    retry: false,
  });

  const plans = useInfiniteQuery({
    queryKey: ['m5-s3', 'plans', spaceId],
    queryFn: () =>
      apiCall(async () => ({
        items: await loadPlanningOverviewPlans(apis, spaceId),
        nextCursor: null,
      })),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor<PlanDetail>,
    retry: false,
  });

  const wishItems = (
    wishes.data?.pages.flatMap((page) => page.items) ?? []
  ).filter((wish) => wish.status === WishStatus.OPEN);
  const planGroups = groupPlanningOverviewPlans(
    plans.data?.pages.flatMap((page) => page.items) ?? [],
  );
  const hasPlans = Boolean(
    planGroups.focal ||
      planGroups.later.length ||
      planGroups.undated.length ||
      planGroups.past.length ||
      planGroups.completed.length,
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

  function renderAgendaPlan(plan: PlanDetail) {
    return (
      <li key={plan.id} className="planen-agenda-item">
        <Link
          className="planen-agenda-link"
          {...planningLinkProps(planDetailPath(plan.id), 'plans', plan.id)}
        >
          <span className="planen-agenda-schedule">
            {planScheduleLabel(plan)}
          </span>
          <span className="planen-agenda-title">{plan.title}</span>
        </Link>
      </li>
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
        {plans.isLoading && !plans.data ? (
          <UiState kind="loading" title={t('states.loading.title')} />
        ) : null}
        {plans.error ? (
          <ProblemState
            error={plans.error}
            onRetry={() => void plans.refetch()}
          />
        ) : null}
        {!plans.isLoading && !plans.error && !hasPlans ? (
          <div className="planen-empty-state">
            <h2>{t('m5s3.overview.plansEmpty')}</h2>
            <p>{t('m5s3.plan.createIntro')}</p>
          </div>
        ) : null}

        {planGroups.focal ? (
          <section
            className="planen-next"
            aria-labelledby="planen-next-heading"
          >
            <h2 id="planen-next-heading">{t('m5s3.overview.nextHeading')}</h2>
            <Link
              className="planen-next-link"
              {...planningLinkProps(
                planDetailPath(planGroups.focal.id),
                'plans',
                planGroups.focal.id,
              )}
            >
              <span className="planen-next-schedule">
                {planScheduleLabel(planGroups.focal)}
              </span>
              <strong>{planGroups.focal.title}</strong>
              {planGroups.focal.description ? (
                <span className="planen-next-description">
                  {planGroups.focal.description}
                </span>
              ) : null}
            </Link>
          </section>
        ) : null}

        {planGroups.later.length ? (
          <section
            className="planen-agenda"
            aria-labelledby="planen-later-heading"
          >
            <h2 id="planen-later-heading">{t('m5s3.overview.laterHeading')}</h2>
            <ul>{planGroups.later.map(renderAgendaPlan)}</ul>
          </section>
        ) : null}

        {planGroups.undated.length ? (
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

        {planGroups.past.length || planGroups.completed.length ? (
          <details className="planen-history">
            <summary>{t('m5s3.overview.historyHeading')}</summary>
            <p>{t('m5s3.overview.historyIntro')}</p>
            <ul>
              {[...planGroups.past, ...planGroups.completed].map((plan) => (
                <li key={plan.id}>
                  <Link
                    {...planningLinkProps(
                      planDetailPath(plan.id),
                      'plans',
                      plan.id,
                    )}
                  >
                    <span>{plan.title}</span>
                    <small>
                      {plan.status === 'COMPLETED'
                        ? t('m5s3.overview.completedLabel')
                        : t('m5s3.overview.pastLabel')}
                    </small>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
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
            <h2>{t('m5s3.overview.wishesEmpty')}</h2>
            <p>{t('m5s3.wish.createIntro')}</p>
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
                  <strong>{wish.title}</strong>
                  <span>
                    {t('m5s3.overview.createdBy', {
                      name: authorDisplayName(wish.creator),
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {wishes.hasNextPage ? (
          <button
            type="button"
            className="tertiary compact-action"
            onClick={() => void wishes.fetchNextPage()}
            disabled={wishes.isFetchingNextPage}
          >
            {wishes.isFetchingNextPage
              ? t('m5s3.common.loadingMore')
              : t('m5s3.common.loadMore')}
          </button>
        ) : null}
      </PlanenPanel>
    </div>
  );
}
