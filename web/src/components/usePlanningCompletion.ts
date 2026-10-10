import {
  hashKey,
  type QueryKey,
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

type CompletionContext = {
  scope: string;
  key: QueryKey;
  isCurrentQuery: () => boolean;
};

type CompletionOutcome<TResult> =
  | { context: CompletionContext; status: 'confirmed'; result: TResult }
  | { context: CompletionContext; status: 'failed'; error: unknown };

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
  const completions = useMutationState({
    filters: { mutationKey, exact: true },
    select: (mutation) => ({
      keyHash: hashKey(mutation.options.mutationKey ?? []),
      status: mutation.state.status,
      input: mutation.state.variables as TRequest | undefined,
      error: mutation.state.error,
      context: mutation.state.context as CompletionContext | undefined,
    }),
  });
  // Subscription options update after render; never expose the previous route's
  // snapshot while the observer switches keys.
  const currentKeyHash = hashKey(mutationKey);
  const currentCompletions = completions.filter(
    (completion) => completion.keyHash === currentKeyHash,
  );
  const pending =
    currentCompletions
      .filter((completion) => completion.status === 'pending')
      .at(-1)?.input ?? null;
  const latestCompletion = currentCompletions.at(-1);

  const mutation = useMutation({
    mutationKey,
    // Fail offline instead of holding an irreversible action for reconnect.
    networkMode: 'always',
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
      return { scope, key: detailKey, isCurrentQuery };
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
        setOutcome({ context, status: 'confirmed', result });
    },
    onError: async (error, _input, context) => {
      if (!context?.isCurrentQuery()) return;
      setOutcome({ context, status: 'failed', error });
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

  const current =
    outcome?.context.scope === scope &&
    outcome.context.isCurrentQuery() &&
    latestCompletion?.context?.isCurrentQuery === outcome.context.isCurrentQuery
      ? outcome
      : null;
  // The mutation cache owns settled failures across page remounts. Only the
  // latest attempt for the still-authorized query may supply an error; success
  // remains a transient continuation owned by the initiating page.
  const cachedError =
    latestCompletion?.status === 'error' &&
    latestCompletion.context?.isCurrentQuery()
      ? latestCompletion.error
      : null;
  return {
    complete,
    isInFlight,
    pendingRequest: current?.status === 'failed' ? null : pending,
    isPending: pending !== null,
    error: current?.status === 'failed' ? current.error : cachedError,
    confirmedResult: current?.status === 'confirmed' ? current.result : null,
  };
}
