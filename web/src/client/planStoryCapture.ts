import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HEART_MOMENT_CREATE_ROUTE,
  MEMORY_CREATE_ROUTE,
  MILESTONE_CREATE_ROUTE,
} from './routes';
import { useTaskOrigin } from './taskOrigin';

/** The Moments a completed Plan can be captured as. */
export type PlanStoryCaptureKind = 'memory' | 'heartMoment' | 'milestone';

export const PLAN_STORY_CAPTURE_ROUTES: Record<PlanStoryCaptureKind, string> = {
  memory: MEMORY_CREATE_ROUTE,
  heartMoment: HEART_MOMENT_CREATE_ROUTE,
  milestone: MILESTONE_CREATE_ROUTE,
};

/**
 * Opens the canonical capture task for a Plan's Moment. The capture page
 * prefills from the Plan (`sourcePlan`) only while it is completed and
 * editable, links the saved Moment to it, and returns to the Plan.
 * Shared by the completion continuation and the Plan's item menu (#2158).
 */
export function usePlanStoryCapture({
  planId,
  spaceId,
  accountId,
  apiBaseUrl,
}: {
  planId?: string;
  spaceId: string;
  accountId?: string;
  apiBaseUrl?: string;
}): (kind: PlanStoryCaptureKind) => void {
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  return useCallback(
    (kind: PlanStoryCaptureKind) => {
      if (!planId) return;
      const taskOriginKey = captureOrigin({
        planningSegment: 'plans',
        selectedKey: planId,
      });
      void navigate(PLAN_STORY_CAPTURE_ROUTES[kind], {
        state: {
          taskOriginKey,
          ...(accountId && apiBaseUrl
            ? {
                sourcePlan: {
                  id: planId,
                  spaceId,
                  accountId,
                  instance: apiBaseUrl,
                },
              }
            : {}),
        },
      });
    },
    [accountId, apiBaseUrl, captureOrigin, navigate, planId, spaceId],
  );
}
