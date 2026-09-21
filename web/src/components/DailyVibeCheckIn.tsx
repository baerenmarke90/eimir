import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useMemo,
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
import {
  dailyCheckInTodayQueryKey,
  dailyCheckInTodayQueryOptions,
  type DailyCheckInSnapshot,
  updateDailyCheckInToday,
} from '../client/dailyCheckIn';
import { firstNameFromDisplayName } from '../client/personalName';
import {
  ClientProblemError,
  clientProblemKind,
} from '../client/problemDetails';
import { postSnackbar } from '../client/snackbar';
import { spaceConfigurationQueryKey } from '../client/spaceConfiguration';
import { useTranslation } from '../i18n';
import { ShortTaskSheet } from './ShortTaskSheet';
import './DailyVibeCheckIn.css';

const VIBE_OPTIONS = [
  {
    value: DailyVibe.GOOD,
    labelKey: 'dailyVibe.values.GOOD',
    partnerKey: 'dailyVibe.partnerVisible.GOOD',
    glyph: '☀',
  },
  {
    value: DailyVibe.OKAY,
    labelKey: 'dailyVibe.values.OKAY',
    partnerKey: 'dailyVibe.partnerVisible.OKAY',
    glyph: '●',
  },
  {
    value: DailyVibe.STRESSED,
    labelKey: 'dailyVibe.values.STRESSED',
    partnerKey: 'dailyVibe.partnerVisible.STRESSED',
    glyph: '↯',
  },
  {
    value: DailyVibe.SAD,
    labelKey: 'dailyVibe.values.SAD',
    partnerKey: 'dailyVibe.partnerVisible.SAD',
    glyph: '☂',
  },
  {
    value: DailyVibe.NEEDS_CONNECTION,
    labelKey: 'dailyVibe.values.NEEDS_CONNECTION',
    partnerKey: 'dailyVibe.partnerVisible.NEEDS_CONNECTION',
    glyph: '♡',
  },
  {
    value: DailyVibe.NEEDS_SPACE,
    labelKey: 'dailyVibe.values.NEEDS_SPACE',
    partnerKey: 'dailyVibe.partnerVisible.NEEDS_SPACE',
    glyph: '○',
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
  configuredEnabled = false,
}: {
  api?: DailyCheckInsApi;
  accountId: string;
  spaceId: string;
  partnerName?: string;
  configuredEnabled?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const online = useSyncExternalStore(
    subscribeOnlineState,
    onlineSnapshot,
    () => true,
  );
  const queryKey = dailyCheckInTodayQueryKey(accountId, spaceId);
  const configurationKey = useMemo(
    () => spaceConfigurationQueryKey(accountId, spaceId),
    [accountId, spaceId],
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
  const [revealVersion, setRevealVersion] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const submittedVibeRef = useRef<DailyVibeValue | null | undefined>(undefined);
  const previousPartnerStateRef = useRef<
    PartnerVibeProjection['state'] | undefined
  >(undefined);
  const titleId = useId();

  const ownVibe = dailyQuery.data?.projection.own.vibe ?? null;
  const serverVibe = dailyQuery.data?.projection.vibe;
  const personalPartnerName = partnerName
    ? firstNameFromDisplayName(partnerName, t('dailyVibe.partnerFallback'))
    : t('dailyVibe.partnerFallback');
  const serverReportsModuleDisabled = serverVibe === null;
  useEffect(() => {
    if (!configuredEnabled || !serverReportsModuleDisabled) return;
    void queryClient.invalidateQueries({
      queryKey: configurationKey,
      exact: true,
      refetchType: 'active',
    });
  }, [
    configurationKey,
    configuredEnabled,
    queryClient,
    serverReportsModuleDisabled,
  ]);

  function partnerAccessibleCopy(projection: PartnerVibeProjection): string {
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
  }

  const mutation = useMutation({
    mutationFn: async (vibe: DailyVibeValue | null) => {
      const current =
        queryClient.getQueryData<DailyCheckInSnapshot>(queryKey) ??
        dailyQuery.data;
      if (!api || !current) {
        throw new ClientProblemError('unknown');
      }
      return updateDailyCheckInToday(api, spaceId, current.etag, { vibe });
    },
    onMutate: () => {
      const current =
        queryClient.getQueryData<DailyCheckInSnapshot>(queryKey) ??
        dailyQuery.data;
      previousPartnerStateRef.current = current?.projection.vibe?.partner.state;
      setAnnouncement('');
    },
    onSuccess: (snapshot) => {
      queryClient.setQueryData<DailyCheckInSnapshot>(queryKey, snapshot);
      const nextPartner = snapshot.projection.vibe?.partner;
      if (
        previousPartnerStateRef.current === 'HIDDEN_UNTIL_SELF_CHECK_IN' &&
        nextPartner?.state === 'VISIBLE'
      ) {
        setRevealVersion((current) => current + 1);
        setAnnouncement(partnerAccessibleCopy(nextPartner));
      }
      setOpen(false);
    },
    onError: async (error) => {
      const problem =
        error instanceof ClientProblemError
          ? error
          : new ClientProblemError(clientProblemKind(error));

      if (problem.code === 'SPACE_MODULE_DISABLED') {
        setOpen(false);
        postSnackbar('snackbar.dailyVibeModuleDisabled');
        await Promise.all([
          queryClient.refetchQueries({
            queryKey,
            exact: true,
            type: 'active',
          }),
          queryClient.invalidateQueries({
            queryKey: configurationKey,
            exact: true,
            refetchType: 'active',
          }),
        ]);
        return;
      }

      if (problem.code === 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE') {
        await queryClient.refetchQueries({
          queryKey,
          exact: true,
          type: 'active',
        });
        return;
      }

      if (problem.kind === 'conflict') {
        await queryClient.refetchQueries({
          queryKey,
          exact: true,
          type: 'active',
        });
        postSnackbar('snackbar.dailyVibeConflict');
      }
    },
    onSettled: () => {
      submittedVibeRef.current = undefined;
    },
  });

  useEffect(() => {
    if (online && !dailyQuery.isError && dailyQuery.fetchStatus === 'idle') {
      return;
    }
    setOpen(false);
  }, [dailyQuery.fetchStatus, dailyQuery.isError, online]);

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
          <h2 id={titleId}>{t('dailyVibe.question')}</h2>
          <p>{t('dailyVibe.loading')}</p>
        </div>
      </section>
    );
  }

  const authoritative =
    online &&
    Boolean(dailyQuery.data) &&
    !dailyQuery.isError &&
    dailyQuery.fetchStatus === 'idle';

  if (!authoritative || !dailyQuery.data) {
    const offline = !online || dailyQuery.fetchStatus === 'paused';
    return (
      <section
        className="daily-vibe-checkin daily-vibe-unavailable"
        aria-labelledby={titleId}
        data-testid="daily-vibe-checkin"
      >
        <div className="daily-vibe-heading">
          <h2 id={titleId}>{t('dailyVibe.question')}</h2>
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

  function submitVibe(value: DailyVibeValue | null): void {
    if (mutation.isPending) return;
    if (submittedVibeRef.current === value) return;
    if (value === ownVibe) {
      setOpen(false);
      return;
    }
    submittedVibeRef.current = value;
    mutation.mutate(value);
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
          onClick={() => submitVibe(null)}
        >
          {mutation.isPending
            ? t('dailyVibe.saving')
            : t('dailyVibe.disabledRemove')}
        </button>
      </section>
    );
  }

  const ownOption = ownVibe ? vibeOption(ownVibe) : undefined;
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
        <h2 id={titleId}>{t('dailyVibe.question')}</h2>
      </div>

      {ownOption || partnerProjection.state === 'VISIBLE' ? (
        <div className="daily-vibe-people">
          {ownOption ? (
            <button
              key={ownVibe}
              ref={triggerRef}
              type="button"
              className="daily-vibe-person daily-vibe-own is-startup-reveal"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={triggerLabel}
              onClick={() => {
                mutation.reset();
                setOpen(true);
              }}
            >
              <span className="daily-vibe-glyph" aria-hidden="true">
                {ownOption.glyph}
              </span>
              <span className="daily-vibe-person-copy">
                <span>{t('dailyVibe.you')}</span>
                <strong>{ownLabel}</strong>
              </span>
            </button>
          ) : null}

          {partnerProjection.state === 'VISIBLE' ? (
            <div
              key={`${revealVersion}:${partnerProjection.value}`}
              className={
                'daily-vibe-person daily-vibe-partner is-visible' +
                (revealVersion > 0
                  ? ' is-revealed'
                  : ' is-startup-reveal')
              }
              data-state="VISIBLE"
              data-testid="daily-vibe-partner"
            >
              <span className="daily-vibe-glyph" aria-hidden="true">
                {partnerOption?.glyph ?? '♡'}
              </span>
              <span className="daily-vibe-person-copy">
                <span>{partnerLabel}</span>
                <strong>{partnerValue}</strong>
              </span>
            </div>
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
          onClick={() => {
            mutation.reset();
            setOpen(true);
          }}
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
            const selected = ownVibe === option.value;
            return (
              <button
                key={option.value}
                ref={index === 0 ? firstOptionRef : undefined}
                type="button"
                className={`daily-vibe-option${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                disabled={mutation.isPending}
                data-vibe={option.value}
                onClick={() => submitVibe(option.value)}
              >
                <span className="daily-vibe-option-glyph" aria-hidden="true">
                  {option.glyph}
                </span>
                <span>{t(option.labelKey)}</span>
              </button>
            );
          })}
        </div>

        <div className="daily-vibe-sheet-footer">
          <span className="daily-vibe-save-status" role="status">
            {mutation.isPending ? t('dailyVibe.saving') : ''}
          </span>
          {ownVibe !== null ? (
            <button
              type="button"
              className="tertiary daily-vibe-remove"
              disabled={mutation.isPending}
              onClick={() => submitVibe(null)}
            >
              {t('dailyVibe.remove')}
            </button>
          ) : null}
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
    </section>
  );
}
