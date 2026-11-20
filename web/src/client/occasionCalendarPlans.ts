import type { PlansApi } from '../api/generated/apis/PlansApi';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { selectUpcomingPlans } from './planningOverview';
import { dateOnlyInput, localCalendarDateInput } from './sharedPlanning';

const PAGE_SIZE = 50;

/** Shared prefix, so every existing Plan invalidation also refreshes this. */
export function occasionCalendarPlansQueryKey(spaceId: string) {
  return ['m5-s3', 'plans', spaceId, 'occasion-calendar'] as const;
}

/**
 * Upcoming dated Plans for the occasions calendar (#1907 F3).
 *
 * The `OPEN` overview scope lists upcoming Plans first, ordered by schedule,
 * then undated and elapsed ones. Paging therefore stops at the first page that
 * already contains a Plan outside the upcoming group.
 */
export async function loadOccasionCalendarPlans(
  plans: Pick<PlansApi, 'listPlans'>,
  spaceId: string,
  now: Date = new Date(),
  signal?: AbortSignal,
): Promise<PlanDetail[]> {
  const upcoming: PlanDetail[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null | undefined = null;
  do {
    const page = await plans.listPlans(
      { spaceId, cursor, limit: PAGE_SIZE, overviewScope: 'OPEN' },
      { signal },
    );
    const pageUpcoming = selectUpcomingPlans(page.items, now);
    upcoming.push(...pageUpcoming);
    if (pageUpcoming.length < page.items.length) break;
    cursor = page.nextCursor;
    if (cursor) {
      if (seenCursors.has(cursor)) {
        throw new Error('Plan pagination returned a repeated cursor.');
      }
      seenCursors.add(cursor);
    }
  } while (cursor);
  return selectUpcomingPlans(upcoming, now);
}

function utcDay(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

/**
 * The calendar days a Plan occupies, as UTC midnights like occasion dates.
 * Date-only Plans keep their encoded calendar days; a timed Plan belongs to
 * the local day it starts on.
 */
export function planCalendarDays(
  plan: Pick<PlanDetail, 'plannedOn' | 'plannedUntil' | 'plannedStart'>,
): { first: Date; last: Date } | null {
  if (plan.plannedOn) {
    const first = utcDay(dateOnlyInput(plan.plannedOn));
    const until = plan.plannedUntil
      ? utcDay(dateOnlyInput(plan.plannedUntil))
      : first;
    return { first, last: until > first ? until : first };
  }
  if (plan.plannedStart) {
    const day = utcDay(localCalendarDateInput(plan.plannedStart));
    return { first: day, last: day };
  }
  return null;
}
