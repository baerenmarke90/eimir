import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { DashboardModulePreferenceList } from '../api/generated/models/DashboardModulePreferenceList';
import {
  dashboardPreferencesQueryKey,
  PINNED_COLLECTION_MODULE_KEY,
  selectedDashboardCollectionId,
} from '../client/dashboardPreferences';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';

type Selection = {
  accountId: string;
  spaceId: string;
  selectedCollectionId: string | null;
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
    retry: false,
    mutationFn: (selection: Selection) => {
      if (!dashboardApi) throw new Error('Dashboard API is not available.');
      return apiCall(() =>
        dashboardApi.updateDashboardModulePreference({
          moduleKey: PINNED_COLLECTION_MODULE_KEY,
          spaceId: selection.spaceId,
          dashboardModulePreferenceUpdate: {
            selectedCollectionId: selection.selectedCollectionId,
            visible: selection.selectedCollectionId ? true : undefined,
          },
        }),
      );
    },
    onMutate: async (selection) => {
      const key = dashboardPreferencesQueryKey(
        selection.accountId,
        selection.spaceId,
      );
      const initiatingQuery = queryClient.getQueryCache().find({
        queryKey: key,
        exact: true,
      });
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      const isCurrentQuery = () =>
        Boolean(initiatingQuery) &&
        queryClient.getQueryCache().find({ queryKey: key, exact: true }) ===
          initiatingQuery;
      const previous = queryClient
        .getQueryData<DashboardModulePreferenceList>(key)
        ?.items.find((item) => item.moduleKey === PINNED_COLLECTION_MODULE_KEY);
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
                          selectedCollectionId:
                            selection.selectedCollectionId ?? undefined,
                          visible: selection.selectedCollectionId
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
      const optimistic = queryClient
        .getQueryData<DashboardModulePreferenceList>(key)
        ?.items.find((item) => item.moduleKey === PINNED_COLLECTION_MODULE_KEY);
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
                        selectedCollectionId:
                          context.previous.selectedCollectionId,
                        visible: selection.selectedCollectionId
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
                          selectedCollectionId: updated.selectedCollectionId,
                          visible: selection.selectedCollectionId
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
      pendingSelection.spaceId === spaceId,
  );
  const selectedCollectionId = isSaving
    ? pendingSelection?.selectedCollectionId
    : selectedDashboardCollectionId(query.data, PINNED_COLLECTION_MODULE_KEY);
  const isBlocked =
    !query.data || query.isFetching || Boolean(query.error) || activeWrites > 0;

  function changeSelection(selectedCollectionId: string | null) {
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
    const selection = { accountId, spaceId, selectedCollectionId };
    inFlightRef.current = selection;
    setPendingSelection(selection);
    mutation.mutate(selection);
  }

  async function retryRead() {
    const result = await query.refetch();
    if (!result.isError) mutation.reset();
  }

  return {
    selectedCollectionId,
    isSaving,
    isBlocked,
    error:
      query.error ??
      (mutation.variables?.accountId === accountId &&
      mutation.variables.spaceId === spaceId
        ? mutation.error
        : null),
    changeSelection,
    retryRead,
  };
}
