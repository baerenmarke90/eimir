import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { AccountApi } from '../api/generated/apis/AccountApi';
import type { PhotoLocationPreferences } from '../api/generated/models/PhotoLocationPreferences';
import { Configuration } from '../client/apiConfiguration';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { useTranslation } from '../i18n';
import { PreferenceSwitch } from './PreferenceSwitch';
import { ProblemState } from './ProblemState';

export function PhotoLocationSettingsPanel({
  apiBaseUrl,
  accessToken,
  accountId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const api = useMemo(
    () =>
      new AccountApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );
  const key = ['photo-location-preferences', apiBaseUrl, accountId] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.getPhotoLocationPreferences({ signal }),
    retry: false,
    gcTime: 0,
  });
  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!query.data || !navigator.onLine)
        throw new Error('Unable to save preferences');
      const ownsQuery = captureAuthorizedQuery(client, key);
      const value = await api.updatePhotoLocationPreferences({
        ifMatch: `"${query.data.version}"`,
        photoLocationPreferencesUpdate: { enabled },
      });
      const current = client.getQueryData<PhotoLocationPreferences>(key);
      if (ownsQuery() && current && current.version <= value.version)
        client.setQueryData(key, value);
    },
  });
  return (
    <section
      className="settings-section"
      aria-label={t('photoLocations.settingsTitle')}
    >
      {query.isPending ? (
        <p role="status">{t('photoLocations.loading')}</p>
      ) : query.error ? (
        <ProblemState
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <PreferenceSwitch
          label={t('photoLocations.enabledLabel')}
          description={t('photoLocations.enabledDescription')}
          checked={query.data.enabled}
          disabled={mutation.isPending}
          onCheckedChange={(enabled) => {
            mutation.reset();
            mutation.mutate(enabled);
          }}
        />
      ) : null}
      <p className="settings-section-intro">
        {t('photoLocations.settingsHelp')}
      </p>
      <p className="field-help">{t('photoLocations.settingsScope')}</p>
      {mutation.isPending || mutation.isSuccess ? (
        <p role="status">
          {t(mutation.isPending ? 'common.saving' : 'photoLocations.saved')}
        </p>
      ) : null}
      {mutation.error ? (
        <ProblemState
          error={mutation.error}
          onRetry={() => {
            mutation.reset();
            void query.refetch();
          }}
        />
      ) : null}
    </section>
  );
}
