import {
  matchMutation,
  type MutationKey,
  type QueryKey,
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { invalidateStoryProjections } from './authorSummaryConsumers';
import { assertOnlineWrite } from './connectivity';
import { invalidateDashboard } from './dashboardQueries';
import { ClientProblemError, normalizeClientError } from './problemDetails';
import {
  deleteProductReadCacheEntry,
  type ProductCacheKind,
  type ProductReadResult,
} from './productReadCache';
import { captureAuthorizedQuery } from './queryIdentity';
import { useTaskActivation } from './useTaskActivation';

interface StoryDeletable {
  readonly id: string;
  readonly version: number;
  readonly capabilities: { readonly canDelete: boolean };
}

interface StoryDeleteRequest<T> {
  readonly resource: T;
  readonly accountId: string;
  readonly spaceId: string;
  readonly kind: 'memory' | 'heartMoment' | 'milestone';
  readonly queryKey: QueryKey;
  readonly execute: (resource: T) => Promise<void>;
  readonly onDeleted: () => void;
  readonly isCurrent: () => boolean;
  readonly ownsTask: () => boolean;
}

/**
 * One Story delete lifecycle. Domain consumers own their API/If-Match, competing
 * write keys, confirmation rendering and success feedback. Capture those at
 * admission: callbacks must never follow later props to another task or scope.
 */
export function useStoryDeletion<T extends StoryDeletable>({
  active,
  accountId,
  spaceId,
  resourceId,
  kind,
  version,
  queryKey,
  mutationKey,
  conflictingMutationKeys,
  execute,
  onDeleted,
}: {
  active: boolean;
  accountId: string;
  spaceId: string;
  resourceId: string | undefined;
  kind: Extract<ProductCacheKind, 'memory' | 'heartMoment' | 'milestone'>;
  version: number | undefined;
  queryKey: QueryKey;
  mutationKey: MutationKey;
  conflictingMutationKeys: readonly MutationKey[];
  execute: (resource: T) => Promise<void>;
  onDeleted: () => void;
}) {
  const client = useQueryClient();
  const location = useLocation();
  const activationKey = JSON.stringify([
    accountId,
    spaceId,
    kind,
    resourceId,
    location.key,
  ]);
  const captureOwnership = useTaskActivation(active, activationKey);
  const [confirmationOwner, setConfirmationOwner] = useState<string | null>(
    null,
  );
  const pending = useIsMutating({ mutationKey }) > 0;
  const conflicts = {
    predicate: (mutation: Parameters<typeof matchMutation>[1]) =>
      conflictingMutationKeys.some((key) =>
        matchMutation({ mutationKey: key }, mutation),
      ),
  };
  const competing = useIsMutating(conflicts) > 0;

  const mutation = useMutation({
    mutationKey: [...mutationKey, version, activationKey],
    networkMode: 'always',
    retry: false,
    onMutate: async (request: StoryDeleteRequest<T>) => {
      if (!request.isCurrent() || !request.ownsTask())
        throw new ClientProblemError('permission');
      await client.cancelQueries({ queryKey: request.queryKey, exact: true });
    },
    mutationFn: async (request: StoryDeleteRequest<T>) => {
      try {
        if (!request.isCurrent() || !request.ownsTask())
          throw new ClientProblemError('permission');
        const current = client.getQueryData<ProductReadResult<T>>(
          request.queryKey,
        );
        if (current?.source !== 'network')
          throw new ClientProblemError('offline');
        if (
          current.value.id !== request.resource.id ||
          !current.value.capabilities.canDelete
        )
          throw new ClientProblemError('permission');
        if (current.value.version !== request.resource.version)
          throw new ClientProblemError('conflict', 409);
        assertOnlineWrite();
        await request.execute(request.resource);
        // A confirmed delete still revokes its original snapshot after departure.
        await deleteProductReadCacheEntry(
          request.accountId,
          request.spaceId,
          request.kind,
          request.resource.id,
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async (_result, request) => {
      if (!request.isCurrent()) return;
      await Promise.all([
        invalidateStoryProjections(client, request.spaceId),
        invalidateDashboard(client, request.spaceId),
      ]);
      if (!request.isCurrent()) return;
      const shouldNavigate = request.ownsTask();
      client.removeQueries({ queryKey: request.queryKey, exact: true });
      if (shouldNavigate) request.onDeleted();
    },
  });

  return {
    isPending: pending,
    isBlocked: pending || competing,
    confirming: confirmationOwner === activationKey,
    setConfirming: (value: boolean) =>
      setConfirmationOwner(value ? activationKey : null),
    error: mutation.error,
    reset: mutation.reset,
    mutate(resource: T) {
      if (client.isMutating({ mutationKey }) || client.isMutating(conflicts))
        return;
      const key = [...queryKey];
      const isCurrent = captureAuthorizedQuery(client, key);
      const ownsTask = captureOwnership();
      if (resource.id !== resourceId || !isCurrent() || !ownsTask()) return;
      mutation.mutate({
        resource,
        accountId,
        spaceId,
        kind,
        queryKey: key,
        execute,
        onDeleted,
        isCurrent,
        ownsTask,
      });
    },
  };
}
