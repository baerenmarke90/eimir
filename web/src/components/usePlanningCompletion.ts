import {
  type QueryKey,
  useIsMutating,
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';

type CompletionOutcome<TResult> =
  | { scope: string; status: 'confirmed'; result: TResult }
  | { scope: string; status: 'failed'; error: unknown };

/**
 * Server-confirmed completion ownership shared by Plans and Wishes.
 * Claim synchronously; retain pending state through remounts; reconcile only
 * the initiating query; hold the lock through authoritative error recovery.
 * Domain requests, dates and achievement meaning belong to the adapters.
 */
export function usePlanningCompletion<TRequest, TResult, TDetail>({
  spaceId,
  resourceId,
  mutationKey,
  detailKey,
  listKey,
  request,
  detail,
}: {
  spaceId: string;
  resourceId: string | undefined;
  mutationKey: QueryKey;
  detailKey: QueryKey;
  listKey: QueryKey;
  request: (input: TRequest) => Promise<TResult>;
  detail: (result: TResult) => TDetail;
}) {
  const queryClient = useQueryClient();
  const scope = `${spaceId}:${resourceId ?? ''}`;
  const inFlightRef = useRef<string | null>(null);
  const [outcome, setOutcome] = useState<CompletionOutcome<TResult> | null>(
    null,
  );
  const activeWrites = useIsMutating({ mutationKey, exact: true });
  const pendingRequests = useMutationState({
    filters: { mutationKey, exact: true, status: 'pending' },
    select: (mutation) => mutation.state.variables as TRequest,
  });
  const pending = pendingRequests.at(-1) ?? null;

  const mutation = useMutation({
    mutationKey,
    retry: false,
    mutationFn: async (input: TRequest) => {
      try {
        return await request(input);
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: async () => {
      const initiatingQuery = queryClient
        .getQueryCache()
        .find({ queryKey: detailKey, exact: true });
      await queryClient.cancelQueries({ queryKey: detailKey, exact: true });
      const isCurrentQuery = () =>
        Boolean(initiatingQuery) &&
        queryClient
          .getQueryCache()
          .find({ queryKey: detailKey, exact: true }) === initiatingQuery;
      return { key: detailKey, isCurrentQuery };
    },
    onSuccess: (result, _input, context) => {
      if (!context?.isCurrentQuery()) return;
      queryClient.setQueryData(context.key, detail(result));
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({
        queryKey: context.key,
        exact: true,
      });
      void invalidateDashboard(queryClient, spaceId);
      if (context.isCurrentQuery())
        setOutcome({ scope, status: 'confirmed', result });
    },
    onError: async (error, _input, context) => {
      if (!context?.isCurrentQuery()) return;
      setOutcome({ scope, status: 'failed', error });
      if (
        ['conflict', 'notFound', 'permission'].includes(
          clientProblemKind(error),
        )
      ) {
        // Never replay a stale If-Match; the lock remains until this read settles.
        await queryClient.refetchQueries({
          queryKey: context.key,
          exact: true,
        });
      }
    },
    onSettled: () => {
      if (inFlightRef.current === scope) inFlightRef.current = null;
    },
  });

  function isInFlight() {
    return (
      inFlightRef.current === scope ||
      queryClient.isMutating({ mutationKey, exact: true }) > 0
    );
  }

  function complete(input: TRequest) {
    if (!resourceId || isInFlight()) return;
    inFlightRef.current = scope;
    setOutcome(null);
    mutation.mutate(input);
  }

  const current = outcome?.scope === scope ? outcome : null;
  return {
    complete,
    isInFlight,
    pendingRequest: current?.status === 'failed' ? null : pending,
    isPending: activeWrites > 0 || pending !== null,
    error: current?.status === 'failed' ? current.error : null,
    confirmedResult: current?.status === 'confirmed' ? current.result : null,
  };
}
