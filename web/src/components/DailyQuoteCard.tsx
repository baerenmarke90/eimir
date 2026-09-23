import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DailyQuoteApi } from '../api/generated/apis/DailyQuoteApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { DailyQuotePreferencePatch } from '../api/generated/models/DailyQuotePreferencePatch';
import {
  dailyQuoteCatalogQueryKey,
  dailyQuoteEntitlementQueryKey,
  dailyQuotePreferencesQueryKey,
  dailyQuoteQueryKey,
  isDailyQuoteConflict,
  isDailyQuoteEntitlementRequired,
  loadDailyQuote,
  loadDailyQuoteCapability,
  loadDailyQuoteCatalog,
  loadDailyQuotePreferences,
  saveDailyQuotePreferences,
  type DailyQuotePreferenceSnapshot,
} from '../client/dailyQuote';
import { clientProblemKind } from '../client/problemDetails';
import { useTranslation } from '../i18n';
import { PreferenceSwitch } from './PreferenceSwitch';
import { ProMark } from './ProMark';
import { ShortTaskSheet } from './ShortTaskSheet';
import './DailyQuoteCard.css';

interface DailyQuoteDraft {
  enabled: boolean;
  categoryIds: string[];
  sourceIds: string[];
}

function toggleSelection(values: string[], id: string): string[] {
  return values.includes(id)
    ? values.filter((value) => value !== id)
    : [...values, id];
}

function QuoteStateMessage({
  className,
  children,
  detail,
  action,
}: {
  className: string;
  children: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`daily-quote-state ${className}`}>
      <p className="daily-quote-state-title">{children}</p>
      {detail ? <p className="daily-quote-state-detail">{detail}</p> : null}
      {action}
    </div>
  );
}

