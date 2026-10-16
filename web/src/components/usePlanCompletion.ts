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
      return {
        completedPlan: await response.value(),
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
