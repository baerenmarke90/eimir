import { TaskBackButton } from './TaskBackButton';
import { createPortal } from 'react-dom';
import {
  ComposerChip,
  ComposerDescriptionField,
  ComposerTool,
  ComposerToolRow,
} from './PageComposer';
import { PlanWishLink } from './PlanWishLink';
import { planningIfMatch } from '../client/sharedPlanning';
import './PagePlanComposer.css';
import {
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AttachmentEntry } from '../api/generated/models/AttachmentEntry';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { PlanSchedule } from '../api/generated/models/PlanSchedule';
import type { WishDetail } from '../api/generated/models/WishDetail';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite, isClientOnline } from '../client/connectivity';
import {
  type CreateRequestAttempt,
  submitCreateRequest,
} from '../client/createRequestIdentity';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  type ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { createReferenceApis } from '../client/referenceFlow';
import { planDetailPath, wishDetailPath } from '../client/routes';
import {
  loadAllPlaces,
  planScheduleFromInputs,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { usePlanFileDrafts } from '../client/usePlanFileDrafts';
import { usePlanPhotoDrafts } from '../client/usePlanPhotoDrafts';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { useTranslation } from '../i18n';
import { useTaskActivation } from '../client/useTaskActivation';
import { CollectionChoicePicker } from './CollectionChoicePicker';
import { ComposerHeader } from './StoryFormPageShell';
import { PlanningDiscardSheet } from './PlanningEditorLifecycle';
import { PlaceChoicePicker } from './PlaceChoicePicker';
import { MemoryTagChoices } from './MemoryTagChoices';
import type { ContextTagEditorHandle } from './ContextTagEditor';
import { EimirIcon } from './EimirIcon';
import { PlanFilesEditor } from './PlanFiles';
import { PlanPhotosEditor } from './PlanPhotosEditor';
import {
  PlanScheduleFields,
  type PlanScheduleFieldsHandle,
} from './PlanScheduleFields';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { WishComposer } from './WishComposer';
import './PlanningCreatePage.css';
import './FreeComposer.css';

type PlanningCreateKind = 'plan' | 'wish';

interface PlanningCreateValues {
  selectedCoverAttachmentId?: string | null;
  readonly title: string;
  readonly tags: string[];
  readonly description?: string;
  readonly placeId?: string;
  readonly schedule?: PlanSchedule;
  readonly attachments?: AttachmentEntry[];
  readonly fileAttachmentIds?: string[];
}

interface PlanningCreateSnapshot {
  readonly kind: PlanningCreateKind;
  readonly spaceId: string;
  readonly values: PlanningCreateValues;
}

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function PlanningCreatePage({
  apis,
  spaceId,
  kind,
  apiBaseUrl,
  accessToken,
  accountId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  kind: PlanningCreateKind;
  apiBaseUrl?: string;
  accessToken?: string;
  accountId?: string;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { requestReturn, resolveOrigin } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const [defaultPlannedDate] = useState(() =>
    kind === 'plan' ? resolveOrigin(originKey)?.planningCreateDate : undefined,
  );
  const headingRef = useRef<HTMLDivElement>(null);
  const referenceApis = useMemo(
    () => createReferenceApis(apiBaseUrl ?? '', accessToken ?? ''),
    [apiBaseUrl, accessToken],
  );
  const photos = usePlanPhotoDrafts({
    apis: referenceApis,
    apiBaseUrl: apiBaseUrl ?? '',
    accessToken: accessToken ?? '',
    spaceId,
    accountId: accountId ?? '',
  });
  const clearPhotos = photos.clear;
  const files = usePlanFileDrafts({
    apis: referenceApis,
    apiBaseUrl: apiBaseUrl ?? '',
    accessToken: accessToken ?? '',
    spaceId,
    accountId: accountId ?? '',
    resourceKey: kind,
  });
  const clearFiles = files.clear;
  const online = useSyncExternalStore(
    onlineManager.subscribe,
    isClientOnline,
    () => true,
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [wish, setWish] = useState<WishDetail | null>(null);
  const placeTrigger = useRef<HTMLButtonElement>(null);
  const listTrigger = useRef<HTMLButtonElement>(null);
  const [photoToolHost, setPhotoToolHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [fileToolHost, setFileToolHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [tagToolHost, setTagToolHost] = useState<HTMLSpanElement | null>(null);
  const [listToolHost, setListToolHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placePending, setPlacePending] = useState(false);
  const placeSheet = useRef<ShortTaskSheetHandle>(null);
  const [tags, setTags] = useState<string[]>([]);
  const tagEditor = useRef<ContextTagEditorHandle>(null);
  const scheduleFields = useRef<PlanScheduleFieldsHandle>(null);
  const [enrichmentDirty, setEnrichmentDirty] = useState(false);
  const [offlineAttempt, setOfflineAttempt] = useState(false);
  const [problem, setProblem] = useState<ClientProblemError | null>(null);
  const [pending, setPending] = useState(false);
  const [lists, setLists] = useState<CollectionDetail[]>([]);
  const [collectionPending, setCollectionPending] = useState(false);
  const confirmedParent = useRef<PlanDetail | WishDetail | null>(null);
  const [parentSaved, setParentSaved] = useState(false);
  const capture = useTaskActivation(
    true,
    JSON.stringify([apiBaseUrl, accountId, spaceId, kind]),
  );
  const createAttemptRef =
    useRef<CreateRequestAttempt<PlanningCreateSnapshot> | null>(null);

  const placesQuery = useQuery({
    queryKey: authorSummaryQueryKeys.placeOptions(spaceId),
    queryFn: () => apiCall(() => loadAllPlaces(apis, spaceId)),
    enabled: kind === 'plan',
    staleTime: 30_000,
    retry: false,
  });

  const dirty = Boolean(
    title ||
      description ||
      placeId ||
      tags.length ||
      enrichmentDirty ||
      photos.items.length ||
      files.items.length ||
      wish,
  );
  const onClose = useCallback(() => {
    clearPhotos();
    clearFiles();
    if (confirmedParent.current) {
      navigate(
        kind === 'plan'
          ? planDetailPath(confirmedParent.current.id)
          : wishDetailPath(confirmedParent.current.id),
        { replace: true, state: { taskOriginKey: originKey } },
      );
      return;
    }
    requestReturn(originKey, '/plan');
  }, [originKey, requestReturn, clearPhotos, clearFiles, kind, navigate]);
  const {
    showDiscardConfirm: showDiscard,
    keepEditing,
    closeConfirmed: closeTask,
    requestClose,
  } = useTaskEditorLifecycle({
    isDirty: dirty,
    isCloseBlocked: pending || placePending || collectionPending,
    onClose,
  });

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const createMutation = useMutation({
    networkMode: 'always',
    mutationFn: async ({
      values,
      collectionIds,
      selectedWish,
      owns,
    }: {
      values: PlanningCreateValues;
      collectionIds: string[];
      selectedWish?: WishDetail | null;
      owns: () => boolean;
    }) => {
      assertOnlineWrite();
      const wishCreate = {
        title: values.title,
        description: values.description,
        tags: values.tags,
      };
      let requestValues: PlanningCreateValues =
        kind === 'wish' ? wishCreate : values;
      if (kind === 'plan' && photos.items.length) {
        requestValues = {
          ...values,
          attachments: photos.entries,
          selectedCoverAttachmentId: photos.selectedCoverAttachmentId,
        };
      }
      if (kind === 'plan' && files.readyIds.length) {
        requestValues = { ...requestValues, fileAttachmentIds: files.readyIds };
      }
      assertOnlineWrite();
      const snapshot: PlanningCreateSnapshot = {
        kind,
        spaceId,
        values: requestValues,
      };
      const created =
        (confirmedParent.current
          ? kind === 'plan' && selectedWish
            ? await apis.plans.getPlan({
                spaceId,
                planId: confirmedParent.current.id,
              })
            : confirmedParent.current
          : null) ??
        (await submitCreateRequest<
          PlanningCreateSnapshot,
          PlanDetail | WishDetail
        >({
          previousAttempt: createAttemptRef.current,
          snapshot,
          rememberAttempt: (attempt) => {
            createAttemptRef.current = attempt;
          },
          request: (idempotencyKey) =>
            kind === 'wish'
              ? apis.wishes.createWish({
                  spaceId,
                  wishCreate,
                  idempotencyKey,
                })
              : apis.plans.createPlan({
                  spaceId,
                  planCreate: requestValues,
                  idempotencyKey,
                }),
        }));
      if (!owns()) throw new Error('Planning task ownership changed');
      confirmedParent.current = created;
      setParentSaved(true);
      queryClient.setQueryData(
        kind === 'plan'
          ? authorSummaryQueryKeys.planDetail(spaceId, created.id)
          : authorSummaryQueryKeys.wishDetail(spaceId, created.id),
        created,
      );
      if (kind === 'plan')
        for (const collectionId of collectionIds) {
          if (!owns()) throw new Error('Planning task ownership changed');
          assertOnlineWrite();
          await apiCall(() =>
            apis.plans.linkPlanCollection({
              spaceId,
              planId: created.id,
              collectionId,
            }),
          );
        }
      if (kind === 'plan' && selectedWish) {
        const current = created as PlanDetail;
        if (current.sourceWishId !== selectedWish.id) {
          assertOnlineWrite();
          if (!owns()) throw new Error('Planning task ownership changed');
          const linked = await apiCall(() =>
            apis.plans.linkWishToPlan({
              spaceId,
              planId: current.id,
              ifMatch: planningIfMatch(current),
              planWishLink: {
                wishId: selectedWish.id,
                wishVersion: selectedWish.version,
              },
            }),
          );
          if (!owns()) throw new Error('Planning task ownership changed');
          confirmedParent.current = linked.plan;
          await queryClient.invalidateQueries({
            queryKey: ['m5-s3', 'wishes', spaceId],
          });
          return linked.plan;
        }
      }
      return created;
    },
    onSuccess: async (created, intent) => {
      if (!intent.owns()) return;
      await queryClient.invalidateQueries({
        queryKey: ['context-tags', spaceId],
      });
      const queryKey =
        kind === 'plan'
          ? authorSummaryQueryKeys.planDetail(spaceId, created.id)
          : authorSummaryQueryKeys.wishDetail(spaceId, created.id);
      queryClient.setQueryData(queryKey, created);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', kind === 'plan' ? 'plans' : 'wishes', spaceId],
        }),
        invalidateDashboard(queryClient, spaceId),
      ]);
      if (!intent.owns()) return;
      closeTask(() => {
        navigate(
          kind === 'plan'
            ? planDetailPath(created.id)
            : wishDetailPath(created.id),
          {
            replace: true,
            state: { taskOriginKey: originKey, planningCreated: true },
          },
        );
      });
    },
    onError: (error, intent) => {
      if (!intent.owns()) return;
      setPending(false);
      setProblem(error as ClientProblemError);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      pending ||
      placePending ||
      collectionPending ||
      !title.trim() ||
      photos.hasPending ||
      photos.hasFailed ||
      files.hasPending ||
      files.hasFailed ||
      photos.entries.length !== photos.items.length
    )
      return;
    if (!navigator.onLine) {
      setOfflineAttempt(true);
      return;
    }
    const committedTags = tagEditor.current?.commitDraft() ?? tags;
    if (!committedTags) return;
    if (scheduleFields.current?.reportValidity() === false) return;
    const data = new FormData(event.currentTarget);
    const schedule =
      kind === 'plan'
        ? planScheduleFromInputs(
            String(data.get('plannedDate') ?? ''),
            String(data.get('plannedTime') ?? ''),
            String(data.get('plannedEnd') ?? ''),
          )
        : undefined;
    setOfflineAttempt(false);
    setProblem(null);
    setPending(true);
    createMutation.mutate({
      values: {
        title: title.trim(),
        tags: committedTags,
        description: description.trim() || undefined,
        placeId: kind === 'plan' && placeId ? placeId : undefined,
        schedule,
      },
      collectionIds: lists.map((list) => list.id),
      selectedWish: wish,
      owns: capture(),
    });
  }

  const chosenPlace = placesQuery.data?.find((place) => place.id === placeId);
  if (kind === 'plan')
    return (
      <div className="page planning-create-task free-composer quiet-composer page-composer page-plan-composer">
        <ComposerHeader
          before={
            <TaskBackButton
              inline
              onClick={requestClose}
              aria-disabled={pending}
            />
          }
          title={t('m5s3.plan.createHeading')}
          action={
            <button
              type="submit"
              form="planning-create-form"
              data-saveable={Boolean(title.trim())}
              disabled={
                pending ||
                placePending ||
                collectionPending ||
                photos.hasPending ||
                photos.hasFailed ||
                files.hasPending ||
                files.hasFailed
              }
            >
              {pending
                ? t('m5s3.common.saving')
                : parentSaved
                  ? t('common.retry')
                  : t('m5s3.common.save')}
            </button>
          }
        />
        <div ref={headingRef} tabIndex={-1} className="planning-task-focus" />
        <form
          id="planning-create-form"
          className="planning-intention-form"
          onSubmit={submit}
        >
          <fieldset
            disabled={pending || parentSaved}
            onChange={() => setEnrichmentDirty(true)}
          >
            <legend className="sr-only">{t('m5s3.plan.createHeading')}</legend>
            <div className="composer-context page-composer-context-row">
              <PlanScheduleFields
                ref={scheduleFields}
                compact
                formId="planning-create-form"
                disabled={pending || parentSaved}
                idPrefix="planning-create-schedule"
                defaultDate={defaultPlannedDate}
                includeEnd
              />
              {chosenPlace ? (
                <button
                  type="button"
                  className="composer-place-context tertiary"
                  onClick={(event) => {
                    placeTrigger.current = event.currentTarget;
                    setPlaceOpen(true);
                  }}
                >
                  <EimirIcon name="orte" />
                  {chosenPlace.name}
                </button>
              ) : null}
            </div>
            <PlanPhotosEditor
              controller={photos}
              spaceId={spaceId}
              disabled={pending || parentSaved}
              canUpload={Boolean(apiBaseUrl && accessToken)}
              presentation="tools"
              pageWideDrop
              mediaTrigger={(open) =>
                photoToolHost
                  ? createPortal(
                      <ComposerTool
                        icon="foto"
                        label={t('composer.photo')}
                        active={Boolean(photos.items.length)}
                        disabled={pending || parentSaved}
                        onClick={open}
                      />,
                      photoToolHost,
                    )
                  : null
              }
              photoSourceContext={
                apiBaseUrl && accessToken && accountId
                  ? { apiBaseUrl, accessToken, accountId }
                  : undefined
              }
              onChange={() => setEnrichmentDirty(true)}
            />
            <div className="page-composer-writing">
              <label className="sr-only" htmlFor="planning-create-title">
                {t('m5s3.plan.intentionLabel')}
              </label>
              <input
                id="planning-create-title"
                name="title"
                className="page-composer-title"
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('m5s3.common.title')}
              />
              <ComposerDescriptionField
                id="planning-create-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <PlanFilesEditor
              drafts={files}
              toolHost={fileToolHost}
              disabled={pending || parentSaved || !apiBaseUrl || !accessToken}
              online={online}
              onChange={() => setEnrichmentDirty(true)}
            />
            <div className="composer-selected-chips">
              {lists.map((list) => (
                <ComposerChip
                  key={list.id}
                  icon="listen"
                  onClick={() => listTrigger.current?.click()}
                >
                  {list.title}
                </ComposerChip>
              ))}
            </div>
            <MemoryTagChoices
              presentation="composer"
              parentType="PLAN"
              selected={tags}
              onChange={setTags}
              editorRef={tagEditor}
              onDraftChange={() => setEnrichmentDirty(true)}
              renderTrigger={(open) =>
                tagToolHost
                  ? createPortal(
                      <ComposerTool
                        icon="tag"
                        label={t('composer.tag')}
                        active={Boolean(tags.length)}
                        onClick={open}
                        disabled={pending || parentSaved}
                      />,
                      tagToolHost,
                    )
                  : null
              }
            />
            <PlanWishLink
              apis={apis}
              spaceId={spaceId}
              disabled={pending || parentSaved}
              draftChoice={{
                value: wish,
                onChoose: (value) => {
                  setWish(value);
                  setEnrichmentDirty(true);
                },
              }}
              presentation="composer"
              renderTrigger={(open) => (
                <>
                  {wish ? (
                    <ComposerChip icon="wuensche" onClick={open}>
                      {wish.title}
                    </ComposerChip>
                  ) : null}
                  <button
                    type="button"
                    className="composer-link-entry tertiary"
                    onClick={open}
                  >
                    <EimirIcon name="hinzufuegen" />
                    {t('m5s3.plan.linkWish')}
                  </button>
                </>
              )}
            />
          </fieldset>
        </form>
        {pending ? (
          <p className="composer-status" role="status">
            {t('m5s3.common.saving')}
          </p>
        ) : null}
        {offlineAttempt ? (
          <p className="inline-message" role="alert">
            {t('taskBoundary.offline')}
          </p>
        ) : null}
        {problem ? <ProblemState error={problem} /> : null}
        {parentSaved && problem ? (
          <p role="status">
            {t(
              wish
                ? 'composer.planSavedLinkFailed'
                : 'm5s3.collection.planSavedLinkFailed',
            )}
          </p>
        ) : null}
        <ComposerToolRow>
          <span className="composer-tool-slot" ref={setPhotoToolHost} />
          <span className="composer-tool-slot" ref={setFileToolHost} />
          <ComposerTool
            icon="orte"
            label={t('composer.place')}
            active={Boolean(placeId)}
            disabled={pending || parentSaved}
            ref={placeTrigger}
            onClick={() => setPlaceOpen(true)}
          />
          <span className="composer-tool-slot" ref={setListToolHost} />
          <span className="composer-tool-slot" ref={setTagToolHost} />
        </ComposerToolRow>
        <CollectionChoicePicker
          apis={apis}
          spaceId={spaceId}
          value={lists}
          disabled={pending || parentSaved}
          onChoose={(selected) => {
            setLists(selected);
            setEnrichmentDirty(true);
          }}
          onPendingChange={setCollectionPending}
          renderTrigger={(open) =>
            listToolHost
              ? createPortal(
                  <ComposerTool
                    ref={listTrigger}
                    icon="listen"
                    label={t('composer.list')}
                    active={Boolean(lists.length)}
                    disabled={pending || parentSaved}
                    onClick={open}
                  />,
                  listToolHost,
                )
              : null
          }
        />
        <ShortTaskSheet
          ref={placeSheet}
          open={placeOpen}
          isCloseBlocked={placePending}
          title={t('m5s3.common.place')}
          restoreFocusRef={placeTrigger}
          onClose={() => setPlaceOpen(false)}
        >
          {placeId ? (
            <button
              type="button"
              className="tertiary"
              disabled={placePending}
              onClick={() => {
                setPlaceId('');
                setEnrichmentDirty(true);
                placeSheet.current?.requestClose();
              }}
            >
              {t('m5s3.common.noPlace')}
            </button>
          ) : null}
          <PlaceChoicePicker
            api={apis.places}
            spaceId={spaceId}
            queryKey={authorSummaryQueryKeys.placeOptions(spaceId)}
            offline={!navigator.onLine}
            confirmSharedCreate
            onPendingChange={setPlacePending}
            onChoose={(place) => {
              queryClient.setQueryData(
                authorSummaryQueryKeys.placeOptions(spaceId),
                (current: typeof placesQuery.data) => [
                  ...(current ?? []).filter((entry) => entry.id !== place.id),
                  place,
                ],
              );
              setPlaceId(place.id);
              setPlacePending(false);
              setEnrichmentDirty(true);
              setPlaceOpen(false);
            }}
          />
        </ShortTaskSheet>
        <PlanningDiscardSheet
          open={showDiscard}
          onKeepEditing={keepEditing}
          onDiscard={closeTask}
        />
      </div>
    );
  return (
    <WishComposer
      title={title}
      description={description}
      tags={tags}
      tagEditorRef={tagEditor}
      focusRef={headingRef}
      disabled={pending || parentSaved}
      saving={pending}
      onTitleChange={setTitle}
      onDescriptionChange={setDescription}
      onTagsChange={setTags}
      onTagDraftChange={setEnrichmentDirty}
      onSubmit={submit}
      onClose={requestClose}
    >
      {offlineAttempt ? (
        <p className="inline-message" role="alert">
          {t('taskBoundary.offline')}
        </p>
      ) : null}
      {problem ? <ProblemState error={problem} /> : null}
      <PlanningDiscardSheet
        open={showDiscard}
        onKeepEditing={keepEditing}
        onDiscard={closeTask}
      />
    </WishComposer>
  );
}
