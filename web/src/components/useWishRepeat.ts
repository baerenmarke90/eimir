import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  type CreateRequestAttempt,
  prepareCreateRequestAttempt,
} from '../client/createRequestIdentity';
import { normalizeClientError } from '../client/problemDetails';
import {
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export interface WishRepeatResult {
  wish: WishDetail;
  /** Set when "Gleich planen" also created the Plan. */
  planId: string | null;
}

/**
 * "Nochmal erleben" (#1816): create a new Wish that follows a completed one,
 * optionally continuing straight into the existing Wish-to-Plan conversion.
 * The create request keeps one identity per source and title, so a double tap
 * or a retry after a lost response returns the Wish the first request created.
 */
export function useWishRepeat({
  apis,
  spaceId,
  source,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  source: WishDetail;
}) {
  const queryClient = useQueryClient();
  const attempt = useRef<CreateRequestAttempt<{
    sourceId: string;
    title: string | null;
  }> | null>(null);

  return useMutation({
    mutationKey: ['wish-repeat', spaceId, source.id],
    networkMode: 'always',
    mutationFn: async ({
      title,
      planNow,
    }: {
      title: string;
      planNow: boolean;
    }): Promise<WishRepeatResult> => {
      assertOnlineWrite();
      // Only an edited title is sent; otherwise the server copies the source.
      const edited = title !== source.title ? title : null;
      attempt.current = prepareCreateRequestAttempt(attempt.current, {
        sourceId: source.id,
        title: edited,
      });
      const created = await apiCall(() =>
        apis.wishes.repeatWish({
          spaceId,
          wishId: source.id,
          idempotencyKey: attempt.current?.idempotencyKey,
          wishRepeat: edited ? { title: edited } : {},
        }),
      );
      attempt.current = null;
      queryClient.setQueryData(
        authorSummaryQueryKeys.wishDetail(spaceId, created.id),
        created,
      );
      if (!planNow) return { wish: created, planId: null };
      try {
        const converted = await apiCall(() =>
          apis.plans.convertWishToPlan({
            spaceId,
            wishId: created.id,
            ifMatch: planningIfMatch(created),
            wishToPlan: {},
          }),
        );
        queryClient.setQueryData(
          authorSummaryQueryKeys.wishDetail(spaceId, created.id),
          converted.wish,
        );
        queryClient.setQueryData(
          authorSummaryQueryKeys.planDetail(spaceId, converted.plan.id),
          converted.plan,
        );
        return { wish: converted.wish, planId: converted.plan.id };
      } catch {
        // The new Wish exists; the person can plan it from its own page.
        return { wish: created, planId: null };
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: authorSummaryQueryKeys.wishes(spaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', 'plans', spaceId],
        }),
        invalidateDashboard(queryClient, spaceId),
      ]);
    },
  });
}
