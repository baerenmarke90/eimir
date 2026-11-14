import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { assertOnlineWrite, isClientOnline } from '../client/connectivity';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { DashboardModulePreferenceList } from '../api/generated/models/DashboardModulePreferenceList';
import {
  dashboardPreferencesQueryKey,
  PINNED_COLLECTION_MODULE_KEY,
  selectedDashboardCollectionIds,
} from '../client/dashboardPreferences';
import {
  ClientProblemError,
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';

type Selection = {
  accountId: string;
  spaceId: string;
  selectedCollectionIds: string[];
  api: DashboardApi;
  isCurrentQuery: () => boolean;
};

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function useCollectionPin({
  dashboardApi,
  accountId = '',
  spaceId,
}: {
  dashboardApi?: DashboardApi;
  accountId?: string;
  spaceId: string;
}) {
  const queryClient = useQueryClient();
  const inFlightRef = useRef<Selection | null>(null);
  const [pendingSelection, setPendingSelection] = useState<Selection | null>(
    null,
  );
  const queryKey = dashboardPreferencesQueryKey(accountId, spaceId);
  const mutationKey = ['collection-pin', accountId, spaceId];
  const activeWrites = useIsMutating({ mutationKey, exact: true });
  const query = useQuery({
    queryKey,
    queryFn: () => {
      if (!dashboardApi) throw new Error('Dashboard API is not available.');
      return apiCall(() =>
        dashboardApi.listDashboardModulePreferences({ spaceId }),
      );
    },
    enabled: Boolean(dashboardApi && accountId && spaceId),
    retry: false,
  });
  const clearPending = (selection: Selection) =>
    setPendingSelection((current) => (current === selection ? null : current));

  const mutation = useMutation({
    mutationKey,
    networkMode: 'always',
    retry: false,
    mutationFn: (selection: Selection) => {
      // A query may be denied or replaced while onMutate awaits cancellation.
      if (!selection.isCurrentQuery())
        throw new ClientProblemError('permission');
      assertOnlineWrite();
      return apiCall(() =>
        selection.api.updateDashboardModulePreference({
          moduleKey: PINNED_COLLECTION_MODULE_KEY,
          spaceId: selection.spaceId,
          dashboardModulePreferenceUpdate: {
            selectedCollectionIds: selection.selectedCollectionIds,
            visible: selection.selectedCollectionIds.length ? true : undefined,
          },
        }),
      );
    },
    onMutate: async (selection) => {
      const key = dashboardPreferencesQueryKey(
        selection.accountId,
        selection.spaceId,
      );
      const isCurrentQuery = selection.isCurrentQuery;
      if (isCurrentQuery())
        await queryClient.cancelQueries({ queryKey: key, exact: true });
      const previous = isCurrentQuery()
        ? queryClient
            .getQueryData<DashboardModulePreferenceList>(key)
            ?.items.find(
              (item) => item.moduleKey === PINNED_COLLECTION_MODULE_KEY,
            )
        : undefined;
      if (isCurrentQuery()) {
        queryClient.setQueryData<DashboardModulePreferenceList>(
          key,
          (current) =>
            current
              ? {
                  ...current,
                  items: current.items.map((item) =>
                    item.moduleKey === PINNED_COLLECTION_MODULE_KEY
                      ? {
                          ...item,
                          selectedCollectionIds:
                            selection.selectedCollectionIds,
                          selectedCollectionId:
                            selection.selectedCollectionIds[0] ?? undefined,
                          visible: selection.selectedCollectionIds.length
                            ? true
                            : item.visible,
                        }
                      : item,
                  ),
                }
              : current,
        );
      }
      // Keep the actual structurally shared row as the transaction's owner.
      const optimistic = isCurrentQuery()
        ? queryClient
            .getQueryData<DashboardModulePreferenceList>(key)
            ?.items.find(
              (item) => item.moduleKey === PINNED_COLLECTION_MODULE_KEY,
            )
        : undefined;
      return { key, previous, optimistic, isCurrentQuery };
    },
    onError: async (error, selection, context) => {
      clearPending(selection);
      if (!context?.isCurrentQuery()) return;
      queryClient.setQueryData<DashboardModulePreferenceList>(
        context.key,
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item === context.optimistic && context.previous
                    ? {
                        ...item,
                        selectedCollectionIds:
                          context.previous.selectedCollectionIds,
                        selectedCollectionId:
                          context.previous.selectedCollectionId,
                        visible: selection.selectedCollectionIds.length
                          ? context.previous.visible
                          : item.visible,
                      }
                    : item,
                ),
              }
            : current,
      );
      if (
        ['unauthorized', 'permission', 'notFound'].includes(
          clientProblemKind(error),
        )
      ) {
        await queryClient.resetQueries({ queryKey: context.key, exact: true });
      }
    },
    onSuccess: (updated, selection, context) => {
      if (context?.isCurrentQuery()) {
        queryClient.setQueryData<DashboardModulePreferenceList>(
          context.key,
          (current) =>
            current
              ? {
                  ...current,
                  items: current.items.map((item) =>
                    item === context.optimistic
                      ? {
                          ...item,
                          selectedCollectionIds: updated.selectedCollectionIds,
                          selectedCollectionId: updated.selectedCollectionId,
                          visible: selection.selectedCollectionIds.length
                            ? updated.visible
                            : item.visible,
                        }
                      : item,
                  ),
                }
              : current,
        );
      }
      clearPending(selection);
    },
    onSettled: async (_data, error, selection, context) => {
      try {
        if (
          context?.isCurrentQuery() &&
          !['unauthorized', 'permission', 'notFound'].includes(
            clientProblemKind(error),
          )
        ) {
          await queryClient.invalidateQueries({
            queryKey: context.key,
            exact: true,
            // An offline recovery read would pause and retain the write lock.
            refetchType: isClientOnline() ? 'active' : 'none',
          });
        }
      } finally {
        if (inFlightRef.current === selection) inFlightRef.current = null;
      }
    },
  });
  const isSaving = Boolean(
    pendingSelection &&
      pendingSelection.accountId === accountId &&
      pendingSelection.spaceId === spaceId &&
      pendingSelection.isCurrentQuery(),
  );
  const canReadPreferences = ![
    'unauthorized',
    'permission',
    'notFound',
  ].includes(clientProblemKind(query.error));
  const selectedCollectionIds: string[] = !canReadPreferences
    ? []
    : isSaving
      ? (pendingSelection?.selectedCollectionIds ?? [])
      : selectedDashboardCollectionIds(
          query.data,
          PINNED_COLLECTION_MODULE_KEY,
        );
  const isBlocked =
    !query.data || query.isFetching || Boolean(query.error) || activeWrites > 0;

  function changeSelection(nextSelectedCollectionIds: string[]) {
    if (
      !dashboardApi ||
      !accountId ||
      !spaceId ||
      isBlocked ||
      (inFlightRef.current?.accountId === accountId &&
        inFlightRef.current.spaceId === spaceId) ||
      queryClient.isMutating({ mutationKey, exact: true }) > 0
    )
      return;
    const isCurrentQuery = captureAuthorizedQuery(queryClient, queryKey);
    if (!isCurrentQuery()) return;
    const selection: Selection = {
      accountId,
      spaceId,
      selectedCollectionIds: nextSelectedCollectionIds,
      api: dashboardApi,
      isCurrentQuery,
    };
    inFlightRef.current = selection;
    setPendingSelection(selection);
    mutation.mutate(selection);
  }

  async function retryRead() {
    const result = await query.refetch();
    if (!result.isError) mutation.reset();
  }

  /** Add the list to Wir, or take it off again, keeping the others. */
  function toggle(collectionId: string) {
    changeSelection(
      selectedCollectionIds.includes(collectionId)
        ? selectedCollectionIds.filter((id) => id !== collectionId)
        : [...selectedCollectionIds, collectionId],
    );
  }

  return {
    selectedCollectionIds,
    isPinned: (collectionId: string) =>
      selectedCollectionIds.includes(collectionId),
    toggle,
    isSaving,
    isBlocked,
    error:
      query.error ??
      (mutation.variables?.accountId === accountId &&
      mutation.variables.spaceId === spaceId &&
      mutation.variables.isCurrentQuery()
        ? mutation.error
        : null),
    changeSelection,
    retryRead,
  };
}
