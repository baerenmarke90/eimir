import './PageComposerDetail.css';
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type FormEvent,
  type Ref,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
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
import {
  ComposerDateContext,
  type ComposerDateContextHandle,
} from './ComposerDateContext';
import type { ContextTagEditorHandle } from './ContextTagEditor';
import { DraftExitPrompt } from './DraftExitPrompt';
import { ExpandableDescription } from './ExpandableDescription';
import { EimirIcon } from './EimirIcon';
import {
  HeartEmotionBadge,
  HeartEmotionPicker,
  HeartEmotionSurface,
} from './HeartEmotionVisual';
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
import { PageHeader } from './PageHeader';
import { ComposerTool, ComposerToolRow } from './PageComposer';
import { ShortTaskSheet } from './ShortTaskSheet';
import { PlanPhotosEditor } from './PlanPhotosEditor';
import { ProblemState } from './ProblemState';
import { SavedVoiceNote } from './SavedVoiceNote';
import {
  ComposerHeader,
  StoryCreatePageShell,
  StoryEditorPageShell,
} from './StoryFormPageShell';
import {
  StoryPlanningLinks,
  StoryPlanningDraftLinks,
  linkDraftPlanningTargets,
  type StoryPlanningTarget,
} from './StoryPlanningLinks';
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

