import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
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

  const supportGestureMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const snapshot = configurationQuery.data;
      if (!snapshot?.configuration.canManageSpaceConfiguration) {
        throw new ClientProblemError(
          'permission',
          403,
          'SPACE_CONFIGURATION_MANAGEMENT_REQUIRED',
        );
      }
      return updateSpaceConfiguration(spacesApi, spaceId, snapshot.etag, {
        supportGesturesEnabled: enabled,
      });
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
        <div className="space-module-row">
          <div className="space-module-copy">
            <h3>{t('profileIdentity.supportGesturesTitle')}</h3>
            <p id="support-gestures-description">
              {t('profileIdentity.supportGesturesIntro')}
            </p>
          </div>

          {canManage ? (
            <button
              type="button"
              role="switch"
              aria-checked={configuration.supportGesturesEnabled}
              aria-label={t('profileIdentity.supportGesturesToggle')}
              aria-describedby="support-gestures-description"
              className="space-module-switch"
              disabled={supportGestureMutation.isPending}
              onClick={() =>
                supportGestureMutation.mutate(
                  !configuration.supportGesturesEnabled,
                )
              }
            >
              <span className="space-module-switch-track" aria-hidden="true">
                <span className="space-module-switch-thumb" />
              </span>
            </button>
          ) : (
            <span className="space-module-readonly-state">
              {configuration.supportGesturesEnabled
                ? t('profileIdentity.spaceModuleOn')
                : t('profileIdentity.spaceModuleOff')}
            </span>
          )}
        </div>
      </div>

      {supportGestureMutation.isPending ? (
        <p
          className="space-configuration-status"
          role="status"
          aria-live="polite"
        >
          {t('profileIdentity.spaceConfigurationSaving')}
        </p>
      ) : supportGestureMutation.isSuccess ? (
        <p
          className="space-configuration-status"
          role="status"
          aria-live="polite"
        >
          {t('profileIdentity.spaceConfigurationSaved')}
        </p>
      ) : null}

      {supportGestureMutation.error ? (
        <ProblemState
          error={supportGestureMutation.error}
          onRetry={
            supportGestureMutation.error instanceof ClientProblemError &&
            supportGestureMutation.error.kind === 'conflict'
              ? () => {
                  supportGestureMutation.reset();
                  void configurationQuery.refetch();
                }
              : undefined
          }
        />
      ) : null}
    </section>
  );
}
