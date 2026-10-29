import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ChapterContentItem } from '../api/generated/models/ChapterContentItem';
import type { StoryItem } from '../api/generated/models/StoryItem';
import { useApiRuntime } from '../client/apiRuntimeContext';
import { assertOnlineWrite } from '../client/connectivity';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { createReferenceApis } from '../client/referenceFlow';
import { postSnackbar } from '../client/snackbar';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { normalizeClientError } from '../client/problemDetails';
import {
  heartMomentDetailPath,
  memoryDetailPath,
  milestoneDetailPath,
} from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import {
  storyRelationTarget,
  type PlanningRelationKind,
  type PlanningRelationTarget,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { i18n, useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import { EimirIcon } from './EimirIcon';
import { ShortTaskSheet } from './ShortTaskSheet';
import { RelationMomentPreview } from './RelationMomentPreview';
import './PlanningRelationManager.css';

const STORY_PAGE_SIZE = 50;

type RelationTargetPage = {
  items: StoryItem[];
  nextCursor: string | null;
};

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

function targetKey(kind: PlanningRelationKind, id: string): string {
  return `${kind}:${id}`;
}

async function loadRelationTargetPage(
  apis: SharedPlanningApis,
  spaceId: string,
  cursor: string | null,
  kind: PlanningRelationKind | null,
  signal: AbortSignal,
): Promise<RelationTargetPage> {
  return apiCall(() =>
    apis.story.getStoryTimeline(
      {
        spaceId,
        cursor,
        limit: STORY_PAGE_SIZE,
        order: 'DESC',
        ...(kind ? { type: [kind] } : {}),
      },
      { signal },
    ),
  );
}

export function nextRelationTargetCursor(
  lastPage: { nextCursor: string | null; items?: unknown[] },
  _allPages: { nextCursor: string | null; items?: unknown[] }[],
  lastPageParam: string | null,
  allPageParams: Array<string | null>,
): string | undefined {
  const nextCursor = lastPage.nextCursor;
  if (!nextCursor) return undefined;
  if (nextCursor === lastPageParam || allPageParams.includes(nextCursor)) {
    return undefined;
  }
  return nextCursor;
}

async function loadLinkedRelationTargets(
  apis: SharedPlanningApis,
  spaceId: string,
  relations: ChapterContentItem[],
): Promise<PlanningRelationTarget[]> {
  const targets = await Promise.all(
    relations.map(async (relation): Promise<PlanningRelationTarget | null> => {
      try {
        switch (relation.targetType) {
          case 'MEMORY': {
            const memory = await apis.memories.getMemory({
              spaceId,
              memoryId: relation.targetId,
            });
            return {
              id: memory.id,
              kind: 'MEMORY',
              label: memory.title,
              effectiveDate: memory.happenedOn ?? memory.createdAt,
              attachment: memory.attachments?.find(
                (attachment) =>
                  attachment.mediaType === 'IMAGE' &&
                  attachment.status === 'READY',
              ),
            };
          }
          case 'HEART_MOMENT': {
            const heartMoment = await apis.heartMoments.getHeartMoment({
              spaceId,
              heartMomentId: relation.targetId,
            });
            if (heartMoment.visibility !== 'SHARED') return null;
            return {
              id: heartMoment.id,
              kind: 'HEART_MOMENT',
              label: heartMoment.text || i18n.t('heartMomentProduct.untitled'),
              effectiveDate: heartMoment.happenedOn,
              attachment:
                heartMoment.attachment?.mediaType === 'IMAGE' &&
                heartMoment.attachment.status === 'READY'
                  ? heartMoment.attachment
                  : undefined,
            };
          }
          case 'MILESTONE': {
            const milestone = await apis.milestones.getMilestone({
              spaceId,
              milestoneId: relation.targetId,
            });
            return {
              id: milestone.id,
              kind: 'MILESTONE',
              label: milestone.title,
              effectiveDate: milestone.happenedOn,
            };
          }
        }
      } catch {
        // Detail APIs enforce authorization. An unreadable target stays an
        // opaque relation row and is never reconstructed client-side.
        return null;
      }
    }),
  );
  return targets.filter(
    (target): target is PlanningRelationTarget => target !== null,
  );
}

async function loadPlaceRelations(
  apis: SharedPlanningApis,
  spaceId: string,
  placeId: string,
): Promise<ChapterContentItem[]> {
  const [memories, heartMoments, milestones] = await Promise.all([
    apiCall(() => apis.placeRelations.listPlaceMemories({ spaceId, placeId })),
    apiCall(() =>
      apis.placeRelations.listPlaceHeartMoments({ spaceId, placeId }),
    ),
    apiCall(() =>
      apis.placeRelations.listPlaceMilestones({ spaceId, placeId }),
    ),
  ]);

  return [
    ...memories.items.map((targetId) => ({
      targetId,
      targetType: 'MEMORY' as const,
    })),
    ...heartMoments.items.map((targetId) => ({
      targetId,
      targetType: 'HEART_MOMENT' as const,
    })),
    ...milestones.items.map((targetId) => ({
      targetId,
      targetType: 'MILESTONE' as const,
    })),
  ];
}

function relationTargetPath(target: PlanningRelationTarget): string {
  switch (target.kind) {
    case 'MEMORY':
      return memoryDetailPath(target.id);
    case 'HEART_MOMENT':
      return heartMomentDetailPath(target.id);
    case 'MILESTONE':
      return milestoneDetailPath(target.id);
  }
}

type PlanningRelationManagerProps = {
  apis: SharedPlanningApis;
  spaceId: string;
  ownerKind: 'place' | 'chapter';
  ownerId: string;
  canManage: boolean;
  ownerName?: string;
};

export function PlanningRelationManager(props: PlanningRelationManagerProps) {
  return (
    <ScopedPlanningRelationManager
      key={`${props.spaceId}:${props.ownerKind}:${props.ownerId}`}
      {...props}
    />
  );
}

function ScopedPlanningRelationManager({
  apis,
  spaceId,
  ownerKind,
  ownerId,
  canManage,
  ownerName,
}: PlanningRelationManagerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const queryClient = useQueryClient();
  const runtime = useApiRuntime();
  const mediaApis = useMemo(
    () =>
      runtime
        ? createReferenceApis(runtime.apiBaseUrl, runtime.accessToken)
        : null,
    [runtime],
  );
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [isSaving, setIsSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState<PlanningRelationKind | null>(null);
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<Map<string, PlanningRelationTarget>>(
    new Map(),
  );
  const [recentlyLinked, setRecentlyLinked] = useState<
    Map<string, PlanningRelationTarget>
  >(new Map());
  const [discardOpen, setDiscardOpen] = useState(false);
  const keepChoosingRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (discardOpen) keepChoosingRef.current?.focus({ preventScroll: true });
  }, [discardOpen]);
  const selectionFocus = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const relationKey = [
    'm5-s3',
    'relations',
    ownerKind,
    spaceId,
    ownerId,
  ] as const;

  const targetsQuery = useInfiniteQuery({
    queryKey: [...authorSummaryQueryKeys.relationTargets(spaceId), filter],
    queryFn: ({ pageParam, signal }) =>
      loadRelationTargetPage(apis, spaceId, pageParam, filter, signal),
    initialPageParam: null as string | null,
    getNextPageParam: nextRelationTargetCursor,
    staleTime: 60_000,
    retry: false,
    enabled: canManage && pickerOpen && !searchTerm,
  });
  const searchQuery = useInfiniteQuery({
    queryKey: [
      ...authorSummaryQueryKeys.relationTargets(spaceId),
      'search',
      filter,
      searchTerm,
    ],
    queryFn: ({ pageParam, signal }) =>
      apiCall(() => {
        if (!apis.search) throw new Error('Search API is unavailable.');
        return apis.search.searchSpaceContent(
          {
            spaceId,
            q: searchTerm,
            type: filter ? [filter] : ['MEMORY', 'HEART_MOMENT', 'MILESTONE'],
            cursor: pageParam,
            limit: STORY_PAGE_SIZE,
          },
          { signal },
        );
      }),
    initialPageParam: null as string | null,
    getNextPageParam: nextRelationTargetCursor,
    staleTime: 60_000,
    retry: false,
    enabled:
      canManage && pickerOpen && Boolean(searchTerm) && Boolean(apis.search),
  });

  const relationsQuery = useQuery({
    queryKey: relationKey,
    queryFn: () =>
      ownerKind === 'chapter'
        ? apiCall(() =>
            apis.chapterRelations.listChapterContent({
              spaceId,
              chapterId: ownerId,
            }),
          ).then((content) => content.items)
        : loadPlaceRelations(apis, spaceId, ownerId),
    retry: false,
  });

  const linkedTargetSignature = (relationsQuery.data ?? [])
    .map((relation) => targetKey(relation.targetType, relation.targetId))
    .sort()
    .join('|');
  const linkedTargetsQuery = useQuery({
    queryKey: [...relationKey, 'targets', linkedTargetSignature],
    queryFn: () =>
      loadLinkedRelationTargets(apis, spaceId, relationsQuery.data ?? []),
    enabled: relationsQuery.isSuccess && linkedTargetSignature.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  const linkMutation = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async ({
      kind,
      targetId,
    }: {
      kind: PlanningRelationKind;
      targetId: string;
    }) => {
      assertOnlineWrite();
      if (ownerKind === 'chapter') {
        switch (kind) {
          case 'MEMORY':
            return apiCall(() =>
              apis.chapterRelations.linkChapterMemory({
                spaceId,
                chapterId: ownerId,
                targetId,
              }),
            );
          case 'HEART_MOMENT':
            return apiCall(() =>
              apis.chapterRelations.linkChapterHeartMoment({
                spaceId,
                chapterId: ownerId,
                targetId,
              }),
            );
          case 'MILESTONE':
            return apiCall(() =>
              apis.chapterRelations.linkChapterMilestone({
                spaceId,
                chapterId: ownerId,
                targetId,
              }),
            );
        }
      }

      switch (kind) {
        case 'MEMORY':
          return apiCall(() =>
            apis.placeRelations.linkPlaceMemory({
              spaceId,
              placeId: ownerId,
              targetId,
            }),
          );
        case 'HEART_MOMENT':
          return apiCall(() =>
            apis.placeRelations.linkPlaceHeartMoment({
              spaceId,
              placeId: ownerId,
              targetId,
            }),
          );
        case 'MILESTONE':
          return apiCall(() =>
            apis.placeRelations.linkPlaceMilestone({
              spaceId,
              placeId: ownerId,
              targetId,
            }),
          );
      }
    },
  });

  const unlinkMutation = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async ({
      kind,
      targetId,
    }: {
      kind: PlanningRelationKind;
      targetId: string;
    }) => {
      assertOnlineWrite();
      if (ownerKind === 'chapter') {
        switch (kind) {
          case 'MEMORY':
            return apiCall(() =>
              apis.chapterRelations.unlinkChapterMemory({
                spaceId,
                chapterId: ownerId,
                targetId,
              }),
            );
          case 'HEART_MOMENT':
            return apiCall(() =>
              apis.chapterRelations.unlinkChapterHeartMoment({
                spaceId,
                chapterId: ownerId,
                targetId,
              }),
            );
          case 'MILESTONE':
            return apiCall(() =>
              apis.chapterRelations.unlinkChapterMilestone({
                spaceId,
                chapterId: ownerId,
                targetId,
              }),
            );
        }
      }

      switch (kind) {
        case 'MEMORY':
          return apiCall(() =>
            apis.placeRelations.unlinkPlaceMemory({
              spaceId,
              placeId: ownerId,
              targetId,
            }),
          );
        case 'HEART_MOMENT':
          return apiCall(() =>
            apis.placeRelations.unlinkPlaceHeartMoment({
              spaceId,
              placeId: ownerId,
              targetId,
            }),
          );
        case 'MILESTONE':
          return apiCall(() =>
            apis.placeRelations.unlinkPlaceMilestone({
              spaceId,
              placeId: ownerId,
              targetId,
            }),
          );
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: relationKey }),
  });

  const loadedTargets = useMemo(() => {
    const byKey = new Map<string, PlanningRelationTarget>();
    for (const page of targetsQuery.data?.pages ?? []) {
      for (const item of page.items) {
        if (
          item.kind === 'HEART_MOMENT' &&
          item.heartMoment.visibility !== 'SHARED'
        )
          continue;
        const target = storyRelationTarget(item);
        byKey.set(targetKey(target.kind, target.id), target);
      }
    }
    return [...byKey.values()];
  }, [targetsQuery.data?.pages]);
  const targetMap = new Map(
    (linkedTargetsQuery.isSuccess
      ? linkedTargetsQuery.data
      : [...recentlyLinked.values()]
    ).map((target) => [targetKey(target.kind, target.id), target]),
  );
  const linkedKeys = new Set(
    (relationsQuery.data ?? []).map((relation) =>
      targetKey(relation.targetType, relation.targetId),
    ),
  );
  const searchTargets: PlanningRelationTarget[] = (
    searchQuery.data?.pages ?? []
  ).flatMap((page) =>
    page.items.flatMap((item) => {
      if (
        item.scope !== 'SHARED' ||
        !['MEMORY', 'HEART_MOMENT', 'MILESTONE'].includes(item.type)
      )
        return [];
      return [
        {
          id: item.id,
          kind: item.type as PlanningRelationKind,
          label:
            item.title || item.excerpt || t('m5s3.relations.contentFallback'),
          excerpt: item.title ? (item.excerpt ?? undefined) : undefined,
          effectiveDate: item.occurredOn ?? new Date(0),
        },
      ];
    }),
  );
  const availableTargets = [
    ...new Map(
      (searchTerm ? searchTargets : loadedTargets)
        .filter((target) => !linkedKeys.has(targetKey(target.kind, target.id)))
        .map((target) => [targetKey(target.kind, target.id), target]),
    ).values(),
  ];
  const activeQuery = searchTerm ? searchQuery : targetsQuery;
  const searchPending = search.trim() !== searchTerm;

  function closePicker() {
    setPickerOpen(false);
    setSelected(new Map());
    setDiscardOpen(false);
  }

  async function addSelected() {
    if (inFlight.current || !selected.size) return;
    const admitted = captureAuthorizedQuery(queryClient, relationKey);
    if (!admitted()) return;
    inFlight.current = true;
    setIsSaving(true);
    let saved = 0;
    try {
      for (const [key, target] of selected) {
        if (!mounted.current || !admitted()) return;
        if (!linkedKeys.has(key)) {
          await linkMutation.mutateAsync({
            kind: target.kind,
            targetId: target.id,
          });
          if (!mounted.current || !admitted()) return;
          queryClient.setQueryData<ChapterContentItem[]>(
            relationKey,
            (current = []) =>
              current.some(
                (item) => targetKey(item.targetType, item.targetId) === key,
              )
                ? current
                : [
                    ...current,
                    { targetType: target.kind, targetId: target.id },
                  ],
          );
          setRecentlyLinked((current) => new Map(current).set(key, target));
          saved += 1;
        }
        setSelected((current) => {
          const next = new Map(current);
          next.delete(key);
          return next;
        });
      }
      if (mounted.current && admitted()) closePicker();
    } catch {
      // The mutation owns its inline error; retain only unsaved selections.
    } finally {
      inFlight.current = false;
      if (mounted.current) setIsSaving(false);
      if (mounted.current && admitted() && saved) {
        void queryClient.invalidateQueries({ queryKey: relationKey });
        void queryClient.invalidateQueries({
          queryKey: authorSummaryQueryKeys.places(spaceId),
        });
        postSnackbar('m5s3.relations.added', { count: saved });
      }
    }
  }

  function openTarget(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const taskOriginKey = captureOrigin();
    if (!taskOriginKey) return;
    event.preventDefault();
    void navigate(path, { state: { taskOriginKey } });
  }

  return (
    <section
      className="planning-subsection"
      aria-labelledby={`${ownerKind}-relations-heading`}
    >
      <div className="layout-section-head">
        <div>
          <h2 id={`${ownerKind}-relations-heading`}>
            {t(
              ownerKind === 'place'
                ? 'm5s3.relations.headingPlace'
                : 'm5s3.relations.headingChapter',
            )}
          </h2>
          <p>{t('m5s3.relations.intro')}</p>
        </div>
      </div>

      {relationsQuery.isLoading ? (
        <UiState kind="loading" title={t('m5s3.relations.loading')} />
      ) : null}
      {relationsQuery.error ? (
        <ProblemState
          error={relationsQuery.error}
          onRetry={() => void relationsQuery.refetch()}
        />
      ) : null}

      {relationsQuery.data && relationsQuery.data.length > 0 ? (
        <ul className="planning-relation-list">
          {relationsQuery.data.map((relation) => {
            const target = targetMap.get(
              targetKey(relation.targetType, relation.targetId),
            );
            const path = target ? relationTargetPath(target) : null;
            return (
              <li key={targetKey(relation.targetType, relation.targetId)}>
                {target && path ? (
                  <Link
                    className="planning-relation-target relation-moment-link"
                    to={path}
                    onClick={(event) => openTarget(event, path)}
                  >
                    <RelationMomentPreview
                      target={target}
                      spaceId={spaceId}
                      mediaApis={mediaApis}
                    />
                  </Link>
                ) : (
                  <div className="planning-relation-target-copy">
                    <strong>{t('m5s3.relations.contentFallback')}</strong>
                    <span className="planning-meta">
                      {t(`m5s3.relations.kind.${relation.targetType}`)}
                    </span>
                  </div>
                )}
                {canManage ? (
                  <button
                    type="button"
                    className="tertiary"
                    onClick={() =>
                      unlinkMutation.mutate({
                        kind: relation.targetType,
                        targetId: relation.targetId,
                      })
                    }
                    disabled={unlinkMutation.isPending}
                  >
                    {t(
                      ownerKind === 'place'
                        ? 'm5s3.relations.unlinkPlace'
                        : 'm5s3.relations.unlink',
                    )}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : relationsQuery.data ? (
        <p className="planning-empty">{t('m5s3.relations.empty')}</p>
      ) : null}

      {canManage && relationsQuery.isSuccess ? (
        <button
          ref={trigger}
          type="button"
          className="secondary relation-moment-add"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => {
            linkMutation.reset();
            setPickerOpen(true);
          }}
        >
          <EimirIcon name="hinzufuegen" />
          {t('m5s3.relations.addLabel')}
        </button>
      ) : null}
      <ShortTaskSheet
        open={pickerOpen && canManage}
        title={t('m5s3.relations.addLabel')}
        className="relation-moment-sheet"
        restoreFocusRef={trigger}
        onClose={closePicker}
        isDirty={selected.size > 0}
        isCloseBlocked={isSaving || inFlight.current}
        onDiscardRequested={() => setDiscardOpen(true)}
        footer={
          <button
            type="button"
            ref={selectionFocus}
            disabled={!selected.size || isSaving || inFlight.current}
            onClick={() => void addSelected()}
          >
            {isSaving
              ? t('m5s3.common.saving')
              : selected.size
                ? t('m5s3.relations.addSelected', { count: selected.size })
                : t('m5s3.relations.chooseMoments')}
          </button>
        }
      >
        {ownerName ? (
          <p className="relation-moment-context">{ownerName}</p>
        ) : null}
        <p className="relation-moment-privacy">
          {t('m5s3.relations.pickerIntro')}
        </p>
        {discardOpen ? (
          <div
            role="alertdialog"
            aria-label={t('m5s3.relations.discardTitle')}
            className="inline-message"
          >
            <p>{t('m5s3.relations.discardTitle')}</p>
            <div className="short-task-sheet-actions">
              <button
                type="button"
                className="secondary"
                ref={keepChoosingRef}
                onClick={() => {
                  setDiscardOpen(false);
                  selectionFocus.current?.focus();
                }}
              >
                {t('m5s3.relations.keepChoosing')}
              </button>
              <button type="button" className="tertiary" onClick={closePicker}>
                {t('m5s3.relations.discard')}
              </button>
            </div>
          </div>
        ) : null}
        {apis.search ? (
          <label className="relation-moment-search">
            <span className="sr-only">{t('m5s3.relations.search')}</span>
            <EimirIcon name="suche" />
            <input
              type="search"
              value={search}
              placeholder={t('m5s3.relations.search')}
              disabled={isSaving}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        ) : null}
        <fieldset className="relation-moment-filters">
          <legend className="sr-only">{t('m5s3.relations.filterLabel')}</legend>
          {([null, 'MEMORY', 'HEART_MOMENT', 'MILESTONE'] as const).map(
            (kind) => (
              <button
                key={kind ?? 'all'}
                type="button"
                className="tertiary"
                aria-pressed={filter === kind}
                disabled={isSaving}
                onClick={() => setFilter(kind)}
              >
                {t(
                  kind ? `m5s3.relations.filter.${kind}` : 'm5s3.relations.all',
                )}
              </button>
            ),
          )}
        </fieldset>
        <p role="status" className="relation-moment-count">
          {t('m5s3.relations.selected', { count: selected.size })}
        </p>
        {activeQuery.isLoading || searchPending ? (
          <UiState kind="loading" title={t('m5s3.relations.loadingMoments')} />
        ) : null}
        {activeQuery.error ? (
          <ProblemState
            error={activeQuery.error}
            onRetry={() => void activeQuery.refetch()}
          />
        ) : null}
        {linkMutation.error ? (
          <ProblemState error={linkMutation.error} />
        ) : null}
        <ul
          className="relation-moment-choices"
          aria-busy={activeQuery.isFetching || searchPending}
        >
          {!searchPending &&
            availableTargets.map((target) => {
              const key = targetKey(target.kind, target.id);
              return (
                <li key={key}>
                  <label
                    className="relation-moment-choice"
                    data-selected={selected.has(key)}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      disabled={isSaving || inFlight.current}
                      onChange={() => {
                        setSelected((current) => {
                          const next = new Map(current);
                          if (next.has(key)) next.delete(key);
                          else next.set(key, target);
                          return next;
                        });
                      }}
                    />
                    <RelationMomentPreview
                      target={target}
                      spaceId={spaceId}
                      mediaApis={mediaApis}
                    />
                  </label>
                </li>
              );
            })}
        </ul>
        {!activeQuery.isLoading &&
        !activeQuery.error &&
        !searchPending &&
        !availableTargets.length ? (
          <p className="planning-empty">
            {t(
              searchTerm || filter
                ? 'm5s3.relations.noMatch'
                : 'm5s3.relations.noMoreTargets',
            )}
          </p>
        ) : null}
        {activeQuery.hasNextPage ? (
          <button
            type="button"
            className="tertiary relation-moment-more"
            disabled={activeQuery.isFetchingNextPage}
            onClick={() => void activeQuery.fetchNextPage()}
          >
            {activeQuery.isFetchingNextPage
              ? t('m5s3.common.loadingMore')
              : t('m5s3.common.loadMore')}
          </button>
        ) : null}
      </ShortTaskSheet>

      {canManage && unlinkMutation.error ? (
        <ProblemState error={unlinkMutation.error} />
      ) : null}
    </section>
  );
}
