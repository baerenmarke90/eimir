import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { AccountApi } from '../api/generated/apis/AccountApi';
import { Configuration } from '../client/apiConfiguration';
import { assertOnlineWrite, isClientOnline } from '../client/connectivity';
import { photoPlacesRequest } from '../client/photoPlaces';
import { clientProblemKind } from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { useTranslation } from '../i18n';
import { PreferenceSwitch } from './PreferenceSwitch';
import { ProblemState } from './ProblemState';

export function PhotoLocationSettings({
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
  const [saved, setSaved] = useState(false);
  const writeInFlight = useRef(false);
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
  const key = ['photo-location-preference', apiBaseUrl, accountId] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      photoPlacesRequest(() => api.getPhotoLocationPreference({ signal })),
    retry: false,
  });
  const mutation = useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async ({
      enabled,
      version,
    }: {
      enabled: boolean;
      version: number;
    }) => {
      const admitted = captureAuthorizedQuery(client, key);
      await client.cancelQueries({ queryKey: key, exact: true });
      assertOnlineWrite();
      if (!admitted())
        throw new Error('Preference scope is no longer authorized.');
      const result = await photoPlacesRequest(() =>
        api.setPhotoLocationPreference({
          ifMatch: `"${version}"`,
          photoLocationPreferenceUpdate: { enabled },
        }),
      );
      return { result, admitted };
    },
    onSuccess: ({ result, admitted }) => {
      if (!admitted()) return;
      client.setQueryData(key, result);
      setSaved(true);
    },
    onError: (error) => {
      if (clientProblemKind(error) === 'conflict') void query.refetch();
    },
  });
  const denied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(query.error) ?? '',
  );
  return (
    <section className="settings-category-content settings-section">
      <p>{t('photoPlaces.description')}</p>
      <p className="muted">{t('photoPlaces.future')}</p>
      {query.data && !denied ? (
        <PreferenceSwitch
          label={t('photoPlaces.setting')}
          checked={query.data.enabled}
          disabled={query.isFetching || mutation.isPending}
          onCheckedChange={(enabled) => {
            if (writeInFlight.current) return;
            writeInFlight.current = true;
            setSaved(false);
            mutation.mutate(
              { enabled, version: query.data.version },
              {
                onSettled: () => {
                  writeInFlight.current = false;
                },
              },
            );
          }}
        />
      ) : null}
      <p className="muted">{t('photoPlaces.metadata')}</p>
      {query.isPending ? (
        <p role="status">
          {t(isClientOnline() ? 'photoPlaces.loading' : 'photoPlaces.offline')}
        </p>
      ) : null}
      {query.error ? (
        <>
          <ProblemState error={query.error} />
          <button
            type="button"
            className="secondary"
            onClick={() => void query.refetch()}
          >
            {t('photoPlaces.retry')}
          </button>
        </>
      ) : null}
      {mutation.error ? <ProblemState error={mutation.error} /> : null}
      <p role="status" aria-live="polite">
        {mutation.isPending
          ? t('photoPlaces.saving')
          : saved
            ? t('photoPlaces.saved')
            : ''}
      </p>
    </section>
  );
}
