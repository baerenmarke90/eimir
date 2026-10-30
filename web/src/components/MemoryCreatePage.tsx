import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { PlansApi } from '../api/generated/apis/PlansApi';
import { Configuration } from '../client/apiConfiguration';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import { MAX_MEMORY_ATTACHMENTS } from '../client/attachmentLimits';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import {
  dateInputValueToApiDate,
  effectiveDateInputValue,
  formatDateInputValue,
  formatDateSummary,
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
import { createReferenceApis } from '../client/referenceFlow';
import { memoryDetailPath } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useAttachmentDrafts } from '../client/useAttachmentDrafts';
import { useMemoryDiaryDraft } from '../client/useMemoryDiaryDraft';
import { recoverSelectedPhoto } from '../client/recoverSelectedPhoto';
import {
  memoryOnlyPhotoDescriptor,
  selectedPhotoUnavailable,
} from '../client/selectedMediaRetention';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { resolvedLocale, useTranslation } from '../i18n';
import { AttachmentDraftPicker } from './AttachmentDraftPicker';
import type { ContextTagEditorHandle } from './ContextTagEditor';
import { DestinationIcon } from './DestinationIcon';
import { type MemoryTag, MemoryTagChoices } from './MemoryTagChoices';
import { PageHeader } from './PageHeader';
import { PhotoSourcePicker } from './PhotoSourcePicker';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { StoryCreatePageShell } from './StoryFormPageShell';
import './MemoryCreatePage.css';

