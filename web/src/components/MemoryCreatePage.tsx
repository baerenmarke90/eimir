import { createPortal } from 'react-dom';
import {
  StoryPlanningDraftLinks,
  linkDraftPlanningTargets,
  type StoryPlanningTarget,
} from './StoryPlanningLinks';
import { ComposerTool, ComposerToolRow } from './PageComposer';
import { EimirIcon } from './EimirIcon';
import { useQueryClient } from '@tanstack/react-query';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { ExperienceKind } from '../api/generated/models/ExperienceKind';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import { MAX_MEMORY_ATTACHMENTS } from '../client/attachmentLimits';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import {
  dateInputValueToApiDate,
  effectiveDateInputValue,
  formatDateInputValue,
  localDateInputValue,
} from '../client/dateInput';
import {
  completeMemoryAttachmentBinding,
  createMemoryWithReadyAttachments,
  MemoryAttachmentBindingError,
  uploadMemoryDraftAttachment,
} from '../client/memoryAttachmentDraft';
import {
  canStillReconcile,
  MEMORY_CREATE_RESULT_DELETED,
  type MemoryCreateAttempt,
  startMemoryCreateAttempt,
} from '../client/memoryCreateIdentity';
import type { MemoryDiaryDraft } from '../client/memoryDiaryDraft';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { recoverSelectedPhoto } from '../client/recoverSelectedPhoto';
import { createReferenceApis } from '../client/referenceFlow';
import { memoryDetailPath } from '../client/routes';
import {
  memoryOnlyPhotoDescriptor,
  selectedPhotoUnavailable,
} from '../client/selectedMediaRetention';
import { useTaskOrigin } from '../client/taskOrigin';
import { useAttachmentDrafts } from '../client/useAttachmentDrafts';
import { useMemoryDiaryDraft } from '../client/useMemoryDiaryDraft';
import { usePlanCaptureSource } from '../client/usePlanCaptureSource';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { resolvedLocale, useTranslation } from '../i18n';
import { AttachmentDraftPicker } from './AttachmentDraftPicker';
import {
  ComposerDateContext,
  type ComposerDateContextHandle,
} from './ComposerDateContext';
import type { ContextTagEditorHandle } from './ContextTagEditor';
import { type MemoryTag, MemoryTagChoices } from './MemoryTagChoices';
import type { MomentPlaceSelection } from './MomentPlaceField';
import { NativeDateField } from './NativeDateField';
import { OrderedMomentPlacesField } from './OrderedMomentPlacesField';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { ComposerHeader, StoryCreatePageShell } from './StoryFormPageShell';
import { TaskBackButton } from './TaskBackButton';
import './MemoryCreatePage.css';

