import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { DateIdea } from '../api/generated/models/DateIdea';
import type { PlanSchedule } from '../api/generated/models/PlanSchedule';
import type { WishDetail } from '../api/generated/models/WishDetail';
import type { WishSelectionCandidateView } from '../api/generated/models/WishSelectionCandidateView';
import type { WishSelectionView } from '../api/generated/models/WishSelectionView';
import { WishStatus } from '../api/generated/models/WishStatus';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import {
  type CreateRequestAttempt,
  submitCreateRequest,
} from '../client/createRequestIdentity';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  createDateIdeasApi,
  savedDateIdeaWishes,
  useDateIdeasCatalog,
  useDateInspirationCapability,
} from '../client/dateIdeas';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { sortByProductLabel } from '../client/productLabelOrder';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import {
  PLAN_CREATE_ROUTE,
  planDetailPath,
  proPaywallPath,
  WISH_CREATE_ROUTE,
  wishDetailPath,
} from '../client/routes';
import {
  planScheduleFromInputs,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { type TaskOriginMetadata, useTaskOrigin } from '../client/taskOrigin';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import {
  ownIdeaSelectionIds,
  ownSelectionIds,
  selectionChanged,
  wishSelectionQueryKey,
  wishSelectionSourceToken,
} from '../client/wishSelection';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionButton, AddActionLink } from './AddAction';
import { AutoLoadMore } from './AutoLoadMore';
import { DateIdeaFacts } from './DateIdeaFacts';
import { DateIdeaImage } from './DateIdeaImage';
import { DestinationIcon } from './DestinationIcon';
import { EimirIcon } from './EimirIcon';
import { PageHeader } from './PageHeader';
import { PlanningDiscardConfirmation } from './PlanningEditorLifecycle';
import { PlanScheduleFields } from './PlanScheduleFields';
import { ProblemState } from './ProblemState';
import { ProMark } from './ProMark';
import { ShortTaskSheet } from './ShortTaskSheet';
import { StatusScope } from './StatusScope';
import { TaskBackButton } from './TaskBackButton';
import { UiState } from './UiState';
import { WishSelectionIdeaPicker } from './WishSelectionIdeaPicker';
import './DateIdeas.css';
import './WishSelection.css';

interface Props {
  apis: SharedPlanningApis;
  spaceId: string;
  accountId: string;
  apiBaseUrl?: string;
  accessToken?: string;
}

type Mode = 'setup' | 'vote' | 'view' | 'plan';
type Source = 'wishes' | 'ideas';
type DraftBase = {
  token: string | null;
  sources: string;
  roundToken: string;
  ids: string[];
  ideaIds: string[];
  favorites: string[];
  favoriteIdeas: string[];
  title: string;
};
const MAX_CANDIDATES = 5;

