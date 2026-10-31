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
import { assertOnlineWrite } from '../client/connectivity';
import {
  DASHBOARD_MODULE_CATALOG,
  type DashboardModuleKey,
} from '../client/dashboardModules';
import {
  dashboardPreferencesQueryKey,
  effectiveUpcomingItemLimit,
  isDashboardModuleVisible,
  orderedDashboardModuleKeys,
  UPCOMING_ITEM_LIMITS,
  UPCOMING_MODULE_KEY,
  type UpcomingItemLimit,
  withDashboardModuleOrder,
} from '../client/dashboardPreferences';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { useTranslation } from '../i18n';
import { ListEntryIconButton, useListItemReorder } from './ListEntryActions';
import { ProblemState } from './ProblemState';

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

type DashboardOrderWrite = {
  keys: DashboardModuleKey[];
  sequence: number;
  scope: string;
  key: ReturnType<typeof dashboardPreferencesQueryKey>;
  isCurrentQuery: () => boolean;
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
  const [pendingLimit, setPendingLimit] = useState<UpcomingLimitWrite | null>(
    null,
  );
  const [savedLimitScope, setSavedLimitScope] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<{
    scope: string;
    error: unknown;
  } | null>(null);
  const upcomingWriteRef = useRef<UpcomingLimitWrite | null>(null);
  const upcomingMutationKey = ['dashboard-upcoming-limit', accountId, spaceId];
  const pendingUpcomingMutations = useMutationState({
    filters: {
      mutationKey: upcomingMutationKey,
      exact: true,
      status: 'pending',
    },
    select: (entry) => entry.state.variables as UpcomingLimitWrite | undefined,
  });
  const [savedModuleKey, setSavedModuleKey] =
    useState<DashboardModuleKey | null>(null);
  // Each independently submitted row remains pending until its own write settles.
  // Scoped keys prevent callbacks from an old Account/Space affecting a new task.
  const settingsScope = JSON.stringify([accountId, spaceId]);
  const activeSettingsScope = useRef(settingsScope);
  activeSettingsScope.current = settingsScope;
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
  const [orderAnnouncement, setOrderAnnouncement] = useState<{
    scope: string;
    message: string;
  } | null>(null);
  const [orderError, setOrderError] = useState<{
    scope: string;
    error: unknown;
  } | null>(null);
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

  const upcomingMutation = useMutation({
    mutationKey: upcomingMutationKey,
    networkMode: 'always',
    retry: false,
    mutationFn: async (write: UpcomingLimitWrite) => {
      // The submitted identity must still own the original authorized read.
      if (!write.isCurrentQuery()) {
        throw new Error('Dashboard preference read is no longer authorized.');
      }
      assertOnlineWrite();
      try {
        return await write.api.updateDashboardModulePreference({
          moduleKey: UPCOMING_MODULE_KEY,
          spaceId: write.spaceId,
          dashboardModulePreferenceUpdate: { itemLimit: write.itemLimit },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: (write) =>
      beginPreferenceFacetWrite(queryClient, write, {
        itemLimit: write.itemLimit,
      }),
    onSuccess: (updated, write, context) => {
      const committed = settlePreferenceFacetWrite(
        queryClient,
        write,
        context,
        {
          itemLimit: updated.itemLimit,
        },
      );
      if (
        committed &&
        activeSettingsScope.current === write.scope &&
        write.isCurrentQuery()
      ) {
        setSavedLimitScope(write.scope);
      }
    },
    onError: async (error, write, context) => {
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
        activeSettingsScope.current === write.scope &&
        write.isCurrentQuery()
      ) {
        setSavedLimitScope(null);
        setLimitError({ scope: write.scope, error });
      }
    },
    onSettled: (_updated, _error, write) => {
      if (upcomingWriteRef.current === write) upcomingWriteRef.current = null;
      setPendingLimit((current) => (current === write ? null : current));
    },
  });

  function changeUpcomingLimit(itemLimit: UpcomingItemLimit) {
    if (
      preferencesQuery.isPending ||
      preferencesQuery.error ||
      upcomingWriteRef.current?.scope === settingsScope ||
      queryClient.isMutating({
        mutationKey: upcomingMutationKey,
        exact: true,
      }) > 0 ||
      visibilityWrites.current.has(`${settingsScope}:${UPCOMING_MODULE_KEY}`) ||
      queryClient
        .getMutationCache()
        .findAll({ mutationKey: visibilityMutationKey, exact: true })
        .some(
          (mutation) =>
            mutation.state.status === 'pending' &&
            (mutation.state.variables as VisibilityWrite | undefined)
              ?.moduleKey === UPCOMING_MODULE_KEY,
        )
    ) {
      return;
    }
    const isCurrentQuery = captureAuthorizedQuery(queryClient, queryKey);
    if (!isCurrentQuery()) return;
    const write: UpcomingLimitWrite = {
      scope: settingsScope,
      key: queryKey,
      moduleKey: UPCOMING_MODULE_KEY,
      itemLimit,
      api: dashboardApi,
      spaceId,
      isCurrentQuery,
    };
    upcomingWriteRef.current = write;
    setPendingLimit(write);
    setSavedLimitScope(null);
    setLimitError(null);
    upcomingMutation.mutate(write);
  }

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
      const committed = settlePreferenceFacetWrite(
        queryClient,
        write,
        context,
        {
          visible: updated.visible,
        },
      );
      if (
        committed &&
        activeSettingsScope.current === write.scope &&
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
        activeSettingsScope.current === write.scope &&
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
    // Existing serialization is required for rapid keyboard/drag reorders.
    scope: { id: `dashboard-order:${accountId}:${spaceId}` },
    networkMode: 'always',
    retry: false,
    mutationFn: async (write: DashboardOrderWrite) => {
      if (
        activeSettingsScope.current !== write.scope ||
        !write.isCurrentQuery()
      ) {
        throw new Error('Dashboard order task is no longer authorized.');
      }
      assertOnlineWrite();
      try {
        return await write.api.updateDashboardModuleOrder({
          spaceId: write.spaceId,
          dashboardModuleOrderUpdate: { moduleKeys: write.keys },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: async (write) => {
      if (
        activeSettingsScope.current !== write.scope ||
        !write.isCurrentQuery()
      ) {
        return null;
      }
      await queryClient.cancelQueries({ queryKey: write.key, exact: true });
      if (
        activeSettingsScope.current !== write.scope ||
        !write.isCurrentQuery()
      ) {
        return null;
      }
      const current = queryClient.getQueryData<DashboardModulePreferenceList>(
        write.key,
      );
      if (!current) return null;
      queryClient.setQueryData<DashboardModulePreferenceList>(
        write.key,
        (old) => (old ? withDashboardModuleOrder(old, write.keys) : old),
      );
      return { optimisticKeys: write.keys };
    },
    onSuccess: (savedOrder, write, context) => {
      if (
        !context ||
        write.sequence !== latestOrderRequest.current ||
        activeSettingsScope.current !== write.scope ||
        !write.isCurrentQuery()
      ) {
        return;
      }
      const current = queryClient.getQueryData<DashboardModulePreferenceList>(
        write.key,
      );
      if (
        !current ||
        orderedDashboardModuleKeys(current).some(
          (key, index) => key !== context.optimisticKeys[index],
        )
      ) {
        // A later authoritative read or independently submitted order wins.
        return;
      }
      queryClient.setQueryData<DashboardModulePreferenceList>(
        write.key,
        (old) =>
          old &&
          orderedDashboardModuleKeys(old).every(
            (key, index) => key === context.optimisticKeys[index],
          )
            ? withDashboardModuleOrder(
                old,
                savedOrder.items.map(
                  (item) => item.moduleKey as DashboardModuleKey,
                ),
              )
            : old,
      );
      setOrderError(null);
      setOrderAnnouncement({
        scope: write.scope,
        message: t('profileIdentity.dashboardModuleSaved'),
      });
    },
    onError: (error, write, context) => {
      if (
        !context ||
        write.sequence !== latestOrderRequest.current ||
        activeSettingsScope.current !== write.scope ||
        !write.isCurrentQuery()
      ) {
        return;
      }
      const current = queryClient.getQueryData<DashboardModulePreferenceList>(
        write.key,
      );
      if (
        !current ||
        orderedDashboardModuleKeys(current).some(
          (key, index) => key !== context.optimisticKeys[index],
        )
      ) {
        // Do not invalidate an independent newer read or another task.
        return;
      }
      setOrderError({ scope: write.scope, error });
      setOrderAnnouncement({
        scope: write.scope,
        message: t('profileIdentity.dashboardOrderFailed'),
      });
      void queryClient.invalidateQueries({
        queryKey: write.key,
        exact: true,
      });
    },
  });

  const orderedKeys = orderedDashboardModuleKeys(preferencesQuery.data);
  const reorder = useListItemReorder({
    itemIds: orderedKeys,
    animatePreview: true,
    disabled: preferencesQuery.isPending || Boolean(preferencesQuery.error),
    onReorder: (keys, moved) => {
      const isCurrentQuery = captureAuthorizedQuery(queryClient, queryKey);
      if (!isCurrentQuery()) return;
      const next = keys as DashboardModuleKey[];
      const entry = DASHBOARD_MODULE_CATALOG.find((item) => item.key === moved);
      const position = next.indexOf(moved as DashboardModuleKey) + 1;
      const write: DashboardOrderWrite = {
        keys: next,
        sequence: ++latestOrderRequest.current,
        scope: settingsScope,
        key: queryKey,
        isCurrentQuery,
        api: dashboardApi,
        spaceId,
      };
      setOrderError(null);
      orderMutation.mutate(write);
      if (entry) {
        setOrderAnnouncement({
          scope: settingsScope,
          message: t('profileIdentity.dashboardOrderPosition', {
            name: t(entry.labelKey),
            position,
            total: keys.length,
          }),
        });
      }
    },
  });

  const confirmedLimit = effectiveUpcomingItemLimit(preferencesQuery.data);
  const pendingUpcoming = pendingUpcomingMutations.find((write) =>
    write?.isCurrentQuery(),
  );
  const activePendingLimit =
    pendingLimit?.scope === settingsScope ? pendingLimit : pendingUpcoming;
  const isLimitPending =
    Boolean(activePendingLimit) || pendingUpcomingMutations.length > 0;
  const selectedLimit = activePendingLimit?.itemLimit ?? confirmedLimit;
  const isUpcomingVisibilityPending =
    pendingVisibility[`${settingsScope}:${UPCOMING_MODULE_KEY}`] !==
      undefined || pendingVisibilityMutations.includes(UPCOMING_MODULE_KEY);
  const status = isLimitPending
    ? t('profileIdentity.dashboardUpcomingSaving')
    : savedLimitScope === settingsScope
      ? t('profileIdentity.dashboardUpcomingSaved')
      : preferencesQuery.isPending
        ? t('profileIdentity.dashboardUpcomingLoading')
        : null;

  const visibilityStatus =
    pendingVisibilityMutations.length > 0 ||
    Object.keys(pendingVisibility).some((key) =>
      key.startsWith(`${settingsScope}:`),
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
            const rowScope = `${settingsScope}:${entry.key}`;
            const isRowPending =
              pendingVisibility[rowScope] !== undefined ||
              pendingVisibilityMutations.includes(entry.key) ||
              (entry.key === UPCOMING_MODULE_KEY && isLimitPending);
            const hasDedicatedSetting =
              entry.key === 'shared_story_summary' ||
              entry.key === 'daily_quote';
            return (
              <div
                key={entry.key}
                className={`dashboard-module-option${reorder.activeItemId === entry.key ? ' is-dragging' : ''}`}
                data-sortable-item-id={entry.key}
              >
                {hasDedicatedSetting ? (
                  <span className="dashboard-module-option-label">
                    {t(entry.labelKey)}
                  </span>
                ) : (
                  <label
                    className="dashboard-module-option-label"
                    htmlFor={`dashboard-visible-${entry.key}`}
                  >
                    {t(entry.labelKey)}
                  </label>
                )}
                {hasDedicatedSetting ? (
                  <a
                    className="dashboard-module-configure"
                    aria-label={t('profileIdentity.dashboardModuleConfigure', {
                      name: t(entry.labelKey),
                    })}
                    href={
                      entry.key === 'daily_quote'
                        ? '#settings-daily-quote'
                        : '#wir-statistics-setting'
                    }
                  >
                    {t('common.edit')}
                  </a>
                ) : (
                  <input
                    id={`dashboard-visible-${entry.key}`}
                    aria-label={t(entry.labelKey)}
                    type="checkbox"
                    checked={pendingVisibility[rowScope]?.visible ?? visible}
                    disabled={isRowPending || preferencesQuery.isPending}
                    onChange={(event) => {
                      if (
                        visibilityWrites.current.has(rowScope) ||
                        (entry.key === UPCOMING_MODULE_KEY &&
                          (upcomingWriteRef.current?.scope === settingsScope ||
                            queryClient.isMutating({
                              mutationKey: upcomingMutationKey,
                              exact: true,
                            }) > 0))
                      ) {
                        return;
                      }
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
                        scope: settingsScope,
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
                )}
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
        {orderAnnouncement?.scope === settingsScope
          ? orderAnnouncement.message
          : null}
      </p>
      {orderError?.scope === settingsScope ? (
        <ProblemState error={orderError.error} />
      ) : null}

      {visibilityStatus ? (
        <p className="dashboard-module-status" role="status" aria-live="polite">
          {visibilityStatus}
        </p>
      ) : null}
      {visibilityError?.scope === settingsScope ? (
        <ProblemState error={visibilityError.error} />
      ) : null}

      <fieldset
        className="dashboard-upcoming-preference"
        aria-busy={isLimitPending || preferencesQuery.isPending}
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
                disabled={
                  isLimitPending ||
                  isUpcomingVisibilityPending ||
                  preferencesQuery.isPending ||
                  Boolean(preferencesQuery.error)
                }
                onChange={() => changeUpcomingLimit(itemLimit)}
              />
              <span>
                {itemLimit}
                {selectedLimit === itemLimit ? (
                  <span aria-hidden="true"> ✓</span>
                ) : null}
              </span>
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
      {limitError?.scope === settingsScope ? (
        <ProblemState error={limitError.error} />
      ) : null}
    </section>
  );
}
