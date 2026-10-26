import {
  hashKey,
  type QueryClient,
  type QueryKey,
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query';
import { useRef } from 'react';
import { assertOnlineWrite } from '../client/connectivity';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyCheckInUpdate } from '../api/generated/models/DailyCheckInUpdate';
import {
  type DailyCheckInSnapshot,
  dailyCheckInTodayQueryKey,
  updateDailyCheckInToday,
} from '../client/dailyCheckIn';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { refreshSpaceConfiguration } from '../client/spaceConfiguration';

type Dimension = 'energy' | 'vibe';
type Request = {
  accountId: string;
  spaceId: string;
  dimension: Dimension;
  contextId: string;
  etag: string;
  update: DailyCheckInUpdate;
  isOwned: () => boolean;
  queryIsCurrent: () => boolean;
  perform: () => Promise<DailyCheckInSnapshot>;
};
type Context = { feedbackClaimed: boolean };

function dayContext(snapshot: DailyCheckInSnapshot | undefined) {
  return snapshot
    ? JSON.stringify([
        snapshot.projection.checkedOn.getTime(),
        snapshot.projection.dailyContextTimezone,
      ])
    : null;
}

function hasReadyProjection(client: QueryClient, key: QueryKey) {
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  return Boolean(
    query?.isActive() &&
      query.state.status === 'success' &&
      query.state.fetchStatus === 'idle' &&
      !query.state.isInvalidated,
  );
}

function currentSnapshot(client: QueryClient, request: Request) {
  return client.getQueryData<DailyCheckInSnapshot>(
    dailyCheckInTodayQueryKey(request.accountId, request.spaceId),
  );
}