function plainActivation(event: MouseEvent): boolean {
  return !(
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}
type WishAttempt = { spaceId: string; title: string };

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function WishSelectionPage(props: Props) {
  return (
    <WishSelectionTask
      key={JSON.stringify([props.apiBaseUrl, props.accountId, props.spaceId])}
      {...props}
    />
  );
}

function WishSelectionTask({
  apis,
  spaceId,
  accountId,
  apiBaseUrl = '',
  accessToken,
}: Props) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { requestReturn, captureOrigin } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const api = apis.wishSelections;
  // gcTime 0: every visit reads the round again, in the current locale.
  const queryKey = wishSelectionQueryKey(apiBaseUrl, accountId, spaceId);
  const [mode, setMode] = useState<Mode | null>(null);
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [ideaIds, setIdeaIds] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteIdeaIds, setFavoriteIdeaIds] = useState<string[]>([]);
  const [source, setSource] = useState<Source>('wishes');
  const [ideasOpened, setIdeasOpened] = useState(false);
  const ideaCount = useRef(0);
  ideaCount.current = ideaIds.length;
  const [occasion, setOccasion] = useState('');
  const [newIdea, setNewIdea] = useState('');
  const [base, setBase] = useState<DraftBase | null>(null);
  const [ownOnly, setOwnOnly] = useState(false);
  const [shareConfirmed, setShareConfirmed] = useState(false);
  const [selected, setSelected] = useState<WishSelectionCandidateView | null>(
    null,
  );
  const [planTitle, setPlanTitle] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planDirty, setPlanDirty] = useState(false);
  const [cancelPlan, setCancelPlan] = useState(false);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submissionLock = useRef(false);
  const focusRef = useRef<HTMLDivElement>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const wishAttempt = useRef<CreateRequestAttempt<WishAttempt> | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: () =>
      apiCall(() => {
        if (!api) throw new Error('Wish selection API unavailable.');
        return api.getWishSelection({ spaceId, locale });
      }),
    enabled: Boolean(api),
    retry: false,
    gcTime: 0,
    refetchInterval: (current) =>
      mode !== 'setup' &&
      mode !== 'vote' &&
      mode !== 'plan' &&
      current.state.data?.own.published
        ? 15_000
        : false,
    refetchIntervalInBackground: false,
  });
  const view = query.data;
  const activeMode: Mode =
    !view?.id && mode === 'view'
      ? 'setup'
      : (mode ??
        (!view?.id
          ? 'setup'
          : view.resultState === 'CHOOSING'
            ? 'vote'
            : 'view'));
  const dirty =
    activeMode === 'setup'
      ? Boolean(
          newIdea.trim() ||
            selectionChanged(candidateIds, base?.ids ?? []) ||
            selectionChanged(ideaIds, base?.ideaIds ?? []) ||
            occasion !== (base?.title ?? ''),
        )
      : activeMode === 'vote'
        ? selectionChanged(favoriteIds, base?.favorites ?? []) ||
          selectionChanged(favoriteIdeaIds, base?.favoriteIdeas ?? [])
        : activeMode === 'plan'
          ? planDirty
          : false;
  const onClose = useCallback(
    () => requestReturn(originKey, '/plan'),
    [originKey, requestReturn],
  );
  const lifecycle = useTaskEditorLifecycle({
    isDirty: dirty,
    isCloseBlocked: busy,
    onClose,
  });

  const adopt = useCallback((current: WishSelectionView) => {
    const ids = current.candidates
      .filter((candidate) => candidate.status === 'OPEN')
      .map((candidate) => candidate.wishId);
    // Changed ideas stay preselected so the review shows their current text;
    // removed or paused ideas have no content and are not offered again.
    const ideas = current.dateIdeaCandidates
      .filter((candidate) => candidate.idea)
      .map((candidate) => candidate.dateIdeaId);
    const favorites = ownSelectionIds(current);
    const favoriteIdeas = ownIdeaSelectionIds(current);
    setBase({
      token: current.selectionToken,
      sources: wishSelectionSourceToken(current),
      roundToken: current.roundToken,
      ids,
      ideaIds: ideas,
      favorites,
      favoriteIdeas,
      title: current.title ?? '',
    });
    setCandidateIds(ids);
    setIdeaIds(ideas);
    setFavoriteIds(favorites);
    setFavoriteIdeaIds(favoriteIdeas);
    setOccasion(current.title ?? '');
  }, []);
  useEffect(() => {
    if (!view) return;
    if (mode === null) setMode(activeMode);
    if (dirty || busy) return;
    if (
      !base ||
      (activeMode !== 'setup' &&
        activeMode !== 'plan' &&
        base.token !== view.selectionToken)
    )
      adopt(view);
  }, [view, dirty, busy, base, activeMode, mode, adopt]);
  useEffect(() => {
    focusRef.current?.focus({ preventScroll: activeMode === 'setup' });
  }, [activeMode]);

  const wishes = useInfiniteQuery({
    queryKey: ['m5-s3', 'wishes', spaceId],
    queryFn: ({ pageParam }) =>
      apiCall(() =>
        apis.wishes.listWishes({
          spaceId,
          status: WishStatus.OPEN,
          cursor: pageParam,
          limit: 30,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: activeMode === 'setup',
    retry: false,
  });
  useEffect(() => {
    if (
      activeMode === 'setup' &&
      wishes.hasNextPage &&
      !wishes.isFetching &&
      !wishes.error
    )
      void wishes.fetchNextPage();
  }, [
    activeMode,
    wishes.hasNextPage,
    wishes.isFetching,
    wishes.error,
    wishes.fetchNextPage,
  ]);
  const wishItems = sortByProductLabel(
    [
      ...new Map<string, { id: string; title: string }>(
        [
          ...(wishes.data?.pages.flatMap((page) => page.items) ?? []),
          ...(view?.candidates
            .filter((candidate) => candidate.status === 'OPEN')
            .map((candidate) => ({
              id: candidate.wishId,
              title: candidate.title,
            })) ?? []),
        ].map((wish) => [wish.id, wish]),
      ).values(),
    ],
    (wish) => wish.title,
    resolvedLocale(),
  );

  // Curated date ideas (Pro `planning.date_inspiration`) reuse the discovery
  // catalog read and its cache; the server authorizes every idea write again.
  const dateApi = useMemo(
    () => createDateIdeasApi(apiBaseUrl, accessToken ?? ''),
    [apiBaseUrl, accessToken],
  );
  const capability = useDateInspirationCapability({
    apiBaseUrl,
    accessToken,
    accountId,
    spaceId,
  });
  const { catalog, denied } = useDateIdeasCatalog({
    api: dateApi,
    accountId,
    spaceId,
    locale,
    capability: capability.data,
    enabled: Boolean(accessToken) && activeMode === 'setup' && ideasOpened,
  });
  const ideasAllowed = capability.data === true && !denied;
  const ideaById = new Map<string, DateIdea>([
    ...(catalog.data?.ideas.map((idea) => [idea.id, idea] as const) ?? []),
    ...(view?.dateIdeaCandidates.flatMap((candidate) =>
      candidate.idea ? [[candidate.dateIdeaId, candidate.idea] as const] : [],
    ) ?? []),
  ]);
  const placeLabels = new Map(
    (catalog.data?.placeTypes ?? []).map((item) => [item.id, item.label]),
  );
  const totalSelected = candidateIds.length + ideaIds.length;

  function begin() {
    if (submissionLock.current) return null;
    submissionLock.current = true;
    setBusy(true);
    const ownsTask = lifecycle.captureOwnership();
    const ownsQuery = captureAuthorizedQuery(client, queryKey);
    return () => ownsTask() && ownsQuery();
  }
  function finish() {
    submissionLock.current = false;
    setBusy(false);
  }

  const roundMutation = useMutation({
    networkMode: 'always',
    gcTime: 0,
    mutationFn: ({
      ids,
      ideas,
      title,
      token,
    }: {
      ids: string[];
      ideas: string[];
      title: string;
      token: string;
      current: () => boolean;
    }) =>
      apiCall(() => {
        assertOnlineWrite();
        if (!api) throw new Error('Wish selection API unavailable.');
        return api.replaceWishSelectionRound({
          spaceId,
          locale,
          ifMatch: token,
          wishSelectionRoundUpdate: {
            wishIds: ids,
            dateIdeaIds: ideas,
            title: title.trim() || undefined,
          },
        });
      }),
    onSuccess: (saved, vars) => {
      if (!vars.current()) return;
      client.setQueryData(queryKey, saved);
      adopt(saved);
      setMode('vote');
      setOwnOnly(false);
      setShareConfirmed(false);
    },
    onSettled: finish,
  });
  const ownMutation = useMutation({
    networkMode: 'always',
    gcTime: 0,
    mutationFn: ({
      ids,
      ideas,
      published,
      token,
    }: {
      ids: string[];
      ideas: string[];
      published: boolean;
      token: string;
      current: () => boolean;
    }) =>
      apiCall(() => {
        assertOnlineWrite();
        if (!api) throw new Error('Wish selection API unavailable.');
        return api.updateOwnWishSelection({
          spaceId,
          locale,
          ifMatch: token,
          wishSelectionUpdate: {
            favoriteWishIds: ids,
            favoriteDateIdeaIds: ideas,
            published,
          },
        });
      }),
    onSuccess: (saved, vars) => {
      if (!vars.current()) return;
      client.setQueryData(queryKey, saved);
      adopt(saved);
      setOwnOnly(false);
      setMode(vars.published ? 'view' : 'vote');
      setShareConfirmed(vars.published);
    },
    onSettled: finish,
  });
  const createWish = useMutation({
    networkMode: 'always',
    gcTime: 0,
    mutationFn: ({ title }: { title: string; current: () => boolean }) =>
      apiCall(() => {
        assertOnlineWrite();
        const snapshot = { spaceId, title };
        return submitCreateRequest<WishAttempt, WishDetail>({
          previousAttempt: wishAttempt.current,
          snapshot,
          rememberAttempt: (attempt) => {
            wishAttempt.current = attempt;
          },
          request: (idempotencyKey) =>
            apis.wishes.createWish({
              spaceId,
              idempotencyKey,
              wishCreate: { title },
            }),
        });
      }),
    onSuccess: async (saved, vars) => {
      if (!vars.current()) return;
      client.setQueryData(
        authorSummaryQueryKeys.wishDetail(spaceId, saved.id),
        saved,
      );
      await client.invalidateQueries({
        queryKey: ['m5-s3', 'wishes', spaceId],
      });
      if (!vars.current()) return;
      setNewIdea((current) => (current.trim() === vars.title ? '' : current));
      setCandidateIds((current) =>
        current.length + ideaCount.current < MAX_CANDIDATES &&
        !current.includes(saved.id)
          ? [...current, saved.id]
          : current,
      );
    },
    onSettled: finish,
  });
  const planMutation = useMutation({
    networkMode: 'always',
    gcTime: 0,
    mutationFn: ({
      source,
      title,
      description,
      schedule,
    }: {
      source: WishSelectionCandidateView;
      title: string;
      description: string;
      schedule?: PlanSchedule;
      current: () => boolean;
    }) =>
      apiCall(() => {
        assertOnlineWrite();
        return apis.plans.convertWishToPlan({
          spaceId,
          wishId: source.wishId,
          ifMatch: String(source.version),
          wishToPlan: {
            title,
            description: description.trim() || undefined,
            schedule,
          },
        });
      }),
    onSuccess: async (saved, vars) => {
      if (!vars.current()) return;
      client.setQueryData(
        authorSummaryQueryKeys.wishDetail(spaceId, saved.wish.id),
        saved.wish,
      );
      client.setQueryData(
        authorSummaryQueryKeys.planDetail(spaceId, saved.plan.id),
        saved.plan,
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ['m5-s3', 'wishes', spaceId] }),
        client.invalidateQueries({ queryKey: ['m5-s3', 'plans', spaceId] }),
        client.invalidateQueries({ queryKey }),
        invalidateDashboard(client, spaceId),
      ]);
      if (!vars.current()) return;
      const taskOriginKey = captureOrigin();
      lifecycle.closeConfirmed(() => {
        void navigate(planDetailPath(saved.plan.id), {
          replace: true,
          state: { taskOriginKey, planningCreated: true },
        });
      });
    },
    onSettled: finish,
  });
  const closeMutation = useMutation({
    networkMode: 'always',
    gcTime: 0,
    mutationFn: ({ token }: { token: string; current: () => boolean }) =>
      apiCall(() => {
        assertOnlineWrite();
        if (!api) throw new Error('Wish selection API unavailable.');
        return api.closeWishSelectionRound({
          spaceId,
          ifMatch: token,
        });
      }),
    onSuccess: async (_saved, vars) => {
      if (!vars.current()) return;
      await query.refetch();
      if (!vars.current()) return;
      setBase(null);
      setMode('setup');
      setCandidateIds([]);
      setIdeaIds([]);
      setFavoriteIds([]);
      setFavoriteIdeaIds([]);
      setOccasion('');
      setCloseOpen(false);
    },
    onSettled: finish,
  });

  const problem =
    roundMutation.error ??
    ownMutation.error ??
    createWish.error ??
    planMutation.error ??
    closeMutation.error ??
    loadError;
  const stale = Boolean(
    view &&
      base &&
      (view.selectionToken !== base.token ||
        view.roundToken !== base.roundToken ||
        wishSelectionSourceToken(view) !== base.sources),
  );
  function clearProblems() {
    roundMutation.reset();
    ownMutation.reset();
    createWish.reset();
    planMutation.reset();
    closeMutation.reset();
    setLoadError(null);
  }
  function toggle(current: string[], id: string) {
    return current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];
  }
  function changeIdeas() {
    if (!view || busy) return;
    adopt(view);
    clearProblems();
    setMode('setup');
  }
  function editOwn() {
    if (!view?.selectionToken || busy) return;
    clearProblems();
    if (!view.own.published) {
      adopt(view);
      setMode('vote');
      return;
    }
    const current = begin();
    if (current)
      ownMutation.mutate({
        current,
        ids: ownSelectionIds(view),
        ideas: ownIdeaSelectionIds(view),
        published: false,
        token: view.selectionToken,
      });
  }
  // A common idea is a decision only: the existing composers save an ordinary
  // Wish or Plan after explicit confirmation and return here afterwards.
  function openIdea(idea: DateIdea, to: string, extra: TaskOriginMetadata) {
    if (busy) return;
    lifecycle.closeConfirmed(() => {
      const taskOriginKey = captureOrigin({ selectedKey: idea.id, ...extra });
      void navigate(to, { state: { taskOriginKey } });
    });
  }
  function prepare(candidate: WishSelectionCandidateView) {
    if (busy) return;
    if (candidate.planId) {
      lifecycle.closeConfirmed(() => {
        void navigate(planDetailPath(candidate.planId as string), {
          state: { taskOriginKey: captureOrigin() },
        });
      });
      return;
    }
    clearProblems();
    setSelected(candidate);
    setPlanTitle(candidate.title);
    setPlanDescription('');
    setPlanDirty(false);
    setMode('plan');
  }
  async function reload() {
    if (busy) return;
    const owns = lifecycle.captureOwnership();
    const result = await query.refetch();
    if (!owns()) return;
    if (result.data && !result.error) {
      await client.invalidateQueries({
        queryKey: ['m5-s3', 'wishes', spaceId],
      });
      if (!owns()) return;
      adopt(result.data);
      setMode(null);
      setNewIdea('');
      clearProblems();
    } else setLoadError(result.error);
    setReloadConfirm(false);
  }

  if (!api)
    return <UiState kind="error" title={t('states.unexpected.title')} />;
  if (!view && query.isLoading)
    return <UiState kind="loading" title={t('states.loading.title')} />;
  if (
    !view ||
    ['unauthorized', 'permission', 'notFound'].includes(
      clientProblemKind(query.error),
    )
  )
    return (
      <ProblemState error={query.error} onRetry={() => void query.refetch()} />
    );

  const available = view.candidates.filter(
    (candidate) => !candidate.planId && candidate.status === 'OPEN',
  );
  const availableIdeas = view.dateIdeaCandidates.flatMap((candidate) =>
    candidate.current && candidate.idea ? [candidate.idea] : [],
  );
  const paused = view.resultState === 'PAUSED';
  const pausedIdeas = paused ? view.dateIdeaCandidates.length : 0;
  const planned = view.candidates.filter((candidate) => candidate.planId);
  const shownIds = ownOnly ? ownSelectionIds(view) : view.commonWishIds;
  const shown = available.filter((candidate) =>
    shownIds.includes(candidate.wishId),
  );
  const shownIdeaIds = ownOnly
    ? ownIdeaSelectionIds(view)
    : view.commonDateIdeaIds;
  const shownIdeas = availableIdeas.filter((idea) =>
    shownIdeaIds.includes(idea.id),
  );
  const shownCount = shown.length + shownIdeas.length;
  const availableCount = available.length + availableIdeas.length;
  const ownFavoriteCount =
    ownSelectionIds(view).filter((id) =>
      available.some((candidate) => candidate.wishId === id),
    ).length + ownIdeaSelectionIds(view).length;
  const savedWishes = savedDateIdeaWishes(client, accountId, spaceId);
  const titleKey =
    activeMode === 'setup'
      ? 'setupTitle'
      : activeMode === 'vote'
        ? 'chooseTitle'
        : activeMode === 'plan'
          ? 'prepareTitle'
          : paused
            ? 'pausedTitle'
            : view.resultState === 'NEEDS_IDEAS'
              ? 'changedTitle'
              : ownOnly
                ? 'ownTitle'
                : availableCount === 0 && planned.length
                  ? 'allPlannedTitle'
                  : view.resultState === 'CHOOSING'
                    ? 'chooseTitle'
                    : view.resultState === 'WAITING'
                      ? 'waitingTitle'
                      : shownCount
                        ? 'sharedTitle'
                        : 'noMatchTitle';
  const introKey =
    activeMode === 'setup'
      ? 'setupIntro'
      : activeMode === 'vote'
        ? 'chooseIntro'
        : activeMode === 'plan'
          ? 'prepareIntro'
          : paused
            ? 'pausedBody'
            : view.resultState === 'NEEDS_IDEAS'
              ? 'changedBody'
              : ownOnly
                ? 'ownBody'
                : availableCount === 0 && planned.length
                  ? 'allPlannedBody'
                  : view.resultState === 'CHOOSING'
                    ? 'chooseIntro'
                    : view.resultState === 'WAITING'
                      ? 'waitingBody'
                      : !shownCount
                        ? 'noMatchBody'
                        : null;

  return (
    <div className="page wish-selection-task">
      <PageHeader
        before={
          <TaskBackButton
            type="button"
            className="back-link tertiary"
            disabled={busy}
            onClick={() => {
              if (activeMode === 'plan') {
                if (planDirty) setCancelPlan(true);
                else setMode('view');
              } else lifecycle.requestClose();
            }}
          >
            {t(
              activeMode === 'plan'
                ? 'wishSelection.toSelection'
                : 'taskBoundary.back',
            )}
          </TaskBackButton>
        }
        eyebrow={view.title && activeMode !== 'setup' ? view.title : undefined}
        title={t(`wishSelection.${titleKey}`)}
        description={introKey ? t(`wishSelection.${introKey}`) : undefined}
      />
      <div ref={focusRef} tabIndex={-1} className="planning-task-focus" />
      {query.error ? (
        <ProblemState
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {problem ? (
        <ProblemState error={problem} onRetry={() => void query.refetch()} />
      ) : null}
      {stale && (activeMode === 'setup' || activeMode === 'vote') ? (
        <div className="inline-message" role="status">
          <p>{t('wishSelection.changedBody')}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => setReloadConfirm(true)}
          >
            {t('wishSelection.reload')}
          </button>
        </div>
      ) : null}
      {lifecycle.showDiscardConfirm || cancelPlan || reloadConfirm ? (
        <PlanningDiscardConfirmation
          onKeepEditing={() => {
            lifecycle.keepEditing();
            setCancelPlan(false);
            setReloadConfirm(false);
          }}
          onDiscard={() => {
            if (reloadConfirm) {
              void reload();
              return;
            }
            if (cancelPlan) {
              setCancelPlan(false);
              setPlanDirty(false);
              setMode('view');
              return;
            }
            lifecycle.closeConfirmed();
          }}
        />
      ) : null}

      {activeMode === 'setup' ? (
        <form
          className="wish-selection-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (totalSelected < 2 || totalSelected > MAX_CANDIDATES || stale)
              return;
            clearProblems();
            const current = begin();
            if (current)
              roundMutation.mutate({
                current,
                ids: [...candidateIds],
                ideas: [...ideaIds],
                title: occasion,
                token: base?.roundToken ?? view.roundToken,
              });
          }}
        >
          <fieldset disabled={busy} className="wish-selection-fields">
            <label className="field-group">
              <span>{t('wishSelection.occasion')}</span>
              <input
                value={occasion}
                maxLength={60}
                onChange={(event) => setOccasion(event.target.value)}
                placeholder={t('wishSelection.occasionPlaceholder')}
              />
            </label>
            <section
              className="wish-selection-tray"
              aria-labelledby="wish-selection-tray-title"
            >
              <h2 id="wish-selection-tray-title">
                {t('wishSelection.inSelection')}
              </h2>
              {totalSelected ? (
                <ul>
                  {candidateIds.map((id) => {
                    const title =
                      wishItems.find((wish) => wish.id === id)?.title ?? '';
                    return (
                      <li key={id}>
                        <EimirIcon
                          name="wuensche"
                          className="wish-selection-tray-source"
                        />
                        <span>{title}</span>
                        <button
                          type="button"
                          className="tertiary wish-selection-tray-remove"
                          aria-label={t('wishSelection.removeCandidate', {
                            title,
                          })}
                          onClick={() =>
                            setCandidateIds((current) => toggle(current, id))
                          }
                        >
                          <EimirIcon name="close" />
                        </button>
                      </li>
                    );
                  })}
                  {ideaIds.map((id) => {
                    const idea = ideaById.get(id);
                    const title = idea?.title ?? t('wishSelection.ideaSource');
                    return (
                      <li key={id}>
                        <EimirIcon
                          name="sparkle"
                          className="wish-selection-tray-source is-idea"
                        />
                        <span
                          lang={
                            idea && idea.contentLocale !== locale
                              ? idea.contentLocale
                              : undefined
                          }
                        >
                          {title}
                        </span>
                        <button
                          type="button"
                          className="tertiary wish-selection-tray-remove"
                          aria-label={t('wishSelection.removeCandidate', {
                            title,
                          })}
                          onClick={() =>
                            setIdeaIds((current) => toggle(current, id))
                          }
                        >
                          <EimirIcon name="close" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <p className="wish-selection-support" role="status">
                {t(
                  totalSelected < 2
                    ? 'wishSelection.chooseMore'
                    : 'wishSelection.selected',
                  { count: totalSelected },
                )}
              </p>
            </section>
            <StatusScope<Source>
              label={t('wishSelection.sourceLabel')}
              value={source}
              options={[
                { value: 'wishes', label: t('wishSelection.sourceWishes') },
                { value: 'ideas', label: t('wishSelection.sourceIdeas') },
              ]}
              onChange={(value) => {
                setSource(value);
                if (value === 'ideas') setIdeasOpened(true);
              }}
            />
            <div className="wish-selection-source" hidden={source !== 'wishes'}>
              {wishes.error ? (
                <ProblemState
                  error={wishes.error}
                  onRetry={() => void wishes.refetch()}
                />
              ) : null}
              {wishes.isLoading ? (
                <UiState kind="loading" title={t('states.loading.title')} />
              ) : null}
              {!wishes.isLoading && !wishes.error && wishItems.length < 2 ? (
                <div className="wish-selection-empty">
                  <h2>{t('wishSelection.emptyWishes')}</h2>
                  <p>{t('wishSelection.emptyWishesBody')}</p>
                </div>
              ) : null}
              <fieldset className="wish-selection-choices">
                <legend>{t('wishSelection.openWishes')}</legend>
                {wishItems.map((wish) => (
                  <label key={wish.id} className="wish-selection-choice">
                    <input
                      type="checkbox"
                      checked={candidateIds.includes(wish.id)}
                      disabled={
                        !candidateIds.includes(wish.id) &&
                        totalSelected >= MAX_CANDIDATES
                      }
                      onChange={() =>
                        setCandidateIds((current) => toggle(current, wish.id))
                      }
                    />
                    <span>{wish.title}</span>
                  </label>
                ))}
              </fieldset>
              {wishes.hasNextPage ? (
                <AutoLoadMore
                  query={wishes}
                  className="tertiary"
                  blocked={wishes.isFetchingNextPage}
                >
                  {t('m5s3.common.loadMore')}
                </AutoLoadMore>
              ) : null}
              <label className="field-group">
                <span>{t('wishSelection.newIdea')}</span>
                <input
                  value={newIdea}
                  maxLength={200}
                  placeholder={t('wishSelection.newIdeaPlaceholder')}
                  onChange={(event) => setNewIdea(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                  }}
                />
              </label>
              <AddActionButton
                label={t('wishSelection.addIdea')}
                disabled={!newIdea.trim()}
                onClick={() => {
                  clearProblems();
                  const current = begin();
                  if (current)
                    createWish.mutate({ current, title: newIdea.trim() });
                }}
              />
            </div>
            {ideasOpened ? (
              <div
                className="wish-selection-source"
                hidden={source !== 'ideas'}
              >
                <WishSelectionIdeaPicker
                  api={dateApi}
                  accountId={accountId}
                  spaceId={spaceId}
                  capability={capability}
                  allowed={ideasAllowed}
                  catalog={catalog}
                  selectedIds={ideaIds}
                  full={totalSelected >= MAX_CANDIDATES}
                  onToggle={(id) =>
                    setIdeaIds((current) =>
                      current.includes(id) || totalSelected < MAX_CANDIDATES
                        ? toggle(current, id)
                        : current,
                    )
                  }
                />
              </div>
            ) : null}
            <div className="wish-selection-actions">
              <button
                type="submit"
                disabled={
                  busy ||
                  stale ||
                  totalSelected < 2 ||
                  totalSelected > MAX_CANDIDATES
                }
              >
                {t(
                  busy
                    ? 'wishSelection.saving'
                    : view.id
                      ? 'wishSelection.replace'
                      : 'wishSelection.start',
                )}
              </button>
              <p className="wish-selection-support">
                {t(
                  view.id
                    ? 'wishSelection.replaceNotice'
                    : 'wishSelection.startNotice',
                )}
              </p>
            </div>
          </fieldset>
        </form>
      ) : null}

      {activeMode === 'vote' ? (
        <form
          className="wish-selection-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!base?.token || stale || view.resultState === 'NEEDS_IDEAS')
              return;
            clearProblems();
            const current = begin();
            if (current)
              ownMutation.mutate({
                current,
                ids: [...favoriteIds],
                ideas: [...favoriteIdeaIds],
                published: true,
                token: base.token,
              });
          }}
        >
          <fieldset disabled={busy} className="wish-selection-fields">
            <p className="wish-selection-private">
              <DestinationIcon icon="private" />
              {t('wishSelection.personal')}
            </p>
            <fieldset className="wish-selection-choices">
              <legend>{t('wishSelection.favorites')}</legend>
              {available.map((candidate) => (
                <label key={candidate.wishId} className="wish-selection-choice">
                  <input
                    type="checkbox"
                    checked={favoriteIds.includes(candidate.wishId)}
                    onChange={() =>
                      setFavoriteIds((current) =>
                        toggle(current, candidate.wishId),
                      )
                    }
                  />
                  <span className="wish-selection-choice-text">
                    {candidate.title}
                    {availableIdeas.length ? (
                      <small>{t('wishSelection.wishSource')}</small>
                    ) : null}
                  </span>
                </label>
              ))}
              {availableIdeas.map((idea) => (
                <label key={idea.id} className="wish-selection-choice is-idea">
                  <input
                    type="checkbox"
                    checked={favoriteIdeaIds.includes(idea.id)}
                    onChange={() =>
                      setFavoriteIdeaIds((current) => toggle(current, idea.id))
                    }
                  />
                  <span className="wish-selection-choice-media">
                    <DateIdeaImage
                      api={dateApi}
                      accountId={accountId}
                      spaceId={spaceId}
                      image={idea.image}
                      lang={
                        idea.contentLocale !== locale
                          ? idea.contentLocale
                          : undefined
                      }
                    />
                  </span>
                  <span
                    className="wish-selection-choice-text"
                    lang={
                      idea.contentLocale !== locale
                        ? idea.contentLocale
                        : undefined
                    }
                  >
                    {idea.title}
                    <small>{t('wishSelection.ideaSourceShort')}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="wish-selection-support">
              {t('wishSelection.privacy')}
            </p>
            <div className="wish-selection-actions">
              <button
                type="submit"
                disabled={
                  busy ||
                  stale ||
                  !base?.token ||
                  view.resultState === 'NEEDS_IDEAS'
                }
              >
                {t(
                  busy
                    ? 'wishSelection.saving'
                    : favoriteIds.length + favoriteIdeaIds.length
                      ? 'wishSelection.share'
                      : 'wishSelection.shareNone',
                )}
              </button>
              <p className="wish-selection-support">
                {t(
                  favoriteIds.length + favoriteIdeaIds.length
                    ? 'wishSelection.changeLater'
                    : 'wishSelection.noneIsFine',
                )}
              </p>
            </div>
          </fieldset>
        </form>
      ) : null}

      {activeMode === 'view' ? (
        <div
          className={`wish-selection-results${shareConfirmed ? ' eimir-motion-success' : ''}`}
        >
          {paused ? (
            <section
              className="wish-selection-paused"
              aria-labelledby="wish-selection-paused-title"
            >
              <h2 id="wish-selection-paused-title">
                {t('wishSelection.pausedIdeas', { count: pausedIdeas })}
                <ProMark label={t('dateIdeas.pro')} />
              </h2>
              <p>{t('dateIdeas.locked.retained')}</p>
              <Link
                className="button-link secondary-link"
                to={proPaywallPath('dateIdeas')}
              >
                {t('dateIdeas.locked.action')}
              </Link>
              <button
                type="button"
                className="secondary"
                onClick={changeIdeas}
                disabled={busy}
              >
                {t('wishSelection.pausedReplace')}
              </button>
            </section>
          ) : view.resultState === 'NEEDS_IDEAS' ? (
            <button type="button" onClick={changeIdeas} disabled={busy}>
              {t('wishSelection.reviewIdeas')}
            </button>
          ) : (
            <>
              {shown.map((candidate, index) => (
                <section
                  key={candidate.wishId}
                  className={`wish-selection-result ${index === 0 ? 'wish-selection-featured' : ''}`}
                >
                  <p className="wish-selection-support">
                    {t(
                      ownOnly
                        ? 'wishSelection.ownOne'
                        : index === 0
                          ? 'wishSelection.sharedOne'
                          : 'wishSelection.moreShared',
                    )}
                  </p>
                  <h2>{candidate.title}</h2>
                  <p className="wish-selection-source">
                    <DestinationIcon icon="wish" />
                    {t('wishSelection.wishSource')}
                  </p>
                  <button
                    type="button"
                    className={index === 0 ? '' : 'secondary'}
                    disabled={busy}
                    onClick={() => prepare(candidate)}
                  >
                    {t('wishSelection.prepare')}
                  </button>
                </section>
              ))}
              {shownIdeas.map((idea, offset) => {
                const index = shown.length + offset;
                const titleId = `wish-selection-idea-${idea.id}`;
                const lang =
                  idea.contentLocale !== locale
                    ? idea.contentLocale
                    : undefined;
                const savedWishId = savedWishes[idea.id];
                const planDraft = {
                  title: idea.planTitle,
                  description: idea.description,
                };
                return (
                  <section
                    key={idea.id}
                    aria-labelledby={titleId}
                    className={`wish-selection-result is-idea ${index === 0 ? 'wish-selection-featured' : ''}`}
                  >
                    {index === 0 ? (
                      <DateIdeaImage
                        api={dateApi}
                        accountId={accountId}
                        spaceId={spaceId}
                        image={idea.image}
                        lang={lang}
                      />
                    ) : null}
                    <div className="wish-selection-result-body">
                      <p className="wish-selection-support">
                        {t(
                          ownOnly
                            ? 'wishSelection.ownOne'
                            : index === 0
                              ? 'wishSelection.sharedIdea'
                              : 'wishSelection.moreShared',
                        )}
                      </p>
                      <h2 id={titleId} lang={lang}>
                        {idea.title}
                      </h2>
                      <p className="wish-selection-source">
                        <EimirIcon name="sparkle" />
                        {t('wishSelection.ideaSource')}
                      </p>
                      <DateIdeaFacts
                        idea={idea}
                        placeLabel={placeLabels.get(idea.placeType)}
                      />
                      <div className="date-idea-actions">
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
                            // A Wish saved from this idea continues through the
                            // canonical Wish-to-Plan conversion.
                            if (savedWishId)
                              openIdea(idea, wishDetailPath(savedWishId), {
                                planningConvertDraft: planDraft,
                              });
                            else
                              openIdea(idea, PLAN_CREATE_ROUTE, {
                                planningCreateDraft: planDraft,
                              });
                          }}
                        />
                        {savedWishId ? (
                          <Link
                            className="button-link secondary-link date-idea-saved"
                            to={wishDetailPath(savedWishId)}
                            aria-describedby={titleId}
                            onClick={(event) => {
                              if (!plainActivation(event)) return;
                              event.preventDefault();
                              openIdea(idea, wishDetailPath(savedWishId), {});
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
                              openIdea(idea, WISH_CREATE_ROUTE, {
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
                      </div>
                    </div>
                  </section>
                );
              })}
              {shownIdeas.length ? (
                <div className="wish-selection-later">
                  <p className="wish-selection-support">
                    {t('wishSelection.ideaResultNote')}
                  </p>
                  <button
                    type="button"
                    className="tertiary"
                    disabled={busy}
                    onClick={() => lifecycle.requestClose()}
                  >
                    {t('wishSelection.later')}
                  </button>
                </div>
              ) : null}
              {view.resultState === 'CHOOSING' ? (
                <button type="button" disabled={busy} onClick={editOwn}>
                  {t('wishSelection.openOwn')}
                </button>
              ) : null}
              {view.resultState === 'WAITING' && !ownOnly ? (
                <p className="wish-selection-support">
                  {t('wishSelection.noDeadline')}
                </p>
              ) : null}
              {!shownCount && view.resultState === 'READY' && availableCount ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={changeIdeas}
                >
                  {t('wishSelection.changeIdeas')}
                </button>
              ) : null}
              <div className="wish-selection-actions">
                {!ownOnly &&
                ownFavoriteCount > 0 &&
                (view.resultState !== 'READY' || !shownCount) ? (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setOwnOnly(true)}
                  >
                    {t('wishSelection.ownContinue')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="tertiary"
                  disabled={busy}
                  onClick={editOwn}
                >
                  {t('wishSelection.changeOwn')}
                </button>
              </div>
            </>
          )}
          {planned.length ? (
            <section className="wish-selection-planned">
              <h2>{t('wishSelection.alreadyPlanned')}</h2>
              {planned.map((candidate) => (
                <Link
                  key={candidate.wishId}
                  to={planDetailPath(candidate.planId as string)}
                  aria-label={t('wishSelection.openPlanFor', {
                    title: candidate.title,
                  })}
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
                    prepare(candidate);
                  }}
                >
                  <strong>{candidate.title}</strong>
                  <span>{t('wishSelection.openPlan')}</span>
                </Link>
              ))}
            </section>
          ) : null}
          <p className="wish-selection-support wish-selection-retention">
            {t('wishSelection.keepWishes')}
          </p>
          {view.resultState === 'WAITING' && !ownOnly ? (
            <button
              type="button"
              className="tertiary"
              disabled={busy || query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t('wishSelection.refresh')}
            </button>
          ) : null}
          <details className="wish-selection-utilities">
            <summary>{t('wishSelection.moreActions')}</summary>
            <div className="wish-selection-utility-actions eimir-motion-disclosure">
              {view.resultState !== 'WAITING' || ownOnly ? (
                <button
                  type="button"
                  className="tertiary"
                  disabled={busy || query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  {t('wishSelection.refresh')}
                </button>
              ) : null}
              {(shownCount > 0 ||
                view.resultState !== 'READY' ||
                availableCount === 0) &&
              view.resultState !== 'NEEDS_IDEAS' &&
              !paused ? (
                <button
                  type="button"
                  className="tertiary"
                  disabled={busy}
                  onClick={changeIdeas}
                >
                  {t('wishSelection.changeIdeas')}
                </button>
              ) : null}
              <button
                type="button"
                className="tertiary"
                disabled={busy}
                onClick={() => setCloseOpen(true)}
              >
                {t('wishSelection.close')}
              </button>
            </div>
          </details>
        </div>
      ) : null}

      {activeMode === 'plan' && selected ? (
        <form
          className="wish-selection-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!planTitle.trim()) return;
            const form = new FormData(event.currentTarget);
            const schedule = planScheduleFromInputs(
              String(form.get('plannedDate') ?? ''),
              String(form.get('plannedTime') ?? ''),
              String(form.get('plannedEnd') ?? ''),
            );
            clearProblems();
            const current = begin();
            if (current)
              planMutation.mutate({
                current,
                source: selected,
                title: planTitle.trim(),
                description: planDescription,
                schedule,
              });
          }}
        >
          <fieldset
            disabled={busy}
            className="wish-selection-fields"
            onChange={() => setPlanDirty(true)}
          >
            <label className="field-group">
              <span>{t('wishSelection.planTitle')}</span>
              <input
                required
                maxLength={200}
                value={planTitle}
                onChange={(event) => setPlanTitle(event.target.value)}
              />
            </label>
            <PlanScheduleFields idPrefix="wish-selection-plan" includeEnd />
            <label className="field-group">
              <span>{t('wishSelection.planDetails')}</span>
              <textarea
                rows={3}
                value={planDescription}
                onChange={(event) => setPlanDescription(event.target.value)}
              />
            </label>
            <p className="wish-selection-support">
              {t('wishSelection.planSource', { title: selected.title })}
            </p>
            {ownOnly ? (
              <p className="wish-selection-support">
                {t('wishSelection.proposal')}
              </p>
            ) : null}
            <div className="wish-selection-actions">
              <button type="submit" disabled={busy || !planTitle.trim()}>
                {t(busy ? 'wishSelection.saving' : 'wishSelection.savePlan')}
              </button>
              <p className="wish-selection-support">
                {t('m5s3.plan.sharedBody')}
              </p>
            </div>
          </fieldset>
        </form>
      ) : null}
      <ShortTaskSheet
        open={closeOpen}
        title={t('wishSelection.closeTitle')}
        onClose={() => setCloseOpen(false)}
        isCloseBlocked={busy}
        role="alertdialog"
      >
        <p>{t('wishSelection.closeBody')}</p>
        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setCloseOpen(false)}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => {
              const current = begin();
              if (current)
                closeMutation.mutate({ current, token: view.roundToken });
            }}
          >
            {t('wishSelection.closeConfirm')}
          </button>
        </div>
      </ShortTaskSheet>
    </div>
  );
}
