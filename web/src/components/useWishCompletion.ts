import type { WishDetail } from '../api/generated/models/WishDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import {
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { usePlanningCompletion } from './usePlanningCompletion';

/** Wish fulfillment keeps its own API and optional Memory continuation semantics. */
export function useWishCompletion({
  apis,
  spaceId,
  wishId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  wishId: string | undefined;
}) {
  return usePlanningCompletion({
    spaceId,
    resourceId: wishId,
    mutationKey: ['wish-complete', spaceId, wishId],
    detailKey: authorSummaryQueryKeys.wishDetail(spaceId, wishId),
    listKey: authorSummaryQueryKeys.wishes(spaceId),
    request: (wish: WishDetail) =>
      apis.wishes.completeWish({
        spaceId,
        wishId: wish.id,
        ifMatch: planningIfMatch(wish),
      }),
    detail: (result) => result,
  });
}
