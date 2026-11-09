import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type FormEvent,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { AttachmentEntry } from '../api/generated/models/AttachmentEntry';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { HeartEmotion } from '../api/generated/models/HeartEmotion';
import type { HeartMomentDetail } from '../api/generated/models/HeartMomentDetail';
import {
  HeartMomentDetailFromJSON,
  HeartMomentDetailToJSON,
} from '../api/generated/models/HeartMomentDetail';
import type { HeartMomentLocation } from '../api/generated/models/HeartMomentLocation';
import type { HeartMomentUpdate } from '../api/generated/models/HeartMomentUpdate';
import {
  authorSummaryQueryKeys,
  invalidateStoryProjections,
} from '../client/authorSummaryConsumers';
import { bindVideoTransferTargets } from '../client/backgroundVideoUploads';
import { assertOnlineWrite } from '../client/connectivity';
import {
  type CreateRequestAttempt,
  submitCreateRequest,
} from '../client/createRequestIdentity';
import { invalidateDashboard } from '../client/dashboardQueries';
import { localDateInputValue } from '../client/dateInput';
import type { ObjectUrlSource } from '../client/objectUrlResource';
import { usePartnerNickname } from '../client/partnerNickname';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import {
  deleteProductReadCacheEntry,
  loadProductWithReadCache,
  type ProductReadResult,
} from '../client/productReadCache';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  appRoutePath,
  heartMomentDetailPath,
  heartMomentEditPath,
} from '../client/routes';
import { protectSensitiveMediaProjections } from '../client/sensitiveMediaProjections';
import { takeSharedVoice } from '../client/sharedVoiceImport';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { useStoryViewReceipt } from '../client/storyViewReceipt';
import { useTaskOrigin } from '../client/taskOrigin';
import { formatAttachmentDraftContextKey } from '../client/useAttachmentDrafts';
import { useHeartVoiceDraft } from '../client/useHeartVoiceDraft';
import { useOrderedPhotoDrafts } from '../client/useOrderedPhotoDrafts';
import { usePlanCaptureSource } from '../client/usePlanCaptureSource';
import { useStoryDeletion } from '../client/useStoryDeletion';
import { useTaskActivation } from '../client/useTaskActivation';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { loadVideoSource } from '../client/video';
import { resolvedLocale, useTranslation } from '../i18n';
import { CommentsPanel } from './CommentsPanel';
import type { ContextTagEditorHandle } from './ContextTagEditor';
import { DraftExitPrompt } from './DraftExitPrompt';
import { ExpandableDescription } from './ExpandableDescription';
import { HeartEmotionBadge, HeartEmotionPicker } from './HeartEmotionVisual';
import {
  HeartMomentLocationField,
  HeartMomentLocationSummary,
  locationFromPlace,
} from './HeartMomentLocation';
import {
  HEART_MOMENT_TAGS,
  HeartMomentTagChoices,
} from './HeartMomentTagChoices';
import { GalleryExpandAction, MediaGallery } from './MediaGallery';
import { MomentDate } from './MomentDate';
import {
  MomentPlaceField,
  type MomentPlaceSelection,
} from './MomentPlaceField';
import { MomentPlaces } from './MomentPlaces';
import { NativeDateField } from './NativeDateField';
import { PageHeader } from './PageHeader';
import { PlanPhotosEditor } from './PlanPhotosEditor';
import { ProblemState } from './ProblemState';
import { SavedVoiceNote } from './SavedVoiceNote';
import { StoryDetailEditLink } from './StoryDetailEditLink';
import { StoryDetailPageShell } from './StoryDetailPageShell';
import {
  StoryCreatePageShell,
  StoryEditorPageShell,
} from './StoryFormPageShell';
import { StoryPlanningLinks } from './StoryPlanningLinks';
import { storyAuthorLabel } from './storyPresentation';
import { TaskBackButton, TaskBackLink } from './TaskBackButton';
import { UiState } from './UiState';
import { VisibilityBadge, VisibilityGlyph } from './VisibilityBadge';
import { VoiceNoteEditor } from './VoiceNoteEditor';

export type HeartMomentProductMode = 'create' | 'detail' | 'edit';

type HeartEmotionValue = (typeof HeartEmotion)[keyof typeof HeartEmotion];
type ContentVisibilityValue =
  (typeof ContentVisibility)[keyof typeof ContentVisibility];

interface HeartMomentCreateValues {
  readonly text: string;
  readonly audioTitle?: string;
  readonly audioSpeakerName?: string;
  readonly emotion: HeartEmotionValue;
  readonly happenedOn: Date;
  readonly visibility: ContentVisibilityValue;
  readonly attachments?: AttachmentEntry[];
  readonly selectedCoverAttachmentId?: string | null;
  readonly tags: string[];
  readonly placeId?: string;
  readonly location?: HeartMomentLocation;
}

interface HeartMomentCreateSnapshot {
  readonly spaceId: string;
  readonly heartMomentCreate: HeartMomentCreateValues;
}

interface HeartMomentVisibilityRequest {
  readonly current: HeartMomentDetail;
  readonly visibility: ContentVisibilityValue;
  readonly accountId: string;
  readonly spaceId: string;
  readonly queryKey: ReturnType<typeof authorSummaryQueryKeys.heartMoment>;
  readonly api: ReferenceApis['heartMoments'];
  readonly isCurrent: () => boolean;
}

function formatDateOnly(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(value);
}

function formatCreatedAt(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
  }).format(value);
}

function dateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function HeartMomentProductPage({
  mode,
  apis,
  apiBaseUrl,
  accessToken,
  spaceId,
  currentAccountId,
  loadAttachment,
}: {
  mode: HeartMomentProductMode;
  apis: ReferenceApis;
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  currentAccountId: string;
  loadAttachment: (
    heartMomentId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<ObjectUrlSource>;
}) {
  const [commentHost, setCommentHost] = useState<HTMLSpanElement | null>(null);
  const { t } = useTranslation();
  const { nicknameFor } = usePartnerNickname();
  const navigate = useNavigate();
  const location = useLocation();
  const { requestReturn } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const params = useParams();
  const queryClient = useQueryClient();
  const heartMomentId = params.heartMomentId;
  const queryKey = authorSummaryQueryKeys.heartMoment(spaceId, heartMomentId);
  const contextKey = formatAttachmentDraftContextKey(currentAccountId, spaceId);
  const deleteKey = [
    'heart-moment-delete',
    currentAccountId,
    spaceId,
    heartMomentId,
  ] as const;
  const updateKey = [
    'heart-moment-update',
    currentAccountId,
    spaceId,
    heartMomentId,
  ] as const;
  const [createContentError, setCreateContentError] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [createText, setCreateText] = useState('');
  const [createDate, setCreateDate] = useState(localDateInputValue);
  const sourceContentApplied = useRef(false);
  const sourcePlaceApplied = useRef(false);
  const placeManuallyChanged = useRef(false);
  const {
    eligibleSourcePlanId,
    sourcePlan,
    sourcePlace,
    loading: sourceLoading,
  } = usePlanCaptureSource({
    apiBaseUrl,
    accessToken,
    spaceId,
    accountId: currentAccountId,
    enabled: mode === 'create',
  });
  const [createPlace, setCreatePlace] = useState<MomentPlaceSelection>();
  const [placePending, setPlacePending] = useState(false);
  const [createLocation, setCreateLocation] =
    useState<HeartMomentLocation | null>(null);
  const [editLocation, setEditLocation] = useState<HeartMomentLocation | null>(
    null,
  );
  const [editLocationChanged, setEditLocationChanged] = useState(false);
  const [editContentError, setEditContentError] = useState(false);
  const tagEditorRef = useRef<ContextTagEditorHandle>(null);
  const [createVisibility, setCreateVisibility] =
    useState<ContentVisibilityValue>(ContentVisibility.SHARED);
  useEffect(() => {
    const source = sourcePlan.data;
    if (
      mode !== 'create' ||
      !source ||
      source.status !== 'COMPLETED' ||
      !source.capabilities.canEdit ||
      source.spaceId !== spaceId ||
      sourceContentApplied.current ||
      formDirty
    )
      return;
    sourceContentApplied.current = true;
    setCreateText(source.description || source.title);
    if (source.experiencedOn)
      setCreateDate(dateInputValue(source.experiencedOn));
  }, [mode, sourcePlan.data, spaceId, formDirty]);
  useEffect(() => {
    if (
      mode !== 'create' ||
      !sourcePlace.data ||
      sourcePlaceApplied.current ||
      placeManuallyChanged.current
    )
      return;
    sourcePlaceApplied.current = true;
    setCreatePlace(sourcePlace.data);
  }, [mode, sourcePlace.data]);
  const createAttemptRef =
    useRef<CreateRequestAttempt<HeartMomentCreateSnapshot> | null>(null);
  const voice = useHeartVoiceDraft({
    apis,
    apiBaseUrl,
    accessToken,
    spaceId,
    accountId: currentAccountId,
    resourceKey: `${heartMomentId ?? 'new'}:${mode}`,
  });
  const photos = useOrderedPhotoDrafts({
    apis,
    apiBaseUrl,
    accessToken,
    spaceId,
    accountId: currentAccountId,
    resourceKey: `${heartMomentId ?? 'new'}:${mode}`,
  });
  const attachments = photos.uploads;
  const combinedEntries: AttachmentEntry[] = [
    ...photos.entries,
    ...(voice.attachmentId
      ? [
          {
            attachmentId: voice.attachmentId,
            position: photos.entries.length,
            isSensitive: voice.existing?.isSensitive ?? false,
          },
        ]
      : []),
  ];
  const voiceImportKey = (location.state as { voiceImportKey?: string } | null)
    ?.voiceImportKey;
  const voiceIngress = useRef(voice.add);
  voiceIngress.current = voice.add;
  useLayoutEffect(() => {
    if (mode !== 'create' || !voiceImportKey) return;
    const file = takeSharedVoice(
      JSON.stringify([apiBaseUrl, currentAccountId, spaceId]),
      voiceImportKey,
    );
    if (file) {
      voiceIngress.current(file);
      setFormDirty(true);
      setCreateVisibility(ContentVisibility.PRIVATE);
    }
  }, [mode, voiceImportKey, apiBaseUrl, currentAccountId, spaceId]);

  const heartMomentQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!heartMomentId)
        throw new Error('Missing HeartMoment route parameter.');
      return loadProductWithReadCache({
        accountId: currentAccountId,
        spaceId,
        kind: 'heartMoment',
        resourceId: heartMomentId,
        load: () =>
          apis.heartMoments.getHeartMoment({ spaceId, heartMomentId }),
        serialize: HeartMomentDetailToJSON,
        deserialize: (payload) => HeartMomentDetailFromJSON(payload),
      });
    },
    enabled: mode !== 'create' && Boolean(heartMomentId),
    refetchInterval: (query) =>
      !query.state.error &&
      (query.state.data?.value.attachments ?? []).some((item) =>
        ['PENDING', 'PROCESSING'].includes(item.status),
      )
        ? 2500
        : false,
    retry: false,
  });

  const loadedMediaScope = useRef('');
  const mediaScope = JSON.stringify([
    apiBaseUrl,
    contextKey,
    heartMomentId,
    mode,
  ]);
  const loadPhotos = photos.load;
  const loadVoice = voice.load;
  useLayoutEffect(() => {
    const moment = heartMomentQuery.data?.value;
    if (mode !== 'edit' || !moment || loadedMediaScope.current === mediaScope)
      return;
    loadedMediaScope.current = mediaScope;
    setEditLocation(moment.location ?? null);
    setEditLocationChanged(false);
    loadVoice(moment);
    loadPhotos(
      (moment.attachments?.length
        ? moment.attachments
        : moment.attachment
          ? [{ ...moment.attachment, position: 0 }]
          : []
      ).filter((item) => item.mediaType !== 'AUDIO'),
      moment.selectedCoverAttachmentId,
    );
  }, [mediaScope, mode, heartMomentQuery.data, loadPhotos, loadVoice]);

  useStoryViewReceipt({
    apis,
    spaceId,
    kind: 'HEART_MOMENT',
    itemId: heartMomentId ?? '',
    presented:
      mode === 'detail' &&
      heartMomentQuery.isSuccess &&
      heartMomentQuery.data.value.visibility === 'SHARED',
  });

  const captureCreateOwnership = useTaskActivation(
    mode === 'create',
    JSON.stringify([apiBaseUrl, contextKey, location.key]),
  );
  const captureEditOwnership = useTaskActivation(
    mode === 'edit',
    JSON.stringify([apiBaseUrl, contextKey, heartMomentId, location.key]),
  );

  const createMutation = useMutation({
    mutationFn: async ({
      values,
      isCurrent,
    }: {
      values: HeartMomentCreateValues;
      isCurrent: () => boolean;
    }) => {
      if (!isCurrent()) throw new ClientProblemError('permission');
      const snapshot: HeartMomentCreateSnapshot = {
        spaceId,
        heartMomentCreate: values,
      };
      const saved = await submitCreateRequest({
        previousAttempt: createAttemptRef.current,
        snapshot,
        rememberAttempt: (attempt) => {
          createAttemptRef.current = attempt;
        },
        request: (idempotencyKey) =>
          apis.heartMoments.createHeartMoment({
            ...snapshot,
            idempotencyKey,
          }),
      });
      protectSensitiveMediaProjections(
        queryClient,
        saved.spaceId,
        saved.attachment ? [saved.attachment] : [],
      );
      await bindVideoTransferTargets(
        spaceId,
        { targetType: 'HEART_MOMENT', targetId: saved.id },
        (saved.attachments ?? (saved.attachment ? [saved.attachment] : [])).map(
          (item) => item.id,
        ),
      );
      return saved;
    },
    onSuccess: async (heartMoment, request) => {
      if (!request.isCurrent()) return;
      setFormDirty(false);
      attachments.clear();
      voice.uploads.clear();
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        invalidateDashboard(queryClient, spaceId),
      ]);
      if (!request.isCurrent()) return;
      editorLifecycle.closeConfirmed(() =>
        navigate(heartMomentDetailPath(heartMoment.id), {
          replace: true,
          state: {
            saved: true,
            taskOriginKey: originKey,
            sourcePlanToLink:
              heartMoment.visibility === 'SHARED' && eligibleSourcePlanId
                ? {
                    id: eligibleSourcePlanId,
                    contentKind: 'HEART_MOMENT',
                    contentId: heartMoment.id,
                    accountId: currentAccountId,
                    spaceId,
                    instance: apiBaseUrl,
                  }
                : undefined,
          },
        }),
      );
    },
  });

  const updateMutation = useMutation({
    mutationKey: updateKey,
    mutationFn: async ({
      current,
      update,
      isCurrent,
    }: {
      isCurrent: () => boolean;
      current: HeartMomentDetail;
      update: HeartMomentUpdate;
    }) => {
      try {
        if (!isCurrent()) throw new ClientProblemError('permission');
        const saved = await apis.heartMoments.updateHeartMoment({
          spaceId,
          heartMomentId: current.id,
          ifMatch: String(current.version),
          heartMomentUpdate: update,
        });
        const observed = queryClient.getQueryData<{ value: HeartMomentDetail }>(
          queryKey,
        );
        if (observed && observed.value.version > saved.version)
          throw new ClientProblemError('conflict', 409);
        protectSensitiveMediaProjections(
          queryClient,
          saved.spaceId,
          saved.attachments ?? (saved.attachment ? [saved.attachment] : []),
        );
        await bindVideoTransferTargets(
          spaceId,
          { targetType: 'HEART_MOMENT', targetId: saved.id },
          (
            saved.attachments ?? (saved.attachment ? [saved.attachment] : [])
          ).map((item) => item.id),
        );
        return saved;
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: async ({ current, update, isCurrent }) => {
      if (!isCurrent()) throw new ClientProblemError('permission');
      await queryClient.cancelQueries({ queryKey });
      if (!isCurrent()) throw new ClientProblemError('permission');
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, {
        value: {
          ...current,
          text: update.text ?? current.text,
          tags: update.tags ?? current.tags,
          emotion: update.emotion ?? current.emotion,
          happenedOn: update.happenedOn ?? current.happenedOn,
          attachment: update.attachmentId === null ? null : current.attachment,
          updatedAt: new Date(),
        },
        source: 'network',
      });
      return { previous };
    },
    onError: (_error, variables, context) => {
      if (!variables.isCurrent()) return;
      const observed = queryClient.getQueryData<{ value: HeartMomentDetail }>(
        queryKey,
      );
      if (
        context?.previous &&
        (!observed || observed.value.version <= variables.current.version)
      )
        queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: async (heartMoment, request) => {
      if (!request.isCurrent()) return;
      setFormDirty(false);
      attachments.clear();
      photos.clear();
      voice.uploads.clear();
      queryClient.setQueryData(queryKey, {
        value: heartMoment,
        source: 'network',
      });
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        queryClient.invalidateQueries({ queryKey }),
        invalidateDashboard(queryClient, spaceId),
      ]);
      if (!request.isCurrent()) return;
      editorLifecycle.closeConfirmed(() =>
        navigate(heartMomentDetailPath(heartMoment.id), {
          replace: true,
          state: { taskOriginKey: originKey },
        }),
      );
    },
  });

  const visibilityMutationKey = [
    'heart-moment-visibility',
    currentAccountId,
    spaceId,
    heartMomentId,
    heartMomentQuery.data?.value.version,
  ] as const;
  const visibilityWrites = useIsMutating({
    mutationKey: visibilityMutationKey,
    exact: true,
  });
  const visibilityMutation = useMutation({
    mutationKey: visibilityMutationKey,
    networkMode: 'always',
    retry: false,
    mutationFn: async (request: HeartMomentVisibilityRequest) => {
      try {
        if (!request.isCurrent()) throw new ClientProblemError('permission');
        const current = queryClient.getQueryData<
          ProductReadResult<HeartMomentDetail>
        >(request.queryKey);
        if (current?.source !== 'network')
          throw new ClientProblemError('offline');
        if (!current.value.capabilities.canEdit)
          throw new ClientProblemError('permission');
        if (current.value.version !== request.current.version)
          throw new ClientProblemError('conflict', 409);
        assertOnlineWrite();
        return await request.api.changeHeartMomentVisibility({
          spaceId: request.spaceId,
          heartMomentId: request.current.id,
          ifMatch: String(request.current.version),
          heartMomentVisibilityChange: { visibility: request.visibility },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: async (request) => {
      if (!request.isCurrent()) throw new ClientProblemError('permission');
      await queryClient.cancelQueries({
        queryKey: request.queryKey,
        exact: true,
      });
    },
    onSuccess: async (heartMoment, request) => {
      // Revoke the persistent snapshot before any refetch:
      // the privacy transition must not depend on a follow-up GET succeeding,
      // and a shared HeartMoment that just became PRIVATE must not remain
      // available as a stale IndexedDB record if that refetch never lands.
      await deleteProductReadCacheEntry(
        request.accountId,
        request.spaceId,
        'heartMoment',
        request.current.id,
      );
      if (!request.isCurrent()) return;
      const current = queryClient.getQueryData<
        ProductReadResult<HeartMomentDetail>
      >(request.queryKey);
      if (!current) return;
      const published = current.value.version < heartMoment.version;
      if (published)
        queryClient.setQueryData(request.queryKey, {
          value: heartMoment,
          source: 'network',
        });
      if (!request.isCurrent()) return;
      await Promise.all([
        invalidateStoryProjections(queryClient, request.spaceId),
        queryClient.invalidateQueries({
          queryKey: [
            'comments',
            request.spaceId,
            'heartMoment',
            request.current.id,
          ],
        }),
        published
          ? queryClient.invalidateQueries({
              queryKey: request.queryKey,
              exact: true,
            })
          : Promise.resolve(),
        invalidateDashboard(queryClient, request.spaceId),
      ]);
    },
  });

  const deleteMutation = useStoryDeletion<HeartMomentDetail>({
    active: mode === 'edit',
    accountId: currentAccountId,
    spaceId,
    resourceId: heartMomentId,
    kind: 'heartMoment',
    version: heartMomentQuery.data?.value.version,
    queryKey,
    mutationKey: deleteKey,
    conflictingMutationKeys: [updateKey, visibilityMutationKey.slice(0, 4)],
    execute: (heartMoment) =>
      apis.heartMoments.deleteHeartMoment({
        spaceId,
        heartMomentId: heartMoment.id,
        ifMatch: String(heartMoment.version),
      }),
    onDeleted: () => navigate(appRoutePath('story'), { replace: true }),
  });
  const { confirming: confirmDelete, setConfirming: setConfirmDelete } =
    deleteMutation;

  const editorLifecycle = useTaskEditorLifecycle({
    isActive: mode !== 'detail',
    isDirty:
      !deleteMutation.isPending &&
      (formDirty ||
        Boolean(createPlace) ||
        Boolean(createLocation) ||
        photos.items.some((item) => item.draft !== undefined) ||
        Boolean(voice.draft)),
    isCloseBlocked:
      createMutation.isPending ||
      updateMutation.isPending ||
      placePending ||
      attachments.hasPending ||
      voice.hasPending,
    onClose: () => {
      if (mode === 'create') requestReturn(originKey);
      else if (heartMomentId)
        navigate(heartMomentDetailPath(heartMomentId), {
          replace: true,
          state: { taskOriginKey: originKey },
        });
    },
  });
  if (mode === 'create') {
    function submitCreate(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (
        voice.hasPending ||
        voice.hasFailed ||
        attachments.hasPending ||
        attachments.items.some((item) => item.status === 'failed') ||
        placePending ||
        sourceLoading ||
        createMutation.isPending
      )
        return;
      const data = new FormData(event.currentTarget);
      const happenedOn = String(data.get('happenedOn') || '');
      if (!happenedOn) return;
      const text = String(data.get('text') || '').trim();
      const tags = tagEditorRef.current?.commitDraft();
      if (!tags) return;
      if (!text && !tags.length && !combinedEntries.length) {
        setCreateContentError(true);
        return;
      }
      setCreateContentError(false);
      createMutation.mutate({
        values: {
          text,
          tags,
          ...(createLocation
            ? { location: createLocation }
            : createPlace
              ? createVisibility === ContentVisibility.SHARED
                ? { placeId: createPlace.id }
                : { location: locationFromPlace(createPlace) }
              : {}),
          emotion: String(data.get('emotion')) as HeartEmotionValue,
          happenedOn: new Date(`${happenedOn}T00:00:00Z`),
          visibility: String(data.get('visibility')) as ContentVisibilityValue,
          attachments: combinedEntries,
          ...(voice.hasAudio
            ? {
                audioTitle: voice.title.trim(),
                audioSpeakerName: voice.speaker.trim(),
              }
            : {}),
          selectedCoverAttachmentId: photos.selectedCoverAttachmentId,
        },
        isCurrent: captureCreateOwnership(),
      });
    }

    return (
      <StoryCreatePageShell
        header={
          <header className="heart-moment-create-header">
            <div className="heart-moment-create-topline">
              <TaskBackButton
                className="heart-moment-create-back"
                onClick={editorLifecycle.requestClose}
              />
            </div>
            <div className="heart-moment-create-title-lockup">
              <span className="heart-moment-create-heart" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <title>{t('heartMomentProduct.createHeading')}</title>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              </span>
              <h1 id="heart-moment-create-heading">
                {t('heartMomentProduct.createHeading')}
              </h1>
            </div>
          </header>
        }
        pageClassName="heart-moment-create-page"
        cardClassName="heart-moment-create-card"
        labelledBy="heart-moment-create-heading"
      >
        <>
          <DraftExitPrompt
            open={editorLifecycle.showDiscardConfirm}
            onKeep={editorLifecycle.keepEditing}
            onDiscard={() => editorLifecycle.closeConfirmed()}
          />
          {sourceLoading ? (
            <p role="status">{t('m5s3.planStory.loadingSource')}</p>
          ) : null}
          {sourcePlan.error ? (
            <ProblemState
              error={sourcePlan.error}
              onRetry={() => void sourcePlan.refetch()}
            />
          ) : null}
          {sourcePlace.error ? (
            <ProblemState
              error={sourcePlace.error}
              onRetry={() => void sourcePlace.refetch()}
            />
          ) : null}
          <form
            onChange={() => setFormDirty(true)}
            onSubmit={submitCreate}
            className="immersive-create-form heart-moment-create-form"
          >
            <NativeDateField
              id="heart-moment-date"
              name="happenedOn"
              label={t('heartMomentProduct.happenedOnLabel')}
              required
              value={createDate}
              onChange={(event) => setCreateDate(event.target.value)}
              openPickerOnClick
              fieldClassName="heart-moment-create-field heart-moment-create-date"
            />
            <div className="heart-moment-create-media">
              <PlanPhotosEditor
                controller={photos}
                spaceId={spaceId}
                parentType="HEART_MOMENT"
                disabled={createMutation.isPending}
                canUpload
                onChange={() => setFormDirty(true)}
                photoSourceContext={{
                  apiBaseUrl,
                  accessToken,
                  accountId: currentAccountId,
                }}
              />
            </div>

            <VoiceNoteEditor
              voice={voice}
              apis={apis}
              spaceId={spaceId}
              disabled={createMutation.isPending}
              onChange={() => setFormDirty(true)}
            />
            <div className="field-group heart-moment-create-field heart-moment-create-note">
              <label htmlFor="heart-moment-text">
                {t('heartMomentProduct.textLabel')}
              </label>
              <textarea
                id="heart-moment-text"
                name="text"
                value={createText}
                onChange={(event) => setCreateText(event.target.value)}
                rows={4}
                maxLength={4000}
                placeholder={t('heartMomentProduct.textPlaceholder')}
                className="immersive-create-title-multiline"
              />
            </div>

            {createVisibility === ContentVisibility.PRIVATE ||
            createLocation ? (
              <HeartMomentLocationField
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                accountId={currentAccountId}
                spaceId={spaceId}
                value={createLocation ?? createPlace}
                privateAudience={createVisibility === ContentVisibility.PRIVATE}
                onChange={(next) => {
                  placeManuallyChanged.current = true;
                  setCreateLocation(next);
                  setCreatePlace(undefined);
                  setFormDirty(true);
                }}
                disabled={createMutation.isPending}
                onPendingChange={setPlacePending}
              />
            ) : (
              <MomentPlaceField
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                accountId={currentAccountId}
                spaceId={spaceId}
                value={createPlace}
                onChange={(next) => {
                  placeManuallyChanged.current = true;
                  setCreatePlace(next);
                  setFormDirty(true);
                }}
                disabled={createMutation.isPending}
                onPendingChange={setPlacePending}
              />
            )}

            <div className="heart-moment-create-field-grid">
              <div className="heart-moment-create-field heart-moment-create-emotion-picker">
                <HeartEmotionPicker
                  legend={t('heartMomentProduct.emotionLabel')}
                  idPrefix="heart-moment-create-emotion"
                />
              </div>
            </div>

            <HeartMomentTagChoices editorRef={tagEditorRef} />

            <fieldset className="heart-moment-create-visibility">
              <legend>{t('heartMomentProduct.visibilityLabel')}</legend>
              <div className="heart-moment-create-visibility-options">
                <label
                  className="heart-moment-create-visibility-option"
                  htmlFor="heart-moment-create-visibility-private"
                >
                  <input
                    id="heart-moment-create-visibility-private"
                    name="visibility"
                    type="radio"
                    value={ContentVisibility.PRIVATE}
                    checked={createVisibility === ContentVisibility.PRIVATE}
                    onChange={() =>
                      setCreateVisibility(ContentVisibility.PRIVATE)
                    }
                  />
                  <VisibilityGlyph visibility="OWNER_ONLY" />
                  <span>
                    <strong>{t('heartMomentProduct.visibilityPrivate')}</strong>
                  </span>
                </label>
                <label
                  className="heart-moment-create-visibility-option"
                  htmlFor="heart-moment-create-visibility-shared"
                >
                  <input
                    id="heart-moment-create-visibility-shared"
                    name="visibility"
                    type="radio"
                    value={ContentVisibility.SHARED}
                    checked={createVisibility === ContentVisibility.SHARED}
                    onChange={() =>
                      setCreateVisibility(ContentVisibility.SHARED)
                    }
                  />
                  <VisibilityGlyph visibility="SPACE_SHARED" />
                  <span>
                    <strong>{t('heartMomentProduct.visibilityShared')}</strong>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="form-actions heart-moment-create-actions">
              <button
                type="submit"
                disabled={
                  createMutation.isPending ||
                  sourceLoading ||
                  placePending ||
                  voice.hasPending ||
                  voice.hasFailed ||
                  attachments.hasPending ||
                  attachments.items.some((item) => item.status === 'failed')
                }
              >
                {createMutation.isPending
                  ? t('heartMomentProduct.saving')
                  : t('heartMomentProduct.save')}
              </button>
              <button
                type="button"
                className="button-link secondary-link"
                onClick={editorLifecycle.requestClose}
              >
                {t('common.cancel')}
              </button>
            </div>
            {createContentError ? (
              <p role="alert">{t('heartMomentProduct.contentRequired')}</p>
            ) : null}
          </form>
          {createMutation.error ? (
            <ProblemState error={createMutation.error} />
          ) : null}
        </>
      </StoryCreatePageShell>
    );
  }

  if (!heartMomentId) {
    return (
      <UiState
        kind="error"
        title={t('states.unknown.title')}
        body={t('states.unknown.body')}
      />
    );
  }
  if (heartMomentQuery.isLoading) {
    return <UiState kind="loading" title={t('heartMomentProduct.loading')} />;
  }
  if (heartMomentQuery.error) {
    return (
      <ProblemState
        error={heartMomentQuery.error}
        onRetry={() => void heartMomentQuery.refetch()}
      />
    );
  }
  const result = heartMomentQuery.data;
  if (!result) return null;
  const heartMoment = result.value;
  const offline = result.source === 'cache';

  if (mode === 'edit') {
    if (!heartMoment.capabilities.canEdit || offline) {
      return (
        <div className="page page-reading">
          <PageHeader
            before={
              <TaskBackLink
                to={heartMomentDetailPath(heartMoment.id)}
                state={{ taskOriginKey: originKey }}
              >
                {t('taskBoundary.back')}
              </TaskBackLink>
            }
            title={t('heartMomentProduct.editHeading')}
            description={t('heartMomentProduct.editIntro')}
          />
          <UiState
            kind={offline ? 'offline' : 'permission'}
            title={
              offline
                ? t('states.offline.title')
                : t('heartMomentProduct.editNotAllowedTitle')
            }
            body={
              offline
                ? t('states.offline.body')
                : t('heartMomentProduct.editNotAllowedBody')
            }
          />
        </div>
      );
    }

    function submitEdit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (
        voice.hasPending ||
        voice.hasFailed ||
        attachments.hasPending ||
        attachments.items.some((item) => item.status === 'failed') ||
        placePending ||
        queryClient.isMutating({ mutationKey: deleteKey }) ||
        queryClient.isMutating({ mutationKey: updateKey }) ||
        queryClient.isMutating({
          mutationKey: visibilityMutationKey.slice(0, 4),
        })
      )
        return;
      const data = new FormData(event.currentTarget);
      const happenedOn = String(data.get('happenedOn') || '');
      const text = String(data.get('text') || '').trim();
      const tags = tagEditorRef.current?.commitDraft();
      if (!tags) return;
      if (!text && !tags.length && !combinedEntries.length) {
        setEditContentError(true);
        return;
      }
      setEditContentError(false);
      const update: HeartMomentUpdate = {
        ...(editLocationChanged ? { location: editLocation } : {}),
        text,
        tags,
        emotion: String(data.get('emotion')) as HeartEmotionValue,
        happenedOn: new Date(`${happenedOn}T00:00:00Z`),
        attachments: combinedEntries,
        audioTitle: voice.hasAudio ? voice.title.trim() : '',
        audioSpeakerName: voice.hasAudio ? voice.speaker.trim() : '',
        selectedCoverAttachmentId: photos.selectedCoverAttachmentId,
      };
      const ownsTask = captureEditOwnership();
      const ownsRead = captureAuthorizedQuery(queryClient, queryKey);
      updateMutation.mutate({
        current: heartMoment,
        update,
        isCurrent: () => ownsTask() && ownsRead(),
      });
    }

    return (
      <StoryEditorPageShell
        before={
          <TaskBackLink
            to={heartMomentDetailPath(heartMoment.id)}
            onClick={(event) => {
              event.preventDefault();
              editorLifecycle.requestClose();
            }}
            state={{ taskOriginKey: originKey }}
          >
            {t('taskBoundary.back')}
          </TaskBackLink>
        }
        title={t('heartMomentProduct.editHeading')}
        description={t('heartMomentProduct.editIntro')}
        sectionLabelledBy="heart-moment-edit-heading"
        sectionHeading={t('heartMomentProduct.formAria')}
      >
        <>
          <DraftExitPrompt
            open={editorLifecycle.showDiscardConfirm}
            onKeep={editorLifecycle.keepEditing}
            onDiscard={() => editorLifecycle.closeConfirmed()}
          />
          <form
            className="form-grid"
            onChange={() => setFormDirty(true)}
            onSubmit={submitEdit}
          >
            <VoiceNoteEditor
              voice={voice}
              apis={apis}
              spaceId={spaceId}
              momentId={heartMomentId}
              canManageExisting={heartMoment.capabilities.canDelete}
              disabled={updateMutation.isPending}
              onChange={() => setFormDirty(true)}
            />
            <HeartMomentFields
              heartMoment={heartMoment}
              editorRef={tagEditorRef}
            />
            {heartMoment.visibility === ContentVisibility.PRIVATE ||
            editLocation ? (
              <HeartMomentLocationField
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                accountId={currentAccountId}
                spaceId={spaceId}
                value={editLocation}
                privateAudience={
                  heartMoment.visibility === ContentVisibility.PRIVATE
                }
                onChange={(next) => {
                  setEditLocation(next);
                  setEditLocationChanged(true);
                  setFormDirty(true);
                }}
                disabled={updateMutation.isPending}
                onPendingChange={setPlacePending}
              />
            ) : null}
            {heartMoment.visibility === ContentVisibility.SHARED ? (
              <MomentPlaces
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                accountId={currentAccountId}
                spaceId={spaceId}
                targetId={heartMoment.id}
                canManage={heartMoment.capabilities.canDelete}
                kind="heart-moments"
                offline={offline}
                onNavigate={(proceed) => {
                  const ownsTask = captureEditOwnership();
                  const ownsRead = captureAuthorizedQuery(
                    queryClient,
                    queryKey,
                  );
                  editorLifecycle.requestClose(() => {
                    if (ownsTask() && ownsRead()) proceed();
                  });
                }}
              />
            ) : null}
            <PlanPhotosEditor
              controller={photos}
              spaceId={spaceId}
              planId={heartMoment.id}
              parentType="HEART_MOMENT"
              disabled={updateMutation.isPending}
              canUpload
              canManageExisting={heartMoment.capabilities.canDelete}
              onChange={() => setFormDirty(true)}
              photoSourceContext={{
                apiBaseUrl,
                accessToken,
                accountId: currentAccountId,
              }}
            />
            <div className="form-actions">
              <Link
                className="button-link secondary-link"
                to={heartMomentDetailPath(heartMoment.id)}
                state={{ taskOriginKey: originKey }}
                onClick={(event) => {
                  event.preventDefault();
                  setConfirmDelete(false);
                  editorLifecycle.requestClose();
                }}
              >
                {t('common.cancel')}
              </Link>
              <button
                type="submit"
                disabled={
                  updateMutation.isPending ||
                  placePending ||
                  voice.hasPending ||
                  voice.hasFailed ||
                  attachments.hasPending ||
                  attachments.items.some((item) => item.status === 'failed') ||
                  deleteMutation.isBlocked
                }
              >
                {updateMutation.isPending
                  ? t('heartMomentProduct.saving')
                  : t('heartMomentProduct.save')}
              </button>
            </div>
          </form>
          {updateMutation.error ? (
            <ProblemState error={updateMutation.error} />
          ) : null}
          {heartMoment.visibility === 'SHARED' ? (
            <StoryPlanningLinks
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
              accountId={currentAccountId}
              spaceId={spaceId}
              contentId={heartMoment.id}
              sourceKind="HEART_MOMENT"
              canManage={
                heartMoment.capabilities.canEdit && !updateMutation.isPending
              }
              editing
              offline={offline}
            />
          ) : null}
          {editContentError ? (
            <p role="alert">{t('heartMomentProduct.contentRequired')}</p>
          ) : null}

          {heartMoment.capabilities.canDelete && !offline ? (
            <div style={{ marginTop: 'var(--space-8)' }}>
              {!confirmDelete && !deleteMutation.isPending ? (
                <button
                  type="button"
                  className="button-link danger-link"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleteMutation.isBlocked}
                >
                  {t('heartMomentProduct.delete')}
                </button>
              ) : (
                <section
                  className="memory-danger-zone memory-delete-confirmation"
                  aria-label={t('heartMomentProduct.delete')}
                  role="alert"
                >
                  <div>
                    <h2>{t('heartMomentProduct.deleteConfirmTitle')}</h2>
                    <p>{t('heartMomentProduct.deleteConfirmBody')}</p>
                  </div>
                  <div className="memory-actions">
                    <button
                      type="button"
                      className="tertiary"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleteMutation.isPending}
                    >
                      {t('heartMomentProduct.deleteCancel')}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => deleteMutation.mutate(heartMoment)}
                      disabled={deleteMutation.isBlocked}
                    >
                      {deleteMutation.isPending
                        ? t('heartMomentProduct.deleting')
                        : t('heartMomentProduct.deleteConfirm')}
                    </button>
                  </div>
                </section>
              )}
              {deleteMutation.error ? (
                <ProblemState error={deleteMutation.error} />
              ) : null}
            </div>
          ) : null}
        </>
      </StoryEditorPageShell>
    );
  }

  const shared = heartMoment.visibility === ContentVisibility.SHARED;
  const changingVisibility = visibilityWrites > 0;
  const allMedia = heartMoment.attachments?.length
    ? heartMoment.attachments
    : heartMoment.attachment
      ? [{ ...heartMoment.attachment, position: 0 }]
      : [];
  const voiceAttachment = allMedia.find((item) => item.mediaType === 'AUDIO');
  const visualMedia = allMedia.filter((item) => item.mediaType !== 'AUDIO');

  return (
    <StoryDetailPageShell
      title={t('heartMomentProduct.detailEyebrow')}
      metadata={
        <div className="moment-metadata">
          {heartMoment.happenedOn ? (
            <MomentDate
              dateTime={heartMoment.happenedOn.toISOString().slice(0, 10)}
            >
              {formatDateOnly(heartMoment.happenedOn)}
            </MomentDate>
          ) : null}
          {heartMoment.location && !changingVisibility ? (
            <HeartMomentLocationSummary location={heartMoment.location} />
          ) : null}
          {shared && !changingVisibility ? (
            <MomentPlaces
              key={`${apiBaseUrl}:${currentAccountId}:${spaceId}:${heartMoment.id}`}
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
              accountId={currentAccountId}
              spaceId={spaceId}
              targetId={heartMoment.id}
              canManage={false}
              kind="heart-moments"
              offline={offline}
              inline
            />
          ) : null}
        </div>
      }
      pageClassName="product-detail-page heart-moment-product-page"
      titleAction={
        heartMoment.capabilities.canEdit && !offline ? (
          <StoryDetailEditLink
            to={heartMomentEditPath(heartMoment.id)}
            label={t('heartMomentProduct.edit')}
            state={{ taskOriginKey: originKey }}
          />
        ) : undefined
      }
      offline={offline}
      containerClassName="heart-moment-detail-container"
      containerDataAttributes={{ 'data-heart-emotion': heartMoment.emotion }}
    >
      {voiceAttachment ? (
        <SavedVoiceNote
          apis={apis}
          spaceId={spaceId}
          momentId={heartMoment.id}
          attachment={voiceAttachment}
          title={heartMoment.audioTitle}
          speaker={heartMoment.audioSpeakerName}
        />
      ) : null}
      {heartMoment.text ? (
        <ExpandableDescription
          text={heartMoment.text}
          scope={JSON.stringify([
            apiBaseUrl,
            currentAccountId,
            spaceId,
            heartMoment.id,
          ])}
          className="heart-moment-detail-text"
        />
      ) : null}

      <div className="heart-moment-detail-emotion">
        <HeartEmotionBadge emotion={heartMoment.emotion} variant="detail" />
      </div>

      {heartMoment.tags?.length ? (
        <ul
          className="memory-tag-summary"
          aria-label={t('heartMomentProduct.tagsLabel')}
        >
          {heartMoment.tags.map((tag) => (
            <li key={tag}>
              {(HEART_MOMENT_TAGS as readonly string[]).includes(tag)
                ? t(`heartMomentProduct.tagLabels.${tag}`)
                : tag}
            </li>
          ))}
        </ul>
      ) : null}

      {visualMedia.length ? (
        <section aria-label={t('heartMomentProduct.photoLabel')}>
          <MediaGallery
            initialMediaId={heartMoment.selectedCoverAttachmentId ?? undefined}
            items={visualMedia.map((item) => ({
              id: item.id,
              status: item.status,
              mediaType: item.mediaType,
              hasThumbnail: item.hasThumbnail,
              durationSeconds: item.durationSeconds,
              isSensitive: item.isSensitive,
            }))}
            loadMedia={(attachmentId, signal) =>
              loadAttachment(heartMoment.id, attachmentId, signal)
            }
            loadPoster={(id, signal) =>
              loadAuthorizedStoryImageResource(
                apis,
                spaceId,
                'HEART_MOMENT',
                heartMoment.id,
                id,
                { signal, variant: 'thumbnail' },
              )
            }
            loadPlayback={(id, signal) =>
              loadVideoSource(
                apis,
                spaceId,
                'HEART_MOMENT',
                heartMoment.id,
                id,
                signal,
              )
            }
            resourceScopeKey={`heart-moment:${currentAccountId}:${spaceId}:${mode}:${heartMoment.id}`}
            renderPhotoActions={(_item, openFullScreen, revealed) => (
              <>
                {revealed ? (
                  <GalleryExpandAction onOpen={openFullScreen} />
                ) : null}
                <span className="media-comment-action" ref={setCommentHost} />
              </>
            )}
          />
        </section>
      ) : null}

      {shared && !changingVisibility ? (
        <StoryPlanningLinks
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          accountId={currentAccountId}
          spaceId={spaceId}
          contentId={heartMoment.id}
          sourceKind="HEART_MOMENT"
          canManage={heartMoment.capabilities.canEdit}
          offline={offline}
        />
      ) : null}
      {visibilityMutation.error ? (
        <ProblemState error={visibilityMutation.error} />
      ) : null}

      {changingVisibility ? (
        <p className="muted" role="status">
          {t('heartMomentProduct.visibilityChanging')}
        </p>
      ) : shared ? (
        <CommentsPanel
          triggerContainer={commentHost}
          commentsApi={apis.comments}
          spaceId={spaceId}
          parentKind="heartMoment"
          parentId={heartMoment.id}
          currentAccountId={currentAccountId}
          canComment={heartMoment.capabilities.canComment}
          offline={offline}
        />
      ) : (
        <p className="muted">{t('heartMomentProduct.commentsPrivate')}</p>
      )}

      <footer className="heart-moment-provenance-footer">
        <p>
          {t('heartMomentProduct.provenanceCompact', {
            author: storyAuthorLabel(
              heartMoment.author,
              currentAccountId,
              nicknameFor,
            ),
            createdAt: formatCreatedAt(heartMoment.createdAt),
          })}
        </p>
        <VisibilityBadge
          visibility={shared ? 'SPACE_SHARED' : 'OWNER_ONLY'}
          size="small"
          variant="subtle"
          compactLabel={
            shared ? t('heartMomentProduct.sharedCompact') : undefined
          }
        />
        {heartMoment.authorId === currentAccountId && !offline ? (
          <button
            type="button"
            className="list-entry-icon-button tertiary heart-moment-visibility-action"
            aria-label={
              shared
                ? t('heartMomentProduct.makePrivate')
                : t('heartMomentProduct.makeShared')
            }
            title={
              shared
                ? t('heartMomentProduct.makePrivate')
                : t('heartMomentProduct.makeShared')
            }
            onClick={() => {
              if (
                queryClient.isMutating({ mutationKey: deleteKey }) ||
                queryClient.isMutating({
                  mutationKey: visibilityMutationKey,
                  exact: true,
                })
              )
                return;
              const key = authorSummaryQueryKeys.heartMoment(
                spaceId,
                heartMoment.id,
              );
              const isCurrent = captureAuthorizedQuery(queryClient, key);
              if (!isCurrent()) return;
              visibilityMutation.mutate({
                current: heartMoment,
                accountId: currentAccountId,
                spaceId,
                queryKey: key,
                api: apis.heartMoments,
                isCurrent,
                visibility: shared
                  ? ContentVisibility.PRIVATE
                  : ContentVisibility.SHARED,
              });
            }}
            disabled={changingVisibility || deleteMutation.isPending}
          >
            <VisibilityGlyph
              visibility={shared ? 'OWNER_ONLY' : 'SPACE_SHARED'}
            />
          </button>
        ) : null}
      </footer>
    </StoryDetailPageShell>
  );
}

function HeartMomentFields({
  heartMoment,
  editorRef,
}: {
  heartMoment?: HeartMomentDetail;
  editorRef: Ref<ContextTagEditorHandle>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <NativeDateField
        id="heart-moment-date"
        name="happenedOn"
        label={t('heartMomentProduct.happenedOnLabel')}
        required
        defaultValue={
          heartMoment ? dateInputValue(heartMoment.happenedOn) : undefined
        }
      />
      <div className="field-group">
        <label htmlFor="heart-moment-text">
          {t('heartMomentProduct.textLabel')}
        </label>
        <textarea
          id="heart-moment-text"
          name="text"
          rows={5}
          maxLength={4000}
          defaultValue={heartMoment?.text ?? ''}
          placeholder={t('heartMomentProduct.textPlaceholder')}
        />
      </div>
      <HeartMomentTagChoices
        parentId={heartMoment?.id}
        selected={heartMoment?.tags}
        editorRef={editorRef}
      />
      <HeartEmotionPicker
        legend={t('heartMomentProduct.emotionLabel')}
        defaultValue={heartMoment?.emotion ?? HeartEmotion.LOVED}
        idPrefix="heart-moment-edit-emotion"
      />
    </>
  );
}
