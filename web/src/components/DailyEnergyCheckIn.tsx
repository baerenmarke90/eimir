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
import { refreshSpaceConfiguration } from '../client/spaceConfiguration';
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

function BatteryIcon({
  value,
  showQuestion = false,
}: {
  value: number | null;
  showQuestion?: boolean;
}) {
  const fillWidth = value === null ? 0 : Math.max(1.5, (15 * value) / 100);
  const level =
    value === null
      ? 'empty'
      : value <= 30
        ? 'low'
        : value <= 60
          ? 'medium'
          : 'high';
  return (
    <svg
      className="daily-energy-battery-icon"
      data-level={level}
      viewBox="0 0 24 14"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className="daily-energy-battery-shell"
        x="1"
        y="2"
        width="19"
        height="10"
        rx="2"
      />
      <rect
        className="daily-energy-battery-tip"
        x="21"
        y="5"
        width="2"
        height="4"
        rx="1"
      />
      {value !== null ? (
        <rect
          key={value}
          className="daily-energy-battery-fill"
          x="3"
          y="4"
          width={fillWidth}
          height="6"
          rx="1"
        />
      ) : showQuestion ? (
        <text
          className="daily-energy-battery-question"
          x="10.5"
          y="9.7"
          textAnchor="middle"
        >
          ?
        </text>
      ) : null}
    </svg>
  );
}

function PartnerBatteryIndicator({
  projection,
  partnerName,
}: {
  projection?: PartnerEnergyProjection;
  partnerName?: string;
}) {
  const { t } = useTranslation();

  // Partner Energy is informative, not an entry point. If there is no
  // revealable value yet (not checked in, hidden by mutual reveal, loading,
  // offline, or unavailable), keep the avatar visually quiet.
  if (projection?.state !== 'VISIBLE') return null;

  const label = partnerName
    ? t('dailyEnergy.partnerLabel', { name: partnerName })
    : t('dailyEnergy.partnerFallback');
  const ariaLabel = `${label}: ${t('dailyEnergy.percentage', {
    value: projection.value,
  })}`;

  return (
    <span
      className="daily-energy-partner-battery"
      role="img"
      aria-label={ariaLabel}
      data-state="visible"
      data-energy={projection.value}
      data-testid="daily-energy-partner-battery"
    >
      <span className="daily-energy-avatar-chip" aria-hidden="true">
        <BatteryIcon value={projection.value} />
      </span>
    </span>
  );
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
    void refreshSpaceConfiguration(queryClient, accountId, spaceId);
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
          refreshSpaceConfiguration(queryClient, accountId, spaceId),
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
    if (online && !dailyQuery.isError) {
      return;
    }
    setOpen(false);
  }, [dailyQuery.isError, online]);

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
    online && Boolean(dailyQuery.data) && !dailyQuery.isError;

  if (loading) {
    return (
      <div className="daily-energy-checkin">
        <button
          type="button"
          className="daily-energy-badge daily-energy-avatar-control daily-energy-badge-loading"
          disabled
          aria-label={t('dailyEnergy.loading')}
          data-testid="daily-energy-own-battery"
        >
          <span className="daily-energy-avatar-chip" aria-hidden="true">
            <BatteryIcon value={null} />
          </span>
        </button>
        <PartnerBatteryIndicator partnerName={partnerName} />
      </div>
    );
  }

  if (!authoritative || !dailyQuery.data) {
    const offline = !online;
    return (
      <div className="daily-energy-checkin">
        <button
          type="button"
          className="daily-energy-badge daily-energy-avatar-control daily-energy-badge-unavailable"
          disabled={offline}
          onClick={offline ? undefined : () => void dailyQuery.refetch()}
          aria-label={
            offline
              ? t('dailyEnergy.unavailableOffline')
              : t('dailyEnergy.unavailable')
          }
          data-testid="daily-energy-own-battery"
        >
          <span className="daily-energy-avatar-chip" aria-hidden="true">
            <BatteryIcon value={null} />
          </span>
        </button>
        <PartnerBatteryIndicator partnerName={partnerName} />
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

  const badgeAria =
    ownEnergy === null
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
        className="daily-energy-badge daily-energy-avatar-control"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={badgeAria}
        onClick={() => setOpen((current) => !current)}
        data-testid="daily-energy-own-battery"
      >
        <span className="daily-energy-avatar-chip" aria-hidden="true">
          <BatteryIcon value={ownEnergy} showQuestion={ownEnergy === null} />
        </span>
      </button>

      <PartnerBatteryIndicator
        projection={snapshot.projection.energy?.partner}
        partnerName={partnerName}
      />

      {open ? (
        <div
          id={dialogId}
          className="daily-energy-popover"
          role="dialog"
          aria-labelledby={dialogTitleId}
          data-testid="daily-energy-popover"
        >
          <div className="daily-energy-popover-heading">
            <strong id={dialogTitleId}>{t('dailyEnergy.popoverTitle')}</strong>
            <span>{t('dailyEnergy.question')}</span>
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
            onPointerUp={() => {
              if (draftTouched) submitEnergy(draftEnergy);
            }}
            onBlur={() => {
              if (draftTouched) submitEnergy(draftEnergy);
            }}
          />
          <div className="daily-energy-slider-labels">
            <span>{t('dailyEnergy.scaleLow')}</span>
            <span>{t('dailyEnergy.scaleHigh')}</span>
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
        </div>
      ) : null}
    </div>
  );
}
