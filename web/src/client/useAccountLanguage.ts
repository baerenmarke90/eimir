import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import type { AccountView } from '../api/generated/models/AccountView';
import type { LanguagePreferenceView } from '../api/generated/models/LanguagePreferenceView';
import { i18n } from '../i18n';
import { detectLocale, effectiveLocale } from '../i18n/locale';
import {
  accountLanguage,
  languageApi,
  languagePreferenceKey,
  loadLanguagePreference,
  saveLanguagePreference,
} from './languagePreference';
import { clientProblemKind } from './problemDetails';
import { loadStoredSession, storeSession } from './sessionPersistence';

/** One current Account owns the language; locale changes never key/remount routes. */
export function useAccountLanguage(
  instance: string,
  accessToken: string | undefined,
  account: AccountView | null,
  onAccount: (account: AccountView) => void,
) {
  const queryClient = useQueryClient();
  const scope = `${instance}:${account?.id ?? ''}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const api = useMemo(
    () => languageApi(instance, accessToken ?? ''),
    [instance, accessToken],
  );
  const key = useMemo(
    () => languagePreferenceKey(instance, account?.id ?? ''),
    [instance, account?.id],
  );
  const snapshot = useMemo(
    () => (account ? accountLanguage(account) : null),
    [account],
  );
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => loadLanguagePreference(api, signal),
    // The existing sign-in and /auth/me reads carry this personal preference.
    // Subscribe to the same Settings cache without an extra startup GET.
    enabled: false,
    initialData: snapshot ?? undefined,
    retry: false,
  });
  const current =
    snapshot && query.data && query.data.version >= snapshot.version
      ? query.data
      : snapshot;

  useEffect(() => {
    const locale = effectiveLocale(current?.preference);
    if (i18n.resolvedLanguage !== locale) void i18n.changeLanguage(locale);
    if (!account || !current) return;
    if (current !== query.data) queryClient.setQueryData(key, current);
    if (
      account.languagePreference === current.preference &&
      account.locale === current.effectiveLocale &&
      account.languageVersion === current.version
    )
      return;
    const updated = {
      ...account,
      languagePreference: current.preference,
      locale: current.effectiveLocale,
      languageVersion: current.version,
    };
    if (account.locale !== current.effectiveLocale) {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'daily-quote' &&
          query.queryKey[1] === 'today' &&
          query.queryKey[2] === account.id,
      });
    }
    onAccount(updated);
    const stored = loadStoredSession();
    if (stored?.account.id === account.id)
      void storeSession({ ...stored, account: updated });
  }, [account, current, onAccount, queryClient, key, query.data]);

  useEffect(() => {
    if (!account || !accessToken || query.isFetching || query.isError) return;
    const observed = current;
    if (!observed) return;
    const controller = new AbortController();
    let pending = false;
    const sync = async () => {
      if (
        pending ||
        controller.signal.aborted ||
        navigator.onLine === false ||
        document.visibilityState === 'hidden'
      )
        return;
      const saved = queryClient.getQueryData<LanguagePreferenceView>(key);
      if (
        saved?.preference !== 'auto' ||
        saved.effectiveLocale === detectLocale()
      )
        return;
      pending = true;
      try {
        const updated = await saveLanguagePreference(
          api,
          'auto',
          saved.version,
          controller.signal,
        );
        if (!controller.signal.aborted && activeScope.current === scope)
          queryClient.setQueryData(key, updated);
      } catch (error) {
        if (
          !controller.signal.aborted &&
          activeScope.current === scope &&
          clientProblemKind(error) === 'conflict'
        ) {
          try {
            const latest = await loadLanguagePreference(api, controller.signal);
            if (!controller.signal.aborted && activeScope.current === scope)
              queryClient.setQueryData(key, latest);
          } catch {
            /* An unavailable read is retried on the next owned observation. */
          }
        }
        // A conflict or transport failure is reconciled by the current read;
        // never turn a background device observation into an offline write queue.
      } finally {
        pending = false;
      }
    };
    void sync();
    window.addEventListener('languagechange', sync);
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    return () => {
      controller.abort();
      window.removeEventListener('languagechange', sync);
      window.removeEventListener('online', sync);
      window.removeEventListener('focus', sync);
    };
  }, [
    account,
    accessToken,
    api,
    key,
    current,
    query.isFetching,
    query.isError,
    queryClient,
    scope,
  ]);
}
