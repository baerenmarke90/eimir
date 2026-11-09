import { TaskBackButton } from './TaskBackButton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AttachmentEntry } from '../api/generated/models/AttachmentEntry';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { PlanSchedule } from '../api/generated/models/PlanSchedule';
import type { WishDetail } from '../api/generated/models/WishDetail';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
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
import { usePlanPhotoDrafts } from '../client/usePlanPhotoDrafts';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { useTranslation } from '../i18n';
import { useTaskActivation } from '../client/useTaskActivation';
import { CollectionChoicePicker } from './CollectionChoicePicker';
import { AddActionContent } from './AddAction';
import { PageHeader } from './PageHeader';
import { PlaceChoicePicker } from './PlaceChoicePicker';
import { MemoryTagChoices } from './MemoryTagChoices';
import type { ContextTagEditorHandle } from './ContextTagEditor';
import { EimirIcon } from './EimirIcon';
import { PlanPhotosEditor } from './PlanPhotosEditor';
import { PlanScheduleFields } from './PlanScheduleFields';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './PlanningCreatePage.css';

type PlanningCreateKind = 'plan' | 'wish';

interface PlanningCreateValues {
  selectedCoverAttachmentId?: string | null;
  readonly title: string;
  readonly tags: string[];
  readonly description?: string;
  readonly placeId?: string;
  readonly schedule?: PlanSchedule;
  readonly attachments?: AttachmentEntry[];
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
  const { requestReturn } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const headingRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<ShortTaskSheetHandle>(null);
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placePending, setPlacePending] = useState(false);
  const placeSheet = useRef<ShortTaskSheetHandle>(null);
  const [tags, setTags] = useState<string[]>([]);
  const tagEditor = useRef<ContextTagEditorHandle>(null);
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
      photos.items.length,
  );
  const onClose = useCallback(() => {
    clearPhotos();
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
  }, [originKey, requestReturn, clearPhotos, kind, navigate]);
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
      owns,
    }: {
      values: PlanningCreateValues;
      collectionIds: string[];
      owns: () => boolean;
    }) => {
      assertOnlineWrite();
      let requestValues: PlanningCreateValues =
        kind === 'wish' ? { title: values.title, tags: values.tags } : values;
      if (kind === 'plan' && photos.items.length) {
        requestValues = {
          ...values,
          attachments: photos.entries,
          selectedCoverAttachmentId: photos.selectedCoverAttachmentId,
        };
      }
      assertOnlineWrite();
      const snapshot: PlanningCreateSnapshot = {
        kind,
        spaceId,
        values: requestValues,
      };
      const created =
        confirmedParent.current ??
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
                  wishCreate: { title: values.title, tags: values.tags },
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
      photos.entries.length !== photos.items.length
    )
      return;
    if (!navigator.onLine) {
      setOfflineAttempt(true);
      return;
    }
    const committedTags = tagEditor.current?.commitDraft();
    if (!committedTags) return;
    const data = new FormData(event.currentTarget);
    const schedule =
      kind === 'plan'
        ? planScheduleFromInputs(
            String(data.get('plannedDate') ?? ''),
            String(data.get('plannedTime') ?? ''),
          )
        : undefined;
    setOfflineAttempt(false);
    setProblem(null);
    setPending(true);
    createMutation.mutate({
      values: {
        title: title.trim(),
        tags: committedTags,
        description:
          kind === 'plan' && description.trim()
            ? description.trim()
            : undefined,
        placeId: kind === 'plan' && placeId ? placeId : undefined,
        schedule,
      },
      collectionIds: lists.map((list) => list.id),
      owns: capture(),
    });
  }

  const isPlan = kind === 'plan';
  return (
    <div className="page planning-create-task">
      <PageHeader
        before={
          <TaskBackButton
            type="button"
            className="back-link tertiary"
            onClick={requestClose}
            aria-disabled={pending}
          >
            {t('taskBoundary.close')}
          </TaskBackButton>
        }
        title={t(
          isPlan ? 'm5s3.plan.createHeading' : 'm5s3.wish.createHeading',
        )}
      />
      <div ref={headingRef} tabIndex={-1} className="planning-task-focus" />

      <form className="planning-intention-form" onSubmit={submit}>
        <fieldset
          disabled={pending || parentSaved}
          onChange={(event) => {
            if (
              !(
                event.target instanceof HTMLInputElement &&
                event.target.name === 'title'
              )
            )
              setEnrichmentDirty(true);
          }}
        >
          <legend className="sr-only">
            {t(isPlan ? 'm5s3.plan.createHeading' : 'm5s3.wish.createHeading')}
          </legend>
          <div className="field-group planning-intention-field">
            <label htmlFor="planning-create-title">
              {t(
                isPlan
                  ? 'm5s3.plan.intentionLabel'
                  : 'm5s3.wish.intentionLabel',
              )}
            </label>
            <input
              id="planning-create-title"
              name="title"
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t(
                isPlan
                  ? 'm5s3.plan.intentionPlaceholder'
                  : 'm5s3.wish.intentionPlaceholder',
              )}
            />
          </div>

          {isPlan ? (
            <PlanPhotosEditor
              controller={photos}
              spaceId={spaceId}
              disabled={pending}
              canUpload={Boolean(apiBaseUrl && accessToken)}
              photoSourceContext={
                apiBaseUrl && accessToken && accountId
                  ? { apiBaseUrl, accessToken, accountId }
                  : undefined
              }
              onChange={() => setEnrichmentDirty(true)}
            />
          ) : null}
          {isPlan ? (
            <div className="planning-place-choice">
              <button
                type="button"
                className={placeId ? 'secondary' : 'add-action'}
                aria-label={placeId ? undefined : t('photoPlaces.add')}
                title={placeId ? undefined : t('photoPlaces.add')}
                onClick={() => setPlaceOpen(true)}
              >
                {placeId ? (
                  <>
                    <EimirIcon name="orte" />
                    {placesQuery.data?.find((place) => place.id === placeId)
                      ?.name ?? t('m5s3.common.place')}
                  </>
                ) : (
                  <AddActionContent label={t('photoPlaces.add')} />
                )}
              </button>
              {placeId ? (
                <button
                  type="button"
                  className="tertiary"
                  onClick={() => setPlaceId('')}
                >
                  {t('m5s3.common.noPlace')}
                </button>
              ) : null}
            </div>
          ) : null}
          <MemoryTagChoices
            parentType={isPlan ? 'PLAN' : 'WISH'}
            selected={tags}
            onChange={setTags}
            editorRef={tagEditor}
            onDraftChange={() => setEnrichmentDirty(true)}
          />
          {isPlan ? (
            <section
              className="plan-collection-links"
              aria-label={t('m5s3.collection.planHeading')}
            >
              {lists.length ? (
                <ul className="plan-collection-draft">
                  {lists.map((list) => (
                    <li key={list.id}>{list.title}</li>
                  ))}
                </ul>
              ) : null}
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
              />
            </section>
          ) : null}
          {isPlan ? (
            <details className="planning-optional-details">
              <summary>{t('m5s3.plan.addDetails')}</summary>
              <div className="planning-optional-fields eimir-motion-disclosure">
                <label htmlFor="planning-create-description">
                  {t('m5s3.common.description')}
                </label>
                <textarea
                  id="planning-create-description"
                  name="description"
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <PlanScheduleFields idPrefix="planning-create-schedule" />
              </div>
            </details>
          ) : null}
        </fieldset>

        <div className="form-actions planning-task-actions">
          <button type="button" className="secondary" onClick={requestClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={
              pending ||
              collectionPending ||
              !title.trim() ||
              photos.hasPending ||
              photos.hasFailed
            }
          >
            {pending
              ? t('m5s3.common.saving')
              : parentSaved
                ? t('common.retry')
                : t('m5s3.common.save')}
          </button>
        </div>
      </form>

      {pending ? (
        <p className="status" role="status" aria-live="polite">
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
        <p role="status">{t('m5s3.collection.planSavedLinkFailed')}</p>
      ) : null}

      <ShortTaskSheet
        ref={placeSheet}
        open={placeOpen}
        isCloseBlocked={placePending}
        title={t('m5s3.common.place')}
        onClose={() => setPlaceOpen(false)}
      >
        <PlaceChoicePicker
          api={apis.places}
          spaceId={spaceId}
          queryKey={authorSummaryQueryKeys.placeOptions(spaceId)}
          offline={!navigator.onLine}
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
            placeSheet.current?.closeForNavigation(() => setPlaceOpen(false));
          }}
        />
      </ShortTaskSheet>
      <ShortTaskSheet
        ref={discardRef}
        open={showDiscard}
        role="alertdialog"
        title={t('taskBoundary.discardTitle')}
        onClose={keepEditing}
      >
        <p>{t('taskBoundary.discardBody')}</p>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={keepEditing}>
            {t('taskBoundary.keepEditing')}
          </button>
          <button
            type="button"
            className="danger"
            onClick={() =>
              discardRef.current?.closeForNavigation(() => closeTask())
            }
          >
            {t('taskBoundary.discard')}
          </button>
        </div>
      </ShortTaskSheet>
    </div>
  );
}
