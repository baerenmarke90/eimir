import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import {
  DailyVibe,
  type DailyVibe as DailyVibeValue,
} from '../api/generated/models/DailyVibe';
import type { PartnerVibeProjection } from '../api/generated/models/PartnerVibeProjection';
import { dailyCheckInTodayQueryOptions } from '../client/dailyCheckIn';
import { firstNameFromDisplayName } from '../client/personalName';
import { ClientProblemError } from '../client/problemDetails';
import { postSnackbar } from '../client/snackbar';
import { refreshSpaceConfiguration } from '../client/spaceConfiguration';
import { useTranslation } from '../i18n';
import { DailyVibeIcon } from './DailyVibeIcon';
import { useDailyCheckInWrite } from './useDailyCheckInWrite';
import { ShortTaskSheet } from './ShortTaskSheet';
import './DailyVibeCheckIn.css';

const VIBE_OPTIONS = [
  {
    value: DailyVibe.GOOD,
    labelKey: 'dailyVibe.values.GOOD',
    partnerKey: 'dailyVibe.partnerVisible.GOOD',
  },
  {
    value: DailyVibe.OKAY,
    labelKey: 'dailyVibe.values.OKAY',
    partnerKey: 'dailyVibe.partnerVisible.OKAY',
  },
  {
    value: DailyVibe.STRESSED,
    labelKey: 'dailyVibe.values.STRESSED',
    partnerKey: 'dailyVibe.partnerVisible.STRESSED',
  },
  {
    value: DailyVibe.SAD,
    labelKey: 'dailyVibe.values.SAD',
    partnerKey: 'dailyVibe.partnerVisible.SAD',
  },
  {
    value: DailyVibe.NEEDS_CONNECTION,
    labelKey: 'dailyVibe.values.NEEDS_CONNECTION',
    partnerKey: 'dailyVibe.partnerVisible.NEEDS_CONNECTION',
  },
  {
    value: DailyVibe.NEEDS_SPACE,
    labelKey: 'dailyVibe.values.NEEDS_SPACE',
    partnerKey: 'dailyVibe.partnerVisible.NEEDS_SPACE',
  },
] as const;

function vibeOption(value: DailyVibeValue) {
  return VIBE_OPTIONS.find((option) => option.value === value);
}

