import {
  type QueryClient,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { DashboardModulePreferenceList } from '../api/generated/models/DashboardModulePreferenceList';
import type { DashboardModulePreferenceView } from '../api/generated/models/DashboardModulePreferenceView';
import {
  DASHBOARD_MODULE_CATALOG,
  type DashboardModuleKey,
} from '../client/dashboardModules';
import {
  dashboardPreferencesQueryKey,
  effectiveUpcomingItemLimit,
  isDashboardModuleVisible,
  orderedDashboardModuleKeys,
  withDashboardModuleOrder,
  type UpcomingItemLimit,
  UPCOMING_ITEM_LIMITS,
  UPCOMING_MODULE_KEY,
} from '../client/dashboardPreferences';
import { assertOnlineWrite } from '../client/connectivity';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { ListEntryIconButton, useListItemReorder } from './ListEntryActions';

export interface DashboardSettingsPanelProps {
  dashboardApi: DashboardApi;
  accountId: string;
  spaceId: string;
}

type PreferenceQueryWrite = {
  moduleKey: DashboardModuleKey;
  key: ReturnType<typeof dashboardPreferencesQueryKey>;
  isCurrentQuery: () => boolean;
};

type PreferenceRowContext = {
  previous: DashboardModulePreferenceView | undefined;
  optimistic: DashboardModulePreferenceView | undefined;
};

type UpcomingLimitWrite = PreferenceQueryWrite & {
  scope: string;
  itemLimit: UpcomingItemLimit;
  api: DashboardApi;
  spaceId: string;
};

type VisibilityWrite = {
  id: number;
  scope: string;
  rowScope: string;
  moduleKey: DashboardModuleKey;
  visible: boolean;
  key: ReturnType<typeof dashboardPreferencesQueryKey>;
  isCurrentQuery: () => boolean;
  api: DashboardApi;
  spaceId: string;
};

function patchPreference(
  old: DashboardModulePreferenceList | undefined,
  moduleKey: string,
  facet: Partial<DashboardModulePreferenceView>,
): DashboardModulePreferenceList {
  const items = [...(old?.items ?? [])];
  const index = items.findIndex((item) => item.moduleKey === moduleKey);
  const updated = {
    ...(items[index] ?? { moduleKey, visible: true }),
    ...facet,
  };
  if (index >= 0) items[index] = updated;
  else items.push(updated);
  return { items };
}

/** One atomic Dashboard facet write, shared by visibility and upcoming limits. */
async function beginPreferenceFacetWrite(
  client: QueryClient,
  write: PreferenceQueryWrite,
  facet: Partial<DashboardModulePreferenceView>,
): Promise<PreferenceRowContext | null> {
  if (!write.isCurrentQuery()) return null;
  await client.cancelQueries({ queryKey: write.key, exact: true });
  if (!write.isCurrentQuery()) return null;
  const previous = client
    .getQueryData<DashboardModulePreferenceList>(write.key)
    ?.items.find((item) => item.moduleKey === write.moduleKey);
  client.setQueryData<DashboardModulePreferenceList>(write.key, (current) =>
    current ? patchPreference(current, write.moduleKey, facet) : current,
  );
  const optimistic = client
    .getQueryData<DashboardModulePreferenceList>(write.key)
    ?.items.find((item) => item.moduleKey === write.moduleKey);
  return { previous, optimistic };
}

/** A stale result cannot replace a later read or a different Query identity. */
function settlePreferenceFacetWrite(
  client: QueryClient,
  write: PreferenceQueryWrite,
  context: PreferenceRowContext | null | undefined,
  confirmedFacet?: Partial<DashboardModulePreferenceView>,
): boolean {
  if (!context?.optimistic || !write.isCurrentQuery()) return false;
  const current = client.getQueryData<DashboardModulePreferenceList>(write.key);
  if (
    !current ||
    current.items.find((item) => item.moduleKey === write.moduleKey) !==
      context.optimistic
  ) {
    return false;
  }
  const previous = context.previous;
  client.setQueryData<DashboardModulePreferenceList>(write.key, (data) => {
    if (
      !data ||
      data.items.find((item) => item.moduleKey === write.moduleKey) !==
        context.optimistic
    ) {
      return data;
    }
    if (confirmedFacet) {
      return patchPreference(data, write.moduleKey, confirmedFacet);
    }
    return {
      ...data,
      items: previous
        ? data.items.map((item) =>
            item === context.optimistic ? previous : item,
          )
        : data.items.filter((item) => item !== context.optimistic),
    };
  });
  return true;
}

export function DashboardSettingsPanel({
  dashboardApi,
  accountId,
  spaceId,
}: DashboardSettingsPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = dashboardPreferencesQueryKey(accountId, spaceId);
  const [pendingLimit, setPendingLimit] = useState<UpcomingItemLimit | null>(
    null,
  );
  const [saved, setSaved] = useState(false);
  const [savedModuleKey, setSavedModuleKey] =
    useState<DashboardModuleKey | null>(null);
  // Each independently submitted row remains pending until its own write settles.
  // Scoped keys prevent callbacks from an old Account/Space affecting a new task.
  const visibilityScope = JSON.stringify([accountId, spaceId]);
  const activeVisibilityScope = useRef(visibilityScope);
  activeVisibilityScope.current = visibilityScope;
  const visibilityWrites = useRef(new Map<string, VisibilityWrite>());
  const nextVisibilityId = useRef(0);
  const [pendingVisibility, setPendingVisibility] = useState<
    Record<string, { id: number; visible: boolean }>
  >({});
  const [visibilityError, setVisibilityError] = useState<{
    scope: string;
    error: unknown;
  } | null>(null);
  const visibilityMutationKey = ['dashboard-visibility', accountId, spaceId];
  const pendingVisibilityMutations = useMutationState({
    filters: {
      mutationKey: visibilityMutationKey,
      exact: true,
      status: 'pending',
    },
    select: (mutation) =>
      (mutation.state.variables as VisibilityWrite | undefined)?.moduleKey,
  });
  const [orderAnnouncement, setOrderAnnouncement] = useState('');
  const latestOrderRequest = useRef(0);

  const preferencesQuery = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await dashboardApi.listDashboardModulePreferences({ spaceId });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async (itemLimit: UpcomingItemLimit) => {
      try {
        return await dashboardApi.updateDashboardModulePreference({
          moduleKey: UPCOMING_MODULE_KEY,
          spaceId,
          dashboardModulePreferenceUpdate: { itemLimit },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: (itemLimit) => {
      setPendingLimit(itemLimit);
      setSaved(false);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<DashboardModulePreferenceList>(queryKey, (old) =>
        patchPreference(old, updated.moduleKey, {
          itemLimit: updated.itemLimit,
        }),
      );
      setPendingLimit(null);
      setSaved(true);
    },
    onError: () => {
      setPendingLimit(null);
      setSaved(false);
    },
  });

  const visibilityMutation = useMutation({
    mutationKey: visibilityMutationKey,
    // Never park a preference write for replay after reconnect.
    networkMode: 'always',
    retry: false,
    mutationFn: async (write: VisibilityWrite) => {
      if (!write.isCurrentQuery()) {
        throw new Error('Dashboard preference read is no longer authorized.');
      }
      assertOnlineWrite();
      try {
        return await write.api.updateDashboardModulePreference({
          moduleKey: write.moduleKey,
          spaceId: write.spaceId,
          dashboardModulePreferenceUpdate: { visible: write.visible },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: (write) =>
      beginPreferenceFacetWrite(queryClient, write, {
        visible: write.visible,
      }),
    onSuccess: (updated, write, context) => {
      // A later authoritative read or another write can replace this row.
      // Only the submitted optimistic row may consume its own response.
      const committed = settlePreferenceFacetWrite(queryClient, write, context, {
        visible: updated.visible,
      });
      if (
        committed &&
        activeVisibilityScope.current === write.scope &&
        write.isCurrentQuery()
      ) {
        setSavedModuleKey(write.moduleKey);
      }
    },
    onError: async (error, write, context) => {
      // Roll back the exact optimistic object, never a newer read or sibling.
      settlePreferenceFacetWrite(queryClient, write, context);
      if (
        write.isCurrentQuery() &&
        ['unauthorized', 'permission', 'notFound'].includes(
          clientProblemKind(error),
        )
      ) {
        await queryClient.resetQueries({ queryKey: write.key, exact: true });
      }
      if (
        activeVisibilityScope.current === write.scope &&
        write.isCurrentQuery()
      ) {
        setSavedModuleKey(null);
        setVisibilityError({ scope: write.scope, error });
      }
    },
    onSettled: (_result, _error, write) => {
      if (visibilityWrites.current.get(write.rowScope) === write) {
        visibilityWrites.current.delete(write.rowScope);
      }
      setPendingVisibility((current) => {
        if (current[write.rowScope]?.id !== write.id) return current;
        const next = { ...current };
        delete next[write.rowScope];
        return next;
      });
    },
  });

  const orderMutation = useMutation({
    mutationKey: ['dashboard-order', accountId, spaceId],
    scope: { id: `dashboard-order:${accountId}:${spaceId}` },
    mutationFn: async ({
      keys,
    }: {
      keys: DashboardModuleKey[];
      sequence: number;
    }) => {
      try {
        return await dashboardApi.updateDashboardModuleOrder({
          spaceId,
          dashboardModuleOrderUpdate: { moduleKeys: keys },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: ({ keys }) => {
      queryClient.setQueryData<DashboardModulePreferenceList>(queryKey, (old) =>
        withDashboardModuleOrder(old, keys),
      );
    },
    onSuccess: (savedOrder, { sequence }) => {
      if (sequence !== latestOrderRequest.current) return;
      queryClient.setQueryData<DashboardModulePreferenceList>(queryKey, (old) =>
        withDashboardModuleOrder(
          old,
          savedOrder.items.map((item) => item.moduleKey as DashboardModuleKey),
        ),
      );
      setOrderAnnouncement(t('profileIdentity.dashboardModuleSaved'));
    },
    onError: (_error, { sequence }) => {
      if (sequence !== latestOrderRequest.current) return;
      setOrderAnnouncement(t('profileIdentity.dashboardOrderFailed'));
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const orderedKeys = orderedDashboardModuleKeys(preferencesQuery.data);
  const reorder = useListItemReorder({
    itemIds: orderedKeys,
    animatePreview: true,
    disabled: preferencesQuery.isPending || Boolean(preferencesQuery.error),
    onReorder: (keys, moved) => {
      const next = keys as DashboardModuleKey[];
      const entry = DASHBOARD_MODULE_CATALOG.find((item) => item.key === moved);
      const position = next.indexOf(moved as DashboardModuleKey) + 1;
      orderMutation.mutate({
        keys: next,
        sequence: ++latestOrderRequest.current,
      });
      if (entry) {
        setOrderAnnouncement(
          t('profileIdentity.dashboardOrderPosition', {
            name: t(entry.labelKey),
            position,
            total: next.length,
          }),
        );
      }
    },
  });

  const confirmedLimit = effectiveUpcomingItemLimit(preferencesQuery.data);
  const selectedLimit = pendingLimit ?? confirmedLimit;
  const status = mutation.isPending
    ? t('profileIdentity.dashboardUpcomingSaving')
    : saved
      ? t('profileIdentity.dashboardUpcomingSaved')
      : preferencesQuery.isPending
        ? t('profileIdentity.dashboardUpcomingLoading')
        : null;

  const visibilityStatus =
    pendingVisibilityMutations.length > 0 ||
    Object.keys(pendingVisibility).some((key) =>
      key.startsWith(`${visibilityScope}:`),
    )
      ? t('profileIdentity.dashboardModuleSaving')
      : savedModuleKey
        ? t('profileIdentity.dashboardModuleSaved')
        : null;

  return (
    <section
      id="settings-dashboard"
      className="settings-section settings-dashboard-panel"
      aria-labelledby="settings-dashboard-heading"
    >
      <div className="settings-section-head">
        <h2 id="settings-dashboard-heading">
          {t('profileIdentity.settingsDashboard')}
        </h2>
        <p className="settings-section-intro">
          {t('profileIdentity.settingsDashboardIntro')}
        </p>
      </div>

      <fieldset
        className="dashboard-module-preference"
        aria-busy={preferencesQuery.isPending}
      >
        <legend>{t('profileIdentity.dashboardModulesTitle')}</legend>
        <p className="dashboard-module-question">
          {t('profileIdentity.dashboardModulesIntro')}
        </p>
        <div className="dashboard-module-list">
          {reorder.orderedItemIds.map((moduleKey) => {
            const entry = DASHBOARD_MODULE_CATALOG.find(
              (item) => item.key === moduleKey,
            );
            if (!entry) return null;
            const visible = isDashboardModuleVisible(
              preferencesQuery.data,
              entry.key,
            );
            const rowScope = `${visibilityScope}:${entry.key}`;
            const isRowPending =
              pendingVisibility[rowScope] !== undefined ||
              pendingVisibilityMutations.includes(entry.key);
            return (
              <div
                key={entry.key}
                className={`dashboard-module-option${reorder.activeItemId === entry.key ? ' is-dragging' : ''}`}
                data-sortable-item-id={entry.key}
              >
                <label
                  className="dashboard-module-option-label"
                  htmlFor={`dashboard-visible-${entry.key}`}
                >
                  {t(entry.labelKey)}
                </label>
                <input
                  id={`dashboard-visible-${entry.key}`}
                  aria-label={t(entry.labelKey)}
                  type="checkbox"
                  checked={pendingVisibility[rowScope]?.visible ?? visible}
                  disabled={isRowPending || preferencesQuery.isPending}
                  onChange={(event) => {
                    if (visibilityWrites.current.has(rowScope)) return;
                    // The mutation cache also prevents duplicate admission
                    // across a panel unmount/remount while a request is in flight.
                    const existing = queryClient
                      .getMutationCache()
                      .findAll({
                        mutationKey: visibilityMutationKey,
                        exact: true,
                      })
                      .some(
                        (mutation) =>
                          mutation.state.status === 'pending' &&
                          (
                            mutation.state.variables as
                              | VisibilityWrite
                              | undefined
                          )?.moduleKey === entry.key,
                      );
                    if (existing) return;
                    const isCurrentQuery = captureAuthorizedQuery(
                      queryClient,
                      queryKey,
                    );
                    if (!isCurrentQuery()) return;
                    const write: VisibilityWrite = {
                      id: ++nextVisibilityId.current,
                      scope: visibilityScope,
                      rowScope,
                      moduleKey: entry.key,
                      visible: event.target.checked,
                      key: queryKey,
                      isCurrentQuery,
                      api: dashboardApi,
                      spaceId,
                    };
                    visibilityWrites.current.set(rowScope, write);
                    setPendingVisibility((current) => ({
                      ...current,
                      [rowScope]: { id: write.id, visible: write.visible },
                    }));
                    setSavedModuleKey(null);
                    setVisibilityError(null);
                    visibilityMutation.mutate(write);
                  }}
                />
                <ListEntryIconButton
                  icon="reorder"
                  label={t('profileIdentity.dashboardOrderHandle', {
                    name: t(entry.labelKey),
                  })}
                  aria-describedby="dashboard-order-instructions"
                  {...reorder.handleProps(entry.key)}
                />
              </div>
            );
          })}
        </div>
        <p
          id="dashboard-order-instructions"
          className="dashboard-order-instructions"
        >
          {t('profileIdentity.dashboardOrderInstructions')}
        </p>
      </fieldset>

      <p className="dashboard-module-status" role="status" aria-live="polite">
        {orderAnnouncement}
      </p>
      {orderMutation.error ? (
        <ProblemState error={orderMutation.error} />
      ) : null}

      {visibilityStatus ? (
        <p className="dashboard-module-status" role="status" aria-live="polite">
          {visibilityStatus}
        </p>
      ) : null}
      {visibilityError?.scope === visibilityScope ? (
        <ProblemState error={visibilityError.error} />
      ) : null}

      <fieldset
        className="dashboard-upcoming-preference"
        aria-busy={mutation.isPending || preferencesQuery.isPending}
      >
        <legend>{t('profileIdentity.dashboardUpcomingTitle')}</legend>
        <p className="dashboard-upcoming-question">
          {t('profileIdentity.dashboardUpcomingQuestion')}
        </p>
        <div className="dashboard-upcoming-options">
          {UPCOMING_ITEM_LIMITS.map((itemLimit) => (
            <label
              key={itemLimit}
              className={
                selectedLimit === itemLimit
                  ? 'dashboard-upcoming-option is-selected'
                  : 'dashboard-upcoming-option'
              }
            >
              <input
                type="radio"
                name="dashboardUpcomingItemLimit"
                value={itemLimit}
                checked={selectedLimit === itemLimit}
                disabled={mutation.isPending || preferencesQuery.isPending}
                onChange={() => mutation.mutate(itemLimit)}
              />
              <span>{itemLimit}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {status ? (
        <p
          className="dashboard-upcoming-status"
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
      ) : null}

      {preferencesQuery.error ? (
        <ProblemState
          error={preferencesQuery.error}
          onRetry={() => void preferencesQuery.refetch()}
        />
      ) : null}
      {mutation.error ? <ProblemState error={mutation.error} /> : null}
    </section>
  );
}
