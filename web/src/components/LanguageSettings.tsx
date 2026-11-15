import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import {
  languageApi,
  languagePreferenceKey,
  loadLanguagePreference,
  saveLanguagePreference,
} from '../client/languagePreference';
import {
  ClientProblemError,
  clientProblemKind,
} from '../client/problemDetails';
import { useTranslation } from '../i18n';
import { localeRegistry, supportedLocales } from '../i18n/locale';
import './LanguageSettings.css';

export function LanguageSettings({
  apiBaseUrl,
  accessToken,
  accountId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const api = useMemo(
    () => languageApi(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const key = languagePreferenceKey(apiBaseUrl, accountId);
  const owner = `${apiBaseUrl}:${accountId}`;
  const activeOwner = useRef(owner);
  activeOwner.current = owner;
  const [attempt, setAttempt] = useState<{
    owner: string;
    preference: string;
  } | null>(null);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => loadLanguagePreference(api, signal),
    retry: false,
  });
  const mutation = useMutation({
    networkMode: 'always',
    mutationFn: (preference: string) => {
      if (navigator.onLine === false) throw new ClientProblemError('offline');
      if (!query.data) throw new Error('Language preference is not loaded.');
      return saveLanguagePreference(api, preference, query.data.version);
    },
    onSuccess: (saved) => {
      if (activeOwner.current !== owner) return;
      queryClient.setQueryData(key, saved);
      setAttempt(null);
    },
  });
  const error = mutation.error ?? query.error;
  const problem = clientProblemKind(error);
  const conflict = problem === 'conflict';
  const attempted = attempt?.owner === owner ? attempt.preference : null;
  const value = attempted ?? query.data?.preference ?? 'auto';

  return (
    <section
      className="settings-section"
      aria-labelledby="language-settings-title"
    >
      <h2 id="language-settings-title">{t('languageSettings.title')}</h2>
      <div className="theme-control theme-control-inline language-settings-control">
        <label htmlFor="language-preference">
          {t('languageSettings.title')}
        </label>
        <select
          id="language-preference"
          value={value}
          aria-describedby="language-personal language-status"
          disabled={!query.data}
          aria-busy={mutation.isPending}
          onChange={(event) => {
            if (mutation.isPending) return;
            const preference = event.currentTarget.value;
            setAttempt({ owner, preference });
            mutation.mutate(preference);
          }}
        >
          <option value="auto">{t('languageSettings.automatic')}</option>
          {supportedLocales.map((locale) => (
            <option key={locale} value={locale} lang={locale}>
              {localeRegistry[locale].name}
            </option>
          ))}
        </select>
      </div>
      <p id="language-personal" className="field-help">
        {t('languageSettings.personal')}
      </p>
      <div id="language-status" role="status" aria-live="polite">
        {mutation.isPending
          ? t('languageSettings.saving')
          : query.isPending
            ? t('languageSettings.loading')
            : mutation.isSuccess
              ? t('languageSettings.saved')
              : null}
      </div>
      {error ? (
        <div className="inline-message error" role="alert">
          <p>
            {t(
              conflict
                ? 'languageSettings.conflict'
                : problem === 'offline'
                  ? 'languageSettings.offline'
                  : 'languageSettings.error',
            )}
          </p>
          <button
            type="button"
            className="secondary"
            disabled={mutation.isPending}
            onClick={() => {
              if (conflict || !query.data) {
                mutation.reset();
                setAttempt(null);
                void query.refetch();
              } else mutation.mutate(value);
            }}
          >
            {t(
              conflict || !query.data
                ? 'languageSettings.reload'
                : 'languageSettings.retry',
            )}
          </button>
        </div>
      ) : null}
    </section>
  );
}
