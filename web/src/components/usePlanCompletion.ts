import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import {
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { sharedAchievementKind } from '../client/sharedAchievements';

type CompletionRequest = { plan: PlanDetail; experiencedOn: Date };

type CompletionOutcome =
  | { scope: string; status: 'confirmed'; achievement: boolean }
  | { scope: string; status: 'failed'; error: unknown };

/**
 * One server-confirmed Plan completion per Space and Plan.
 *
 * Completion has no reopen operation and the server decides the shared
 * achievement, so nothing is shown as completed before the response. The
 * request is claimed synchronously, its pending state lives in the mutation
 * cache (it survives a remount and never crosses a Space or Plan), and a late
 * response only reconciles the Plan query that initiated it.
 */
export function usePlanCompletion({
  apis,
  spaceId,
  planId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  planId: string | undefined;
}) {
  const queryClient = useQueryClient();
  const scope = `${spaceId}:${planId ?? ''}`;
  const mutationKey = ['plan-complete', spaceId, planId] as const;
  const inFlightRef = useRef<string | null>(null);
  const [outcome, setOutcome] = useState<CompletionOutcome | null>(null);
  const activeWrites = useIsMutating({ mutationKey, exact: true });
  const pendingRequests = useMutationState({
    filters: { mutationKey, exact: true, status: 'pending' },
    select: (mutation) => mutation.state.variables as CompletionRequest,
  });
  const pending = pendingRequests.at(-1) ?? null;

  const mutation = useMutation({
    mutationKey,
    retry: false,
    mutationFn: async ({ plan, experiencedOn }: CompletionRequest) => {
      try {
        const response = await apis.plans.completePlanRaw({
          spaceId,
          planId: plan.id,
          ifMatch: planningIfMatch(plan),
          planComplete: { experiencedOn },
        });
        return {
          completedPlan: await response.value(),
          achievement: sharedAchievementKind(response.raw),
        };
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: async ({ plan }) => {
      const key = authorSummaryQueryKeys.planDetail(spaceId, plan.id);
      const initiatingQuery = queryClient
        .getQueryCache()
        .find({ queryKey: key, exact: true });
      // An older read must not land after the confirmed Plan.
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      const isCurrentQuery = () =>
        Boolean(initiatingQuery) &&
        queryClient.getQueryCache().find({ queryKey: key, exact: true }) ===
          initiatingQuery;
      return { key, isCurrentQuery };
    },
    onSuccess: ({ completedPlan, achievement }, _request, context) => {
      if (context?.isCurrentQuery()) {
        queryClient.setQueryData(context.key, completedPlan);
        void queryClient.invalidateQueries({
          queryKey: ['m5-s3', 'plans', spaceId],
        });
        void queryClient.invalidateQueries({
          queryKey: context.key,
          exact: true,
        });
        void invalidateDashboard(queryClient, spaceId);
      }
      setOutcome({
        scope: `${spaceId}:${completedPlan.id}`,
        status: 'confirmed',
        achievement: achievement === 'plan-completed',
      });
    },
    onError: (error, { plan }, context) => {
      setOutcome({
        scope: `${spaceId}:${plan.id}`,
        status: 'failed',
        error,
      });
      // Read the authoritative Plan before another decision; never replay the
      // stale version.
      if (
        context?.isCurrentQuery() &&
        ['conflict', 'notFound', 'permission'].includes(
          clientProblemKind(error),
        )
      ) {
        void queryClient.refetchQueries({ queryKey: context.key, exact: true });
      }
    },
    onSettled: (_data, _error, { plan }) => {
      if (inFlightRef.current === `${spaceId}:${plan.id}`) {
        inFlightRef.current = null;
      }
    },
  });

  function complete(request: CompletionRequest) {
    if (
      !planId ||
      inFlightRef.current === scope ||
      queryClient.isMutating({ mutationKey, exact: true }) > 0
    )
      return;
    inFlightRef.current = scope;
    setOutcome(null);
    mutation.mutate(request);
  }

  const current = outcome?.scope === scope ? outcome : null;
  return {
    complete,
    /** The submitted day while this Plan's completion awaits the server. */
    pendingDay: pending?.experiencedOn ?? null,
    isPending: activeWrites > 0 || pending !== null,
    error: current?.status === 'failed' ? current.error : null,
    isConfirmed: current?.status === 'confirmed',
    hasSharedAchievement:
      current?.status === 'confirmed' && current.achievement,
  };
}