function PreferencesContent({
  catalog,
  draft,
  partnerName,
  pending,
  error,
  onDraftChange,
  onReload,
  onCancel,
  onSave,
}: {
  catalog: Awaited<ReturnType<typeof loadDailyQuoteCatalog>>;
  draft: DailyQuoteDraft;
  partnerName?: string;
  pending: boolean;
  error: unknown;
  onDraftChange: (draft: DailyQuoteDraft) => void;
  onReload: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const problemKind = clientProblemKind(error);
  const conflict = isDailyQuoteConflict(error);

  return (
    <div className="daily-quote-preferences">
      <p className="daily-quote-privacy">
        {partnerName
          ? t('dailyQuote.privacy', { name: partnerName })
          : t('dailyQuote.privacyFallback')}
      </p>

      <PreferenceSwitch
        label={t('dailyQuote.enabledLabel')}
        description={t('dailyQuote.enabledDescription')}
        checked={draft.enabled}
        disabled={pending}
        onCheckedChange={(enabled) =>
          onDraftChange({
            ...draft,
            enabled,
          })
        }
      />

      <fieldset
        className="daily-quote-choice-group"
        disabled={pending || !draft.enabled}
      >
        <legend>{t('dailyQuote.categories')}</legend>
        <div className="daily-quote-category-grid">
          {catalog.categories.map((category) => {
            const selected = draft.categoryIds.includes(category.id);
            return (
              <label
                key={category.id}
                className={`daily-quote-category${selected ? ' is-selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={pending}
                  onChange={() =>
                    onDraftChange({
                      ...draft,
                      categoryIds: toggleSelection(
                        draft.categoryIds,
                        category.id,
                      ),
                    })
                  }
                />
                <span aria-hidden="true" className="daily-quote-category-check">
                  {selected ? '✓' : ''}
                </span>
                <span>{category.name}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset
        className="daily-quote-choice-group daily-quote-source-group"
        disabled={pending || !draft.enabled}
      >
        <legend>{t('dailyQuote.sources')}</legend>
        <div className="daily-quote-source-list">
          {catalog.sources.map((source) => {
            const selected = draft.sourceIds.includes(source.id);
            return (
              <label key={source.id} className="daily-quote-source">
                <span className="daily-quote-source-copy">
                  <strong>{source.name}</strong>
                  <span>{source.description}</span>
                </span>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={pending}
                  onChange={() =>
                    onDraftChange({
                      ...draft,
                      sourceIds: toggleSelection(draft.sourceIds, source.id),
                    })
                  }
                />
                <span aria-hidden="true" className="daily-quote-source-check">
                  {selected ? '✓' : ''}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="daily-quote-footnote">{t('dailyQuote.footnote')}</p>

      {error ? (
        <div className="daily-quote-preference-error" role="alert">
          <p>
            {conflict
              ? t('dailyQuote.conflict')
              : problemKind === 'offline'
                ? t('dailyQuote.preferencesOffline')
                : t('dailyQuote.saveError')}
          </p>
          {conflict ? (
            <button type="button" className="button-link" onClick={onReload}>
              {t('dailyQuote.reload')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="daily-quote-preference-actions">
        <button
          type="button"
          className="primary"
          disabled={pending}
          onClick={onSave}
        >
          {pending ? t('dailyQuote.saving') : t('dailyQuote.done')}
        </button>
        <button type="button" disabled={pending} onClick={onCancel}>
          {t('dailyQuote.cancel')}
        </button>
      </div>
    </div>
  );
}

export function DailyQuoteCard({
  quoteApi,
  entitlementsApi,
  accountId,
  spaceId,
  partnerName,
}: {
  quoteApi: DailyQuoteApi;
  entitlementsApi: EntitlementsApi;
  accountId: string;
  spaceId: string;
  partnerName?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<DailyQuoteDraft | null>(null);

  const entitlementKey = useMemo(
    () => dailyQuoteEntitlementQueryKey(accountId, spaceId),
    [accountId, spaceId],
  );
  const quoteKey = useMemo(
    () => dailyQuoteQueryKey(accountId, spaceId),
    [accountId, spaceId],
  );
  const catalogKey = useMemo(
    () => dailyQuoteCatalogQueryKey(accountId, spaceId),
    [accountId, spaceId],
  );
  const preferencesKey = useMemo(
    () => dailyQuotePreferencesQueryKey(accountId, spaceId),
    [accountId, spaceId],
  );

  const entitlementQuery = useQuery({
    queryKey: entitlementKey,
    queryFn: ({ signal }) =>
      loadDailyQuoteCapability(entitlementsApi, spaceId, signal),
    enabled: Boolean(accountId && spaceId),
    retry: false,
    gcTime: 0,
  });

  const hasCapability = entitlementQuery.data === true;

  const quoteQuery = useQuery({
    queryKey: quoteKey,
    queryFn: ({ signal }) => loadDailyQuote(quoteApi, spaceId, signal),
    enabled: hasCapability,
    retry: false,
    gcTime: 0,
  });

  const catalogQuery = useQuery({
    queryKey: catalogKey,
    queryFn: ({ signal }) => loadDailyQuoteCatalog(quoteApi, spaceId, signal),
    enabled: hasCapability,
    retry: false,
  });

  const preferencesQuery = useQuery({
    queryKey: preferencesKey,
    queryFn: ({ signal }) =>
      loadDailyQuotePreferences(quoteApi, spaceId, signal),
    enabled: settingsOpen && hasCapability,
    retry: false,
    gcTime: 0,
  });

  useEffect(() => {
    if (!settingsOpen || !preferencesQuery.data) return;
    setDraft({
      enabled: preferencesQuery.data.preference.enabled,
      categoryIds: [...preferencesQuery.data.preference.selectedCategoryIds],
      sourceIds: [...preferencesQuery.data.preference.selectedSourceIds],
    });
  }, [preferencesQuery.data, settingsOpen]);

  useEffect(() => {
    if (!isDailyQuoteEntitlementRequired(quoteQuery.error)) return;
    queryClient.setQueryData(entitlementKey, false);
  }, [entitlementKey, quoteQuery.error, queryClient]);

  useEffect(() => {
    if (!isDailyQuoteEntitlementRequired(catalogQuery.error)) return;
    setSettingsOpen(false);
    setDraft(null);
    queryClient.removeQueries({ queryKey: preferencesKey, exact: true });
    queryClient.setQueryData(entitlementKey, false);
  }, [catalogQuery.error, entitlementKey, preferencesKey, queryClient]);

  useEffect(() => {
    if (!isDailyQuoteEntitlementRequired(preferencesQuery.error)) return;
    setSettingsOpen(false);
    setDraft(null);
    queryClient.removeQueries({ queryKey: preferencesKey, exact: true });
    queryClient.setQueryData(entitlementKey, false);
  }, [entitlementKey, preferencesKey, preferencesQuery.error, queryClient]);

  const saveMutation = useMutation({
    mutationFn: ({
      snapshot,
      nextDraft,
    }: {
      snapshot: DailyQuotePreferenceSnapshot;
      nextDraft: DailyQuoteDraft;
    }) => {
      const patch: DailyQuotePreferencePatch = {
        enabled: nextDraft.enabled,
        selectedCategoryIds: nextDraft.categoryIds,
        selectedSourceIds: nextDraft.sourceIds,
      };
      return saveDailyQuotePreferences(quoteApi, spaceId, snapshot, patch);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: preferencesKey, exact: true });
      void queryClient.invalidateQueries({ queryKey: quoteKey });
      setSettingsOpen(false);
      setDraft(null);
    },
    onError: (error) => {
      if (!isDailyQuoteEntitlementRequired(error)) return;
      queryClient.removeQueries({ queryKey: preferencesKey, exact: true });
      queryClient.setQueryData(entitlementKey, false);
      setSettingsOpen(false);
      setDraft(null);
    },
  });

  const categoryNames = useMemo(
    () =>
      new Map(
        (catalogQuery.data?.categories ?? []).map((category) => [
          category.id,
          category.name,
        ]),
      ),
    [catalogQuery.data],
  );

  const openSettings = () => {
    saveMutation.reset();
    setDraft(null);
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    if (saveMutation.isPending) return;
    saveMutation.reset();
    queryClient.removeQueries({ queryKey: preferencesKey, exact: true });
    setDraft(null);
    setSettingsOpen(false);
  };

  const reloadPreferences = async () => {
    saveMutation.reset();
    const result = await preferencesQuery.refetch();
    if (result.data) {
      setDraft({
        enabled: result.data.preference.enabled,
        categoryIds: [...result.data.preference.selectedCategoryIds],
        sourceIds: [...result.data.preference.selectedSourceIds],
      });
    }
  };

  const retryEntitlement = () => void entitlementQuery.refetch();
  const retryQuote = () => void quoteQuery.refetch();

  if (hasCapability && quoteQuery.data?.enabled === false) {
    return null;
  }

  let body: React.ReactNode;
  let settingsAvailable = false;

  if (entitlementQuery.isPending) {
    body = (
      <QuoteStateMessage className="is-loading">
        {t('dailyQuote.loading')}
      </QuoteStateMessage>
    );
  } else if (entitlementQuery.error) {
    body = (
      <QuoteStateMessage
        className="is-error"
        detail={
          clientProblemKind(entitlementQuery.error) === 'offline'
            ? t('dailyQuote.unavailableOffline')
            : undefined
        }
        action={
          <button
            type="button"
            className="daily-quote-retry"
            onClick={retryEntitlement}
          >
            {t('dailyQuote.retry')}
          </button>
        }
      >
        {t('dailyQuote.unavailable')}
      </QuoteStateMessage>
    );
  } else if (!hasCapability) {
    body = (
      <QuoteStateMessage
        className="is-discovery"
        detail={t('dailyQuote.discoveryMeta')}
      >
        {t('dailyQuote.discovery')}
      </QuoteStateMessage>
    );
  } else if (quoteQuery.isPending) {
    body = (
      <QuoteStateMessage className="is-loading">
        {t('dailyQuote.loading')}
      </QuoteStateMessage>
    );
  } else if (isDailyQuoteEntitlementRequired(quoteQuery.error)) {
    body = (
      <QuoteStateMessage
        className="is-discovery"
        detail={t('dailyQuote.discoveryMeta')}
      >
        {t('dailyQuote.discovery')}
      </QuoteStateMessage>
    );
  } else if (quoteQuery.error) {
    body = (
      <QuoteStateMessage
        className="is-error"
        detail={
          clientProblemKind(quoteQuery.error) === 'offline'
            ? t('dailyQuote.unavailableOffline')
            : undefined
        }
        action={
          <button
            type="button"
            className="daily-quote-retry"
            onClick={retryQuote}
          >
            {t('dailyQuote.retry')}
          </button>
        }
      >
        {t('dailyQuote.unavailable')}
      </QuoteStateMessage>
    );
  } else if (!quoteQuery.data?.quote) {
    settingsAvailable = true;
    body = (
      <QuoteStateMessage
        className="is-empty"
        detail={t('dailyQuote.emptyMeta')}
      >
        {t('dailyQuote.empty')}
      </QuoteStateMessage>
    );
  } else {
    settingsAvailable = true;
    const quote = quoteQuery.data.quote;
    const visibleCategories = quote.categoryIds
      .map((id) => categoryNames.get(id))
      .filter((name): name is string => Boolean(name));
    const attribution = quote.sourceDisplay
      ? t('dailyQuote.quoteAttribution', {
          author: quote.authorDisplay,
          source: quote.sourceDisplay,
        })
      : t('dailyQuote.quoteAttributionAuthorOnly', {
          author: quote.authorDisplay,
        });

    body = (
      <>
        <blockquote className="daily-quote-block">
          <p>„{quote.text}“</p>
          {quote.attributionRequired ? <footer>{attribution}</footer> : null}
        </blockquote>
        {visibleCategories.length > 0 ? (
          <ul
            className="daily-quote-categories"
            aria-label={t('dailyQuote.categories')}
          >
            {visibleCategories.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : null}
      </>
    );
  }

  const snapshot = preferencesQuery.data;
  const preferenceReady =
    snapshot && catalogQuery.data && draft
      ? { snapshot, catalog: catalogQuery.data, draft }
      : null;

  return (
    <>
      <section
        className="daily-quote-card"
        data-color-world="warm"
        aria-labelledby="daily-quote-title"
      >
        <header className="daily-quote-header">
          <div className="daily-quote-heading-group">
            <span className="today-section-kicker">
              {t('dailyQuote.kicker')}
            </span>
            <div className="daily-quote-heading">
              <h2 id="daily-quote-title" className="today-section-title">
                {t('dailyQuote.title')}
              </h2>
              <ProMark label={t('dailyQuote.pro')} />
            </div>
          </div>
          {settingsAvailable ? (
            <button
              ref={settingsButtonRef}
              type="button"
              className="daily-quote-settings"
              aria-label={t('dailyQuote.settingsAria')}
              onClick={openSettings}
            >
              <span aria-hidden="true">•••</span>
            </button>
          ) : null}
        </header>
        {body}
      </section>

      <ShortTaskSheet
        open={settingsOpen}
        title={t('dailyQuote.sheetTitle')}
        onClose={closeSettings}
        restoreFocusRef={settingsButtonRef}
        closeLabel={t('dailyQuote.close')}
        className="daily-quote-preferences-sheet"
      >
        {preferencesQuery.isPending || catalogQuery.isPending ? (
          <p className="daily-quote-preferences-status" role="status">
            {t('dailyQuote.preferencesLoading')}
          </p>
        ) : preferencesQuery.error || catalogQuery.error ? (
          <div className="daily-quote-preference-error" role="alert">
            <p>
              {clientProblemKind(
                preferencesQuery.error ?? catalogQuery.error,
              ) === 'offline'
                ? t('dailyQuote.preferencesOffline')
                : t('dailyQuote.preferencesUnavailable')}
            </p>
            <button
              type="button"
              className="button-link"
              onClick={() => {
                void preferencesQuery.refetch();
                void catalogQuery.refetch();
              }}
            >
              {t('dailyQuote.retry')}
            </button>
          </div>
        ) : preferenceReady ? (
          <PreferencesContent
            catalog={preferenceReady.catalog}
            draft={preferenceReady.draft}
            partnerName={partnerName}
            pending={saveMutation.isPending}
            error={saveMutation.error}
            onDraftChange={(nextDraft) => {
              saveMutation.reset();
              setDraft(nextDraft);
            }}
            onReload={() => void reloadPreferences()}
            onCancel={closeSettings}
            onSave={() =>
              saveMutation.mutate({
                snapshot: preferenceReady.snapshot,
                nextDraft: preferenceReady.draft,
              })
            }
          />
        ) : null}
      </ShortTaskSheet>
    </>
  );
}
