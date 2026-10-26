import {
  hashKey,
  type QueryKey,
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { assertOnlineWrite } from '../client/connectivity';
import { dashboardQueryKey, invalidateDashboard } from '../client/dashboardQueries';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import {
  ClientProblemError,
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';

type CompletionContext = {
  scope: string;
  key: QueryKey;
  isCurrentQuery: () => boolean;
  isStartingDetail: () => boolean;
};

type CompletionSubmission<TRequest, TResult, TDetail> = {
  input: TRequest;
  scope: string;
  spaceId: string;
  detailKey: QueryKey;
  listKey: QueryKey;
  send: () => Promise<TResult>;
  detail: (result: TResult) => TDetail;
  isCurrentDetail: () => boolean;
  isStartingDetail: () => boolean;
  isCurrentList: () => boolean;
  isCurrentDashboard: () => boolean;
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
      submission: mutation.state.variables as
        | CompletionSubmission<TRequest, TResult, TDetail>
        | undefined,
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
      .at(-1)?.submission?.input ?? null;
  const latestCompletion = currentCompletions.at(-1);

  const mutation = useMutation<
    TResult,
    ClientProblemError,
    CompletionSubmission<TRequest, TResult, TDetail>,
    CompletionContext
  >({
    mutationKey,
    // Fail offline instead of holding an irreversible action for reconnect.
    networkMode: 'always',
    retry: false,
    mutationFn: async (submission) => {
      // onMutate awaited cancellation: the originating read might now be gone
      // or denied. Never send its old If-Match after that ownership loss.
      if (!submission.isCurrentDetail())
        throw new ClientProblemError('permission');
      assertOnlineWrite();
      try {
        return await submission.send();
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: async (submission) => {
      if (submission.isCurrentDetail())
        await queryClient.cancelQueries({
          queryKey: submission.detailKey,
          exact: true,
        });
      return {
        scope: submission.scope,
        key: submission.detailKey,
        isCurrentQuery: submission.isCurrentDetail,
        isStartingDetail: submission.isStartingDetail,
      };
    },
    onSuccess: (result, submission, context) => {
      if (!context?.isCurrentQuery()) return;
      // The same Query object may have received a newer authoritative read.
      // Preserve it instead of replacing it with this older response.
      const mayConfirm = context.isStartingDetail();
      if (mayConfirm) {
        queryClient.setQueryData(context.key, submission.detail(result));
        if (context.isCurrentQuery())
          setOutcome({ context, status: 'confirmed', result });
      }
      if (submission.isCurrentList())
        void queryClient.invalidateQueries({
          queryKey: submission.listKey,
          exact: true,
        });
      if (context.isCurrentQuery())
        void queryClient.invalidateQueries({
          queryKey: context.key,
          exact: true,
        });
      if (submission.isCurrentDashboard())
        void invalidateDashboard(queryClient, submission.spaceId);
    },
    onError: async (error, submission, context) => {
      if (!context?.isCurrentQuery() || !context.isStartingDetail()) return;
      setOutcome({ context, status: 'failed', error });
      if (
        ['conflict', 'notFound', 'permission'].includes(
          clientProblemKind(error),
        )
      ) {
        // Never replay a stale If-Match; the lock remains until this read settles.
        // Do not fetch an already replaced or denied Query.
        if (submission.isCurrentDetail())
          await queryClient.refetchQueries({
            queryKey: context.key,
            exact: true,
          });
      }
    },
    onSettled: (_result, _error, submission) => {
      if (inFlightRef.current === submission.scope) inFlightRef.current = null;
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
    // Snapshot the exact authorized task, APIs and original read at the tap.
    // Do not derive a write from a later route or Account/Space render.
    const isCurrentDetail = captureAuthorizedQuery(queryClient, detailKey);
    if (!isCurrentDetail()) return;
    const startingDetail = queryClient.getQueryData<TDetail>(detailKey);
    if (startingDetail === undefined) return;
    const send = () => request(input);
    const adaptDetail = detail;
    const submission: CompletionSubmission<TRequest, TResult, TDetail> = {
      input,
      scope,
      spaceId,
      detailKey,
      listKey,
      send,
      detail: adaptDetail,
      isCurrentDetail,
      isStartingDetail: () =>
        isCurrentDetail() &&
        queryClient.getQueryData<TDetail>(detailKey) === startingDetail,
      isCurrentList: captureAuthorizedQuery(queryClient, listKey),
      isCurrentDashboard: captureAuthorizedQuery(
        queryClient,
        dashboardQueryKey(spaceId),
      ),
    };
    inFlightRef.current = scope;
    setOutcome(null);
    mutation.mutate(submission);
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
    latestCompletion.context?.isCurrentQuery() &&
    latestCompletion.context.isStartingDetail()
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
