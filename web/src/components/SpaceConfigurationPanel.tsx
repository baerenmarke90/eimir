import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { SpaceConfigurationUpdate } from '../api/generated/models/SpaceConfigurationUpdate';
import {
  spaceConfigurationQueryKey,
  spaceConfigurationQueryOptions,
  updateSpaceConfiguration,
  type SpaceConfigurationSnapshot,
} from '../client/spaceConfiguration';
import { ClientProblemError } from '../client/problemDetails';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';

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
      id: 'vibe-check',
      title: t('profileIdentity.vibeCheckTitle'),
      intro: t('profileIdentity.vibeCheckIntro'),
      toggleLabel: t('profileIdentity.vibeCheckToggle'),
      enabled: configuration.vibeCheckEnabled,
      update: {
        vibeCheckEnabled: !configuration.vibeCheckEnabled,
      },
    },
  ];

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
            <div className="space-module-row" key={module.id}>
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
          );
        })}
      </div>

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

      {configurationMutation.error ? (
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
