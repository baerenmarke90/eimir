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
import type { WishSelectionDecisionUpdateActionEnum } from '../api/generated/models/WishSelectionDecisionUpdate';
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
import { usePartnerName } from '../client/partnerLocation';
import { usePartnerNickname } from '../client/partnerNickname';
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
import { useEditorHistoryEntry } from '../client/useEditorHistoryEntry';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { withoutHiddenWishes } from '../client/wishConcealment';
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
import { PlanningDiscardConfirmation } from './PlanningEditorLifecycle';
import { PlanScheduleFields } from './PlanScheduleFields';
import { ProblemState } from './ProblemState';
import { ProMark } from './ProMark';
import { ShortTaskSheet } from './ShortTaskSheet';
import { TaskBackButton } from './TaskBackButton';
import { UiState } from './UiState';
import { WishSelectionIdeaPicker } from './WishSelectionIdeaPicker';
import { WishSelectionRandomDecision } from './WishSelectionRandomDecision';
import { type ResultItem, WishSelectionVote } from './WishSelectionVote';
import { WishSelectionWishPicker } from './WishSelectionWishPicker';
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
/** Composing a round (#1907 J1): the hub with two sources, or one source. */
type SetupStep = 'hub' | 'wishes' | 'ideas';
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

function titleInitial(title: string): string {
  const initial = Array.from(title.trim())[0] ?? '#';
  return /\p{L}/u.test(initial)
    ? initial.toLocaleUpperCase(resolvedLocale())
    : '#';
}

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
  const [step, setStep] = useState<SetupStep>('hub');
  const [ideasOpened, setIdeasOpened] = useState(false);
  // Plays the short chance reveal once after this device agreed (#1907 J1).
  const [revealing, setRevealing] = useState(false);
  const partner = usePartnerName({
    apiBaseUrl,
    accessToken: accessToken ?? '',
    accountId,
    spaceId,
    enabled: Boolean(accessToken),
  });
  const { relationshipLabel } = usePartnerNickname();
  const partnerName = partner.name
    ? relationshipLabel(partner.id, partner.name, '')
    : '';
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
  // The plan step is a nested task: system Back returns to the selection like
  // the header control, and asks first when the plan draft has changes.
  const closePlanStep = useEditorHistoryEntry({
    isActive: activeMode === 'plan',
    isDirty: planDirty,
    isCloseBlocked: busy,
    onClose: () => setMode('view'),
    onDiscardRequested: () => setCancelPlan(true),
  });

  useEditorHistoryEntry({
    isActive: activeMode === 'setup' && step !== 'hub',
    isDirty: false,
    isCloseBlocked: busy,
    onClose: () => setStep('hub'),
    onDiscardRequested: () => setStep('hub'),
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new step or mode moves focus to the task start.
  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, [activeMode, step]);

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
          // #2158 H: a wish an open game hides from the reader is no choice.
          ...withoutHiddenWishes(
            wishes.data?.pages.flatMap((page) => page.items) ?? [],
          ),
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
      setStep('hub');
      setOwnOnly(false);
      setShareConfirmed(false);
    },
    onSettled: finish,
  });
  const decisionMutation = useMutation({
    networkMode: 'always',
    gcTime: 0,
    mutationFn: ({
      action,
      item,
      token,
    }: {
      action: WishSelectionDecisionUpdateActionEnum;
      item?: ResultItem;
      token: string;
      current: () => boolean;
    }) =>
      apiCall(() => {
        assertOnlineWrite();
        if (!api) throw new Error('Wish selection API unavailable.');
        return api.decideWishSelection({
          spaceId,
          locale,
          ifMatch: token,
          wishSelectionDecisionUpdate: {
            action,
            wishId: item?.kind === 'wish' ? item.candidate.wishId : undefined,
            dateIdeaId: item?.kind === 'idea' ? item.idea.id : undefined,
          },
        });
      }),
    onSuccess: (saved, vars) => {
      if (!vars.current()) return;
      client.setQueryData(queryKey, saved);
      adopt(saved);
      if (
        vars.action === 'ACCEPT_RANDOM' ||
        (vars.action === 'REQUEST_RANDOM' &&
          saved.decision?.method === 'RANDOM')
      ) {
        const reduced =
          typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!reduced) {
          setRevealing(true);
          window.setTimeout(() => setRevealing(false), 1200);
        }
      }
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
      // Release the plan step's entry before the task's own entry.
      closePlanStep(() =>
        lifecycle.closeConfirmed(() => {
          void navigate(planDetailPath(saved.plan.id), {
            replace: true,
            state: { taskOriginKey, planningCreated: true },
          });
        }),
      );
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
    decisionMutation.error ??
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
    decisionMutation.reset();
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
    setStep('hub');
    setMode('setup');
  }
  function decide(
    action: WishSelectionDecisionUpdateActionEnum,
    item?: ResultItem,
  ) {
    if (!view?.selectionToken || busy) return;
    clearProblems();
    const current = begin();
    if (current)
      decisionMutation.mutate({
        current,
        action,
        item,
        token: view.selectionToken,
      });
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
  const shownIdeaIds = ownOnly
    ? ownIdeaSelectionIds(view)
    : view.commonDateIdeaIds;
  const shownItems: ResultItem[] = [
    ...available
      .filter((candidate) => shownIds.includes(candidate.wishId))
      .map((candidate) => ({
        kind: 'wish' as const,
        key: `wish:${candidate.wishId}`,
        candidate,
      })),
    ...availableIdeas
      .filter((idea) => shownIdeaIds.includes(idea.id))
      .map((idea) => ({ kind: 'idea' as const, key: `idea:${idea.id}`, idea })),
  ];
  const shownCount = shownItems.length;
  const availableCount = available.length + availableIdeas.length;
  const ownFavoriteCount =
    ownSelectionIds(view).filter((id) =>
      available.some((candidate) => candidate.wishId === id),
    ).length + ownIdeaSelectionIds(view).length;
  const savedWishes = savedDateIdeaWishes(client, accountId, spaceId);
  // A revealed round is decided once for both devices (#1907 J1): a tap among
  // several common favourites, or chance after both partners agreed.
  const revealed = !ownOnly && view.resultState === 'READY';
  const severalShared = revealed && shownCount >= 2;
  const allItems: ResultItem[] = [
    ...available.map((candidate) => ({
      kind: 'wish' as const,
      key: `wish:${candidate.wishId}`,
      candidate,
    })),
    ...availableIdeas.map((idea) => ({
      kind: 'idea' as const,
      key: `idea:${idea.id}`,
      idea,
    })),
  ];
  const decision = revealed ? view.decision : null;
  const chosen = decision
    ? (allItems.find((item) =>
        item.kind === 'wish'
          ? item.candidate.wishId === decision.wishId
          : item.idea.id === decision.dateIdeaId,
      ) ?? null)
    : null;
  const randomRequest = revealed ? view.randomRequest : null;
  const partnerLabel =
    partnerName || t('m5s5.today.relationshipSignal.partnerFallback');
  const ideasLang = (idea: DateIdea) =>
    idea.contentLocale !== locale ? idea.contentLocale : undefined;
  const itemTitle = (item: ResultItem) =>
    item.kind === 'wish' ? item.candidate.title : item.idea.title;

  const title =
    activeMode === 'setup'
      ? t(
          step === 'wishes'
            ? 'wishSelection.sourceWishesTitle'
            : step === 'ideas'
              ? 'wishSelection.ideasTitle'
              : 'wishSelection.setupTitle',
        )
      : activeMode === 'vote'
        ? t('wishSelection.chooseTitle')
        : activeMode === 'plan'
          ? t('wishSelection.prepareTitle')
          : paused
            ? t('wishSelection.pausedTitle')
            : view.resultState === 'NEEDS_IDEAS'
              ? t('wishSelection.changedTitle')
              : ownOnly
                ? t('wishSelection.ownTitle')
                : availableCount === 0 && planned.length
                  ? t('wishSelection.allPlannedTitle')
                  : view.resultState === 'CHOOSING'
                    ? t('wishSelection.chooseTitle')
                    : view.resultState === 'WAITING'
                      ? t('wishSelection.waitingTitle')
                      : chosen && !revealing
                        ? t('wishSelection.chosenTitle')
                        : severalShared
                          ? t('wishSelection.sharedManyTitle', {
                              amount: shownCount,
                            })
                          : shownCount
                            ? t('wishSelection.sharedTitle')
                            : t('wishSelection.noMatchTitle');
  const chooseIntro = partnerName
    ? t('wishSelection.chooseIntro', { name: partnerName })
    : t('wishSelection.chooseIntroUnnamed');
  const intro =
    activeMode === 'setup'
      ? null
      : activeMode === 'vote'
        ? chooseIntro
        : activeMode === 'plan'
          ? t('wishSelection.prepareIntro')
          : paused
            ? t('wishSelection.pausedBody')
            : view.resultState === 'NEEDS_IDEAS'
              ? t('wishSelection.changedBody')
              : ownOnly
                ? t('wishSelection.ownBody')
                : availableCount === 0 && planned.length
                  ? t('wishSelection.allPlannedBody')
                  : view.resultState === 'CHOOSING'
                    ? chooseIntro
                    : view.resultState === 'WAITING'
                      ? partnerName
                        ? t('wishSelection.waitingBody', { name: partnerName })
                        : t('wishSelection.waitingBodyUnnamed')
                      : chosen
                        ? null
                        : severalShared
                          ? t('wishSelection.sharedManyIntro')
                          : !shownCount
                            ? t('wishSelection.noMatchBody')
                            : null;

  function goBack() {
    if (activeMode === 'plan') {
      if (planDirty) setCancelPlan(true);
      else setMode('view');
    } else if (activeMode === 'setup' && step !== 'hub') setStep('hub');
    else lifecycle.requestClose();
  }

  function candidateMedia(item: ResultItem) {
    return item.kind === 'idea' ? (
      <span className="wish-selection-row-media">
        <DateIdeaImage
          api={dateApi}
          accountId={accountId}
          spaceId={spaceId}
          image={item.idea.image}
          decorative
        />
      </span>
    ) : (
      <span className="wish-selection-row-initial" aria-hidden="true">
        {titleInitial(item.candidate.title)}
      </span>
    );
  }

  /** The existing result card: Plan for a Wish, Plan/remember for an idea. */
  function resultCard(item: ResultItem, label: string, featured: boolean) {
    if (item.kind === 'wish') {
      const { candidate } = item;
      return (
        <section
          key={item.key}
          className={`wish-selection-result ${featured ? 'wish-selection-featured' : ''}`}
        >
          <p className="wish-selection-support">{label}</p>
          <h2>{candidate.title}</h2>
          <p className="wish-selection-source">
            <DestinationIcon icon="wish" />
            {t('wishSelection.wishSource')}
          </p>
          <button
            type="button"
            className={featured ? '' : 'secondary'}
            disabled={busy}
            onClick={() => prepare(candidate)}
          >
            {t('wishSelection.prepare')}
          </button>
        </section>
      );
    }
    const { idea } = item;
    const titleId = `wish-selection-idea-${idea.id}`;
    const lang = ideasLang(idea);
    const savedWishId = savedWishes[idea.id];
    const planDraft = {
      title: idea.planTitle,
      description: idea.description,
    };
    return (
      <section
        key={item.key}
        aria-labelledby={titleId}
        className={`wish-selection-result is-idea ${featured ? 'wish-selection-featured' : ''}`}
      >
        {featured ? (
          <DateIdeaImage
            api={dateApi}
            accountId={accountId}
            spaceId={spaceId}
            image={idea.image}
            lang={lang}
          />
        ) : null}
        <div className="wish-selection-result-body">
          <p className="wish-selection-support">{label}</p>
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
              to={savedWishId ? wishDetailPath(savedWishId) : PLAN_CREATE_ROUTE}
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
  }

  const pickBar = (
    <div className="wish-selection-pick-bar">
      <p role="status">
        {t('wishSelection.selected', { count: totalSelected })}
      </p>
      <button type="button" onClick={() => setStep('hub')}>
        {t('wishSelection.pickDone')}
      </button>
    </div>
  );

  return (
    <div className="page wish-selection-task">
      <header className="page-heading wish-selection-heading">
        <TaskBackButton inline type="button" disabled={busy} onClick={goBack}>
          {t(
            activeMode === 'plan'
              ? 'wishSelection.toSelection'
              : 'taskBoundary.back',
          )}
        </TaskBackButton>
        <div>
          {view.title && activeMode !== 'setup' ? (
            <p className="eyebrow">{view.title}</p>
          ) : null}
          <h1>{title}</h1>
        </div>
      </header>
      {intro ? <p className="wish-selection-intro">{intro}</p> : null}
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
            if (
              step !== 'hub' ||
              totalSelected < 2 ||
              totalSelected > MAX_CANDIDATES ||
              stale
            )
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
            {step === 'hub' ? (
              <>
                {totalSelected === 0 ? (
                  <ol
                    className="wish-selection-steps"
                    aria-label={t('wishSelection.stepsLabel')}
                  >
                    <li>
                      <strong>{t('wishSelection.stepCollect')}</strong>
                      <span>{t('wishSelection.stepCollectBody')}</span>
                    </li>
                    <li>
                      <strong>{t('wishSelection.stepFavorites')}</strong>
                      <span>
                        {partnerName
                          ? t('wishSelection.stepFavoritesBody', {
                              name: partnerName,
                            })
                          : t('wishSelection.stepFavoritesBodyUnnamed')}
                      </span>
                    </li>
                    <li>
                      <strong>{t('wishSelection.stepResult')}</strong>
                      <span>{t('wishSelection.stepResultBody')}</span>
                    </li>
                  </ol>
                ) : (
                  <section
                    className="wish-selection-tray"
                    aria-labelledby="wish-selection-tray-count"
                  >
                    <p
                      id="wish-selection-tray-count"
                      className="wish-selection-support"
                      role="status"
                    >
                      {totalSelected === 1
                        ? t('wishSelection.needOneMore')
                        : t('wishSelection.selected', {
                            count: totalSelected,
                          })}
                    </p>
                    <ul>
                      {candidateIds.map((id) => {
                        const wishTitle =
                          wishItems.find((wish) => wish.id === id)?.title ?? '';
                        return (
                          <li key={id}>
                            <EimirIcon
                              name="wuensche"
                              className="wish-selection-tray-source"
                            />
                            <span>{wishTitle}</span>
                            <button
                              type="button"
                              className="tertiary wish-selection-tray-remove"
                              aria-label={t('wishSelection.removeCandidate', {
                                title: wishTitle,
                              })}
                              onClick={() =>
                                setCandidateIds((current) =>
                                  toggle(current, id),
                                )
                              }
                            >
                              <EimirIcon name="close" />
                            </button>
                          </li>
                        );
                      })}
                      {ideaIds.map((id) => {
                        const idea = ideaById.get(id);
                        const ideaTitle =
                          idea?.title ?? t('wishSelection.ideaSource');
                        return (
                          <li key={id}>
                            <EimirIcon
                              name="sparkle"
                              className="wish-selection-tray-source is-idea"
                            />
                            <span lang={idea ? ideasLang(idea) : undefined}>
                              {ideaTitle}
                            </span>
                            <button
                              type="button"
                              className="tertiary wish-selection-tray-remove"
                              aria-label={t('wishSelection.removeCandidate', {
                                title: ideaTitle,
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
                  </section>
                )}
                <ul
                  className="wish-selection-sources"
                  aria-label={t('wishSelection.sourcesLabel')}
                >
                  <li>
                    <button
                      type="button"
                      className="wish-selection-source-card"
                      onClick={() => setStep('wishes')}
                    >
                      <EimirIcon
                        name="gemeinsam"
                        className="wish-selection-source-icon"
                      />
                      <span className="wish-selection-source-text">
                        <strong>{t('wishSelection.sourceWishesTitle')}</strong>
                        <span>
                          {wishes.isLoading
                            ? t('states.loading.title')
                            : wishItems.length
                              ? t('wishSelection.sourceWishesBody', {
                                  count: wishItems.length,
                                })
                              : t('wishSelection.sourceWishesNone')}
                        </span>
                      </span>
                      {candidateIds.length ? (
                        <span className="wish-selection-source-count">
                          {t('wishSelection.sourceCount', {
                            count: candidateIds.length,
                          })}
                        </span>
                      ) : (
                        <EimirIcon
                          name="chevron-right"
                          className="wish-selection-source-chevron"
                        />
                      )}
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="wish-selection-source-card is-ideas"
                      onClick={() => {
                        setIdeasOpened(true);
                        setStep('ideas');
                      }}
                    >
                      <EimirIcon
                        name="sparkle"
                        className="wish-selection-source-icon"
                      />
                      <span className="wish-selection-source-text">
                        <strong>
                          {t('wishSelection.sourceIdeasTitle')}
                          <ProMark label={t('dateIdeas.pro')} />
                        </strong>
                        <span>{t('wishSelection.sourceIdeasBody')}</span>
                      </span>
                      {ideaIds.length ? (
                        <span className="wish-selection-source-count">
                          {t('wishSelection.sourceCount', {
                            count: ideaIds.length,
                          })}
                        </span>
                      ) : (
                        <EimirIcon
                          name="chevron-right"
                          className="wish-selection-source-chevron"
                        />
                      )}
                    </button>
                  </li>
                </ul>
                {totalSelected > 0 || occasion ? (
                  <label className="field-group">
                    <span>{t('wishSelection.occasion')}</span>
                    <input
                      value={occasion}
                      maxLength={60}
                      onChange={(event) => setOccasion(event.target.value)}
                      placeholder={t('wishSelection.occasionPlaceholder')}
                    />
                  </label>
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
                  {view.id ? (
                    <p className="wish-selection-support">
                      {t('wishSelection.replaceNotice')}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
            {step === 'wishes' ? (
              <div className="wish-selection-source-panel">
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
                <WishSelectionWishPicker
                  wishItems={wishItems}
                  candidateIds={candidateIds}
                  full={totalSelected >= MAX_CANDIDATES}
                  onToggle={(id) =>
                    setCandidateIds((current) => toggle(current, id))
                  }
                />
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
                {pickBar}
              </div>
            ) : null}
            {ideasOpened ? (
              <div
                className="wish-selection-source-panel"
                hidden={step !== 'ideas'}
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
                {ideasAllowed ? pickBar : null}
              </div>
            ) : null}
          </fieldset>
        </form>
      ) : null}

      {activeMode === 'vote' ? (
        <WishSelectionVote
          available={available}
          availableIdeas={availableIdeas}
          busy={busy}
          favoriteIds={favoriteIds}
          favoriteIdeaIds={favoriteIdeaIds}
          canPublish={Boolean(
            base?.token && !stale && view.resultState !== 'NEEDS_IDEAS',
          )}
          onPublish={() => {
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
          onToggleWish={(id) =>
            setFavoriteIds((current) => toggle(current, id))
          }
          onToggleIdea={(id) =>
            setFavoriteIdeaIds((current) => toggle(current, id))
          }
          candidateMedia={candidateMedia}
          ideasLang={ideasLang}
        />
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
              {revealing ? (
                <div className="wish-selection-rolling" role="status">
                  <EimirIcon
                    name="sparkle"
                    className="wish-selection-rolling-icon eimir-motion-loading-roll"
                  />
                  <strong>{t('wishSelection.randomRolling')}</strong>
                </div>
              ) : null}
              {severalShared && !chosen && !revealing ? (
                <ul className="wish-selection-matches">
                  {shownItems.map((item) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        className="wish-selection-match"
                        disabled={busy}
                        onClick={() => decide('CHOOSE', item)}
                      >
                        {candidateMedia(item)}
                        <span
                          className="wish-selection-favorite-title"
                          lang={
                            item.kind === 'idea'
                              ? ideasLang(item.idea)
                              : undefined
                          }
                        >
                          {itemTitle(item)}
                        </span>
                        <EimirIcon
                          name="chevron-right"
                          className="wish-selection-match-chevron"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {chosen && !revealing ? (
                <div className="wish-selection-chosen eimir-motion-success">
                  {resultCard(
                    chosen,
                    t(
                      decision?.method === 'RANDOM'
                        ? 'wishSelection.chosenRandomLabel'
                        : 'wishSelection.chosenLabel',
                    ),
                    true,
                  )}
                  <button
                    type="button"
                    className="tertiary wish-selection-unchoose"
                    disabled={busy}
                    onClick={() => decide('CLEAR')}
                  >
                    {t('wishSelection.unchoose')}
                  </button>
                  {shownItems.some((item) => item.key !== chosen.key) ? (
                    <section
                      className="wish-selection-also"
                      aria-labelledby="wish-selection-also-title"
                    >
                      <h2 id="wish-selection-also-title">
                        {t('wishSelection.alsoShared')}
                      </h2>
                      <ul>
                        {shownItems
                          .filter((item) => item.key !== chosen.key)
                          .map((item) => (
                            <li key={item.key}>
                              {candidateMedia(item)}
                              <span
                                lang={
                                  item.kind === 'idea'
                                    ? ideasLang(item.idea)
                                    : undefined
                                }
                              >
                                {itemTitle(item)}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              ) : null}
              {!chosen && !revealing && revealed && view.randomPool ? (
                <WishSelectionRandomDecision
                  randomPool={view.randomPool}
                  randomRequest={randomRequest}
                  partnerLabel={partnerLabel}
                  busy={busy}
                  decide={decide}
                  editOwn={editOwn}
                />
              ) : null}
              {!severalShared && !chosen
                ? shownItems.map((item, index) =>
                    resultCard(
                      item,
                      t(
                        ownOnly
                          ? index === 0
                            ? 'wishSelection.ownOne'
                            : 'wishSelection.ownMore'
                          : item.kind === 'idea'
                            ? 'wishSelection.sharedIdea'
                            : 'wishSelection.sharedOne',
                      ),
                      index === 0,
                    ),
                  )
                : null}
              {(
                chosen
                  ? chosen.kind === 'idea'
                  : !severalShared &&
                    shownItems.some((item) => item.kind === 'idea')
              ) ? (
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
              {!shownCount &&
              !chosen &&
              view.resultState === 'READY' &&
              availableCount &&
              !(randomRequest && !randomRequest.declined) ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={changeIdeas}
                >
                  {t('wishSelection.newRound')}
                </button>
              ) : null}
              <div className="wish-selection-actions">
                {!ownOnly &&
                ownFavoriteCount > 0 &&
                !chosen &&
                !(randomRequest && !randomRequest.declined) &&
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
                    if (!plainActivation(event)) return;
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
