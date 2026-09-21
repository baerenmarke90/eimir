import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
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

function PartnerEnergyState({
  projection,
  partnerName,
}: {
  projection: PartnerEnergyProjection;
  partnerName?: string;
}) {
  const { t } = useTranslation();

  switch (projection.state) {
    case 'VISIBLE':
      return (
        <div
          className="daily-energy-partner"
          role="status"
          aria-label={t('dailyEnergy.partnerStateAria')}
          data-testid="daily-energy-partner"
        >
          <span className="daily-energy-partner-label">
            {partnerName
              ? t('dailyEnergy.partnerLabel', { name: partnerName })
              : t('dailyEnergy.partnerFallback')}
          </span>
          <strong className="daily-energy-partner-value">
            {t('dailyEnergy.percentage', { value: projection.value })}
          </strong>
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
          <span className="daily-energy-partner-label">
            {partnerName
              ? t('dailyEnergy.partnerLabel', { name: partnerName })
              : t('dailyEnergy.partnerFallback')}
          </span>
          <span className="daily-energy-partner-neutral">
            {t('dailyEnergy.noCheckIn')}
          </span>
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

function EnergyUnavailable({
  offline,
  onRetry,
}: {
  offline: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="daily-energy-unavailable" role="status">
      <span>
        {offline
          ? t('dailyEnergy.unavailableOffline')
          : t('dailyEnergy.unavailable')}
      </span>
      {!offline ? (
        <button type="button" className="tertiary" onClick={onRetry}>
          {t('common.retry')}
        </button>
      ) : null}
    </div>
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
  const configurationKey = spaceConfigurationQueryKey(accountId, spaceId);
  const dailyQuery = useQuery(
    dailyCheckInTodayQueryOptions(api, accountId, spaceId),
  );
  const [editing, setEditing] = useState(false);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const serverReportsModuleDisabled =
    dailyQuery.data?.projection.energy === null;

  useEffect(() => {
    if (!serverReportsModuleDisabled) return;
    // A DailyCheckIn response with no Energy projection is itself
    // authoritative proof that the module is no longer available. Fail
    // closed immediately and converge the presentation configuration without
    // ever reconstructing a local participation state.
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
      setEditing(false);
    },
    onError: async (error) => {
      const problem =
        error instanceof ClientProblemError
          ? error
          : new ClientProblemError(clientProblemKind(error));

      if (problem.code === 'SPACE_MODULE_DISABLED') {
        // The server is the enforcement boundary. Hide this stale participation
        // surface immediately, then converge the active configuration query.
        setModuleDisabled(true);
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
        // Never fall back to browser/device time. A refetch either produces a
        // new authoritative Space-day or leaves the query unavailable.
        await queryClient.refetchQueries({
          queryKey,
          exact: true,
          type: 'active',
        });
        return;
      }

      if (problem.kind === 'conflict') {
        // No retry with the stale validator: first converge to the authoritative
        // snapshot and let the user decide whether to make another change.
        await queryClient.refetchQueries({
          queryKey,
          exact: true,
          type: 'active',
        });
        postSnackbar('snackbar.dailyEnergyConflict');
      }
    },
  });

  if (moduleDisabled || serverReportsModuleDisabled) return null;

  if (dailyQuery.isPending && !dailyQuery.data) {
    return (
      <div className="daily-energy-loading" role="status">
        {t('dailyEnergy.loading')}
      </div>
    );
  }

  const authoritative =
    online &&
    Boolean(dailyQuery.data) &&
    !dailyQuery.isError &&
    dailyQuery.fetchStatus === 'idle';

  if (!authoritative || !dailyQuery.data) {
    return (
      <EnergyUnavailable
        offline={!online || dailyQuery.fetchStatus === 'paused'}
        onRetry={() => void dailyQuery.refetch()}
      />
    );
  }

  const snapshot = dailyQuery.data;
  const ownEnergy = snapshot.projection.own.energyLevel;
  const pendingEnergy = mutation.isPending ? mutation.variables : undefined;
  const displayedEnergy =
    pendingEnergy !== undefined ? pendingEnergy : ownEnergy;
  const showPicker = ownEnergy === null || editing;
  const mutationProblem =
    mutation.error instanceof ClientProblemError ? mutation.error : null;
  const contextUnavailable =
    mutationProblem?.code === 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE';
  const showGenericMutationError =
    Boolean(mutation.error) &&
    mutationProblem?.kind !== 'conflict' &&
    mutationProblem?.code !== 'SPACE_MODULE_DISABLED' &&
    !contextUnavailable;

  return (
    <div className="daily-energy-checkin">
      {showPicker ? (
        <div className="daily-energy-picker-wrap">
          <p className="daily-energy-voluntary">{t('dailyEnergy.voluntary')}</p>
          <fieldset
            className="daily-energy-picker"
            disabled={mutation.isPending}
            aria-describedby="daily-energy-save-status"
          >
            <legend className="sr-only">
              {ownEnergy === null
                ? t('dailyEnergy.selectLegend')
                : t('dailyEnergy.changeLegend')}
            </legend>
            <div className="daily-energy-grid">
              {DAILY_ENERGY_LEVELS.map((level) => {
                const id = `daily-energy-${spaceId}-${level}`;
                return (
                  <label
                    key={level}
                    className="daily-energy-choice"
                    htmlFor={id}
                  >
                    <input
                      id={id}
                      className="daily-energy-choice-input"
                      type="radio"
                      name={`daily-energy-${spaceId}`}
                      value={level}
                      checked={displayedEnergy === level}
                      onChange={() => {
                        if (level === ownEnergy) {
                          setEditing(false);
                          return;
                        }
                        mutation.mutate(level);
                      }}
                      aria-label={t('dailyEnergy.optionAria', { value: level })}
                    />
                    <span className="daily-energy-choice-visual">
                      {t('dailyEnergy.percentage', { value: level })}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {editing && ownEnergy !== null ? (
            <button
              type="button"
              className="tertiary daily-energy-cancel"
              disabled={mutation.isPending}
              onClick={() => setEditing(false)}
            >
              {t('common.cancel')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="daily-energy-own-set">
          <div className="daily-energy-own-copy">
            <span>{t('dailyEnergy.ownLabel')}</span>
            <strong>{t('dailyEnergy.percentage', { value: ownEnergy })}</strong>
          </div>
          <div className="daily-energy-own-actions">
            <button
              type="button"
              className="tertiary"
              disabled={mutation.isPending}
              onClick={() => setEditing(true)}
            >
              {t('dailyEnergy.change')}
            </button>
            <button
              type="button"
              className="tertiary daily-energy-remove"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(null)}
            >
              {t('dailyEnergy.remove')}
            </button>
          </div>
        </div>
      )}

      <span
        id="daily-energy-save-status"
        className="daily-energy-save-status"
        role="status"
        aria-live="polite"
      >
        {mutation.isPending ? t('dailyEnergy.saving') : ''}
      </span>

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
  );
}
