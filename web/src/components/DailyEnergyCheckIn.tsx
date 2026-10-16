import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { PartnerEnergyProjection } from '../api/generated/models/PartnerEnergyProjection';
import { dailyCheckInTodayQueryOptions } from '../client/dailyCheckIn';
import { ClientProblemError } from '../client/problemDetails';
import { postSnackbar } from '../client/snackbar';
import { useDismissiblePopover } from '../client/useDismissiblePopover';
import { refreshSpaceConfiguration } from '../client/spaceConfiguration';
import { useTranslation } from '../i18n';
import { useDailyCheckInWrite } from './useDailyCheckInWrite';
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
  const dailyQuery = useQuery(
    dailyCheckInTodayQueryOptions(api, accountId, spaceId),
  );
  const {
    isOpen: open,
    setIsOpen: setOpen,
    toggle,
    triggerRef,
    panelRef,
  } = useDismissiblePopover();
  const [draftEnergy, setDraftEnergy] = useState<DailyEnergyLevel>(50);
  const [draftTouched, setDraftTouched] = useState(false);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const dialogId = useId();
  const dialogTitleId = useId();

  const serverReportsModuleDisabled =
    dailyQuery.data?.projection.energy === null;
  const ownEnergy = dailyQuery.data?.projection.own.energyLevel ?? null;

  useEffect(() => {
    if (!serverReportsModuleDisabled) return;
    void refreshSpaceConfiguration(queryClient, accountId, spaceId);
  }, [accountId, queryClient, serverReportsModuleDisabled, spaceId]);

  const mutation = useDailyCheckInWrite({
    api,
    accountId,
    spaceId,
    dimension: 'energy',
  });
  const preserveFailedDraft = Boolean(
    mutation.error &&
      mutation.error.kind !== 'conflict' &&
      mutation.error.code !== 'SPACE_MODULE_DISABLED' &&
      mutation.error.code !== 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE',
  );
  const previousContext = useRef(mutation.scopeId);
  useEffect(() => {
    if (previousContext.current === mutation.scopeId) return;
    previousContext.current = mutation.scopeId;
    setDraftTouched(false);
    setDraftEnergy((ownEnergy ?? 50) as DailyEnergyLevel);
    setOpen(false);
    setModuleDisabled(false);
  }, [mutation.scopeId, ownEnergy, setOpen]);
  useEffect(() => {
    const failed = mutation.request?.update.energyLevel;
    if (!preserveFailedDraft) return;
    if (failed !== null && failed !== undefined) {
      setDraftEnergy(failed as DailyEnergyLevel);
      setDraftTouched(true);
    }
    setOpen(true);
  }, [preserveFailedDraft, mutation.request, setOpen]);
  useEffect(() => {
    if (!mutation.claimFeedback()) return;
    if (mutation.status === 'success') {
      setDraftTouched(false);
    } else if (mutation.error?.code === 'SPACE_MODULE_DISABLED') {
      setModuleDisabled(serverReportsModuleDisabled);
      setOpen(false);
      postSnackbar('snackbar.dailyEnergyModuleDisabled');
    } else if (mutation.error?.code === 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE') {
      setDraftTouched(false);
    } else if (mutation.error?.kind === 'conflict') {
      setDraftTouched(false);
      postSnackbar('snackbar.dailyEnergyConflict');
    }
  }, [
    mutation.claimFeedback,
    mutation.status,
    mutation.error,
    serverReportsModuleDisabled,
    setOpen,
  ]);

  useEffect(() => {
    if (mutation.isPending || preserveFailedDraft || draftTouched) return;
    if (ownEnergy !== null) {
      setDraftEnergy(ownEnergy as DailyEnergyLevel);
      return;
    }
    if (!open) {
      setDraftEnergy(50);
      setDraftTouched(false);
    }
  }, [draftTouched, mutation.isPending, preserveFailedDraft, open, ownEnergy]);

  useEffect(() => {
    if (online && !dailyQuery.isError) {
      return;
    }
    setOpen(false);
  }, [dailyQuery.isError, online, setOpen]);

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
  const activeMutation = Boolean(mutation.request);
  const pendingOwnEnergy =
    mutation.pendingUpdate && mutation.pendingUpdate.energyLevel !== undefined
      ? { value: mutation.pendingUpdate.energyLevel }
      : null;
  const failedOwnEnergy =
    mutation.error && mutation.request?.update.energyLevel !== undefined
      ? {
          value: mutation.request.update.energyLevel as DailyEnergyLevel | null,
        }
      : null;
  const displayedEnergy = pendingOwnEnergy ? pendingOwnEnergy.value : ownEnergy;
  const mutationProblem =
    activeMutation && mutation.error instanceof ClientProblemError
      ? mutation.error
      : null;
  const contextUnavailable =
    mutationProblem?.code === 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE';
  const showGenericMutationError = activeMutation && preserveFailedDraft;

  const badgeAria =
    displayedEnergy === null
      ? t('dailyEnergy.badgeAriaEmpty')
      : t('dailyEnergy.badgeAriaValue', { value: displayedEnergy });
  const displayedDraftEnergy = pendingOwnEnergy?.value ?? draftEnergy;
  const progress = ((displayedDraftEnergy - 10) / 90) * 100;
  const sliderStyle = {
    '--daily-energy-progress': `${progress}%`,
  } as CSSProperties;

  function submitEnergy(value: DailyEnergyLevel | null): void {
    if (mutation.isInFlight()) return;
    if (value === ownEnergy) {
      mutation.reset();
      return;
    }
    mutation.submit({ energyLevel: value });
  }

  function updateDraft(value: number): void {
    if (mutation.isInFlight()) return;
    setDraftEnergy(value as DailyEnergyLevel);
    setDraftTouched(true);
    mutation.reset();
  }

  return (
    <div
      className="daily-energy-checkin"
      ref={panelRef as RefObject<HTMLDivElement>}
    >
      <button
        ref={triggerRef as RefObject<HTMLButtonElement>}
        type="button"
        className="daily-energy-badge daily-energy-avatar-control"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={badgeAria}
        aria-busy={Boolean(pendingOwnEnergy)}
        data-pending={pendingOwnEnergy ? 'true' : undefined}
        onClick={toggle}
        data-testid="daily-energy-own-battery"
      >
        <span className="daily-energy-avatar-chip" aria-hidden="true">
          <BatteryIcon
            value={displayedEnergy}
            showQuestion={displayedEnergy === null}
          />
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
            value={displayedDraftEnergy}
            disabled={mutation.isPending}
            style={sliderStyle}
            aria-valuetext={t('dailyEnergy.optionAria', {
              value: displayedDraftEnergy,
            })}
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
              {mutation.otherPending
                ? t('dailyEnergy.otherSaving')
                : mutation.isPending && activeMutation
                  ? t('dailyEnergy.saving')
                  : ''}
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
              {failedOwnEnergy ? (
                <button
                  type="button"
                  className="tertiary daily-energy-retry"
                  disabled={mutation.isPending}
                  onClick={() => submitEnergy(failedOwnEnergy.value)}
                >
                  {t('common.retry')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
