import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { DailyCheckInVisibilityMode } from '../api/generated/models/DailyCheckInVisibilityMode';
import type { SpaceConfigurationUpdate } from '../api/generated/models/SpaceConfigurationUpdate';
import {
  dailyContextTimezoneOptions,
  dailyModuleToggleUpdate,
  spaceConfigurationQueryKey,
  spaceConfigurationQueryOptions,
  suggestedDailyContextTimezone,
  updateSpaceConfiguration,
  type SpaceConfigurationSnapshot,
} from '../client/spaceConfiguration';
import { ClientProblemError } from '../client/problemDetails';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';

const VISIBILITY_MODES = [
  {
    value: 'IMMEDIATE',
    labelKey: 'profileIdentity.visibilityImmediate',
    hintKey: 'profileIdentity.visibilityImmediateHint',
  },
  {
    value: 'MUTUAL_REVEAL',
    labelKey: 'profileIdentity.visibilityMutualReveal',
    hintKey: 'profileIdentity.visibilityMutualRevealHint',
  },
] as const satisfies ReadonlyArray<{
  value: DailyCheckInVisibilityMode;
  labelKey: string;
  hintKey: string;
}>;

export function SpaceConfigurationPanel({
  spacesApi,
  accountId,
  spaceId,
}: {
  spacesApi: SpacesApi;
  accountId: string;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = spaceConfigurationQueryKey(accountId, spaceId);
  const configurationQuery = useQuery(
    spaceConfigurationQueryOptions(spacesApi, accountId, spaceId),
  );

  const configurationMutation = useMutation({
    mutationFn: async (update: SpaceConfigurationUpdate) => {
      const snapshot = configurationQuery.data;
      if (!snapshot?.configuration.canManageSpaceConfiguration) {
        throw new ClientProblemError(
          'permission',
          403,
          'SPACE_CONFIGURATION_MANAGEMENT_REQUIRED',
        );
      }
      return updateSpaceConfiguration(
        spacesApi,
        spaceId,
        snapshot.etag,
        update,
      );
    },
    onSuccess: async (snapshot) => {
      queryClient.setQueryData<SpaceConfigurationSnapshot>(queryKey, snapshot);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: async (error) => {
      // Never retry a stale If-Match as a write. Refresh the latest shared
      // state so the manager can make a new deliberate choice.
      if (error instanceof ClientProblemError && error.kind === 'conflict') {
        await queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  if (configurationQuery.isPending) {
    return (
      <section
        className="settings-section space-configuration-panel"
        aria-labelledby="space-configuration-heading"
      >
        <div className="settings-section-head">
          <h2 id="space-configuration-heading">
            {t('profileIdentity.spaceConfigurationTitle')}
          </h2>
        </div>
        <p className="space-configuration-status" role="status">
          {t('profileIdentity.spaceConfigurationLoading')}
        </p>
      </section>
    );
  }

  if (configurationQuery.error || !configurationQuery.data) {
    return (
      <section
        className="settings-section space-configuration-panel"
        aria-labelledby="space-configuration-heading"
      >
        <div className="settings-section-head">
          <h2 id="space-configuration-heading">
            {t('profileIdentity.spaceConfigurationTitle')}
          </h2>
        </div>
        <ProblemState
          error={configurationQuery.error}
          onRetry={() => void configurationQuery.refetch()}
        />
      </section>
    );
  }

  const { configuration } = configurationQuery.data;
  const canManage = configuration.canManageSpaceConfiguration;
  const modules: Array<{
    id: string;
    title: string;
    intro: string;
    toggleLabel: string;
    enabled: boolean;
    update: SpaceConfigurationUpdate;
    visibility?: {
      mode: DailyCheckInVisibilityMode;
      update: (mode: DailyCheckInVisibilityMode) => SpaceConfigurationUpdate;
    };
  }> = [
    {
      id: 'support-gestures',
      title: t('profileIdentity.supportGesturesTitle'),
      intro: t('profileIdentity.supportGesturesIntro'),
      toggleLabel: t('profileIdentity.supportGesturesToggle'),
      enabled: configuration.supportGesturesEnabled,
      update: {
        supportGesturesEnabled: !configuration.supportGesturesEnabled,
      },
    },
    {
      id: 'shared-achievements',
      title: t('profileIdentity.sharedAchievementsTitle'),
      intro: t('profileIdentity.sharedAchievementsIntro'),
      toggleLabel: t('profileIdentity.sharedAchievementsToggle'),
      enabled: configuration.sharedAchievementsEnabled,
      update: {
        sharedAchievementsEnabled: !configuration.sharedAchievementsEnabled,
      },
    },
    {
      id: 'vibe-check',
      title: t('profileIdentity.vibeCheckTitle'),
      intro: t('profileIdentity.vibeCheckIntro'),
      toggleLabel: t('profileIdentity.vibeCheckToggle'),
      enabled: configuration.vibeCheckEnabled,
      update: dailyModuleToggleUpdate(
        configuration,
        'vibeCheckEnabled',
        suggestedDailyContextTimezone(),
      ),
      visibility: {
        mode: configuration.vibeVisibilityMode,
        update: (mode) => ({ vibeVisibilityMode: mode }),
      },
    },
    {
      id: 'energy-check-in',
      title: t('profileIdentity.energyCheckInTitle'),
      intro: t('profileIdentity.energyCheckInIntro'),
      toggleLabel: t('profileIdentity.energyCheckInToggle'),
      enabled: configuration.energyCheckInEnabled,
      update: dailyModuleToggleUpdate(
        configuration,
        'energyCheckInEnabled',
        suggestedDailyContextTimezone(),
      ),
      visibility: {
        mode: configuration.energyVisibilityMode,
        update: (mode) => ({ energyVisibilityMode: mode }),
      },
    },
  ];
  const dailyContextTimezone = configuration.dailyContextTimezone;
  const timezoneLocked =
    configurationMutation.error instanceof ClientProblemError &&
    configurationMutation.error.code ===
      'SPACE_DAILY_CONTEXT_TIMEZONE_ACTIVE_CHECK_IN';

  return (
    <section
      className="settings-section space-configuration-panel"
      aria-labelledby="space-configuration-heading"
    >
      <div className="settings-section-head">
        <h2 id="space-configuration-heading">
          {t('profileIdentity.spaceConfigurationTitle')}
        </h2>
        <p className="settings-section-intro">
          {canManage
            ? t('profileIdentity.spaceConfigurationManagerIntro')
            : t('profileIdentity.spaceConfigurationReadOnlyIntro')}
        </p>
      </div>

      <div className="space-module-list">
        {modules.map((module) => {
          const descriptionId = `${module.id}-description`;
          return (
            <div className="space-module" key={module.id}>
              <div className="space-module-row">
                <div className="space-module-copy">
                  <h3>{module.title}</h3>
                  <p id={descriptionId}>{module.intro}</p>
                </div>

                {canManage ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={module.enabled}
                    aria-label={module.toggleLabel}
                    aria-describedby={descriptionId}
                    className="space-module-switch"
                    disabled={configurationMutation.isPending}
                    onClick={() => configurationMutation.mutate(module.update)}
                  >
                    <span
                      className="space-module-switch-track"
                      aria-hidden="true"
                    >
                      <span className="space-module-switch-thumb" />
                    </span>
                  </button>
                ) : (
                  <span className="space-module-readonly-state">
                    {module.enabled
                      ? t('profileIdentity.spaceModuleOn')
                      : t('profileIdentity.spaceModuleOff')}
                  </span>
                )}
              </div>
              {module.enabled && module.visibility ? (
                canManage ? (
                  <fieldset
                    className="space-visibility"
                    disabled={configurationMutation.isPending}
                  >
                    <legend>
                      {t('profileIdentity.visibilityLegend', {
                        module: module.title,
                      })}
                    </legend>
                    <div className="space-visibility-options">
                      {VISIBILITY_MODES.map((mode) => (
                        <label
                          key={mode.value}
                          className={
                            module.visibility?.mode === mode.value
                              ? 'space-visibility-option is-selected'
                              : 'space-visibility-option'
                          }
                        >
                          <input
                            type="radio"
                            name={`${module.id}-visibility`}
                            value={mode.value}
                            checked={module.visibility?.mode === mode.value}
                            onChange={() =>
                              configurationMutation.mutate(
                                module.visibility?.update(mode.value) ?? {},
                              )
                            }
                          />
                          <span className="space-visibility-label">
                            {t(mode.labelKey)}
                          </span>
                          <span className="space-visibility-hint">
                            {t(mode.hintKey)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <p className="space-visibility-readonly">
                    {t('profileIdentity.visibilityReadOnly', {
                      mode: t(
                        module.visibility.mode === 'MUTUAL_REVEAL'
                          ? 'profileIdentity.visibilityMutualReveal'
                          : 'profileIdentity.visibilityImmediate',
                      ),
                    })}
                  </p>
                )
              ) : null}
            </div>
          );
        })}
      </div>

      {dailyContextTimezone ? (
        <div className="space-timezone-row">
          {canManage ? (
            <>
              <label htmlFor="space-daily-timezone">
                {t('profileIdentity.dailyContextTimezoneLabel')}
              </label>
              <p id="space-daily-timezone-hint">
                {t('profileIdentity.dailyContextTimezoneIntro')}
              </p>
              <select
                id="space-daily-timezone"
                aria-describedby="space-daily-timezone-hint"
                value={dailyContextTimezone}
                disabled={configurationMutation.isPending}
                onChange={(event) =>
                  configurationMutation.mutate({
                    dailyContextTimezone: event.target.value,
                  })
                }
              >
                {dailyContextTimezoneOptions(dailyContextTimezone).map(
                  (zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ),
                )}
              </select>
            </>
          ) : (
            <p>
              {t('profileIdentity.dailyContextTimezoneReadOnly', {
                timezone: dailyContextTimezone,
              })}
            </p>
          )}
        </div>
      ) : null}

      {canManage ? (
        <p className="space-configuration-note">
          {t('profileIdentity.spaceModulesKeepDataNote')}
        </p>
      ) : null}

      {configurationMutation.isPending ? (
        <p
          className="space-configuration-status"
          role="status"
          aria-live="polite"
        >
          {t('profileIdentity.spaceConfigurationSaving')}
        </p>
      ) : configurationMutation.isSuccess ? (
        <p
          className="space-configuration-status"
          role="status"
          aria-live="polite"
        >
          {t('profileIdentity.spaceConfigurationSaved')}
        </p>
      ) : null}

      {timezoneLocked ? (
        <p className="space-configuration-status" role="alert">
          {t('profileIdentity.dailyContextTimezoneLocked')}
        </p>
      ) : configurationMutation.error ? (
        <ProblemState
          error={configurationMutation.error}
          onRetry={
            configurationMutation.error instanceof ClientProblemError &&
            configurationMutation.error.kind === 'conflict'
              ? () => {
                  configurationMutation.reset();
                  void configurationQuery.refetch();
                }
              : undefined
          }
        />
      ) : null}
    </section>
  );
}
