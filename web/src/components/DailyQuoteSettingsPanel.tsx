import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { DailyQuoteApi } from '../api/generated/apis/DailyQuoteApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import {
  DAILY_QUOTE_CAPABILITY,
  type DailyQuotePreferenceSnapshot,
  dailyQuotePreferencesQueryKey,
  dailyQuoteQueryKey,
  isDailyQuoteConflict,
  isDailyQuoteEntitlementRequired,
  loadDailyQuotePreferences,
  saveDailyQuotePreferences,
} from '../client/dailyQuote';
import {
  ClientProblemError,
  clientProblemKind,
} from '../client/problemDetails';
import {
  entitlementLoader,
  useSpaceCapability,
  withdrawSpaceCapability,
} from '../client/spaceEntitlement';
import { useTranslation } from '../i18n';
import { DailyQuoteCard } from './DailyQuoteCard';
import { PreferenceSwitch } from './PreferenceSwitch';
import { ProMark } from './ProMark';

export function DailyQuoteSettingsPanel({
  quoteApi,
  entitlementsApi,
  accountId,
  spaceId,
  variant = 'section',
}: {
  quoteApi: DailyQuoteApi;
  entitlementsApi: EntitlementsApi;
  accountId: string;
  spaceId: string;
  variant?: 'section' | 'toggle' | 'categories';
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const preferencesKey = useMemo(
    () => dailyQuotePreferencesQueryKey(accountId, spaceId),
    [accountId, spaceId],
  );
  const quoteKey = useMemo(
    () => dailyQuoteQueryKey(accountId, spaceId),
    [accountId, spaceId],
  );

  const loadEntitlement = useMemo(
    () => entitlementLoader(entitlementsApi, spaceId),
    [entitlementsApi, spaceId],
  );
  // Reuses the session's single entitlement read from app start.
  const entitlementQuery = useSpaceCapability({
    accountId,
    spaceId,
    load: loadEntitlement,
    capability: DAILY_QUOTE_CAPABILITY,
  });
  const hasCapability = entitlementQuery.data === true;

  const preferencesQuery = useQuery({
    queryKey: preferencesKey,
    queryFn: ({ signal }) =>
      loadDailyQuotePreferences(quoteApi, spaceId, signal),
    enabled: hasCapability,
    retry: false,
    gcTime: 0,
  });

  useEffect(() => {
    if (!isDailyQuoteEntitlementRequired(preferencesQuery.error)) return;
    queryClient.removeQueries({ queryKey: preferencesKey, exact: true });
    withdrawSpaceCapability(
      queryClient,
      accountId,
      spaceId,
      DAILY_QUOTE_CAPABILITY,
    );
  }, [accountId, spaceId, preferencesKey, preferencesQuery.error, queryClient]);

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => {
      const snapshot =
        queryClient.getQueryData<DailyQuotePreferenceSnapshot>(
          preferencesKey,
        ) ?? preferencesQuery.data;
      if (!snapshot) throw new ClientProblemError('unknown');
      return saveDailyQuotePreferences(quoteApi, spaceId, snapshot, {
        enabled,
      });
    },
    onSuccess: (snapshot) => {
      queryClient.setQueryData(preferencesKey, snapshot);
      void queryClient.invalidateQueries({ queryKey: quoteKey });
    },
    onError: (error) => {
      if (!isDailyQuoteEntitlementRequired(error)) return;
      queryClient.removeQueries({ queryKey: preferencesKey, exact: true });
      withdrawSpaceCapability(
        queryClient,
        accountId,
        spaceId,
        DAILY_QUOTE_CAPABILITY,
      );
    },
  });

  const reload = async () => {
    mutation.reset();
    await preferencesQuery.refetch();
  };

  const enabled = preferencesQuery.data?.preference.enabled ?? false;
  const status = mutation.isPending
    ? t('dailyQuote.saving')
    : mutation.isSuccess
      ? t('dailyQuote.settingsSaved')
      : null;

  if (variant === 'toggle') {
    const failure =
      entitlementQuery.error ?? preferencesQuery.error ?? mutation.error;
    return (
      <div className="dashboard-module-control">
        <label className="dashboard-module-switch">
          <input
            type="checkbox"
            aria-label={t('dailyQuote.title')}
            checked={hasCapability && enabled}
            disabled={
              !hasCapability ||
              !preferencesQuery.data ||
              Boolean(failure) ||
              mutation.isPending
            }
            onChange={(event) => {
              mutation.reset();
              mutation.mutate(event.target.checked);
            }}
          />
        </label>
        {failure ? (
          <div role="status">
            <p>{t('dailyQuote.preferencesUnavailable')}</p>
            <button
              type="button"
              className="tertiary"
              onClick={() => {
                mutation.reset();
                void entitlementQuery.refetch();
                void preferencesQuery.refetch();
              }}
            >
              {t('dailyQuote.retry')}
            </button>
          </div>
        ) : null}
        {status ? (
          <span className="sr-only" role="status">
            {status}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <section
      id="settings-daily-quote"
      className="settings-section daily-quote-settings-panel"
      aria-labelledby="settings-daily-quote-heading"
    >
      <div className="settings-section-head">
        <h2 id="settings-daily-quote-heading">
          {t('dailyQuote.settingsTitle')}
        </h2>
        {variant !== 'categories' ? (
          <p className="settings-section-intro">
            {t('dailyQuote.settingsIntro')}
          </p>
        ) : null}
      </div>

      {entitlementQuery.isPending ? (
        <p className="daily-quote-settings-status" role="status">
          {t('dailyQuote.settingsLoading')}
        </p>
      ) : entitlementQuery.error ? (
        <div className="daily-quote-settings-error" role="status">
          <p>
            {clientProblemKind(entitlementQuery.error) === 'offline'
              ? t('dailyQuote.preferencesOffline')
              : t('dailyQuote.preferencesUnavailable')}
          </p>
          <button
            type="button"
            className="button-link"
            onClick={() => void entitlementQuery.refetch()}
          >
            {t('dailyQuote.retry')}
          </button>
        </div>
      ) : !hasCapability ? (
        <div className="daily-quote-settings-discovery">
          <ProMark label={t('dailyQuote.pro')} />
          <p>{t('dailyQuote.discoveryMeta')}</p>
        </div>
      ) : preferencesQuery.isPending ? (
        <p className="daily-quote-settings-status" role="status">
          {t('dailyQuote.settingsLoading')}
        </p>
      ) : preferencesQuery.error ? (
        <div className="daily-quote-settings-error" role="status">
          <p>
            {clientProblemKind(preferencesQuery.error) === 'offline'
              ? t('dailyQuote.preferencesOffline')
              : t('dailyQuote.preferencesUnavailable')}
          </p>
          <button
            type="button"
            className="button-link"
            onClick={() => void reload()}
          >
            {t('dailyQuote.retry')}
          </button>
        </div>
      ) : preferencesQuery.data && variant !== 'categories' ? (
        <PreferenceSwitch
          label={t('dailyQuote.enabledLabel')}
          description={t('dailyQuote.enabledSettingsDescription')}
          checked={enabled}
          disabled={mutation.isPending}
          onCheckedChange={(nextEnabled) => {
            mutation.reset();
            mutation.mutate(nextEnabled);
          }}
        />
      ) : null}

      {hasCapability ? (
        <DailyQuoteCard
          settingsOnly
          quoteApi={quoteApi}
          entitlementsApi={entitlementsApi}
          accountId={accountId}
          spaceId={spaceId}
        />
      ) : null}
      {status ? (
        <p
          className="daily-quote-settings-status"
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
      ) : null}

      {mutation.error && !isDailyQuoteEntitlementRequired(mutation.error) ? (
        <div className="daily-quote-settings-error" role="status">
          <p>
            {isDailyQuoteConflict(mutation.error)
              ? t('dailyQuote.conflict')
              : clientProblemKind(mutation.error) === 'offline'
                ? t('dailyQuote.preferencesOffline')
                : t('dailyQuote.saveError')}
          </p>
          {isDailyQuoteConflict(mutation.error) ? (
            <button
              type="button"
              className="button-link"
              onClick={() => void reload()}
            >
              {t('dailyQuote.reload')}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
