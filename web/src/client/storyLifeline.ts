import type { DashboardItem } from '../api/generated/models/DashboardItem';
import type { StoryLifelineView } from '../api/generated/models/StoryLifelineView';

/** The three shared Story types, drawn bottom to top in every column. */
export const LIFELINE_KINDS = [
  'memories',
  'heartMoments',
  'milestones',
] as const;
export type LifelineKind = (typeof LIFELINE_KINDS)[number];
export type LifelineUnit = 'week' | 'month' | 'quarter';

/** The most columns that stay legible across a Compact band. */
export const MAX_LIFELINE_COLUMNS = 40;
/** The most stacked dots that fit the band height. */
export const MAX_LIFELINE_STACK = 6;
/** A band needs some history and content before it shows a shape. */
export const MIN_LIFELINE_DAYS = 42;
export const MIN_LIFELINE_ENTRIES = 5;

const DAY_MS = 86_400_000;

export interface LifelineTotals {
  memories: number;
  heartMoments: number;
  milestones: number;
  total: number;
}

export interface LifelineColumn extends LifelineTotals {
  key: string;
  /** First day of the column's period (UTC calendar date). */
  start: Date;
  /** Horizontal center within the band, 0 (start) to 1 (today). */
  position: number;
  highlight: DashboardItem;
  /** Drawn dots per type, bottom to top; never more than the band holds. */
  dots: LifelineKind[];
}

export interface LifelineModel {
  unit: LifelineUnit;
  rangeStart: Date;
  today: Date;
  totals: LifelineTotals;
  columns: LifelineColumn[];
  /** Whether there is enough history to draw the band at all. */
  drawable: boolean;
}

function utcDay(value: Date): number {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

function periodStart(day: Date, unit: LifelineUnit): Date {
  if (unit === 'week') return new Date(utcDay(day));
  const month =
    unit === 'month'
      ? day.getUTCMonth()
      : Math.floor(day.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(day.getUTCFullYear(), month, 1));
}

function periodEnd(start: Date, unit: LifelineUnit): number {
  if (unit === 'week') return start.getTime() + 7 * DAY_MS;
  return Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth() + (unit === 'month' ? 1 : 3),
    1,
  );
}

function chooseUnit(days: number): LifelineUnit {
  if (Math.ceil(days / 7) <= MAX_LIFELINE_COLUMNS) return 'week';
  if (Math.ceil(days / 30.44) <= MAX_LIFELINE_COLUMNS) return 'month';
  return 'quarter';
}

/**
 * Distribute a column's dots across its types. Small columns get one dot
 * per entry; when the busiest column exceeds the band height, every dot
 * stands for the same number of entries, each present type keeps at least
 * one dot, and memories give way first so landmarks stay visible.
 */
function columnDots(counts: LifelineTotals, perDot: number): LifelineKind[] {
  const amounts = LIFELINE_KINDS.map((kind) =>
    counts[kind] > 0 ? Math.ceil(counts[kind] / perDot) : 0,
  );
  let overflow =
    amounts.reduce((sum, amount) => sum + amount, 0) - MAX_LIFELINE_STACK;
  for (const index of [0, 1, 2]) {
    while (overflow > 0 && amounts[index] > 1) {
      amounts[index] -= 1;
      overflow -= 1;
    }
  }
  return LIFELINE_KINDS.flatMap((kind, index) =>
    Array.from({ length: amounts[index] }, () => kind),
  );
}

/** Turn the server's weekly buckets into a drawable band. */
export function buildLifeline(view: StoryLifelineView): LifelineModel {
  const today = new Date(utcDay(view.today));
  const firstWeek = view.weeks[0]?.weekStart;
  const startDays = [
    view.startsOn ? utcDay(view.startsOn) : null,
    firstWeek ? utcDay(firstWeek) : null,
  ].filter((value): value is number => value !== null);
  const rangeStart = new Date(
    startDays.length ? Math.min(...startDays) : today.getTime(),
  );
  const spanDays = Math.max(
    1,
    Math.round((today.getTime() - rangeStart.getTime()) / DAY_MS) + 1,
  );
  const unit = chooseUnit(spanDays);

  const grouped = new Map<string, LifelineColumn>();
  const totals: LifelineTotals = {
    memories: 0,
    heartMoments: 0,
    milestones: 0,
    total: 0,
  };
  for (const week of view.weeks) {
    const start = periodStart(week.weekStart, unit);
    const key = start.toISOString().slice(0, 10);
    const column = grouped.get(key) ?? {
      key,
      start,
      position: 0,
      memories: 0,
      heartMoments: 0,
      milestones: 0,
      total: 0,
      highlight: week.highlight,
      dots: [],
    };
    column.memories += week.memories;
    column.heartMoments += week.heartMoments;
    column.milestones += week.milestones;
    column.total += week.memories + week.heartMoments + week.milestones;
    // Weeks arrive in order: a later week replaces the highlight unless it
    // would trade a photo for an entry without one.
    if (
      week.highlight.previewAttachmentId ||
      !column.highlight.previewAttachmentId
    )
      column.highlight = week.highlight;
    grouped.set(key, column);
    totals.memories += week.memories;
    totals.heartMoments += week.heartMoments;
    totals.milestones += week.milestones;
  }
  totals.total = totals.memories + totals.heartMoments + totals.milestones;

  const columns = [...grouped.values()];
  const busiest = Math.max(0, ...columns.map((column) => column.total));
  const perDot = Math.max(1, Math.ceil(busiest / MAX_LIFELINE_STACK));
  const rangeEnd = today.getTime() + DAY_MS;
  for (const column of columns) {
    const from = Math.max(column.start.getTime(), rangeStart.getTime());
    const to = Math.min(periodEnd(column.start, unit), rangeEnd);
    const center = (from + to) / 2;
    column.position = Math.min(
      1,
      Math.max(
        0,
        (center - rangeStart.getTime()) / (rangeEnd - rangeStart.getTime()),
      ),
    );
    column.dots = columnDots(column, perDot);
  }

  return {
    unit,
    rangeStart,
    today,
    totals,
    columns,
    drawable:
      totals.total >= MIN_LIFELINE_ENTRIES && spanDays >= MIN_LIFELINE_DAYS,
  };
}

/** The column nearest to a horizontal position in the band (0..1). */
export function nearestColumn(
  columns: readonly LifelineColumn[],
  position: number,
): number {
  let best = -1;
  let distance = Number.POSITIVE_INFINITY;
  columns.forEach((column, index) => {
    const next = Math.abs(column.position - position);
    if (next < distance) {
      best = index;
      distance = next;
    }
  });
  return best;
}

/** Month boundaries inside the range, for the band's axis labels. */
export function monthTicks(
  model: LifelineModel,
): { start: Date; position: number }[] {
  const ticks: { start: Date; position: number }[] = [];
  const rangeStart = model.rangeStart.getTime();
  const rangeEnd = model.today.getTime() + DAY_MS;
  const step = model.unit === 'quarter' ? 12 : model.unit === 'month' ? 3 : 1;
  let cursor = new Date(
    Date.UTC(
      model.rangeStart.getUTCFullYear(),
      model.rangeStart.getUTCMonth(),
      1,
    ),
  );
  while (cursor.getTime() < rangeEnd) {
    const at = Math.max(cursor.getTime(), rangeStart);
    ticks.push({
      start: cursor,
      position: (at - rangeStart) / (rangeEnd - rangeStart),
    });
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + step, 1),
    );
  }
  return ticks;
}
