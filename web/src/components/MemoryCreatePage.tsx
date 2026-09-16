import { useQueryClient } from '@tanstack/react-query';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
} from '../client/memoryAttachmentDraft';
import {
  type ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { createReferenceApis } from '../client/referenceFlow';
import { memoryDetailPath } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useAttachmentDrafts } from '../client/useAttachmentDrafts';
import { useEditorHistoryEntry } from '../client/useEditorHistoryEntry';
import { resolvedLocale, useTranslation } from '../i18n';
import { AttachmentDraftPicker } from './AttachmentDraftPicker';
import { DestinationIcon } from './DestinationIcon';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
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
  const [happenedOn, setHappenedOn] = useState(initialDate);
  const [invalidDate, setInvalidDate] = useState(false);
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<ClientProblemError | null>(null);
  const [offlineAttempt, setOfflineAttempt] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [partial, setPartial] = useState<MemoryAttachmentBindingError | null>(
    null,
  );
  const [showDiscard, setShowDiscard] = useState(false);
  const discardDestinationRef = useRef<'timeline' | null>(null);
  const confirmRef = useRef<ShortTaskSheetHandle>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const owner = useRef({ active: true, pending: false });
  useEffect(() => {
    const session = owner.current;
    session.active = true;
    return () => {
      session.active = false;
    };
  }, []);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);
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
  const attachments = useAttachmentDrafts({
    apis,
    apiBaseUrl,
    accessToken,
    spaceId,
    accountId,
    maxAttachments: MAX_MEMORY_ATTACHMENTS,
  });
  const dirty = Boolean(
    title || body || attachments.items.length || happenedOn !== initialDate,
  );
  const hasUserContent = Boolean(
    title.trim() || body.trim() || attachments.items.length,
  );
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
  const closeTask = useEditorHistoryEntry({
    isDirty: dirty || uncertain || Boolean(partial),
    isCloseBlocked: pending,
    onDiscardRequested: () => setShowDiscard(true),
    onClose,
  });
  function requestClose() {
    if (owner.current.pending) return;
    discardDestinationRef.current = null;
    if (dirty || uncertain || partial) setShowDiscard(true);
    else closeTask();
  }
  useEffect(() => {
    if (!dirty && !pending && !uncertain && !partial) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, pending, uncertain, partial]);

  function openResult(memory: MemoryDetail, photosUnconfirmed = false) {
    if (!owner.current.active || exitAction.current) return;
    owner.current.pending = true;
    setPending(true);
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

  async function save() {
    if (
      !hasUserContent ||
      owner.current.pending ||
      uncertain ||
      attachments.hasPending ||
      attachments.items.some((item) => item.status === 'failed')
    )
      return;
    if (!navigator.onLine) {
      setOfflineAttempt(true);
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
    const snapshot = {
      title: title.trim()
        ? title
        : t('memoryProduct.createFallbackTitle', {
            date: formatDateInputValue(date, resolvedLocale()),
          }),
      body,
      happenedOn: submittedDate,
    };
    const attachmentIds = [...attachments.readyIds];
    const session = owner.current;
    session.pending = true;
    setPending(true);
    setProblem(null);
    setOfflineAttempt(false);
    try {
      const memory = partial
        ? await completeMemoryAttachmentBinding(
            apis,
            spaceId,
            partial.memory,
            partial.attachmentIds,
            true,
          )
        : (
            await createMemoryWithReadyAttachments(
              apis,
              spaceId,
              snapshot,
              attachmentIds,
            )
          ).memory;
      if (!session.active) return;
      openResult(memory);
    } catch (error) {
      if (!session.active) return;
      if (error instanceof MemoryAttachmentBindingError) {
        setPartial(error);
        setProblem(await normalizeClientError(error.cause));
      } else {
        const normalized = await normalizeClientError(error);
        if (!session.active) return;
        setProblem(normalized);
        // A transport/server failure after POST does not establish non-creation.
        if (['offline', 'server', 'unknown'].includes(normalized.kind))
          setUncertain(true);
      }
    } finally {
      if (!exitAction.current) {
        session.pending = false;
        if (session.active) setPending(false);
      }
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }
  return (
    <div className="page page-reading create-page memory-task-page">
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
          eyebrow={t('memory.eyebrow')}
          title={t('memory.heading')}
          description={t('memory.intro')}
          className="create-heading"
        />
      </div>

      <section
        className="immersive-create-card eimir-motion-reveal"
        aria-labelledby="memory-form-heading"
      >
        <h2 id="memory-form-heading" className="sr-only">
          {t('memory.formAria')}
        </h2>
        <form onSubmit={submit} className="immersive-create-form">
          <fieldset
            className="memory-task-fields"
            disabled={pending || Boolean(partial) || uncertain}
          >
            <legend className="sr-only">{t('memory.formAria')}</legend>

            <div className="immersive-create-media">
              <AttachmentDraftPicker
                id="memory-create-images"
                attachments={attachments}
                multiple
              />
            </div>

            <div className="field-group immersive-create-narrative">
              <label htmlFor="body">{t('memory.bodyLabel')}</label>
              <textarea
                id="body"
                name="body"
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                  const field = event.target;
                  field.style.height = 'auto';
                  field.style.height = `${field.scrollHeight}px`;
                }}
                rows={2}
                placeholder={t('memory.bodyPlaceholder')}
              />
            </div>

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
                pending ||
                uncertain ||
                attachments.hasPending ||
                attachments.items.some((item) => item.status === 'failed')
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
            {t('taskBoundary.pending')}
          </p>
        ) : null}
        {attachments.items.some((item) => item.status === 'failed') ? (
          <p role="alert">{t('taskBoundary.failedPhotos')}</p>
        ) : null}
        {offlineAttempt ? (
          <p role="alert">{t('taskBoundary.offline')}</p>
        ) : null}
        {uncertain ? (
          <section className="inline-message" role="alert">
            <h2>{t('taskBoundary.uncertainTitle')}</h2>
            <p>{t('taskBoundary.uncertainBody')}</p>
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
          </section>
        ) : partial ? (
          <section className="inline-message" role="alert">
            <h2>{t('taskBoundary.partialTitle')}</h2>
            <p>{t('taskBoundary.partialBody')}</p>
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
            setShowDiscard(false);
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
                setShowDiscard(false);
                discardDestinationRef.current = null;
              }}
            >
              {t('taskBoundary.keepEditing')}
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                const checkTimeline =
                  discardDestinationRef.current === 'timeline';
                confirmRef.current?.closeForNavigation(() => {
                  setShowDiscard(false);
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
      </section>
    </div>
  );
}
