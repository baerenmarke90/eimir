import type { DashboardRelationshipDuration } from '../api/generated/models/DashboardRelationshipDuration';
import type { DashboardView } from '../api/generated/models/DashboardView';
import { dashboardItemPath } from './m4Product';
import { nextRoundDay } from './storyWaymarks';

const DAY_MS = 86_400_000;

/** Calendar arithmetic anchored to the server's viewer-local day count.
 * It must not drift with the browser time zone, DST or a stale device clock.
 */
export function passportLandmarks(
  duration: DashboardRelationshipDuration | null,
) {
  if (
    !duration ||
    !Number.isSafeInteger(duration.daysTogether) ||
    duration.daysTogether < 0
  )
    return null;
  const start = duration.startedOn;
  if (!Number.isFinite(start.getTime())) return null;
  const startDay = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const today = new Date(startDay + duration.daysTogether * DAY_MS);
  const anniversaryIn = (year: number) => {
    const lastDay = new Date(
      Date.UTC(year, start.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return new Date(
      Date.UTC(
        year,
        start.getUTCMonth(),
        Math.min(start.getUTCDate(), lastDay),
      ),
    );
  };
  let year = today.getUTCFullYear();
  let anniversary = anniversaryIn(year);
  if (anniversary < today || year === start.getUTCFullYear()) {
    year += 1;
    anniversary = anniversaryIn(year);
  }
  const roundDays = nextRoundDay(duration.daysTogether);
  return {
    anniversary: {
      date: anniversary,
      years: year - start.getUTCFullYear(),
      daysRemaining: Math.round(
        (anniversary.getTime() - today.getTime()) / DAY_MS,
      ),
    },
    // The series ends at 10,000 days; there is no further round day to show.
    roundDay:
      roundDays === null
        ? null
        : {
            date: new Date(startDay + roundDays * DAY_MS),
            days: roundDays,
            daysRemaining: roundDays - duration.daysTogether,
          },
  };
}

/** A shared, bounded editorial selection; never infer lifetime totals here. */
export function passportHighlights(dashboard: DashboardView | undefined) {
  const seen = new Set<string>();
  return [
    dashboard?.retrospective,
    dashboard?.keepsake,
    ...(dashboard?.recentShared ?? []),
  ]
    .filter((item) => {
      if (!item || !['MEMORY', 'HEART_MOMENT', 'MILESTONE'].includes(item.type))
        return false;
      const key = `${item.type}:${item.id}`;
      if (seen.has(key) || !dashboardItemPath(item.type, item.id)) return false;
      seen.add(key);
      return true;
    })
    .filter((item) => item != null)
    .slice(0, 3);
}
