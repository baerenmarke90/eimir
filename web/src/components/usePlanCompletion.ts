import { useQueryClient } from '@tanstack/react-query';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import {
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { sharedAchievementKind } from '../client/sharedAchievements';
import { usePlanningCompletion } from './usePlanningCompletion';

type CompletionRequest = { plan: PlanDetail; experiencedOn: Date };

/** Plan-specific date and server achievement contract; completion is not optimistic. */
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
  const completion = usePlanningCompletion({
    spaceId,
    resourceId: planId,
    mutationKey: ['plan-complete', spaceId, planId],
    detailKey: authorSummaryQueryKeys.planDetail(spaceId, planId),
    listKey: authorSummaryQueryKeys.plans(spaceId),
    request: async ({ plan, experiencedOn }: CompletionRequest) => {
      const response = await apis.plans.completePlanRaw({
        spaceId,
        planId: plan.id,
        ifMatch: planningIfMatch(plan),
        planComplete: { experiencedOn },
      });
      const completedPlan = await response.value();
      // The source wish completed in the same server transaction (#1790 F2):
      // its journey lists and detail must not keep showing it as planned.
      if (completedPlan.sourceWishId) {
        void queryClient.invalidateQueries({
          queryKey: authorSummaryQueryKeys.wishes(spaceId),
        });
        void queryClient.invalidateQueries({
          queryKey: authorSummaryQueryKeys.wishDetail(
            spaceId,
            completedPlan.sourceWishId,
          ),
        });
      }
      return {
        completedPlan,
        achievement: sharedAchievementKind(response.raw),
      };
    },
    detail: (result) => result.completedPlan,
  });
  return {
    complete: completion.complete,
    isInFlight: completion.isInFlight,
    pendingDay: completion.pendingRequest?.experiencedOn ?? null,
    isPending: completion.isPending,
    error: completion.error,
    isConfirmed: completion.confirmedResult !== null,
    hasSharedAchievement:
      completion.confirmedResult?.achievement === 'plan-completed',
  };
}
