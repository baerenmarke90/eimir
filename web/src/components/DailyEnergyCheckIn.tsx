import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CSSProperties,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { PartnerEnergyProjection } from '../api/generated/models/PartnerEnergyProjection';
import {
  dailyCheckInTodayQueryKey,
  dailyCheckInTodayQueryOptions,
  type DailyCheckInSnapshot,
  updateDailyCheckInToday,
} from '../client/dailyCheckIn';
import {
  ClientProblemError,
  clientProblemKind,
} from '../client/problemDetails';
import { postSnackbar } from '../client/snackbar';
import { spaceConfigurationQueryKey } from '../client/spaceConfiguration';
import { useTranslation } from '../i18n';
import './DailyEnergyCheckIn.css';

export const DAILY_ENERGY_LEVELS = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
] as const;
export type DailyEnergyLevel = (typeof DAILY_ENERGY_LEVELS)[number];

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

function BatteryIcon({ value }: { value: number | null }) {
  const fillWidth = value === null ? 0 : Math.max(1.5, (15 * value) / 100);
  return (
    <svg
      className="daily-energy-battery-icon"
      viewBox="0 0 24 14"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="daily-energy-battery-shell" x="1" y="2" width="19" height="10" rx="2" />
      <rect className="daily-energy-battery-tip" x="21" y="5" width="2" height="4" rx="1" />
      {value !== null ? (
        <rect
          className="daily-energy-battery-fill"
          x="3"
          y="4"
          width={fillWidth}
          height="6"
          rx="1"
        />
      ) : null}
    </svg>
  );
}

function PartnerEnergyState({
  projection,
  partnerName,
}: {
  projection: PartnerEnergyProjection;
  partnerName?: string;
}) {
  const { t } = useTranslation();

  const label = partnerName
    ? t('dailyEnergy.partnerLabel', { name: partnerName })
    : t('dailyEnergy.partnerFallback');

  switch (projection.state) {
    case 'VISIBLE':
      return (
        <div
          className="daily-energy-partner"
          role="status"
          aria-label={t('dailyEnergy.partnerStateAria')}
          data-testid="daily-energy-partner"
        >
          <span>{label}</span>
          <strong>{t('dailyEnergy.percentage', { value: projection.value })}</strong>
        </div>
      );
    case 'NO_CHECK_IN':
      return (
        <div
          className="daily-energy-partner"
          role="status"
          aria-label={t('dailyEnergy.partnerStateAria')}
          data-testid="daily-energy-partner"
        >
          <span>{label}</span>
          <span>{t('dailyEnergy.noCheckIn')}</span>
        </div>
      );
    case 'HIDDEN_UNTIL_SELF_CHECK_IN':
      return (
        <div
          className="daily-energy-partner daily-energy-partner-hidden"
          role="status"
          aria-label={t('dailyEnergy.partnerStateAria')}
          data-testid="daily-energy-partner"
        >
          <strong>{t('dailyEnergy.hiddenTitle')}</strong>
          <span>{t('dailyEnergy.hiddenBody')}</span>
        </div>
      );
  }
}