function resizeLead(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
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
  const [editText, setEditText] = useState('');
  useLayoutEffect(() => {
    const field =
      document.querySelector<HTMLTextAreaElement>('#heart-moment-text');
    const text = mode === 'create' ? createText : editText;
    if (field?.value === text) resizeLead(field);
  }, [createText, editText, mode]);
  const [emotion, setEmotion] = useState<HeartEmotionValue>(HeartEmotion.LOVED);
  const [createTags, setCreateTags] = useState<string[]>([]);
  const [planningTargets, setPlanningTargets] = useState<StoryPlanningTarget[]>(
    [],
  );
  const [parentSaved, setParentSaved] = useState(false);
  const confirmedCreateParent = useRef<HeartMomentDetail | null>(null);
  const confirmedCreateIntent = useRef<{
    values: HeartMomentCreateValues;
    planningTargets: StoryPlanningTarget[];
  } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scope changes invalidate a confirmed create and its frozen association intent together.
  useEffect(() => {
    confirmedCreateParent.current = null;
    confirmedCreateIntent.current = null;
    setParentSaved(false);
    setPlanningTargets([]);
  }, [apiBaseUrl, currentAccountId, spaceId, mode, location.key]);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [photoTool, setPhotoTool] = useState<HTMLSpanElement | null>(null);
  const [voiceTool, setVoiceTool] = useState<HTMLSpanElement | null>(null);
  const [placeTool, setPlaceTool] = useState<HTMLSpanElement | null>(null);
  const [tagTool, setTagTool] = useState<HTMLSpanElement | null>(null);
  const [placeContext, setPlaceContext] = useState<HTMLSpanElement | null>(
    null,
  );
  function tool(
    kind: 'photo' | 'voice' | 'place' | 'tag',
    open: () => void,
    active = false,
    disabled = false,
  ) {
    const host = {
      photo: photoTool,
      voice: voiceTool,
      place: placeTool,
      tag: tagTool,
    }[kind];
    return host
      ? createPortal(
          <ComposerTool
            icon={
              { photo: 'foto', voice: 'microphone', place: 'orte', tag: 'tag' }[
                kind
              ] as 'foto' | 'microphone' | 'orte' | 'tag'
            }
            label={t(`composer.${kind}`)}
            active={active}
            disabled={disabled}
            onClick={open}
            aria-haspopup="dialog"
          />,
          host,
        )
      : null;
  }
  function placeTrigger(
    open: () => void,
    place?: { name: string } | null,
    disabled = false,
  ) {
    return (
      <>
        {tool('place', open, Boolean(place), disabled)}
        {placeContext && place
          ? createPortal(
              <button
                type="button"
                className="composer-place-context tertiary"
                onClick={open}
                disabled={disabled}
              >
                <EimirIcon name="orte" />
                <span>{place.name}</span>
              </button>,
              placeContext,
            )
          : null}
      </>
    );
  }
  const tools = (
    <ComposerToolRow>
      <span ref={setPhotoTool} />
      <span ref={setVoiceTool} />
      <span ref={setPlaceTool} />
      <span ref={setTagTool} />
    </ComposerToolRow>
  );
  const [createDate, setCreateDate] = useState(localDateInputValue);
  const dateContextRef = useRef<ComposerDateContextHandle>(null);
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
    setEditText(moment.text ?? '');
    setEmotion(moment.emotion);
    setEditTags(moment.tags ?? []);
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
    mutationKey: [
      'heart-moment-create',
      apiBaseUrl,
      contextKey,
      mode,
      location.key,
    ],
    mutationFn: async ({
      values,
      planningTargets: selectedTargets,
      isCurrent,
    }: {
      values: HeartMomentCreateValues;
      planningTargets: StoryPlanningTarget[];
      isCurrent: () => boolean;
    }) => {
      if (!isCurrent()) throw new ClientProblemError('permission');
      const snapshot: HeartMomentCreateSnapshot = {
        spaceId,
        heartMomentCreate: values,
      };
      const saved =
        confirmedCreateParent.current ??
        (await submitCreateRequest({
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
        }));
      if (!isCurrent()) throw new ClientProblemError('permission');
      confirmedCreateParent.current = saved;
      confirmedCreateIntent.current = {
        values,
        planningTargets: selectedTargets,
      };
      setParentSaved(true);
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
      await linkDraftPlanningTargets({
        apiBaseUrl,
        accessToken,
        spaceId,
        contentId: saved.id,
        sourceKind: 'HEART_MOMENT',
        targets:
          values.visibility === ContentVisibility.SHARED ? selectedTargets : [],
        isCurrent,
      });
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
          state: { taskOriginKey: originKey, saved: true },
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
        planningTargets.length > 0 ||
        photos.items.some((item) => item.draft !== undefined) ||
        Boolean(voice.draft)),
    isCloseBlocked:
      createMutation.isPending ||
      updateMutation.isPending ||
      placePending ||
      attachments.hasPending ||
      voice.hasPending,
    onClose: () => {
      if (mode === 'create') {
        const saved = confirmedCreateParent.current;
        if (saved)
          navigate(heartMomentDetailPath(saved.id), {
            replace: true,
            state: { saved: true, taskOriginKey: originKey },
          });
        else requestReturn(originKey);
      } else if (heartMomentId)
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
      if (confirmedCreateParent.current && confirmedCreateIntent.current) {
        createMutation.mutate({
          ...confirmedCreateIntent.current,
          isCurrent: captureCreateOwnership(),
        });
        return;
      }
      if (!dateContextRef.current?.reportValidity()) return;
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
        planningTargets,
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
      <HeartEmotionSurface emotion={emotion} className="page-composer">
        <StoryCreatePageShell
          header={
            <ComposerHeader
              before={
                <TaskBackButton
                  inline
                  className="heart-moment-create-back"
                  onClick={editorLifecycle.requestClose}
                />
              }
              title={t('heartMomentProduct.createHeading')}
              titleId="heart-moment-create-heading"
              action={
                <button
                  type="submit"
                  form="heart-moment-create-form"
                  className="composer-submit"
                  data-saveable={Boolean(
                    createText.trim() || combinedEntries.length,
                  )}
                  aria-label={
                    createMutation.isPending
                      ? t('heartMomentProduct.saving')
                      : parentSaved
                        ? t('common.retry')
                        : t('heartMomentProduct.save')
                  }
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
                    : t('m5s3.common.save')}
                </button>
              }
            />
          }
          pageClassName="heart-moment-create-page quiet-composer"
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
              id="heart-moment-create-form"
              onChange={() => setFormDirty(true)}
              onSubmit={submitCreate}
              className="immersive-create-form heart-moment-create-form heart-emotion-compose"
            >
              <fieldset
                className="heart-composer-fields"
                disabled={createMutation.isPending || parentSaved}
              >
                <div className="composer-context-row">
                  <ComposerDateContext
                    ref={dateContextRef}
                    idPrefix="heart-moment-create-date"
                    name="happenedOn"
                    formId="heart-moment-create-form"
                    label={t('heartMomentProduct.happenedOnLabel')}
                    required
                    value={createDate}
                    onChange={(value) => {
                      setCreateDate(value);
                      setFormDirty(true);
                    }}
                  />
                  <span ref={setPlaceContext} />
                </div>
                <HeartVisibilityChoice
                  value={createVisibility}
                  formId="heart-moment-create-form"
                  disabled={createMutation.isPending || parentSaved}
                  onChange={(next) => {
                    setCreateVisibility(next);
                    if (next === ContentVisibility.PRIVATE)
                      setPlanningTargets([]);
                    setFormDirty(true);
                  }}
                />
                <div className="composer-content">
                  <div className="field-group heart-moment-create-field heart-moment-create-note composer-writing-surface">
                    <label htmlFor="heart-moment-text">
                      {t('heartMomentProduct.textLabel')}
                    </label>
                    <textarea
                      id="heart-moment-text"
                      name="text"
                      value={createText}
                      onChange={(event) => setCreateText(event.target.value)}
                      rows={1}
                      ref={resizeLead}
                      onInput={(event) => resizeLead(event.currentTarget)}
                      maxLength={4000}
                      placeholder={t('heartMomentProduct.textPlaceholder')}
                      className="immersive-create-title-multiline composer-lead"
                    />
                  </div>

                  <div className="heart-moment-create-field-grid">
                    <div className="heart-moment-create-emotion-picker">
                      <HeartEmotionPicker
                        legend={t('heartMomentProduct.emotionLabel')}
                        idPrefix="heart-moment-create-emotion"
                        onChange={setEmotion}
                      />
                    </div>
                  </div>

                  <div className="heart-moment-create-media">
                    <PlanPhotosEditor
                      presentation="tools"
                      pageWideDrop
                      mediaTrigger={(open) =>
                        tool(
                          'photo',
                          open,
                          photos.items.length > 0,
                          createMutation.isPending || parentSaved,
                        )
                      }
                      controller={photos}
                      spaceId={spaceId}
                      parentType="HEART_MOMENT"
                      disabled={createMutation.isPending || parentSaved}
                      canUpload
                      onChange={() => setFormDirty(true)}
                      photoSourceContext={{
                        apiBaseUrl,
                        accessToken,
                        accountId: currentAccountId,
                      }}
                    />
                  </div>
                </div>
                <VoiceNoteEditor
                  voice={voice}
                  apis={apis}
                  spaceId={spaceId}
                  disabled={createMutation.isPending || parentSaved}
                  presentation="composer"
                  renderTrigger={(open) =>
                    tool(
                      'voice',
                      open,
                      voice.hasAudio,
                      createMutation.isPending,
                    )
                  }
                  onChange={() => setFormDirty(true)}
                />
                <div className="composer-enrichment">
                  {createVisibility === ContentVisibility.PRIVATE ||
                  createLocation ? (
                    <HeartMomentLocationField
                      apiBaseUrl={apiBaseUrl}
                      accessToken={accessToken}
                      accountId={currentAccountId}
                      spaceId={spaceId}
                      value={createLocation ?? createPlace}
                      showSelection={false}
                      renderTrigger={(open) =>
                        placeTrigger(
                          open,
                          createLocation ?? createPlace,
                          createMutation.isPending || parentSaved,
                        )
                      }
                      privateAudience={
                        createVisibility === ContentVisibility.PRIVATE
                      }
                      onChange={(next) => {
                        placeManuallyChanged.current = true;
                        setCreateLocation(next);
                        setCreatePlace(undefined);
                        setFormDirty(true);
                      }}
                      disabled={createMutation.isPending || parentSaved}
                      onPendingChange={setPlacePending}
                    />
                  ) : (
                    <MomentPlaceField
                      apiBaseUrl={apiBaseUrl}
                      accessToken={accessToken}
                      accountId={currentAccountId}
                      spaceId={spaceId}
                      value={createPlace}
                      showSelection={false}
                      renderTrigger={(open) =>
                        placeTrigger(
                          open,
                          createPlace,
                          createMutation.isPending || parentSaved,
                        )
                      }
                      onChange={(next) => {
                        placeManuallyChanged.current = true;
                        setCreatePlace(next);
                        setFormDirty(true);
                      }}
                      disabled={createMutation.isPending || parentSaved}
                      onPendingChange={setPlacePending}
                    />
                  )}

                  <HeartMomentTagChoices
                    presentation="composer"
                    disabled={createMutation.isPending || parentSaved}
                    editorRef={tagEditorRef}
                    renderTrigger={(open) =>
                      tool(
                        'tag',
                        open,
                        createTags.length > 0,
                        createMutation.isPending || parentSaved,
                      )
                    }
                    onChange={(next) => {
                      setCreateTags(next);
                      setFormDirty(true);
                    }}
                    onDraftChange={() => setFormDirty(true)}
                  />
                </div>
                {createVisibility === ContentVisibility.SHARED &&
                (createText.trim() ||
                  combinedEntries.length > 0 ||
                  planningTargets.length > 0) ? (
                  <StoryPlanningDraftLinks
                    apiBaseUrl={apiBaseUrl}
                    accessToken={accessToken}
                    accountId={currentAccountId}
                    spaceId={spaceId}
                    sourceKind="HEART_MOMENT"
                    targets={planningTargets}
                    onChange={(targets) => {
                      setPlanningTargets(targets);
                      setFormDirty(true);
                    }}
                    disabled={createMutation.isPending || parentSaved}
                  />
                ) : null}
                {createContentError ? (
                  <p role="alert">{t('heartMomentProduct.contentRequired')}</p>
                ) : null}
              </fieldset>
            </form>
            {tools}
            {createMutation.error ? (
              <>
                <ProblemState error={createMutation.error} />
                {parentSaved ? (
                  <p role="status">{t('composer.planSavedLinkFailed')}</p>
                ) : null}
              </>
            ) : null}
          </>
        </StoryCreatePageShell>
      </HeartEmotionSurface>
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
      if (!dateContextRef.current?.reportValidity()) return;
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
      <HeartEmotionSurface emotion={emotion} className="page-composer">
        <StoryEditorPageShell
          pageComposer={false}
          quiet
          before={
            <TaskBackLink
              inline
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
          headerAction={
            <button
              type="submit"
              form="heart-moment-edit-form"
              className="composer-submit"
              data-saveable={Boolean(editText.trim() || combinedEntries.length)}
              aria-label={
                updateMutation.isPending
                  ? t('heartMomentProduct.saving')
                  : t('heartMomentProduct.save')
              }
              disabled={
                updateMutation.isPending ||
                visibilityWrites > 0 ||
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
                : t('m5s3.common.save')}
            </button>
          }
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
              id="heart-moment-edit-form"
              className="form-grid heart-emotion-compose"
              onChange={() => setFormDirty(true)}
              onSubmit={submitEdit}
            >
              <HeartMomentFields
                heartMoment={heartMoment}
                dateContextRef={dateContextRef}
                onDateChange={() => setFormDirty(true)}
                onEmotionChange={setEmotion}
                text={editText}
                onTextChange={setEditText}
                placeContext={<span ref={setPlaceContext} />}
                visibility={
                  <HeartVisibilityChoice
                    value={heartMoment.visibility}
                    readOnly={heartMoment.authorId !== currentAccountId}
                    disabled={
                      updateMutation.isPending ||
                      visibilityWrites > 0 ||
                      deleteMutation.isPending
                    }
                    onChange={(visibility) => {
                      if (
                        queryClient.isMutating({ mutationKey: updateKey }) ||
                        queryClient.isMutating({ mutationKey: deleteKey }) ||
                        queryClient.isMutating({
                          mutationKey: visibilityMutationKey,
                          exact: true,
                        })
                      )
                        return;
                      const isCurrent = captureAuthorizedQuery(
                        queryClient,
                        queryKey,
                      );
                      if (!isCurrent()) return;
                      visibilityMutation.mutate({
                        current: heartMoment,
                        visibility,
                        accountId: currentAccountId,
                        spaceId,
                        queryKey,
                        api: apis.heartMoments,
                        isCurrent,
                      });
                    }}
                  />
                }
              >
                <PlanPhotosEditor
                  presentation="tools"
                  pageWideDrop
                  mediaTrigger={(open) =>
                    tool(
                      'photo',
                      open,
                      photos.items.length > 0,
                      updateMutation.isPending,
                    )
                  }
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
                <VoiceNoteEditor
                  voice={voice}
                  apis={apis}
                  spaceId={spaceId}
                  momentId={heartMomentId}
                  canManageExisting={heartMoment.capabilities.canDelete}
                  disabled={updateMutation.isPending}
                  presentation="composer"
                  renderTrigger={(open) =>
                    tool(
                      'voice',
                      open,
                      voice.hasAudio,
                      updateMutation.isPending,
                    )
                  }
                  onChange={() => setFormDirty(true)}
                />
              </HeartMomentFields>
              {heartMoment.visibility === ContentVisibility.PRIVATE ||
              editLocation ? (
                <HeartMomentLocationField
                  apiBaseUrl={apiBaseUrl}
                  accessToken={accessToken}
                  accountId={currentAccountId}
                  spaceId={spaceId}
                  value={editLocation}
                  showSelection={false}
                  renderTrigger={(open) => (
                    <>
                      {heartMoment.visibility === ContentVisibility.PRIVATE
                        ? tool(
                            'place',
                            open,
                            Boolean(editLocation),
                            updateMutation.isPending,
                          )
                        : null}
                      {placeContext && editLocation
                        ? createPortal(
                            <button
                              type="button"
                              className="composer-place-context tertiary"
                              onClick={open}
                              disabled={updateMutation.isPending}
                            >
                              <EimirIcon name="orte" />
                              <span>{editLocation.name}</span>
                            </button>,
                            placeContext,
                          )
                        : null}
                    </>
                  )}
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
                  showSelection={false}
                  renderTrigger={(open) =>
                    tool(
                      'place',
                      open,
                      Boolean(editLocation),
                      updateMutation.isPending,
                    )
                  }
                  renderSelection={(places, open) =>
                    placeContext && places.length
                      ? createPortal(
                          <button
                            type="button"
                            className="composer-place-context tertiary"
                            onClick={open}
                          >
                            <EimirIcon name="orte" />
                            <span>
                              {places[0].name}
                              {places.length > 1
                                ? ` +${places.length - 1}`
                                : ''}
                            </span>
                          </button>,
                          placeContext,
                        )
                      : null
                  }
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
              <HeartMomentTagChoices
                presentation="composer"
                renderTrigger={(open) =>
                  tool(
                    'tag',
                    open,
                    editTags.length > 0,
                    updateMutation.isPending,
                  )
                }
                onChange={(tags) => {
                  setEditTags(tags);
                  setFormDirty(true);
                }}
                onDraftChange={() => setFormDirty(true)}
                parentId={heartMoment.id}
                selected={heartMoment.tags}
                editorRef={tagEditorRef}
              />
            </form>
            {tools}
            {visibilityMutation.error ? (
              <ProblemState error={visibilityMutation.error} />
            ) : null}
            {visibilityWrites > 0 ? (
              <p role="status">{t('heartMomentProduct.visibilityChanging')}</p>
            ) : null}
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
                presentation="composer"
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
      </HeartEmotionSurface>
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

  const orderedVisualMedia = heartMoment.selectedCoverAttachmentId
    ? [
        ...visualMedia.filter(
          (item) => item.id === heartMoment.selectedCoverAttachmentId,
        ),
        ...visualMedia.filter(
          (item) => item.id !== heartMoment.selectedCoverAttachmentId,
        ),
      ]
    : visualMedia;
  const saved = Boolean((location.state as { saved?: boolean } | null)?.saved);
  return (
    <HeartEmotionSurface
      emotion={heartMoment.emotion}
      className="heart-moment-read-page"
    >
      <div className="page page-reading story-reading product-detail-page heart-moment-product-page page-composer-detail quiet-composer">
        <ComposerHeader
          before={
            <TaskBackButton
              inline
              onClick={() => requestReturn(originKey, appRoutePath('story'))}
            />
          }
          title={t('heartMomentProduct.detailEyebrow')}
          action={
            heartMoment.capabilities.canEdit && !offline ? (
              <Link
                className="button-link tertiary story-detail-edit-text"
                to={heartMomentEditPath(heartMoment.id)}
                state={{ taskOriginKey: originKey }}
              >
                {t('heartMomentProduct.edit')}
              </Link>
            ) : undefined
          }
        />
        {saved ? (
          <p className="composer-saved-status" role="status">
            <EimirIcon name="check" />
            {t('m5s3.common.saved')}
          </p>
        ) : null}
        {offline ? (
          <p className="inline-message" role="status">
            {t('offlineCache.banner')}
          </p>
        ) : null}
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
          <VisibilityBadge
            visibility={shared ? 'SPACE_SHARED' : 'OWNER_ONLY'}
            size="small"
            variant="subtle"
          />
        </div>
        <div
          className="heart-moment-detail-container"
          data-heart-emotion={heartMoment.emotion}
        >
          <article className="story-surface product-detail-card coffee-table-layout">
            <div className="heart-moment-detail-emotion">
              <HeartEmotionBadge
                emotion={heartMoment.emotion}
                variant="detail"
              />
            </div>
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
            {visualMedia.length ? (
              <section aria-label={t('heartMomentProduct.photoLabel')}>
                <MediaGallery
                  presentation="composer"
                  initialMediaId={
                    heartMoment.selectedCoverAttachmentId ?? undefined
                  }
                  items={orderedVisualMedia.map((item) => ({
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
                      <span
                        className="media-comment-action"
                        ref={setCommentHost}
                      />
                    </>
                  )}
                />
              </section>
            ) : null}

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
                presentation="handoff"
              />
            ) : null}
            {changingVisibility ? (
              <p className="muted" role="status">
                {t('heartMomentProduct.visibilityChanging')}
              </p>
            ) : shared ? (
              <CommentsPanel
                inlineComposer
                triggerContainer={commentHost}
                commentsApi={apis.comments}
                spaceId={spaceId}
                parentKind="heartMoment"
                parentId={heartMoment.id}
                currentAccountId={currentAccountId}
                canComment={heartMoment.capabilities.canComment}
                offline={offline}
              />
            ) : null}

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
            </footer>
          </article>
        </div>
      </div>
    </HeartEmotionSurface>
  );
}

function HeartMomentFields({
  children,
  heartMoment,
  dateContextRef,
  onDateChange,
  onEmotionChange,
  text,
  onTextChange,
  placeContext,
  visibility,
}: {
  text: string;
  onTextChange: (value: string) => void;
  onEmotionChange: (emotion: HeartEmotionValue) => void;
  placeContext: ReactNode;
  visibility: ReactNode;
  children: ReactNode;
  heartMoment?: HeartMomentDetail;
  dateContextRef: Ref<ComposerDateContextHandle>;
  onDateChange: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="composer-context-row">
        <ComposerDateContext
          ref={dateContextRef}
          idPrefix="heart-moment-edit-date"
          name="happenedOn"
          formId="heart-moment-edit-form"
          label={t('heartMomentProduct.happenedOnLabel')}
          required
          defaultValue={
            heartMoment ? dateInputValue(heartMoment.happenedOn) : undefined
          }
          onChange={onDateChange}
        />
        {placeContext}
      </div>
      {visibility}
      <div className="composer-content">
        <div className="field-group composer-writing-surface">
          <label htmlFor="heart-moment-text">
            {t('heartMomentProduct.textLabel')}
          </label>
          <textarea
            id="heart-moment-text"
            name="text"
            rows={1}
            ref={resizeLead}
            onInput={(event) => resizeLead(event.currentTarget)}
            maxLength={4000}
            value={text}
            onChange={(event) => onTextChange(event.currentTarget.value)}
            className="composer-lead"
            placeholder={t('heartMomentProduct.textPlaceholder')}
          />
        </div>
        <HeartEmotionPicker
          onChange={onEmotionChange}
          legend={t('heartMomentProduct.emotionLabel')}
          defaultValue={heartMoment?.emotion ?? HeartEmotion.LOVED}
          idPrefix="heart-moment-edit-emotion"
        />
        {children}
      </div>
    </>
  );
}

function HeartVisibilityChoice({
  value,
  onChange,
  disabled = false,
  formId,
  readOnly = false,
}: {
  readOnly?: boolean;
  value: ContentVisibilityValue;
  onChange: (value: ContentVisibilityValue) => void;
  disabled?: boolean;
  formId?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (readOnly)
    return <VisibilityBadge visibility={value} size="small" variant="subtle" />;
  return (
    <div className="composer-audience">
      {formId ? (
        <input type="hidden" name="visibility" form={formId} value={value} />
      ) : null}
      <button
        ref={trigger}
        type="button"
        className="heart-visibility-pill tertiary"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t('heartMomentProduct.visibilityLabel')}: ${t(value === ContentVisibility.PRIVATE ? 'heartMomentProduct.visibilityPrivate' : 'heartMomentProduct.visibilityShared')}`}
        onClick={() => setOpen(true)}
      >
        <VisibilityGlyph visibility={value} />
        <span>
          {t(
            value === ContentVisibility.PRIVATE
              ? 'heartMomentProduct.visibilityPrivate'
              : 'heartMomentProduct.visibilityShared',
          )}
        </span>
        <EimirIcon name="chevron-right" />
      </button>
      <ShortTaskSheet
        open={open}
        title={t('heartMomentProduct.visibilityLabel')}
        className="composer-audience-sheet"
        onClose={() => setOpen(false)}
        restoreFocusRef={trigger}
        isCloseBlocked={disabled}
      >
        <fieldset
          className="heart-moment-create-visibility"
          disabled={disabled}
        >
          <legend className="sr-only">
            {t('heartMomentProduct.visibilityLabel')}
          </legend>
          <div className="heart-moment-create-visibility-options">
            {[ContentVisibility.PRIVATE, ContentVisibility.SHARED].map(
              (visibility) => (
                <label
                  key={visibility}
                  className="heart-moment-create-visibility-option"
                >
                  <input
                    type="radio"
                    name="heart-visibility-choice"
                    aria-label={t(
                      visibility === ContentVisibility.PRIVATE
                        ? 'heartMomentProduct.visibilityPrivate'
                        : 'heartMomentProduct.visibilityShared',
                    )}
                    value={visibility}
                    checked={value === visibility}
                    onChange={(event) => {
                      event.stopPropagation();
                      onChange(visibility);
                      setOpen(false);
                    }}
                  />
                  <VisibilityGlyph visibility={visibility} />
                  <span>
                    <strong>
                      {t(
                        visibility === ContentVisibility.PRIVATE
                          ? 'heartMomentProduct.visibilityPrivate'
                          : 'heartMomentProduct.visibilityShared',
                      )}
                    </strong>
                    <span>
                      {t(
                        visibility === ContentVisibility.PRIVATE
                          ? 'heartMomentProduct.privateHelp'
                          : 'heartMomentProduct.sharedHelp',
                      )}
                    </span>
                  </span>
                </label>
              ),
            )}
          </div>
        </fieldset>
      </ShortTaskSheet>
    </div>
  );
}
