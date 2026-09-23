import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { normalizeClientError } from '../client/problemDetails';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { ListEntryIconButton, useListItemReorder } from './ListEntryActions';

export interface DashboardSettingsPanelProps {
  dashboardApi: DashboardApi;
  accountId: string;
  spaceId: string;
}

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
  const [pendingVisibility, setPendingVisibility] = useState<
    Partial<Record<DashboardModuleKey, boolean>>
  >({});
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
    mutationFn: async ({
      moduleKey,
      visible,
    }: {
      moduleKey: DashboardModuleKey;
      visible: boolean;
      previousVisible: boolean;
    }) => {
      try {
        return await dashboardApi.updateDashboardModulePreference({
          moduleKey,
          spaceId,
          dashboardModulePreferenceUpdate: { visible },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<DashboardModulePreferenceList>(queryKey, (old) =>
        patchPreference(old, updated.moduleKey, { visible: updated.visible }),
      );
      setPendingVisibility((old) => {
        const next = { ...old };
        delete next[updated.moduleKey as DashboardModuleKey];
        return next;
      });
      setSavedModuleKey(updated.moduleKey as DashboardModuleKey);
    },
    onError: (_error, { moduleKey, previousVisible }) => {
      queryClient.setQueryData<DashboardModulePreferenceList>(queryKey, (old) =>
        patchPreference(old, moduleKey, { visible: previousVisible }),
      );
      setPendingVisibility((old) => {
        const next = { ...old };
        delete next[moduleKey];
        return next;
      });
      setSavedModuleKey(null);
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

  const visibilityStatus = visibilityMutation.isPending
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
            const isRowPending =
              visibilityMutation.isPending &&
              visibilityMutation.variables?.moduleKey === entry.key;
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
                  checked={pendingVisibility[entry.key] ?? visible}
                  disabled={isRowPending || preferencesQuery.isPending}
                  onChange={(event) => {
                    const visible = event.target.checked;
                    const previousVisible = isDashboardModuleVisible(
                      queryClient.getQueryData<DashboardModulePreferenceList>(
                        queryKey,
                      ),
                      entry.key,
                    );
                    queryClient.setQueryData<DashboardModulePreferenceList>(
                      queryKey,
                      (old) => patchPreference(old, entry.key, { visible }),
                    );
                    setPendingVisibility((old) => ({
                      ...old,
                      [entry.key]: visible,
                    }));
                    setSavedModuleKey(null);
                    visibilityMutation.mutate({
                      moduleKey: entry.key,
                      visible,
                      previousVisible,
                    });
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
      {visibilityMutation.error ? (
        <ProblemState error={visibilityMutation.error} />
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