/** One in-memory task. Account/Space/entry keys are supplied by the route owner. */
export function MemoryCreatePage({
  accessToken,
  apiBaseUrl,
  spaceId,
  accountId,
  onSaved,
}: {
  accessToken: string;
  apiBaseUrl: string;
  spaceId: string;
  accountId: string;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { requestReturn } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const [initialDate] = useState(localDateInputValue);
  const [title, setTitle] = useState(() => searchParams.get('title') ?? '');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<MemoryTag[]>([]);
  const [tagDraftDirty, setTagDraftDirty] = useState(false);
  const [tagDraftText, setTagDraftText] = useState('');
  const [happenedOn, setHappenedOn] = useState(initialDate);
  const [invalidDate, setInvalidDate] = useState(false);
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const tagEditorRef = useRef<ContextTagEditorHandle>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
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
  const recoveryScope = JSON.stringify([apiBaseUrl, accountId, spaceId]);
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
  useEffect(() => {
    if (!dateEditorOpen) return;
    const field = dateInputRef.current;
    field?.focus();
    try {
      field?.showPicker?.();
    } catch {
      // Some browsers reject showPicker() outside a trusted gesture; the
      // focused native input remains fully usable via the keyboard.
    }
  }, [dateEditorOpen]);
  const apis = useMemo(
    () => createReferenceApis(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const sourceCandidate = (
    location.state as {
      sourcePlan?: {
        id?: unknown;
        spaceId?: unknown;
        accountId?: unknown;
        instance?: unknown;
      };
    } | null
  )?.sourcePlan;
  const sourcePlanId =
    sourceCandidate?.spaceId === spaceId &&
    sourceCandidate.accountId === accountId &&
    sourceCandidate.instance === apiBaseUrl &&
    typeof sourceCandidate.id === 'string'
      ? sourceCandidate.id
      : null;
  const plansApi = useMemo(
    () =>
      new PlansApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );
  const sourcePlan = useQuery({
    queryKey: [
      'memory-source-plan',
      apiBaseUrl,
      accountId,
      spaceId,
      sourcePlanId,
    ],
    enabled: Boolean(sourcePlanId),
    retry: false,
    queryFn: async ({ signal }) => {
      if (!sourcePlanId) throw new Error('No source Plan selected.');
      try {
        return await plansApi.getPlan(
          { spaceId, planId: sourcePlanId },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });
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
    title ||
      body ||
      tags.length ||
      tagDraftDirty ||
      attachments.items.length ||
      happenedOn !== initialDate,
  );
  const hasUserContent = Boolean(
    title.trim() || body.trim() || attachments.items.length,
  );
  const draftSnapshot = useMemo<MemoryDiaryDraft>(
    () => ({
      title,
      body,
      tags,
      tagDraft: tagDraftText,
      happenedOn,
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
    [title, body, tags, tagDraftText, happenedOn, attachments.items],
  );
  const diaryDraft = useMemoryDiaryDraft({
    apiBaseUrl,
    accountId,
    spaceId,
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
    setBody(source.description ?? '');
    if (source.experiencedOn)
      setHappenedOn(source.experiencedOn.toISOString().slice(0, 10));
    setDetailsOpen(true);
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
      setTitle(draft.title);
      setBody(draft.body);
      setTags(draft.tags);
      setTagDraftText(draft.tagDraft ?? '');
      setTagDraftDirty(Boolean(draft.tagDraft));
      setHappenedOn(draft.happenedOn);
      setDetailsOpen(
        Boolean(draft.title || draft.tags.length || draft.tagDraft),
      );
      attachments.restore(files);
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

  // null when happenedOn cannot be parsed (e.g. an out-of-range year the
  // native date input accepted via direct keyboard entry): the editable
  // input stays shown rather than risking a throw from the summary format.
  const dateSummaryText = useMemo(() => {
    try {
      return formatDateSummary(
        effectiveDateInputValue(happenedOn),
        resolvedLocale(),
      );
    } catch {
      return null;
    }
  }, [happenedOn]);
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

  async function openResult(memory: MemoryDetail, photosUnconfirmed = false) {
    if (!owner.current.active || exitAction.current) return;
    owner.current.pending = true;
    setPending(true);
    await diaryDraft.clear();
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
    if (
      !hasUserContent ||
      diaryDraft.recovery ||
      diaryDraft.status === 'conflict' ||
      owner.current.pending ||
      uncertain ||
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
          );
        },
        { verification: false },
      );
      return;
    }
    const date = effectiveDateInputValue(happenedOn);
    let submittedDate: Date;
    try {
      submittedDate = dateInputValueToApiDate(date);
    } catch {
      // No request has started: retain an editable draft, never an uncertain save.
      setInvalidDate(true);
      setDateEditorOpen(true);
      dateInputRef.current?.focus();
      return;
    }
    setInvalidDate(false);
    setDeletedAfterSave(false);
    // One identity per user-initiated save; it is reused only to verify an
    // unknown outcome of this exact snapshot.
    const attempt = {
      ...startMemoryCreateAttempt(
        {
          title: title.trim()
            ? title
            : t('memoryProduct.createFallbackTitle', {
                date: formatDateInputValue(date, resolvedLocale()),
              }),
          body,
          tags: [...(submittedTags ?? tags)],
          happenedOn: submittedDate,
        },
        [...attachments.readyIds],
      ),
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
        if (metadata.status === 'READY') continue;
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
    const verifiedAttempt = { ...attempt, attachmentIds: recovered.ids };
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
      attempt.snapshot,
      recovered.ids,
      {
        idempotencyKey: attempt.idempotencyKey,
        reconcile,
        attachmentSensitivity: attempt.attachmentSensitivity,
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
    void save();
  }
  return (
    <StoryCreatePageShell
      header={
        <div ref={headingRef} tabIndex={-1} className="memory-task-heading">
          <PageHeader
            before={
              <button
                type="button"
                className="back-link tertiary"
                onClick={requestClose}
                aria-disabled={pending}
              >
                {t('taskBoundary.close')}
              </button>
            }
            title={t('memory.heading')}
            className="create-heading"
          />
        </div>
      }
      pageClassName="memory-task-page"
      labelledBy="memory-form-heading"
    >
      <>
        <h2 id="memory-form-heading" className="sr-only">
          {t('memory.formAria')}
        </h2>
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
        <form onSubmit={submit} className="immersive-create-form">
          <fieldset
            className="memory-task-fields"
            disabled={
              pending ||
              Boolean(partial) ||
              uncertain ||
              Boolean(diaryDraft.recovery)
            }
          >
            <legend className="sr-only">{t('memory.formAria')}</legend>

            <div className="field-group immersive-create-date-field">
              <span id="happenedOn-label">{t('memory.dateLabel')}</span>
              {dateEditorOpen || dateSummaryText === null ? (
                <input
                  ref={dateInputRef}
                  id="happenedOn"
                  aria-labelledby="happenedOn-label"
                  aria-invalid={invalidDate || undefined}
                  aria-describedby={
                    invalidDate ? 'memory-date-error' : undefined
                  }
                  name="happenedOn"
                  type="date"
                  value={happenedOn}
                  onChange={(event) => {
                    setHappenedOn(event.target.value);
                    setInvalidDate(false);
                  }}
                  onBlur={() => setDateEditorOpen(false)}
                />
              ) : (
                <button
                  type="button"
                  className="immersive-create-date-summary"
                  aria-labelledby="happenedOn-label happenedOn-summary-value happenedOn-summary-change"
                  onClick={() => setDateEditorOpen(true)}
                >
                  <span id="happenedOn-summary-value">{dateSummaryText}</span>
                  <span
                    id="happenedOn-summary-change"
                    className="immersive-create-date-change"
                  >
                    {t('memory.dateChangeAction')}
                  </span>
                </button>
              )}
              {invalidDate ? (
                <p id="memory-date-error" role="alert">
                  {t('taskBoundary.invalidDate')}
                </p>
              ) : null}
              <p className="field-help">{t('memory.dateHelp')}</p>
            </div>

            <div className="field-group immersive-create-narrative">
              <label htmlFor="body">{t('memory.bodyLabel')}</label>
              <textarea
                ref={bodyInputRef}
                id="body"
                name="body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={6}
                placeholder={t('memory.bodyPlaceholder')}
              />
            </div>

            <div className="immersive-create-media">
              <AttachmentDraftPicker
                id="memory-create-images"
                attachments={attachments}
                multiple
              />
              <PhotoSourcePicker
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                accountId={accountId}
                spaceId={spaceId}
                remaining={Math.max(
                  0,
                  MAX_MEMORY_ATTACHMENTS - attachments.items.length,
                )}
                beginSelection={attachments.beginSelection}
              />
            </div>

            <details
              className="memory-diary-details"
              open={detailsOpen}
              onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
            >
              <summary>{t('memory.diary.optionalDetails')}</summary>
              <MemoryTagChoices
                editorRef={tagEditorRef}
                selected={tags}
                onChange={setTags}
                onDraftChange={setTagDraftDirty}
                draftValue={tagDraftText}
                onDraftValueChange={setTagDraftText}
              />

              <div className="field-group immersive-create-title-field">
                <label htmlFor="title">{t('memory.titleLabelOptional')}</label>
                <input
                  id="title"
                  name="title"
                  maxLength={200}
                  placeholder={t('memory.titlePlaceholder')}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="immersive-create-title-input"
                />
              </div>
            </details>
            <div
              className="sharing-note immersive-sharing-note"
              role="note"
              aria-label={t('memory.visibilityAria')}
            >
              <span className="sharing-icon" aria-hidden="true">
                <DestinationIcon icon="people" />
              </span>
              <div>
                <strong>{t('memory.sharedTitle')}</strong>
                <p>{t('memory.sharedBody')}</p>
              </div>
            </div>
          </fieldset>
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
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              onClick={requestClose}
              aria-disabled={pending}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={
                !hasUserContent ||
                Boolean(diaryDraft.recovery) ||
                diaryDraft.status === 'conflict' ||
                pending ||
                uncertain ||
                attachments.hasPending ||
                hasBlockingPhotoFailure
              }
            >
              {pending
                ? t('memory.saving')
                : partial
                  ? t('taskBoundary.retryPhotos')
                  : t('memory.save')}
            </button>
          </div>
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