export function DailyEnergyCheckIn({
  api,
  accountId,
  spaceId,
  partnerName,
}: {
  api?: DailyCheckInsApi;
  accountId: string;
  spaceId: string;
  partnerName?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const online = useSyncExternalStore(
    subscribeOnlineState,
    onlineSnapshot,
    () => true,
  );
  const queryKey = dailyCheckInTodayQueryKey(accountId, spaceId);
  const configurationKey = spaceConfigurationQueryKey(accountId, spaceId);
  const dailyQuery = useQuery(
    dailyCheckInTodayQueryOptions(api, accountId, spaceId),
  );
  const [open, setOpen] = useState(false);
  const [draftEnergy, setDraftEnergy] = useState<DailyEnergyLevel>(50);
  const [draftTouched, setDraftTouched] = useState(false);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const submittedEnergyRef = useRef<DailyEnergyLevel | null | undefined>(
    undefined,
  );
  const dialogId = useId();
  const dialogTitleId = useId();

  const serverReportsModuleDisabled =
    dailyQuery.data?.projection.energy === null;
  const ownEnergy = dailyQuery.data?.projection.own.energyLevel ?? null;

  useEffect(() => {
    if (!serverReportsModuleDisabled) return;
    void queryClient.invalidateQueries({
      queryKey: spaceConfigurationQueryKey(accountId, spaceId),
      exact: true,
      refetchType: 'active',
    });
  }, [accountId, queryClient, serverReportsModuleDisabled, spaceId]);

  const mutation = useMutation({
    mutationFn: async (energyLevel: DailyEnergyLevel | null) => {
      const current =
        queryClient.getQueryData<DailyCheckInSnapshot>(queryKey) ??
        dailyQuery.data;
      if (!api || !current) {
        throw new ClientProblemError('unknown');
      }
      return updateDailyCheckInToday(api, spaceId, current.etag, {
        energyLevel,
      });
    },
    onSuccess: (snapshot) => {
      queryClient.setQueryData<DailyCheckInSnapshot>(queryKey, snapshot);
      setDraftTouched(false);
    },
    onError: async (error) => {
      const problem =
        error instanceof ClientProblemError
          ? error
          : new ClientProblemError(clientProblemKind(error));

      if (problem.code === 'SPACE_MODULE_DISABLED') {
        setModuleDisabled(true);
        setOpen(false);
        postSnackbar('snackbar.dailyEnergyModuleDisabled');
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
        postSnackbar('snackbar.dailyEnergyConflict');
      }
    },
    onSettled: () => {
      submittedEnergyRef.current = undefined;
    },
  });

  useEffect(() => {
    if (mutation.isPending) return;
    if (ownEnergy !== null) {
      setDraftEnergy(ownEnergy as DailyEnergyLevel);
      return;
    }
    if (!open) {
      setDraftEnergy(50);
      setDraftTouched(false);
    }
  }, [mutation.isPending, open, ownEnergy]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      badgeRef.current?.focus();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (moduleDisabled || serverReportsModuleDisabled) return null;

  const loading = dailyQuery.isPending && !dailyQuery.data;
  const authoritative =
    online &&
    Boolean(dailyQuery.data) &&
    !dailyQuery.isError &&
    dailyQuery.fetchStatus === 'idle';

  if (loading) {
    return (
      <div className="daily-energy-checkin">
        <button
          type="button"
          className="daily-energy-badge daily-energy-badge-loading"
          disabled
          aria-label={t('dailyEnergy.loading')}
        >
          <BatteryIcon value={null} />
          <span aria-hidden="true">…</span>
        </button>
      </div>
    );
  }

  if (!authoritative || !dailyQuery.data) {
    const offline = !online || dailyQuery.fetchStatus === 'paused';
    return (
      <div className="daily-energy-checkin">
        <button
          type="button"
          className="daily-energy-badge daily-energy-badge-unavailable"
          disabled={offline}
          onClick={offline ? undefined : () => void dailyQuery.refetch()}
          aria-label={
            offline
              ? t('dailyEnergy.unavailableOffline')
              : t('dailyEnergy.unavailable')
          }
        >
          <BatteryIcon value={null} />
          <span>{t('dailyEnergy.badgePrompt')}</span>
        </button>
      </div>
    );
  }

  const snapshot = dailyQuery.data;
  const mutationProblem =
    mutation.error instanceof ClientProblemError ? mutation.error : null;
  const contextUnavailable =
    mutationProblem?.code === 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE';
  const showGenericMutationError =
    Boolean(mutation.error) &&
    mutationProblem?.kind !== 'conflict' &&
    mutationProblem?.code !== 'SPACE_MODULE_DISABLED' &&
    !contextUnavailable;

  const displayedBadge = ownEnergy === null
    ? t('dailyEnergy.badgePrompt')
    : t('dailyEnergy.percentage', { value: ownEnergy });
  const badgeAria = ownEnergy === null
    ? t('dailyEnergy.badgeAriaEmpty')
    : t('dailyEnergy.badgeAriaValue', { value: ownEnergy });
  const progress = ((draftEnergy - 10) / 90) * 100;
  const sliderStyle = {
    '--daily-energy-progress': `${progress}%`,
  } as CSSProperties;

  function submitEnergy(value: DailyEnergyLevel | null): void {
    if (mutation.isPending) return;
    if (submittedEnergyRef.current === value) return;
    if (value === ownEnergy) return;
    submittedEnergyRef.current = value;
    mutation.mutate(value);
  }

  function updateDraft(value: number): void {
    setDraftEnergy(value as DailyEnergyLevel);
    setDraftTouched(true);
  }

  return (
    <div className="daily-energy-checkin" ref={rootRef}>
      <button
        ref={badgeRef}
        type="button"
        className="daily-energy-badge"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={badgeAria}
        onClick={() => setOpen((current) => !current)}
      >
        <BatteryIcon value={ownEnergy} />
        <span>{displayedBadge}</span>
      </button>

      {open ? (
        <div
          id={dialogId}
          className="daily-energy-popover"
          role="dialog"
          aria-labelledby={dialogTitleId}
          data-testid="daily-energy-popover"
        >
          <div className="daily-energy-popover-heading">
            <div>
              <strong id={dialogTitleId}>{t('dailyEnergy.popoverTitle')}</strong>
              <span>{t('dailyEnergy.question')}</span>
            </div>
            <strong className="daily-energy-current-value">
              {ownEnergy === null && !draftTouched
                ? t('dailyEnergy.notSet')
                : t('dailyEnergy.percentage', { value: draftEnergy })}
            </strong>
          </div>

          <label className="sr-only" htmlFor={`daily-energy-slider-${spaceId}`}>
            {ownEnergy === null
              ? t('dailyEnergy.selectLegend')
              : t('dailyEnergy.changeLegend')}
          </label>
          <input
            id={`daily-energy-slider-${spaceId}`}
            className="daily-energy-slider"
            type="range"
            min={10}
            max={100}
            step={10}
            value={draftEnergy}
            disabled={mutation.isPending}
            style={sliderStyle}
            aria-valuetext={t('dailyEnergy.optionAria', { value: draftEnergy })}
            onChange={(event) => updateDraft(Number(event.currentTarget.value))}
            onPointerUp={() => submitEnergy(draftEnergy)}
            onBlur={() => submitEnergy(draftEnergy)}
          />

          <div className="daily-energy-scale" aria-hidden="true">
            <span>10 %</span>
            <span>100 %</span>
          </div>

          <div className="daily-energy-popover-actions">
            <span
              id="daily-energy-save-status"
              className="daily-energy-save-status"
              role="status"
              aria-live="polite"
            >
              {mutation.isPending ? t('dailyEnergy.saving') : ''}
            </span>
            {ownEnergy !== null ? (
              <button
                type="button"
                className="tertiary daily-energy-remove"
                disabled={mutation.isPending}
                onClick={() => submitEnergy(null)}
              >
                {t('dailyEnergy.remove')}
              </button>
            ) : null}
          </div>

          {contextUnavailable ? (
            <div className="daily-energy-inline-error" role="status">
              {t('dailyEnergy.contextUnavailable')}
            </div>
          ) : showGenericMutationError ? (
            <div className="daily-energy-inline-error" role="status">
              {t('dailyEnergy.saveError')}
            </div>
          ) : null}

          {snapshot.projection.energy ? (
            <PartnerEnergyState
              projection={snapshot.projection.energy.partner}
              partnerName={partnerName}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