/** One in-memory task. Account/Space/entry keys are supplied by the route owner. */
export function MemoryCreatePage({
  accessToken,
  apiBaseUrl,
  spaceId,
  accountId,
  onSaved,
  experienceKind,
  partnerName,
  experienceQuestion,
  experienceQuestionId,
  experienceReply,
}: {
  accessToken: string;
  apiBaseUrl: string;
  spaceId: string;
  accountId: string;
  onSaved: () => Promise<void>;
  experienceKind?: ExperienceKind;
  partnerName?: string;
  experienceQuestion?: string;
  /** Editorial key of the selected daily question, sent with a new experience. */
  experienceQuestionId?: string;
  experienceReply?: MemoryDetail;
}) {
  const { t } = useTranslation();
  const experienceName =
    experienceKind === 'HAPPINESS' ? 'happiness' : 'timeTravel';
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { requestReturn } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const [initialDate] = useState(() =>
    experienceReply?.happenedOn
      ? experienceReply.happenedOn.toISOString().slice(0, 10)
      : localDateInputValue(),
  );
  const [initialTitle] = useState(
    () => experienceQuestion ?? searchParams.get('title') ?? '',
  );
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState('');
  const [planningLinks, setPlanningLinks] = useState<StoryPlanningTarget[]>([]);
  const [linkRecoveryMemory, setLinkRecoveryMemory] = useState<MemoryDetail>();
  const [emptyContent, setEmptyContent] = useState(false);
  const [placeToolHost, setPlaceToolHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [tagToolHost, setTagToolHost] = useState<HTMLSpanElement | null>(null);
  const [placeContextHost, setPlaceContextHost] =
    useState<HTMLSpanElement | null>(null);
  const [places, setPlaces] = useState<MomentPlaceSelection[]>([]);
  const [selectedCoverKey, setSelectedCoverKey] = useState<string | null>(null);
  const [happenedUntil, setHappenedUntil] = useState('');
  const [placePending, setPlacePending] = useState(false);
  const [tags, setTags] = useState<MemoryTag[]>([]);
  const [tagDraftDirty, setTagDraftDirty] = useState(false);
  const [tagDraftText, setTagDraftText] = useState('');
  const [happenedOn, setHappenedOn] = useState(initialDate);
  const [invalidDate, setInvalidDate] = useState(false);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const tagEditorRef = useRef<ContextTagEditorHandle>(null);
  const dateInputRef = useRef<ComposerDateContextHandle>(null);
  const experienceDateRef = useRef<HTMLInputElement>(null);
  const [questionId, setQuestionId] = useState(experienceQuestionId);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<ClientProblemError | null>(null);
  const [offlineAttempt, setOfflineAttempt] = useState(false);
  // Outcome unknown: the create may or may not have committed. The attempt
  // (request identity + exact snapshot) is what makes verification safe.
  const [uncertain, setUncertain] = useState(false);
  const [verifiable, setVerifiable] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyUnavailable, setVerifyUnavailable] = useState(false);
  const [deletedAfterSave, setDeletedAfterSave] = useState(false);
  const attemptRef = useRef<MemoryCreateAttempt | null>(null);
  const recoveredDraft = useRef(false);
  const recoveryUpload = useRef<AbortController | null>(null);
  const recoveryScope = JSON.stringify([
    apiBaseUrl,
    accountId,
    spaceId,
    experienceKind,
    experienceReply?.id,
  ]);
  const recoveryScopeRef = useRef(recoveryScope);
  useLayoutEffect(() => {
    recoveryScopeRef.current = recoveryScope;
    return () => recoveryUpload.current?.abort();
  }, [recoveryScope]);
  const outcomeHeadingRef = useRef<HTMLHeadingElement>(null);
  const outcomeNoticeRef = useRef<HTMLElement>(null);
  const [partial, setPartial] = useState<MemoryAttachmentBindingError | null>(
    null,
  );
  const discardDestinationRef = useRef<'timeline' | null>(null);
  const confirmRef = useRef<ShortTaskSheetHandle>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const owner = useRef({ active: true, pending: false });
  useEffect(() => {
    const session = owner.current;
    session.active = true;
    return () => {
      session.active = false;
      recoveryUpload.current?.abort();
    };
  }, []);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  // The submit control is locked once the outcome is unknown, so keyboard and
  // screen-reader users are moved to the explanation and its next action; on
  // Compact the message would otherwise sit below the fold.
  const outcomeNoticeVisible = uncertain || deletedAfterSave;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus when the notice changes kind
  useEffect(() => {
    if (outcomeNoticeVisible) {
      outcomeHeadingRef.current?.focus();
      // The context chips make this form taller on Compact. Bring the notice
      // actions into view after moving focus to its explanation.
      outcomeNoticeRef.current?.scrollIntoView?.({ block: 'end' });
    }
  }, [outcomeNoticeVisible, verifiable, deletedAfterSave]);
  const apis = useMemo(
    () => createReferenceApis(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const {
    sourcePlanId,
    sourcePlan,
    sourcePlace,
    loading: sourceLoading,
  } = usePlanCaptureSource({
    apiBaseUrl,
    accessToken,
    spaceId,
    accountId,
  });
  const sourcePlaceApplied = useRef(false);
  const placeManuallyChanged = useRef(false);
  const sourceApplied = useRef(false);
  const attachments = useAttachmentDrafts({
    apis,
    apiBaseUrl,
    accessToken,
    spaceId,
    accountId,
    maxAttachments: MAX_MEMORY_ATTACHMENTS,
  });
  // A missing local preview must not block the exact known-created binding.
  // The retry still checks current server metadata before using these IDs.
  const hasBlockingPhotoFailure = attachments.items.some(
    (item, index) =>
      item.status === 'failed' &&
      !(
        partial &&
        partial.attachmentIds.length === attachments.items.length &&
        selectedPhotoUnavailable(item.file) &&
        item.attachmentId === partial.attachmentIds[index]
      ),
  );
  const dirty = Boolean(
    (experienceQuestion ? title !== initialTitle : title) ||
      body ||
      tags.length ||
      planningLinks.length ||
      tagDraftDirty ||
      places.length ||
      happenedUntil ||
      attachments.items.length ||
      happenedOn !== initialDate,
  );
  const hasUserContent = Boolean(
    experienceKind
      ? body.trim()
      : title.trim() || body.trim() || attachments.items.length,
  );
  const draftSnapshot = useMemo<MemoryDiaryDraft>(
    () => ({
      title,
      experienceQuestionId: questionId,
      body,
      planningLinks,
      linkRecoveryMemory,
      tags,
      tagDraft: tagDraftText,
      happenedOn,
      happenedUntil,
      places,
      selectedCoverPosition: selectedCoverKey
        ? attachments.items.findIndex((item) => item.id === selectedCoverKey)
        : null,
      files: attachments.items.map(
        ({ file, attachmentId, status, isSensitive }) => ({
          file,
          isSensitive: isSensitive ?? false,
          attachmentId:
            status === 'ready' || selectedPhotoUnavailable(file)
              ? attachmentId
              : undefined,
        }),
      ),
      attempt: null,
      partial: null,
    }),
    [
      planningLinks,
      linkRecoveryMemory,
      title,
      questionId,
      body,
      tags,
      tagDraftText,
      happenedOn,
      happenedUntil,
      places,
      selectedCoverKey,
      attachments.items,
    ],
  );
  const diaryDraft = useMemoryDiaryDraft({
    apiBaseUrl,
    accountId,
    spaceId,
    purpose: experienceReply
      ? `${experienceKind}:reply:${experienceReply.id}`
      : experienceKind,
    snapshot: draftSnapshot,
    dirty,
    suspended: pending || uncertain || Boolean(partial),
  });
  useEffect(() => {
    if (
      !sourcePlanId ||
      sourceApplied.current ||
      !sourcePlan.data ||
      diaryDraft.status === 'loading' ||
      diaryDraft.recovery ||
      recoveredDraft.current ||
      dirty ||
      pending
    )
      return;
    const source = sourcePlan.data;
    if (
      source.spaceId !== spaceId ||
      source.status !== 'COMPLETED' ||
      !source.capabilities.canEdit
    )
      return;
    sourceApplied.current = true;
    setTitle(source.title);
    setTags(source.tags ?? []);
    setBody(source.description ?? '');
    if (source.experiencedOn)
      setHappenedOn(source.experiencedOn.toISOString().slice(0, 10));
  }, [
    sourcePlanId,
    sourcePlan.data,
    diaryDraft.status,
    diaryDraft.recovery,
    dirty,
    pending,
    spaceId,
  ]);
  useLayoutEffect(() => {
    const field = bodyInputRef.current;
    if (!field || field.value !== body) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [body]);

  async function resumeDraft() {
    const draft = diaryDraft.recovery;
    if (!draft || owner.current.pending) return;
    owner.current.pending = true;
    setPending(true);
    const controller = new AbortController();
    const scope = recoveryScopeRef.current;
    recoveryUpload.current = controller;
    try {
      // Explicit Resume is the consent boundary for conservative legacy migration.
      if (!(await diaryDraft.checkpoint(draft, true)) || !owner.current.active)
        return;
      const files = [];
      for (const entry of draft.files) {
        controller.signal.throwIfAborted();
        let file = entry.file;
        try {
          file = await recoverSelectedPhoto(
            apis,
            spaceId,
            file,
            entry.attachmentId,
            controller.signal,
          );
        } catch {
          // Keep an honest missing slot and the original attachment identity.
          controller.signal.throwIfAborted();
        }
        files.push({ ...entry, file });
      }
      controller.signal.throwIfAborted();
      if (!owner.current.active || scope !== recoveryScopeRef.current) return;
      setPlanningLinks(draft.planningLinks ?? []);
      setLinkRecoveryMemory(draft.linkRecoveryMemory);
      setTitle(draft.title);
      setQuestionId(draft.experienceQuestionId);
      setBody(draft.body);
      setPlaces(draft.places ?? (draft.place ? [draft.place] : []));
      setHappenedUntil(draft.happenedUntil ?? '');
      setTags(draft.tags);
      setTagDraftText(draft.tagDraft ?? '');
      setTagDraftDirty(Boolean(draft.tagDraft));
      setHappenedOn(draft.happenedOn);
      const restoredKeys = attachments.restore(files);
      setSelectedCoverKey(
        draft.selectedCoverPosition != null
          ? (restoredKeys[draft.selectedCoverPosition] ?? null)
          : null,
      );
      recoveredDraft.current = true;
      attemptRef.current = draft.attempt;
      setUncertain(Boolean(draft.attempt));
      setVerifiable(!draft.attempt || canStillReconcile(draft.attempt));
      if (draft.partial)
        setPartial(
          new MemoryAttachmentBindingError(
            draft.partial.memory,
            draft.partial.attachmentIds,
            new Error('Restored attachment binding'),
            draft.partial.attachmentSensitivity,
            draft.partial.selectedCoverPosition,
          ),
        );
      diaryDraft.acceptRecovery();
    } catch (error) {
      if (owner.current.active && !controller.signal.aborted)
        setProblem(await normalizeClientError(error));
    } finally {
      if (recoveryUpload.current === controller) recoveryUpload.current = null;
      owner.current.pending = false;
      if (owner.current.active) setPending(false);
    }
  }

  const exitAction = useRef<(() => void) | null>(null);
  const onClose = useCallback(() => {
    if (!owner.current.active) return;
    if (exitAction.current) exitAction.current();
    else requestReturn(originKey);
  }, [originKey, requestReturn]);
  const {
    showDiscardConfirm: showDiscard,
    keepEditing: keepDiscardEditing,
    closeConfirmed: closeTask,
    requestClose: requestTaskClose,
  } = useTaskEditorLifecycle({
    isDirty: dirty || uncertain || Boolean(partial),
    isCloseBlocked: pending,
    onClose,
  });
  function requestClose() {
    if (owner.current.pending) return;
    discardDestinationRef.current = null;
    requestTaskClose();
  }

  useEffect(() => {
    if (
      !sourcePlace.data ||
      sourcePlaceApplied.current ||
      placeManuallyChanged.current ||
      diaryDraft.status === 'loading' ||
      diaryDraft.recovery ||
      recoveredDraft.current ||
      pending
    )
      return;
    sourcePlaceApplied.current = true;
    setPlaces([sourcePlace.data]);
  }, [sourcePlace.data, diaryDraft.status, diaryDraft.recovery, pending]);

  async function openResult(memory: MemoryDetail, photosUnconfirmed = false) {
    if (!owner.current.active || exitAction.current) return;
    owner.current.pending = true;
    setPending(true);
    await diaryDraft.clear();
    void queryClient.invalidateQueries({ queryKey: ['context-tags', spaceId] });
    if (!owner.current.active) return;
    queryClient.setQueryData(
      authorSummaryQueryKeys.memory(spaceId, memory.id),
      { value: memory, source: 'network' },
    );
    // Refresh is deliberately independent of the confirmed result handoff.
    void onSaved().catch(() => undefined);
    exitAction.current = () => {
      if (!owner.current.active) return;
      attachments.clear();
      navigate(memoryDetailPath(memory.id), {
        replace: true,
        state: {
          taskOriginKey: originKey,
          memorySaved: true,
          photosUnconfirmed,
          sourcePlanToLink: sourcePlanId
            ? {
                id: sourcePlanId,
                memoryId: memory.id,
                accountId,
                spaceId,
                instance: apiBaseUrl,
              }
            : undefined,
        },
      });
    };
    closeTask();
  }

  async function run(
    work: () => Promise<MemoryDetail>,
    { verification }: { verification: boolean },
  ) {
    const session = owner.current;
    session.pending = true;
    setPending(true);
    setVerifying(verification);
    setProblem(null);
    setOfflineAttempt(false);
    setVerifyUnavailable(false);
    try {
      const memory = await work();
      if (!session.active) return;
      attemptRef.current = null;
      if (!experienceKind && planningLinks.length) {
        try {
          await linkDraftPlanningTargets({
            apiBaseUrl,
            accessToken,
            spaceId,
            contentId: memory.id,
            sourceKind: 'MEMORY',
            targets: planningLinks,
            isCurrent: () => session.active,
          });
        } catch (error) {
          if (!session.active) return;
          setLinkRecoveryMemory(memory);
          setUncertain(false);
          setProblem(await normalizeClientError(error));
          await diaryDraft.checkpoint({
            ...draftSnapshot,
            attempt: null,
            linkRecoveryMemory: memory,
          });
          return;
        }
      }
      setLinkRecoveryMemory(undefined);
      await openResult(memory);
    } catch (error) {
      if (!session.active) return;
      if (error instanceof MemoryAttachmentBindingError) {
        // The Memory is confirmed (created or reconciled); only photos remain.
        attemptRef.current = null;
        setUncertain(false);
        setPartial(error);
        await diaryDraft.checkpoint({
          ...draftSnapshot,
          partial: {
            memory: error.memory,
            attachmentIds: error.attachmentIds,
            attachmentSensitivity: error.attachmentSensitivity,
            selectedCoverPosition: error.selectedCoverPosition,
          },
          attempt: null,
        });
        setProblem(await normalizeClientError(error.cause));
        return;
      }
      const normalized = await normalizeClientError(error);
      if (!session.active) return;
      if (partial) {
        // A failed metadata read cannot make a confirmed Memory unknown.
        // Keep its binding retry available without another create identity.
        setProblem(normalized);
        setUncertain(false);
        return;
      }
      const outcomeUnknown = ['offline', 'server', 'unknown'].includes(
        normalized.kind,
      );
      if (!verification) {
        setProblem(normalized);
        // A transport/server failure after POST does not establish non-creation.
        if (outcomeUnknown) setUncertain(true);
        else attemptRef.current = null;
      } else if (outcomeUnknown) {
        setVerifyUnavailable(true);
      } else if (
        normalized.kind === 'notFound' &&
        normalized.code === MEMORY_CREATE_RESULT_DELETED
      ) {
        // Confirmed saved, then deleted: nothing to recover, nothing recreated.
        attemptRef.current = null;
        setUncertain(false);
        setDeletedAfterSave(true);
      } else if (
        normalized.kind === 'validation' ||
        normalized.kind === 'conflict'
      ) {
        // The identity can never confirm this request; do not pretend it can.
        setVerifiable(false);
      } else {
        setProblem(normalized);
      }
    } finally {
      if (!exitAction.current) {
        session.pending = false;
        if (session.active) {
          setPending(false);
          setVerifying(false);
        }
      }
    }
  }

  async function save() {
    if (sourceLoading) return;
    if (!hasUserContent) {
      setEmptyContent(true);
      bodyInputRef.current?.focus();
      return;
    }
    setEmptyContent(false);
    if (linkRecoveryMemory) {
      await run(async () => linkRecoveryMemory, { verification: false });
      return;
    }
    if (
      diaryDraft.recovery ||
      diaryDraft.status === 'conflict' ||
      owner.current.pending ||
      uncertain ||
      placePending ||
      attachments.hasPending ||
      hasBlockingPhotoFailure
    )
      return;
    if (!navigator.onLine) {
      setOfflineAttempt(true);
      return;
    }
    const submittedTags = tagEditorRef.current?.commitDraft();
    if (submittedTags === null) return;
    if (partial) {
      await run(
        async () => {
          const recovered = await recoverReadyFiles(partial.attachmentIds);
          if (
            !(await diaryDraft.checkpoint({
              ...draftSnapshot,
              files: recovered.files,
              partial: {
                memory: partial.memory,
                attachmentIds: recovered.ids,
                attachmentSensitivity: partial.attachmentSensitivity,
                selectedCoverPosition: partial.selectedCoverPosition,
              },
            }))
          )
            throw new ClientProblemError(
              'validation',
              422,
              'MEMORY_DRAFT_RECOVERY_REQUIRED',
            );
          return completeMemoryAttachmentBinding(
            apis,
            spaceId,
            partial.memory,
            recovered.ids,
            true,
            partial.attachmentSensitivity,
            partial.selectedCoverPosition,
          );
        },
        { verification: false },
      );
      return;
    }
    const date = effectiveDateInputValue(happenedOn);
    let submittedDate: Date;
    let submittedUntil: Date | undefined;
    try {
      submittedDate = dateInputValueToApiDate(date);
      if (happenedUntil)
        submittedUntil = dateInputValueToApiDate(happenedUntil);
    } catch {
      // No request has started: retain an editable draft, never an uncertain save.
      setInvalidDate(true);
      if (experienceKind) experienceDateRef.current?.focus();
      else dateInputRef.current?.focus();
      return;
    }
    setInvalidDate(false);
    setDeletedAfterSave(false);
    // One identity per user-initiated save; it is reused only to verify an
    // unknown outcome of this exact snapshot.
    if (happenedUntil && happenedUntil < date) {
      setInvalidDate(true);
      dateInputRef.current?.focus('end');
      return;
    }
    const attempt = {
      ...startMemoryCreateAttempt(
        {
          title: title.trim()
            ? title
            : t('memoryProduct.createFallbackTitle', {
                date: formatDateInputValue(date, resolvedLocale()),
              }),
          body,
          experienceKind,
          ...(experienceReply
            ? {
                experienceReplyTo:
                  experienceReply.experienceRootId ?? experienceReply.id,
              }
            : {}),
          ...(experienceKind && !experienceReply && questionId
            ? { experienceQuestionId: questionId }
            : {}),
          tags: [...(submittedTags ?? tags)],
          happenedOn: submittedDate,
          ...(happenedUntil ? { happenedUntil: submittedUntil } : {}),
          placeIds: places.map((place) => place.id),
        },
        [...attachments.readyIds],
      ),
      selectedCoverPosition:
        selectedCoverKey &&
        attachments.items.some((item) => item.id === selectedCoverKey)
          ? attachments.items.findIndex((item) => item.id === selectedCoverKey)
          : null,
      attachmentSensitivity: attachments.items
        .filter((item) => item.status === 'ready')
        .map((item) => item.isSensitive === true),
    };
    attemptRef.current = attempt;
    await run(
      async () => {
        return submitAttempt(attempt, false);
      },
      { verification: false },
    );
  }
  async function recoverReadyFiles(originalIds: readonly string[]) {
    const ids = [...originalIds];
    const files = draftSnapshot.files.map((entry) => ({ ...entry }));
    if (!recoveredDraft.current) return { ids, files };
    for (const [index, draft] of attachments.items.entries()) {
      if (!owner.current.active) throw new Error('Draft task ended');
      try {
        const metadata = await apis.attachments.getAttachment({
          spaceId,
          attachmentId: ids[index],
        });
        if (
          metadata.status === 'READY' ||
          (metadata.mediaType === 'VIDEO' &&
            ['PENDING', 'PROCESSING', 'FAILED'].includes(metadata.status))
        )
          continue;
      } catch (error) {
        if ((await normalizeClientError(error)).kind !== 'notFound')
          throw error;
      }
      // Unbound server uploads expire after 60 minutes. The local File is
      // retained for seven days, so replace only a confirmed missing upload.
      if (!owner.current.active) throw new Error('Draft task ended');
      const controller = new AbortController();
      recoveryUpload.current = controller;
      let replacement: { attachmentId: string };
      try {
        replacement = await uploadMemoryDraftAttachment(
          apis,
          apiBaseUrl,
          accessToken,
          spaceId,
          draft.file,
          undefined,
          fetch,
          { signal: controller.signal, preserveMetadata: true },
        );
      } finally {
        if (recoveryUpload.current === controller)
          recoveryUpload.current = null;
      }
      if (!owner.current.active) throw new Error('Draft task ended');
      ids[index] = replacement.attachmentId;
      files[index].attachmentId = replacement.attachmentId;
      attachments.replaceReadyId(draft, replacement.attachmentId);
    }
    return { ids, files };
  }

  async function submitAttempt(
    attempt: MemoryCreateAttempt,
    reconcile: boolean,
  ) {
    // Verify the original operation first. A missing volatile File must never
    // force a new create identity or erase a Memory that already exists.
    const recovered =
      reconcile &&
      draftSnapshot.files.some(({ file }) => memoryOnlyPhotoDescriptor(file))
        ? { ids: [...attempt.attachmentIds], files: draftSnapshot.files }
        : await recoverReadyFiles(attempt.attachmentIds);
    const verifiedAttempt = {
      ...attempt,
      attachmentIds: recovered.ids,
      snapshot:
        attempt.atomicAttachments && attempt.snapshot.attachments === undefined
          ? {
              ...attempt.snapshot,
              attachments: recovered.ids.map((attachmentId, position) => ({
                attachmentId,
                position,
                isSensitive: attempt.attachmentSensitivity?.[position] ?? false,
              })),
              selectedCoverAttachmentId:
                attempt.selectedCoverPosition == null
                  ? null
                  : recovered.ids[attempt.selectedCoverPosition],
            }
          : attempt.snapshot,
    };
    attemptRef.current = verifiedAttempt;
    const allowed = await diaryDraft.checkpoint({
      ...draftSnapshot,
      files: recovered.files,
      attempt: verifiedAttempt,
    });
    if (!owner.current.active || !allowed)
      throw new ClientProblemError(
        'validation',
        422,
        'MEMORY_DRAFT_RECOVERY_REQUIRED',
      );
    return createMemoryWithReadyAttachments(
      apis,
      spaceId,
      verifiedAttempt.snapshot,
      recovered.ids,
      {
        idempotencyKey: attempt.idempotencyKey,
        reconcile,
        attachmentSensitivity: attempt.attachmentSensitivity,
        selectedCoverPosition: attempt.selectedCoverPosition,
      },
    ).then((result) => result.memory);
  }
  async function verify() {
    const attempt = attemptRef.current;
    if (!attempt || owner.current.pending || !uncertain) return;
    if (!canStillReconcile(attempt)) {
      setVerifiable(false);
      return;
    }
    if (!navigator.onLine) {
      setVerifyUnavailable(true);
      return;
    }
    await run(() => submitAttempt(attempt, true), { verification: true });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sourceLoading) return;
    void save();
  }
  const narrativeField = (
    <div className="field-group immersive-create-narrative">
      <label htmlFor="body">
        {t(
          experienceKind
            ? `coupleExperiences.write.${experienceName}`
            : 'memory.bodyLabel',
        )}
      </label>
      <textarea
        ref={bodyInputRef}
        id="body"
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={experienceKind ? 6 : 4}
        maxLength={experienceKind ? 2000 : undefined}
        placeholder={t(
          experienceKind
            ? `coupleExperiences.placeholder.${experienceName}`
            : 'memory.bodyPlaceholder',
        )}
        aria-describedby={
          experienceKind && title ? 'experience-selected-question' : undefined
        }
      />
    </div>
  );
  const saveLabel = pending
    ? t('memory.saving')
    : partial
      ? t('taskBoundary.retryPhotos')
      : experienceKind
        ? t('coupleExperiences.share', {
            name: partnerName ?? t('coupleExperiences.partner'),
          })
        : t('memory.save');
  const saveAction = (
    <button
      type="submit"
      form="memory-create-form"
      className={!experienceKind ? 'composer-save-action' : undefined}
      aria-label={saveLabel}
      data-saveable={hasUserContent}
      disabled={
        Boolean(diaryDraft.recovery) ||
        diaryDraft.status === 'conflict' ||
        pending ||
        uncertain ||
        sourceLoading ||
        placePending ||
        attachments.hasPending ||
        hasBlockingPhotoFailure
      }
    >
      {!experienceKind && !pending && !partial
        ? t('m5s3.common.save')
        : saveLabel}
    </button>
  );
  return (
    <StoryCreatePageShell
      header={
        <div ref={headingRef} tabIndex={-1} className="memory-task-heading">
          {experienceKind ? (
            <PageHeader
              before={
                <TaskBackButton
                  type="button"
                  onClick={requestClose}
                  aria-disabled={pending}
                >
                  {t('taskBoundary.close')}
                </TaskBackButton>
              }
              title={t(
                experienceKind
                  ? `coupleExperiences.entries.${experienceName}.title`
                  : 'memory.heading',
              )}
              className="create-heading"
            />
          ) : (
            <ComposerHeader
              before={
                <TaskBackButton
                  inline
                  type="button"
                  onClick={requestClose}
                  aria-disabled={pending}
                >
                  {t('taskBoundary.close')}
                </TaskBackButton>
              }
              title={t('memory.heading')}
              action={saveAction}
              className="create-heading"
            />
          )}
        </div>
      }
      pageClassName={
        experienceKind
          ? 'memory-task-page couple-experience-compose'
          : 'memory-task-page quiet-composer page-composer'
      }
      labelledBy="memory-form-heading"
    >
      <>
        <h2 id="memory-form-heading" className="sr-only">
          {t('memory.formAria')}
        </h2>
        {sourceLoading ? (
          <p role="status">{t('m5s3.planStory.loadingSource')}</p>
        ) : null}
        {sourcePlace.error ? (
          <ProblemState
            error={sourcePlace.error}
            onRetry={() => void sourcePlace.refetch()}
          />
        ) : null}
        {sourcePlanId && sourcePlan.error ? (
          <ProblemState
            error={sourcePlan.error}
            onRetry={() => void sourcePlan.refetch()}
          />
        ) : null}
        {diaryDraft.recovery ? (
          <section
            className="inline-message memory-draft-recovery"
            aria-label={t('memory.diary.resumeTitle')}
          >
            <h2>{t('memory.diary.resumeTitle')}</h2>
            <p>{t('memory.diary.resumeBody')}</p>
            {diaryDraft.recovery.legacyMedia ? (
              <p>{t('memory.diary.legacyMedia')}</p>
            ) : null}
            <div className="memory-actions">
              <button
                type="button"
                disabled={pending}
                onClick={() => void resumeDraft()}
              >
                {t('memory.diary.resume')}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={pending}
                onClick={() => void diaryDraft.discardRecovery()}
              >
                {t('memory.diary.startNew')}
              </button>
            </div>
          </section>
        ) : null}
        <form
          id="memory-create-form"
          onSubmit={submit}
          className="immersive-create-form"
        >
          <fieldset
            className="memory-task-fields"
            disabled={
              pending ||
              Boolean(partial) ||
              Boolean(linkRecoveryMemory) ||
              uncertain ||
              Boolean(diaryDraft.recovery)
            }
          >
            <legend className="sr-only">{t('memory.formAria')}</legend>

            <div className="composer-context">
              {!experienceKind ? (
                <ComposerDateContext
                  ref={dateInputRef}
                  idPrefix="happenedOn"
                  label={t('memory.dateLabel')}
                  value={happenedOn}
                  onChange={(value) => {
                    setHappenedOn(value);
                    setInvalidDate(false);
                  }}
                  allowRange
                  endValue={happenedUntil}
                  onEndChange={(value) => {
                    setHappenedUntil(value);
                    setInvalidDate(false);
                  }}
                  disabled={
                    pending ||
                    Boolean(partial) ||
                    uncertain ||
                    Boolean(diaryDraft.recovery)
                  }
                  error={
                    invalidDate &&
                    !(happenedUntil && happenedUntil < happenedOn)
                      ? t('taskBoundary.invalidDate')
                      : undefined
                  }
                  endError={
                    invalidDate && happenedUntil && happenedUntil < happenedOn
                      ? t('experiences.invalidPeriod')
                      : undefined
                  }
                />
              ) : experienceKind !== 'HAPPINESS' && !experienceReply ? (
                <NativeDateField
                  ref={experienceDateRef}
                  id="happenedOn"
                  name="happenedOn"
                  label={t('memory.dateLabel')}
                  value={happenedOn}
                  error={
                    invalidDate ? t('taskBoundary.invalidDate') : undefined
                  }
                  fieldClassName="immersive-create-date-field"
                  onChange={(event) => {
                    setHappenedOn(event.target.value);
                    setInvalidDate(false);
                  }}
                />
              ) : null}
              {!experienceKind ? (
                <span
                  ref={setPlaceContextHost}
                  className="composer-context-row"
                />
              ) : null}
            </div>
            {experienceKind && title ? (
              <section
                className="experience-selected-question"
                id="experience-selected-question"
                aria-label={t('coupleExperiences.selectedQuestion')}
              >
                <p>{title}</p>
              </section>
            ) : null}
            {experienceKind ? narrativeField : null}
            {!experienceKind ? (
              <div className="composer-content">
                <div className="immersive-create-media">
                  <AttachmentDraftPicker
                    presentation="diary"
                    pageWideDrop
                    id="memory-create-images"
                    videoContext={{ apis, accountId, spaceId }}
                    attachments={attachments}
                    selectedCoverKey={
                      selectedCoverKey &&
                      attachments.items.some(
                        (item) => item.id === selectedCoverKey,
                      )
                        ? selectedCoverKey
                        : null
                    }
                    onSelectCover={setSelectedCoverKey}
                    sourceContext={{
                      apiBaseUrl,
                      accessToken,
                      accountId,
                      spaceId,
                      remaining: Math.max(
                        0,
                        MAX_MEMORY_ATTACHMENTS - attachments.items.length,
                      ),
                      beginSelection: attachments.beginSelection,
                    }}
                    multiple
                  />
                </div>
                <div className="composer-writing-surface composer-authored-surface">
                  <div className="field-group immersive-create-title-field">
                    <label htmlFor="title">
                      {t('memory.titleLabelOptional')}
                    </label>
                    <input
                      id="title"
                      name="title"
                      maxLength={200}
                      placeholder={t('memory.titleLabelOptional')}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="immersive-create-title-input"
                    />
                  </div>
                  {narrativeField}
                </div>
              </div>
            ) : null}

            <div
              className={!experienceKind ? 'composer-enrichment' : undefined}
            >
              <OrderedMomentPlacesField
                presentation={!experienceKind ? 'composer' : 'default'}
                renderTrigger={
                  !experienceKind
                    ? (open) =>
                        placeToolHost
                          ? createPortal(
                              <ComposerTool
                                icon="orte"
                                label={t('composer.place')}
                                active={places.length > 0}
                                disabled={
                                  pending ||
                                  uncertain ||
                                  Boolean(partial) ||
                                  Boolean(diaryDraft.recovery)
                                }
                                onClick={open}
                              />,
                              placeToolHost,
                            )
                          : null
                    : undefined
                }
                renderSelection={
                  !experienceKind
                    ? (selected, open) =>
                        selected.length && placeContextHost
                          ? createPortal(
                              <button
                                type="button"
                                className="tertiary composer-place-context"
                                aria-label={t('composer.editPlace', {
                                  name: selected[0].name,
                                })}
                                onClick={open}
                              >
                                <EimirIcon name="orte" />
                                <span>
                                  {selected[0].name}
                                  {selected.length > 1
                                    ? ` +${selected.length - 1}`
                                    : ''}
                                </span>
                              </button>,
                              placeContextHost,
                            )
                          : null
                    : undefined
                }
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                accountId={accountId}
                spaceId={spaceId}
                value={places}
                onChange={(next) => {
                  placeManuallyChanged.current = true;
                  setPlaces(next);
                }}
                disabled={
                  pending ||
                  uncertain ||
                  Boolean(partial) ||
                  Boolean(diaryDraft.recovery)
                }
                onPendingChange={setPlacePending}
              />

              {!experienceKind ? (
                <MemoryTagChoices
                  presentation="composer"
                  renderTrigger={(open) =>
                    tagToolHost
                      ? createPortal(
                          <ComposerTool
                            icon="tag"
                            label={t('composer.tag')}
                            active={tags.length > 0}
                            disabled={
                              pending ||
                              uncertain ||
                              Boolean(partial) ||
                              Boolean(diaryDraft.recovery)
                            }
                            onClick={open}
                          />,
                          tagToolHost,
                        )
                      : null
                  }
                  editorRef={tagEditorRef}
                  selected={tags}
                  onChange={setTags}
                  onDraftChange={setTagDraftDirty}
                  draftValue={tagDraftText}
                  onDraftValueChange={setTagDraftText}
                  discloseEmpty
                />
              ) : null}
            </div>
            {!experienceKind && (hasUserContent || planningLinks.length > 0) ? (
              <StoryPlanningDraftLinks
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                accountId={accountId}
                spaceId={spaceId}
                targets={planningLinks}
                onChange={setPlanningLinks}
                disabled={
                  pending ||
                  uncertain ||
                  Boolean(partial) ||
                  Boolean(linkRecoveryMemory) ||
                  Boolean(diaryDraft.recovery)
                }
              />
            ) : null}
          </fieldset>
          {emptyContent ? (
            <p className="field-error" role="alert">
              {t('composer.emptyContent')}
            </p>
          ) : null}
          {linkRecoveryMemory ? (
            <div className="inline-message" role="status">
              <p>{t('composer.linkRecovery')}</p>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void run(async () => linkRecoveryMemory, {
                    verification: false,
                  })
                }
              >
                {t('common.retry')}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={pending}
                onClick={() => void openResult(linkRecoveryMemory)}
              >
                {t('taskBoundary.openSaved')}
              </button>
            </div>
          ) : null}
          {!experienceKind ? (
            <ComposerToolRow>
              <span className="composer-tool-slot" ref={setPlaceToolHost} />
              <span className="composer-tool-slot" ref={setTagToolHost} />
            </ComposerToolRow>
          ) : null}
          {dirty &&
          !diaryDraft.recovery &&
          !pending &&
          !uncertain &&
          !partial ? (
            <p className="memory-draft-status" role="status">
              {t(
                diaryDraft.status === 'unavailable' &&
                  attachments.items.some(({ file }) =>
                    memoryOnlyPhotoDescriptor(file),
                  )
                  ? 'memory.diary.draft.memoryOnlyUnavailable'
                  : diaryDraft.status === 'saved' &&
                      attachments.items.some(({ file }) =>
                        memoryOnlyPhotoDescriptor(file),
                      )
                    ? 'memory.diary.draft.memoryOnly'
                    : `memory.diary.draft.${diaryDraft.status}`,
              )}
            </p>
          ) : null}
          {experienceKind ? (
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={requestClose}
                aria-disabled={pending}
              >
                {t('common.cancel')}
              </button>
              {saveAction}
            </div>
          ) : null}
        </form>
        {pending ? (
          <p className="status" role="status" aria-live="polite">
            {verifying
              ? t('taskBoundary.verifying')
              : t('taskBoundary.pending')}
          </p>
        ) : null}
        {attachments.items.some((item) => item.status === 'failed') ? (
          <p role="alert">{t('taskBoundary.failedPhotos')}</p>
        ) : null}
        {offlineAttempt ? (
          <p role="alert">{t('taskBoundary.offline')}</p>
        ) : null}
        {uncertain ? (
          <section
            ref={outcomeNoticeRef}
            className="inline-message"
            role="alert"
          >
            <h2 ref={outcomeHeadingRef} tabIndex={-1}>
              {t(
                verifiable
                  ? 'taskBoundary.uncertainTitle'
                  : 'taskBoundary.unverifiableTitle',
              )}
            </h2>
            <p>
              {t(
                verifiable
                  ? 'taskBoundary.uncertainBody'
                  : 'taskBoundary.unverifiableBody',
              )}
            </p>
            {verifyUnavailable ? (
              <p role="status">{t('taskBoundary.verifyUnavailable')}</p>
            ) : null}
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  requestClose();
                  discardDestinationRef.current = 'timeline';
                }}
              >
                {t('taskBoundary.checkMoments')}
              </button>
              {verifiable ? (
                <button
                  type="button"
                  aria-disabled={pending}
                  onClick={() => void verify()}
                >
                  {t('taskBoundary.verify')}
                </button>
              ) : null}
            </div>
            {problem &&
            !['offline', 'server', 'unknown'].includes(problem.kind) ? (
              <ProblemState error={problem} />
            ) : null}
          </section>
        ) : partial ? (
          <section className="inline-message" role="alert">
            <h2>{t('taskBoundary.partialTitle')}</h2>
            <p>{t('taskBoundary.partialBody')}</p>
            {problem?.code === 'MEMORY_DRAFT_RECOVERY_REQUIRED' ? (
              <p>{t('memory.diary.recoveryRequired')}</p>
            ) : null}
            {problem?.kind === 'conflict' ? (
              <p>{t('states.conflict.body')}</p>
            ) : null}
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => openResult(partial.memory, true)}
            >
              {t('taskBoundary.openSaved')}
            </button>
          </section>
        ) : deletedAfterSave ? (
          <section
            ref={outcomeNoticeRef}
            className="inline-message"
            role="alert"
          >
            <h2 ref={outcomeHeadingRef} tabIndex={-1}>
              {t('taskBoundary.deletedTitle')}
            </h2>
            <p>{t('taskBoundary.deletedBody')}</p>
          </section>
        ) : problem?.code === 'MEMORY_DRAFT_RECOVERY_REQUIRED' ? (
          <p role="alert">{t('memory.diary.recoveryRequired')}</p>
        ) : problem ? (
          <ProblemState error={problem} />
        ) : null}
        <ShortTaskSheet
          ref={confirmRef}
          open={showDiscard}
          role="alertdialog"
          title={t(
            partial
              ? 'taskBoundary.partialDiscardTitle'
              : uncertain
                ? 'taskBoundary.uncertainDiscardTitle'
                : 'taskBoundary.discardTitle',
          )}
          onClose={() => {
            keepDiscardEditing();
            discardDestinationRef.current = null;
          }}
        >
          <p>
            {t(
              partial
                ? 'taskBoundary.partialDiscardBody'
                : uncertain
                  ? 'taskBoundary.uncertainDiscardBody'
                  : 'taskBoundary.discardBody',
            )}
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                keepDiscardEditing();
                discardDestinationRef.current = null;
              }}
            >
              {t('taskBoundary.keepEditing')}
            </button>
            {!partial && !uncertain && diaryDraft.status === 'saved' ? (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  confirmRef.current?.closeForNavigation(() => {
                    keepDiscardEditing();
                    closeTask();
                  });
                }}
              >
                {t('memory.diary.keepDraft')}
              </button>
            ) : null}
            <button
              type="button"
              className="danger"
              onClick={() => {
                void diaryDraft.clear();
                const checkTimeline =
                  discardDestinationRef.current === 'timeline';
                confirmRef.current?.closeForNavigation(() => {
                  keepDiscardEditing();
                  if (checkTimeline)
                    exitAction.current = () =>
                      navigate('/story?tab=timeline', { replace: true });
                  closeTask();
                });
              }}
            >
              {t('taskBoundary.discard')}
            </button>
          </div>
        </ShortTaskSheet>
      </>
    </StoryCreatePageShell>
  );
}