function subscribeOnlineState(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

function onlineSnapshot(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function DailyVibeCheckIn({
  api,
  accountId,
  spaceId,
  partnerName,
  partnerNameIsResolved = false,
  configuredEnabled = false,
}: {
  api?: DailyCheckInsApi;
  accountId: string;
  spaceId: string;
  partnerName?: string;
  partnerNameIsResolved?: boolean;
  configuredEnabled?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const online = useSyncExternalStore(
    subscribeOnlineState,
    onlineSnapshot,
    () => true,
  );
  const dailyQueryOptions = dailyCheckInTodayQueryOptions(
    api,
    accountId,
    spaceId,
  );
  const dailyQuery = useQuery({
    ...dailyQueryOptions,
    enabled: dailyQueryOptions.enabled && configuredEnabled,
  });
  const [open, setOpen] = useState(false);
  const [draftVibe, setDraftVibe] = useState<DailyVibeValue | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [partnerNoteOpen, setPartnerNoteOpen] = useState(false);
  const [revealVersion, setRevealVersion] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const partnerTriggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const previousPartnerStateRef = useRef<
    PartnerVibeProjection['state'] | undefined
  >(undefined);
  const titleId = useId();

  const ownVibe = dailyQuery.data?.projection.own.vibe ?? null;
  const ownVibeNote = dailyQuery.data?.projection.own.vibeNote ?? null;
  const mutation = useDailyCheckInWrite({
    api,
    accountId,
    spaceId,
    dimension: 'vibe',
  });
  const ownPending = Boolean(mutation.pendingUpdate);
  const displayedOwnVibe = mutation.pendingUpdate?.vibe ?? ownVibe;
  const serverVibe = dailyQuery.data?.projection.vibe;
  const serverPartnerNote =
    serverVibe?.partner.state === 'VISIBLE'
      ? (serverVibe.partnerNote ?? null)
      : null;
  const personalPartnerName = partnerName
    ? partnerNameIsResolved
      ? partnerName
      : firstNameFromDisplayName(partnerName, t('dailyVibe.partnerFallback'))
    : t('dailyVibe.partnerFallback');
  const serverReportsModuleDisabled = serverVibe === null;
  useEffect(() => {
    if (!configuredEnabled || !serverReportsModuleDisabled) return;
    void refreshSpaceConfiguration(queryClient, accountId, spaceId);
  }, [
    accountId,
    configuredEnabled,
    queryClient,
    serverReportsModuleDisabled,
    spaceId,
  ]);

  useEffect(() => {
    if (partnerNoteOpen && serverPartnerNote === null) {
      setPartnerNoteOpen(false);
    }
  }, [partnerNoteOpen, serverPartnerNote]);

  const partnerAccessibleCopy = useCallback(
    (projection: PartnerVibeProjection): string => {
      const name = personalPartnerName;
      switch (projection.state) {
        case 'HIDDEN_UNTIL_SELF_CHECK_IN':
          return t('dailyVibe.partnerHiddenAria', { name });
        case 'NO_CHECK_IN':
          return t('dailyVibe.partnerNoCheckInAria', { name });
        case 'VISIBLE': {
          const option = vibeOption(projection.value);
          return option
            ? t(option.partnerKey, { name })
            : t('dailyVibe.partnerFallbackVisible', { name });
        }
      }
    },
    [personalPartnerName, t],
  );

  const previousContext = useRef(mutation.scopeId);
  useEffect(() => {
    if (previousContext.current === mutation.scopeId) return;
    previousContext.current = mutation.scopeId;
    setOpen(false);
    setPartnerNoteOpen(false);
    setDraftVibe(ownVibe);
    setDraftNote(ownVibeNote ?? '');
    previousPartnerStateRef.current = undefined;
    setAnnouncement('');
  }, [mutation.scopeId, ownVibe, ownVibeNote]);
  useEffect(() => {
    if (
      !mutation.error ||
      mutation.error.kind === 'conflict' ||
      mutation.error.code === 'SPACE_MODULE_DISABLED' ||
      mutation.error.code === 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE'
    )
      return;
    const submitted = mutation.request?.update;
    if (!submitted) return;
    if (
      submitted.vibe === null &&
      ownVibe === null &&
      mutation.isReadReady &&
      dailyQuery.data?.etag !== mutation.request?.etag
    ) {
      mutation.reset();
      setOpen(false);
      return;
    }
    setDraftVibe(submitted.vibe ?? ownVibe);
    setDraftNote(
      submitted.vibe === null
        ? (ownVibeNote ?? '')
        : (submitted.vibeNote ?? ''),
    );
    setOpen(true);
  }, [
    mutation.error,
    mutation.request,
    mutation.isReadReady,
    mutation.reset,
    dailyQuery.data?.etag,
    ownVibe,
    ownVibeNote,
  ]);
  useEffect(() => {
    if (!mutation.claimFeedback()) return;
    if (mutation.status === 'success') {
      const nextPartner = dailyQuery.data?.projection.vibe?.partner;
      if (
        previousPartnerStateRef.current === 'HIDDEN_UNTIL_SELF_CHECK_IN' &&
        nextPartner?.state === 'VISIBLE'
      ) {
        setRevealVersion((value) => value + 1);
        setAnnouncement(partnerAccessibleCopy(nextPartner));
      }
      setOpen(false);
    } else if (mutation.error?.code === 'SPACE_MODULE_DISABLED') {
      setOpen(false);
      postSnackbar('snackbar.dailyVibeModuleDisabled');
    } else if (mutation.error?.code === 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE') {
      setOpen(true);
    } else if (mutation.error?.kind === 'conflict') {
      setOpen(false);
      postSnackbar('snackbar.dailyVibeConflict');
    }
  }, [
    mutation.claimFeedback,
    mutation.status,
    mutation.error,
    dailyQuery.data,
    partnerAccessibleCopy,
  ]);

  useEffect(() => {
    if (online && !dailyQuery.isError) {
      return;
    }
    setOpen(false);
    setPartnerNoteOpen(false);
  }, [dailyQuery.isError, online]);

  if (!api || !accountId || !spaceId || !configuredEnabled) return null;

  const loading = dailyQuery.isPending && !dailyQuery.data;
  if (loading) {
    return (
      <section
        className="daily-vibe-checkin daily-vibe-loading"
        aria-labelledby={titleId}
        data-testid="daily-vibe-checkin"
      >
        <div className="daily-vibe-heading">
          <span className="today-section-kicker">{t('dailyVibe.kicker')}</span>
          <h2 id={titleId} className="today-section-title">
            {t('dailyVibe.question')}
          </h2>
          <p>{t('dailyVibe.loading')}</p>
        </div>
      </section>
    );
  }

  const authoritative =
    online && Boolean(dailyQuery.data) && !dailyQuery.isError;

  if (!authoritative || !dailyQuery.data) {
    const offline = !online;
    return (
      <section
        className="daily-vibe-checkin daily-vibe-unavailable"
        aria-labelledby={titleId}
        data-testid="daily-vibe-checkin"
      >
        <div className="daily-vibe-heading">
          <span className="today-section-kicker">{t('dailyVibe.kicker')}</span>
          <h2 id={titleId} className="today-section-title">
            {t('dailyVibe.question')}
          </h2>
          <p>
            {offline
              ? t('dailyVibe.unavailableOffline')
              : t('dailyVibe.unavailable')}
          </p>
        </div>
        {!offline ? (
          <button
            type="button"
            className="tertiary daily-vibe-retry"
            onClick={() => void dailyQuery.refetch()}
          >
            {t('dailyVibe.retry')}
          </button>
        ) : null}
      </section>
    );
  }

  const snapshot = dailyQuery.data;

  function openOwnSheet(): void {
    if (mutation.isInFlight()) return;
    if (!mutation.error) mutation.reset();
    const failed = mutation.error ? mutation.request?.update : null;
    setDraftVibe(failed?.vibe ?? ownVibe);
    setDraftNote(
      failed && failed.vibe !== null
        ? (failed.vibeNote ?? '')
        : (ownVibeNote ?? ''),
    );
    setOpen(true);
  }

  function saveDraft(): void {
    if (mutation.isInFlight() || draftVibe === null) return;
    const normalizedNote = draftNote.trim();
    const currentNote = ownVibeNote?.trim() ?? '';
    if (draftVibe === ownVibe && normalizedNote === currentNote) {
      mutation.reset();
      setOpen(false);
      return;
    }
    previousPartnerStateRef.current =
      dailyQuery.data?.projection.vibe?.partner.state;
    if (
      mutation.submit({
        vibe: draftVibe,
        vibeNote: normalizedNote.length > 0 ? normalizedNote : null,
      })
    ) {
      setAnnouncement('');
      setOpen(false);
    }
  }

  function removeVibe(): void {
    if (mutation.isInFlight()) return;
    previousPartnerStateRef.current =
      dailyQuery.data?.projection.vibe?.partner.state;
    mutation.submit({ vibe: null });
  }

  function retryDraft(): void {
    if (mutation.error && mutation.request?.update.vibe === null) removeVibe();
    else saveDraft();
  }

  if (snapshot.projection.vibe === null) {
    if (ownVibe === null) return null;
    const ownOption = vibeOption(ownVibe);
    return (
      <section
        className="daily-vibe-disabled-clear"
        aria-labelledby={titleId}
        data-testid="daily-vibe-disabled-clear"
      >
        <div>
          <h2 id={titleId}>{t('dailyVibe.disabledTitle')}</h2>
          <p>
            {t('dailyVibe.disabledBody', {
              value: ownOption ? t(ownOption.labelKey) : '',
            })}
          </p>
        </div>
        <button
          type="button"
          className="tertiary"
          disabled={mutation.isPending}
          onClick={removeVibe}
        >
          {mutation.isPending
            ? t('dailyVibe.saving')
            : t('dailyVibe.disabledRemove')}
        </button>
      </section>
    );
  }

  const ownOption = displayedOwnVibe ? vibeOption(displayedOwnVibe) : undefined;
  const ownLabel = ownOption ? t(ownOption.labelKey) : '';
  const triggerLabel = ownOption
    ? t('dailyVibe.changeAria', { value: ownLabel })
    : t('dailyVibe.chooseAria');
  const partnerProjection = snapshot.projection.vibe.partner;
  const partnerLabel = personalPartnerName;
  const partnerOption =
    partnerProjection.state === 'VISIBLE'
      ? vibeOption(partnerProjection.value)
      : undefined;
  const partnerValue =
    partnerProjection.state === 'VISIBLE'
      ? partnerOption
        ? t(partnerOption.labelKey)
        : t('dailyVibe.partnerFallbackVisible', { name: partnerLabel })
      : '';
  const partnerNote = serverPartnerNote;
  const partnerCardClass =
    'daily-vibe-person daily-vibe-partner is-visible' +
    (revealVersion > 0 ? ' is-revealed' : ' is-startup-reveal');
  const partnerCardContent = (
    <>
      <span className="daily-vibe-glyph" aria-hidden="true">
        {partnerOption ? <DailyVibeIcon value={partnerOption.value} /> : null}
      </span>
      <span className="daily-vibe-person-copy">
        <span>{partnerLabel}</span>
        <strong>{partnerValue}</strong>
      </span>
    </>
  );

  const mutationProblem =
    mutation.error instanceof ClientProblemError ? mutation.error : null;
  const contextUnavailable =
    mutationProblem?.code === 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE';
  const genericMutationError =
    Boolean(mutation.error) &&
    mutationProblem?.kind !== 'conflict' &&
    mutationProblem?.code !== 'SPACE_MODULE_DISABLED' &&
    !contextUnavailable;

  return (
    <section
      className="daily-vibe-checkin"
      aria-labelledby={titleId}
      data-testid="daily-vibe-checkin"
    >
      <div className="daily-vibe-heading">
        <span className="today-section-kicker">{t('dailyVibe.kicker')}</span>
        <h2 id={titleId} className="today-section-title">
          {t('dailyVibe.question')}
        </h2>
      </div>

      {mutation.otherPending || (ownPending && displayedOwnVibe === null) ? (
        <p className="daily-vibe-save-status" role="status">
          {mutation.otherPending
            ? t('dailyVibe.otherSaving')
            : t('dailyVibe.saving')}
        </p>
      ) : null}

      {ownOption || partnerProjection.state === 'VISIBLE' ? (
        <div className="daily-vibe-people">
          {ownOption ? (
            <button
              key={displayedOwnVibe}
              ref={triggerRef}
              type="button"
              className={`daily-vibe-person daily-vibe-own${ownPending ? ' is-pending' : ' is-startup-reveal'}`}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-disabled={mutation.isPending}
              aria-label={triggerLabel}
              data-testid="daily-vibe-own"
              onClick={() => {
                if (!mutation.isInFlight()) openOwnSheet();
              }}
            >
              <span className="daily-vibe-glyph" aria-hidden="true">
                <DailyVibeIcon value={ownOption.value} />
              </span>
              <span className="daily-vibe-person-copy">
                <span>{t('dailyVibe.you')}</span>
                <strong>{ownLabel}</strong>
                {ownPending ? (
                  <small className="daily-vibe-pending-status" role="status">
                    {t('dailyVibe.saving')}
                  </small>
                ) : null}
              </span>
            </button>
          ) : null}

          {partnerProjection.state === 'VISIBLE' ? (
            partnerNote ? (
              <button
                key={`${revealVersion}:${partnerProjection.value}`}
                ref={partnerTriggerRef}
                type="button"
                className={`${partnerCardClass} daily-vibe-partner-context`}
                data-state="VISIBLE"
                data-testid="daily-vibe-partner"
                aria-haspopup="dialog"
                aria-expanded={partnerNoteOpen}
                aria-label={t('dailyVibe.partnerContextAria', {
                  name: partnerLabel,
                  value: partnerValue,
                })}
                onClick={() => setPartnerNoteOpen(true)}
              >
                {partnerCardContent}
              </button>
            ) : (
              <div
                key={`${revealVersion}:${partnerProjection.value}`}
                className={partnerCardClass}
                data-state="VISIBLE"
                data-testid="daily-vibe-partner"
              >
                {partnerCardContent}
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {!ownOption ? (
        <button
          ref={triggerRef}
          type="button"
          className="tertiary daily-vibe-share"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={triggerLabel}
          aria-disabled={mutation.isPending}
          onClick={openOwnSheet}
        >
          {t('dailyVibe.choose')}
        </button>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      <ShortTaskSheet
        open={open}
        title={t('dailyVibe.sheetTitle')}
        closeLabel={t('dailyVibe.close')}
        onClose={() => setOpen(false)}
        initialFocusRef={firstOptionRef}
        restoreFocusRef={triggerRef}
        className="daily-vibe-sheet"
      >
        <p className="daily-vibe-sheet-intro">{t('dailyVibe.sheetIntro')}</p>
        <div className="daily-vibe-options">
          {VIBE_OPTIONS.map((option, index) => {
            const selected = draftVibe === option.value;
            return (
              <button
                key={option.value}
                ref={index === 0 ? firstOptionRef : undefined}
                type="button"
                className={`daily-vibe-option${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                disabled={mutation.isPending}
                data-vibe={option.value}
                onClick={() => {
                  if (mutation.isInFlight()) return;
                  mutation.reset();
                  setDraftVibe(option.value);
                }}
              >
                <span className="daily-vibe-option-glyph" aria-hidden="true">
                  <DailyVibeIcon value={option.value} />
                </span>
                <span>{t(option.labelKey)}</span>
              </button>
            );
          })}
        </div>

        <label className="daily-vibe-note-field">
          <span>{t('dailyVibe.noteLabel')}</span>
          <span className="daily-vibe-note-hint">
            {t('dailyVibe.noteHint')}
          </span>
          <textarea
            value={draftNote}
            maxLength={200}
            rows={3}
            disabled={mutation.isPending}
            placeholder={t('dailyVibe.notePlaceholder')}
            onChange={(event) => {
              if (mutation.isInFlight()) return;
              mutation.reset();
              setDraftNote(event.currentTarget.value);
            }}
          />
        </label>

        <div className="daily-vibe-sheet-footer">
          <span className="daily-vibe-save-status" role="status">
            {mutation.otherPending
              ? t('dailyVibe.otherSaving')
              : mutation.isPending
                ? t('dailyVibe.saving')
                : ''}
          </span>
          <div className="daily-vibe-sheet-actions">
            {ownVibe !== null ? (
              <button
                type="button"
                className="tertiary daily-vibe-remove"
                disabled={mutation.isPending}
                onClick={removeVibe}
              >
                {t('dailyVibe.remove')}
              </button>
            ) : null}
            <button
              type="button"
              className="primary daily-vibe-save"
              disabled={mutation.isPending || draftVibe === null}
              onClick={retryDraft}
            >
              {genericMutationError
                ? t('dailyVibe.retry')
                : ownVibe === null
                  ? t('dailyVibe.share')
                  : t('dailyVibe.saveChanges')}
            </button>
          </div>
        </div>

        {contextUnavailable ? (
          <p className="daily-vibe-inline-error" role="status">
            {t('dailyVibe.contextUnavailable')}
          </p>
        ) : genericMutationError ? (
          <p className="daily-vibe-inline-error" role="status">
            {t('dailyVibe.saveError')}
          </p>
        ) : null}
      </ShortTaskSheet>

      <ShortTaskSheet
        open={partnerNoteOpen}
        title={t('dailyVibe.partnerNoteTitle', { name: partnerLabel })}
        closeLabel={t('dailyVibe.partnerNoteClose')}
        onClose={() => setPartnerNoteOpen(false)}
        restoreFocusRef={partnerTriggerRef}
        className="daily-vibe-sheet daily-vibe-partner-note-sheet"
      >
        <div className="daily-vibe-partner-note-header">
          <strong>{partnerValue}</strong>
        </div>
        <blockquote className="daily-vibe-partner-note">
          {partnerNote}
        </blockquote>
      </ShortTaskSheet>
    </section>
  );
}
