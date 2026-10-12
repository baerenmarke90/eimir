import {
  hashKey,
  onlineManager,
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { SupportGestureKind } from '../api/generated/models/SupportGestureKind';
import type { DashboardView } from '../api/generated/models/DashboardView';
import {
  type CreateRequestAttempt,
  isCreateOutcomeUnknown,
  prepareCreateRequestAttempt,
} from '../client/createRequestIdentity';
import { dashboardQueryKey } from '../client/dashboardQueries';
import type { M4ProductApis } from '../client/m4Product';
import {
  PARTNER_QUICK_ACTIONS_ENTITLEMENT_REQUIRED,
  partnerQuickActionsEntitlementQueryKey,
} from '../client/partnerQuickActions';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { captureQueryIdentity } from '../client/queryIdentity';
import { postSnackbar } from '../client/snackbar';
import { refreshSpaceConfiguration } from '../client/spaceConfiguration';

export type PartnerAction = 'THINKING' | 'KISS' | 'CHECK_IN';
type Snapshot = { accountId: string; spaceId: string; action: PartnerAction };
type Result = { action: PartnerAction; availableAt: Date };
type Request = {
  attempt: CreateRequestAttempt<Snapshot>;
  isCurrent: () => boolean;
  canNotify: () => boolean;
  dashboardIsCurrent: () => boolean;
  send: () => Promise<Result>;
};
type Context = { cooldownUntil?: Date };

export function isGestureCooldown(error: ClientProblemError) {
  return (
    error.code === 'THINKING_OF_YOU_COOLDOWN' ||
    error.code === 'SUPPORT_GESTURE_COOLDOWN'
  );
}

/** One deliberate send per Account/Space; no outbox or optimistic delivery. */
export function usePartnerGesture({
  apis,
  accountId,
  spaceId,
  onModuleDisabled,
}: {
  apis: M4ProductApis;
  accountId: string;
  spaceId: string;
  onModuleDisabled: () => void;
}) {
  const client = useQueryClient();
  const mutationKey = ['partner-gesture', accountId, spaceId];
  const keyHash = hashKey(mutationKey);
  const scope = JSON.stringify([accountId, spaceId]);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const snapshots = useMutationState({
    filters: { mutationKey, exact: true },
    select: (mutation) => ({
      keyHash: hashKey(mutation.options.mutationKey ?? []),
      status: mutation.state.status,
      request: mutation.state.variables as Request | undefined,
      data: mutation.state.data as Result | undefined,
      error: mutation.state.error as ClientProblemError | null,
      context: mutation.state.context as Context | undefined,
    }),
  });
  // Observer options switch after render; never show the previous scope's snapshot.
  const current = snapshots.filter(
    (snapshot) => snapshot.keyHash === keyHash && snapshot.request?.isCurrent(),
  );
  const latest = current.at(-1);
  const pending = current.find((snapshot) => snapshot.status === 'pending');

  const mutation = useMutation<Result, ClientProblemError, Request, Context>({
    mutationKey,
    networkMode: 'always',
    retry: false,
    mutationFn: async (request: Request) => {
      if (!request.isCurrent()) throw new ClientProblemError('unauthorized');
      if (!onlineManager.isOnline() || navigator.onLine === false)
        throw new ClientProblemError('offline');
      try {
        return await request.send();
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: (): Context => ({}),
    onSuccess: (result, request) => {
      if (!request.isCurrent()) return;
      const snapshot = request.attempt.snapshot;
      if (result.action === 'THINKING' && request.dashboardIsCurrent()) {
        client.setQueryData<DashboardView>(
          dashboardQueryKey(snapshot.spaceId),
          (old) =>
            old
              ? { ...old, thinkingOfYouAvailableAt: result.availableAt }
              : old,
        );
      }
      if (!request.canNotify()) return;
      postSnackbar(
        result.action === 'THINKING'
          ? 'snackbar.partnerQuickActionThinkingSent'
          : result.action === 'KISS'
            ? 'snackbar.partnerQuickActionKissSent'
            : 'snackbar.partnerQuickActionCheckInSent',
      );
    },
    onError: (error, request, context) => {
      if (!request.isCurrent()) return;
      const snapshot = request.attempt.snapshot;
      if (
        isGestureCooldown(error) &&
        context &&
        error.retryAfterSeconds &&
        error.retryAfterSeconds > 0
      )
        context.cooldownUntil = new Date(
          Date.now() + error.retryAfterSeconds * 1000,
        );
      if (error.code === 'SPACE_MODULE_DISABLED') {
        void refreshSpaceConfiguration(
          client,
          snapshot.accountId,
          snapshot.spaceId,
        );
        if (request.canNotify()) {
          postSnackbar('snackbar.supportGesturesModuleDisabled');
          onModuleDisabled();
        }
      } else if (error.code === PARTNER_QUICK_ACTIONS_ENTITLEMENT_REQUIRED) {
        void client.invalidateQueries({
          queryKey: partnerQuickActionsEntitlementQueryKey(
            snapshot.accountId,
            snapshot.spaceId,
          ),
        });
      } else if (isGestureCooldown(error) && request.canNotify()) {
        postSnackbar('snackbar.partnerQuickActionCooldown');
      }
    },
  });

  const cooldowns: Partial<Record<PartnerAction, Date>> = {};
  for (const state of current) {
    const action = state.request?.attempt.snapshot.action;
    const deadline = state.data?.availableAt ?? state.context?.cooldownUntil;
    if (
      action &&
      deadline &&
      (!cooldowns[action] || deadline > cooldowns[action])
    )
      cooldowns[action] = deadline;
  }

  function send(action: PartnerAction) {
    if (client.isMutating({ mutationKey, exact: true }) > 0) return;
    const isCurrentQuery = captureQueryIdentity(
      client,
      partnerQuickActionsEntitlementQueryKey(accountId, spaceId),
    );
    const isCurrent = () => activeScope.current === scope && isCurrentQuery();
    if (!isCurrent()) return;
    // Event handlers can run before observer delivery after a response. Read
    // the cache synchronously for both pacing and uncertain retry identity.
    const previous = client
      .getMutationCache()
      .findAll({ mutationKey, exact: true })
      .map((entry) => ({
        status: entry.state.status,
        request: entry.state.variables as Request | undefined,
        data: entry.state.data as Result | undefined,
        error: entry.state.error as ClientProblemError | null,
        context: entry.state.context as Context | undefined,
      }))
      .filter(
        (state) =>
          state.request?.isCurrent() &&
          state.request.attempt.snapshot.action === action,
      )
      .at(-1);
    const deadline =
      previous?.data?.availableAt ?? previous?.context?.cooldownUntil;
    if (deadline && deadline.getTime() > Date.now()) return;
    const retryAttempt =
      previous?.status === 'error' &&
      previous.error &&
      isCreateOutcomeUnknown(previous.error)
        ? (previous.request?.attempt ?? null)
        : null;
    const attempt = prepareCreateRequestAttempt(retryAttempt, {
      accountId,
      spaceId,
      action,
    });
    mutation.mutate({
      attempt,
      isCurrent,
      canNotify: () => isCurrent() && mounted.current,
      dashboardIsCurrent: captureQueryIdentity(
        client,
        dashboardQueryKey(spaceId),
      ),
      send: async () => {
        if (action === 'THINKING') {
          const accepted = await apis.notifications.sendThinkingOfYou({
            spaceId,
            thinkingOfYouCreate: { clientRequestId: attempt.idempotencyKey },
          });
          return { action, availableAt: accepted.thinkingOfYouAvailableAt };
        }
        const accepted = await apis.notifications.sendPartnerQuickAction({
          spaceId,
          partnerQuickActionCreate: {
            kind:
              action === 'KISS'
                ? SupportGestureKind.KISS
                : SupportGestureKind.CHECK_IN,
            clientRequestId: attempt.idempotencyKey,
          },
        });
        return { action, availableAt: accepted.availableAt };
      },
    });
  }

  return {
    send,
    isInFlight: () => client.isMutating({ mutationKey, exact: true }) > 0,
    isPending: Boolean(pending),
    pendingAction: pending?.request?.attempt.snapshot.action ?? null,
    confirmedAction:
      latest?.status === 'success' ? (latest.data?.action ?? null) : null,
    error: latest?.status === 'error' ? latest.error : null,
    cooldowns,
  };
}
