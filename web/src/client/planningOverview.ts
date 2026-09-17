import type { PlanDetail } from '../api/generated/models/PlanDetail';
import {
  PlanStatus,
  type PlanStatus as PlanStatusValue,
} from '../api/generated/models/PlanStatus';
import type { SharedPlanningApis } from './sharedPlanning';
import { dateOnlyInput, localCalendarDateInput } from './sharedPlanning';

const OVERVIEW_PAGE_SIZE = 50;

async function loadPlansForStatus(
  apis: Pick<SharedPlanningApis, 'plans'>,
  spaceId: string,
  status: PlanStatusValue,
): Promise<PlanDetail[]> {
  const items: PlanDetail[] = [];
  let cursor: string | null | undefined = null;
  const seenCursors = new Set<string>();

  do {
    const page = await apis.plans.listPlans({
      spaceId,
      cursor,
      limit: OVERVIEW_PAGE_SIZE,
      status,
    });
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor) {
      if (seenCursors.has(cursor)) {
        throw new Error('Plan pagination returned a repeated cursor.');
      }
      seenCursors.add(cursor);
    }
  } while (cursor);

  return items;
}

/**
 * Loads every Plan lifecycle state needed by the R3 overview. Completed Plans
 * remain visually receded, but are still discoverable relationship history.
 */
export async function loadPlanningOverviewPlans(
  apis: Pick<SharedPlanningApis, 'plans'>,
  spaceId: string,
): Promise<PlanDetail[]> {
  const [planned, ideas, completed] = await Promise.all([
    loadPlansForStatus(apis, spaceId, PlanStatus.PLANNED),
    loadPlansForStatus(apis, spaceId, PlanStatus.IDEA),
    loadPlansForStatus(apis, spaceId, PlanStatus.COMPLETED),
  ]);
  return [...planned, ...ideas, ...completed];
}

function localDayKey(value: Date): string {
  return localCalendarDateInput(value);
}

function scheduleDayKey(plan: PlanDetail): string | null {
  if (plan.plannedOn) return dateOnlyInput(plan.plannedOn);
  if (plan.plannedStart) return localDayKey(plan.plannedStart);
  return null;
}

/**
 * Mixed upcoming semantics for the Mobile-Web Planning reference.
 *
 * Date-only schedules are compared as YYYY-MM-DD calendar values and therefore
 * never converted into an instant. Timed schedules retain instant eligibility.
 * On the same calendar day, date-only Plans lead, then timed Plans by their real
 * local wall-clock order, then ID provides a stable product-neutral tie-break.
 */
export function selectUpcomingPlans(
  plans: readonly PlanDetail[],
  now: Date = new Date(),
): PlanDetail[] {
  const today = localDayKey(now);
  const nowMs = now.getTime();

  return plans
    .filter((plan) => {
      if (plan.status !== PlanStatus.PLANNED) return false;
      if (plan.plannedOn) return dateOnlyInput(plan.plannedOn) >= today;
      return plan.plannedStart !== null && plan.plannedStart.getTime() >= nowMs;
    })
    .sort((left, right) => {
      const leftDay = scheduleDayKey(left);
      const rightDay = scheduleDayKey(right);
      if (leftDay !== rightDay)
        return (leftDay ?? '').localeCompare(rightDay ?? '');

      const leftRank = left.plannedOn ? 0 : 1;
      const rightRank = right.plannedOn ? 0 : 1;
      if (leftRank !== rightRank) return leftRank - rightRank;

      if (left.plannedStart && right.plannedStart) {
        const instantOrder =
          left.plannedStart.getTime() - right.plannedStart.getTime();
        if (instantOrder !== 0) return instantOrder;
      }

      if (left.id < right.id) return -1;
      if (left.id > right.id) return 1;
      return 0;
    });
}

export interface PlanningOverviewGroups {
  focal: PlanDetail | null;
  later: PlanDetail[];
  undated: PlanDetail[];
  past: PlanDetail[];
  completed: PlanDetail[];
}

/**
 * R3 overview composition. The nearest future intention leads; undated Plans
 * remain first-class, while elapsed and completed entries stay discoverable
 * without competing with anticipation.
 */
export function groupPlanningOverviewPlans(
  plans: readonly PlanDetail[],
  now: Date = new Date(),
): PlanningOverviewGroups {
  const upcoming = selectUpcomingPlans(plans, now);
  const upcomingIds = new Set(upcoming.map((plan) => plan.id));
  const active = plans.filter((plan) => plan.status !== PlanStatus.COMPLETED);
  const undated = active
    .filter(
      (plan) =>
        !upcomingIds.has(plan.id) && !plan.plannedOn && !plan.plannedStart,
    )
    .sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
    );
  const undatedIds = new Set(undated.map((plan) => plan.id));
  const past = active
    .filter((plan) => !upcomingIds.has(plan.id) && !undatedIds.has(plan.id))
    .sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
    );
  const completed = plans
    .filter((plan) => plan.status === PlanStatus.COMPLETED)
    .sort((left, right) => {
      const leftDate = left.experiencedOn ?? left.updatedAt;
      const rightDate = right.experiencedOn ?? right.updatedAt;
      return rightDate.getTime() - leftDate.getTime();
    });

  return {
    focal: upcoming[0] ?? null,
    later: upcoming.slice(1),
    undated,
    past,
    completed,
  };
}