/** Only own request input survives return; never retain a server projection. */
export function useDailyCheckInWrite({
  api,
  accountId,
  spaceId,
  dimension,
}: {
  api?: DailyCheckInsApi;
  accountId: string;
  spaceId: string;
  dimension: Dimension;
}) {
  const client = useQueryClient();
  const queryKey = dailyCheckInTodayQueryKey(accountId, spaceId);
  const mutationKey = ['daily-check-in-write', accountId, spaceId];
  const keyHash = hashKey(mutationKey);
  const scope = JSON.stringify([accountId, spaceId]);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const contextId = dayContext(client.getQueryData(queryKey));
  const isLive = (request: Request) =>
    client
      .getMutationCache()
      .getAll()
      .some((entry) => entry.state.variables === request);
  const canReconcile = (request: Request) =>
    isLive(request) &&
    request.isOwned() &&
    dayContext(currentSnapshot(client, request)) === request.contextId;
  const refreshCurrent = async (request: Request) => {
    const key = dailyCheckInTodayQueryKey(request.accountId, request.spaceId);
    // A late result cannot refetch a denied or removed private projection.
    if (!canReconcile(request) || !captureAuthorizedQuery(client, key)())
      return;
    await client.refetchQueries({
      queryKey: key,
      exact: true,
      type: 'active',
    });
  };

  const snapshots = useMutationState({
    filters: { mutationKey, exact: true },
    select: (entry) => ({
      keyHash: hashKey(entry.options.mutationKey ?? []),
      status: entry.state.status,
      request: entry.state.variables as Request | undefined,
      error: entry.state.error as ClientProblemError | null,
      context: entry.state.context as Context | undefined,
    }),
  });
  const current = snapshots.filter(
    (entry) =>
      entry.keyHash === keyHash &&
      entry.request?.contextId === contextId &&
      entry.request.accountId === accountId &&
      entry.request.spaceId === spaceId &&
      entry.request.isOwned(),
  );
  const pending = current.find((entry) => entry.status === 'pending');
  const latest = current
    .filter((entry) => entry.request?.dimension === dimension)
    .at(-1);

  const mutation = useMutation<void, ClientProblemError, Request, Context>({
    mutationKey,
    // Match the existing inactive mutation-cache lifetime, not a persistent outbox.
    gcTime: 5 * 60 * 1000,
    networkMode: 'always',
    retry: false,
    onMutate: async (request) => {
      if (canReconcile(request) && request.queryIsCurrent()) {
        await client.cancelQueries({
          queryKey: dailyCheckInTodayQueryKey(
            request.accountId,
            request.spaceId,
          ),
          exact: true,
        });
      }
      return { feedbackClaimed: false };
    },
    mutationFn: async (request) => {
      if (!isLive(request) || !request.isOwned())
        throw new ClientProblemError('unauthorized');
      // Cancellation is asynchronous; the original authorized read or its
      // validator may have been replaced before the deliberate write starts.
      if (!request.queryIsCurrent())
        throw new ClientProblemError('permission');
      assertOnlineWrite();
      let confirmed: DailyCheckInSnapshot;
      try {
        confirmed = await request.perform();
      } catch (error) {
        throw await normalizeClientError(error);
      }
      if (!canReconcile(request)) return;
      const key = dailyCheckInTodayQueryKey(request.accountId, request.spaceId);
      if (
        request.queryIsCurrent() &&
        currentSnapshot(client, request)?.etag === request.etag &&
        dayContext(confirmed) === request.contextId
      ) {
        await client.cancelQueries({ queryKey: key, exact: true });
        if (
          canReconcile(request) &&
          request.queryIsCurrent() &&
          currentSnapshot(client, request)?.etag === request.etag
        ) {
          client.setQueryData<DailyCheckInSnapshot>(key, (existing) =>
            existing &&
            existing.etag === request.etag &&
            dayContext(existing) === request.contextId
              ? confirmed
              : existing,
          );
          return;
        }
      }
      // A remounted/replaced consumer must get its own authorized projection.
      await refreshCurrent(request);
      // Returning void prevents the mutation cache from retaining partner data.
    },
    onError: async (error, request) => {
      // An intervening authoritative read (including denial) owns its cache;
      // an older failed request must not reset or refetch it.
      if (!canReconcile(request) || !request.queryIsCurrent()) return;
      if (error.code === 'SPACE_MODULE_DISABLED') {
        await Promise.all([
          refreshCurrent(request),
          refreshSpaceConfiguration(client, request.accountId, request.spaceId),
        ]);
      } else if (
        error.kind === 'conflict' ||
        error.code === 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE'
      ) {
        await refreshCurrent(request);
      } else if (
        ['unauthorized', 'permission', 'notFound'].includes(error.kind)
      ) {
        await client.resetQueries({
          queryKey: dailyCheckInTodayQueryKey(
            request.accountId,
            request.spaceId,
          ),
          exact: true,
        });
      }
    },
  });

  function isInFlight() {
    const currentContext = dayContext(client.getQueryData(queryKey));
    return (
      client.isMutating({
        mutationKey,
        exact: true,
        predicate: (entry) =>
          (entry.state.variables as Request | undefined)?.contextId ===
          currentContext,
      }) > 0
    );
  }

  function submit(update: DailyCheckInUpdate) {
    if (!api || isInFlight()) return false;
    const admitted = client.getQueryData<DailyCheckInSnapshot>(queryKey);
    const admittedContext = dayContext(admitted);
    if (
      !admitted ||
      !admittedContext ||
      client.getQueryState(queryKey)?.status !== 'success'
    )
      return false;
    const etag = admitted.etag;
    const input = { ...update };
    const queryIsCurrent = captureAuthorizedQuery(client, queryKey);
    const snapshotIdentity = new WeakRef(admitted);
    const isStartingReadCurrent = () =>
      queryIsCurrent() &&
      hasReadyProjection(client, queryKey) &&
      snapshotIdentity.deref() === client.getQueryData(queryKey);
    if (!isStartingReadCurrent()) return false;
    mutation.mutate({
      accountId,
      spaceId,
      dimension,
      contextId: admittedContext,
      etag,
      update: input,
      isOwned: () => activeScope.current === scope,
      queryIsCurrent: isStartingReadCurrent,
      perform: () => updateDailyCheckInToday(api, spaceId, etag, input),
    });
    return true;
  }

  function reset() {
    if (isInFlight()) return;
    mutation.reset();
    for (const entry of client
      .getMutationCache()
      .findAll({ mutationKey, exact: true })) {
      const request = entry.state.variables as Request | undefined;
      if (
        entry.state.status !== 'pending' &&
        request?.dimension === dimension &&
        request.contextId === contextId
      )
        client.getMutationCache().remove(entry);
    }
  }

  function claimFeedback() {
    if (
      !latest?.context ||
      latest.context.feedbackClaimed ||
      latest.status === 'pending' ||
      !latest.request ||
      !canReconcile(latest.request) ||
      !hasReadyProjection(
        client,
        dailyCheckInTodayQueryKey(
          latest.request.accountId,
          latest.request.spaceId,
        ),
      )
    )
      return false;
    latest.context.feedbackClaimed = true;
    return true;
  }

  return {
    contextId,
    scopeId: JSON.stringify([accountId, spaceId, contextId]),
    submit,
    reset,
    claimFeedback,
    isInFlight,
    isReadReady: hasReadyProjection(client, queryKey),
    isPending: Boolean(pending),
    otherPending: Boolean(pending && pending.request?.dimension !== dimension),
    pendingUpdate:
      pending?.request?.dimension === dimension ? pending.request.update : null,
    request: latest?.request ?? null,
    status: latest?.status ?? 'idle',
    error: latest?.status === 'error' ? latest.error : null,
  };
}
