/*
 * Waymarks of "Eure Geschichte" (#1907 F1): round day counts and yearly
 * anniversaries of the couple's own Milestones.
 *
 * Everything is derived from data the page already reads (the passport's
 * server-anchored day count and the Milestones list). All arithmetic is on
 * UTC calendar dates, never the device time zone; 29 February falls on
 * 28 February in other years, as in the existing anniversary countdown.
 */

const DAY_MS = 86_400_000;

/**
 * The round days worth a landmark: 100, 200, 500 and 1,000, then every 1,000
 * days up to 10,000. Not every hundredth day and no repdigits. The series ends
 * there on purpose: nothing is invented past what the product has a reason to
 * call a landmark.
 */
export const ROUND_DAYS: readonly number[] = [
  100, 200, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10_000,
];

function utcMidnight(value: Date): number {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

/** The calendar date of `source` in `year`, clamped for 29 February. */
export function anniversaryIn(source: Date, year: number): Date {
  const month = source.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month, Math.min(source.getUTCDate(), lastDay)),
  );
}

/** The date `days` after `start` (date-only, UTC). */
export function dayCountDate(start: Date, days: number): Date {
  return new Date(utcMidnight(start) + days * DAY_MS);
}

/** The next round day that has not passed yet; today still counts. */
export function nextRoundDay(daysTogether: number): number | null {
  if (!Number.isSafeInteger(daysTogether) || daysTogether < 0) return null;
  return ROUND_DAYS.find((days) => days >= daysTogether) ?? null;
}

/** Every round day the couple has already reached, oldest first. */
export function reachedRoundDays(daysTogether: number): number[] {
  if (!Number.isSafeInteger(daysTogether) || daysTogether < 0) return [];
  return ROUND_DAYS.filter((days) => days <= daysTogether);
}

export interface MilestoneRef {
  id: string;
  title: string;
  happenedOn: Date;
}

export type Waymark =
  | { kind: 'roundDay'; key: string; date: Date; days: number }
  | {
      kind: 'milestoneAnniversary';
      key: string;
      date: Date;
      years: number;
      milestoneId: string;
      title: string;
    }
  | { kind: 'relationshipAnniversary'; key: string; date: Date; years: number };

export interface UpcomingMilestoneAnniversary {
  date: Date;
  years: number;
  milestoneId: string;
  title: string;
  daysRemaining: number;
}

/** Milestones with a usable date that is not in the future. */
function usableMilestones(milestones: readonly MilestoneRef[], today: Date) {
  const todayMs = utcMidnight(today);
  return milestones.filter(
    (milestone) =>
      Number.isFinite(milestone.happenedOn.getTime()) &&
      utcMidnight(milestone.happenedOn) <= todayMs,
  );
}

/** The anniversaries of authored Milestones that have already come. */
export function reachedMilestoneAnniversaries(
  milestones: readonly MilestoneRef[],
  today: Date,
): Waymark[] {
  const todayMs = utcMidnight(today);
  const reached: Waymark[] = [];
  for (const milestone of usableMilestones(milestones, today)) {
    const firstYear = milestone.happenedOn.getUTCFullYear();
    for (
      let years = 1;
      firstYear + years <= today.getUTCFullYear();
      years += 1
    ) {
      const date = anniversaryIn(milestone.happenedOn, firstYear + years);
      if (date.getTime() > todayMs) break;
      reached.push({
        kind: 'milestoneAnniversary',
        key: `milestone:${milestone.id}:${years}`,
        date,
        years,
        milestoneId: milestone.id,
        title: milestone.title,
      });
    }
  }
  return reached;
}

/** The nearest anniversary of an authored Milestone that is still to come. */
export function nextMilestoneAnniversary(
  milestones: readonly MilestoneRef[],
  today: Date,
): UpcomingMilestoneAnniversary | null {
  const todayMs = utcMidnight(today);
  let best: UpcomingMilestoneAnniversary | null = null;
  for (const milestone of usableMilestones(milestones, today)) {
    const firstYear = milestone.happenedOn.getUTCFullYear();
    // Today still counts: the day itself is the one worth showing.
    let years = Math.max(1, today.getUTCFullYear() - firstYear);
    let date = anniversaryIn(milestone.happenedOn, firstYear + years);
    if (date.getTime() < todayMs) {
      years += 1;
      date = anniversaryIn(milestone.happenedOn, firstYear + years);
    }
    if (best && best.date.getTime() <= date.getTime()) continue;
    best = {
      date,
      years,
      milestoneId: milestone.id,
      title: milestone.title,
      daysRemaining: Math.round((date.getTime() - todayMs) / DAY_MS),
    };
  }
  return best;
}

/**
 * Only the first anniversary and every fifth one after it read as a
 * milestone of the relationship (1, 5, 10, 15 …); the years in between stay
 * out of the thread so it does not fill up with one line per year.
 */
export function isMeaningfulAnniversary(years: number): boolean {
  return years === 1 || (years > 0 && years % 5 === 0);
}

/** The meaningful relationship anniversaries that have already come. */
export function reachedRelationshipAnniversaries(
  start: Date,
  today: Date,
): Waymark[] {
  const todayMs = utcMidnight(today);
  const reached: Waymark[] = [];
  const firstYear = start.getUTCFullYear();
  for (let years = 1; firstYear + years <= today.getUTCFullYear(); years += 1) {
    const date = anniversaryIn(start, firstYear + years);
    if (date.getTime() > todayMs) break;
    if (!isMeaningfulAnniversary(years)) continue;
    reached.push({
      kind: 'relationshipAnniversary',
      key: `anniversary:${years}`,
      date,
      years,
    });
  }
  return reached;
}

export interface WaymarkDuration {
  startedOn: Date;
  daysTogether: number;
}

/**
 * The day the page treats as "today". The passport's day count is anchored
 * on the server, so it does not drift with the device clock; without a
 * relationship start the device's UTC calendar date is the only anchor left.
 */
export function waymarkToday(
  duration: WaymarkDuration | null,
  now: Date = new Date(),
): Date {
  if (
    duration &&
    Number.isFinite(duration.startedOn.getTime()) &&
    Number.isSafeInteger(duration.daysTogether) &&
    duration.daysTogether >= 0
  )
    return dayCountDate(duration.startedOn, duration.daysTogether);
  return new Date(utcMidnight(now));
}

/** The waymarks the couple has reached, newest first. */
export function reachedWaymarks({
  duration,
  milestones,
  today,
}: {
  duration: WaymarkDuration | null;
  milestones: readonly MilestoneRef[];
  today: Date;
}): Waymark[] {
  const validDuration =
    duration &&
    Number.isFinite(duration.startedOn.getTime()) &&
    Number.isSafeInteger(duration.daysTogether) &&
    duration.daysTogether >= 0
      ? duration
      : null;
  const waymarks: Waymark[] = [
    ...(validDuration
      ? reachedRoundDays(validDuration.daysTogether).map(
          (days): Waymark => ({
            kind: 'roundDay',
            key: `round:${days}`,
            date: dayCountDate(validDuration.startedOn, days),
            days,
          }),
        )
      : []),
    ...(validDuration
      ? reachedRelationshipAnniversaries(validDuration.startedOn, today)
      : []),
    ...reachedMilestoneAnniversaries(milestones, today),
  ];
  const rank = {
    roundDay: 0,
    relationshipAnniversary: 1,
    milestoneAnniversary: 2,
  };
  return waymarks.sort(
    (a, b) =>
      b.date.getTime() - a.date.getTime() ||
      rank[a.kind] - rank[b.kind] ||
      a.key.localeCompare(b.key),
  );
}
