/*
 * Deterministic presentation model for the Pro Vibe/Energy insights (#1151).
 *
 * Input is exclusively the authorized server projection of
 * `getDailyCheckInInsights`. Nothing here re-derives data the server withheld:
 * a partner value exists in the model only when the server projected it as
 * VISIBLE. HIDDEN_UNTIL_SELF_CHECK_IN and NO_CHECK_IN are deliberately
 * collapsed into the same absent value — the insights endpoint distinguishes
 * them per day, but rendering that distinction would let a caller learn
 * whether the partner checked in on a day the Mutual Reveal rule keeps closed.
 *
 * Every derived statement is descriptive. There is no score, ranking,
 * causality or diagnosis, and every statement is gated by a minimum data
 * threshold so sparse data yields no statement instead of a weak one.
 */
import { DailyVibe } from '../api/generated/models/DailyVibe';
import type { DailyCheckInInsightsView } from '../api/generated/models/DailyCheckInInsightsView';

export type IsoDate = string;
export type PersonKey = 'own' | 'partner';

export interface PersonDay {
  vibe: DailyVibe | null;
  energy: number | null;
}

export interface InsightDay {
  date: IsoDate;
  own: PersonDay;
  partner: PersonDay;
}

/* Calendar arithmetic on ISO dates. The server speaks plain calendar dates in
 * the Space's own time zone, so all math is UTC-anchored and never consults
 * the browser's zone. */

const DAY_MS = 86_400_000;

export function isoToDate(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(isoToDate(iso).getTime() + days * DAY_MS));
}

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(iso: IsoDate): number {
  return (isoToDate(iso).getUTCDay() + 6) % 7;
}

export function mondayOf(iso: IsoDate): IsoDate {
  return addDays(iso, -weekdayIndex(iso));
}

export function weekDates(monday: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function monthStart(iso: IsoDate): IsoDate {
  return `${iso.slice(0, 7)}-01`;
}

export function shiftMonth(iso: IsoDate, months: number): IsoDate {
  const date = isoToDate(monthStart(iso));
  return toIsoDate(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)),
  );
}

export function monthEnd(iso: IsoDate): IsoDate {
  return addDays(shiftMonth(iso, 1), -1);
}

/** Weeks (Monday-first) that cover a month; days outside the month are null. */
export function monthWeeks(iso: IsoDate): (IsoDate | null)[][] {
  const first = monthStart(iso);
  const last = monthEnd(iso);
  const weeks: (IsoDate | null)[][] = [];
  for (
    let monday = mondayOf(first);
    monday <= last;
    monday = addDays(monday, 7)
  ) {
    weeks.push(
      weekDates(monday).map((date) =>
        date >= first && date <= last ? date : null,
      ),
    );
  }
  return weeks;
}

/* Projection -------------------------------------------------------------- */

export function projectInsightDays(
  view: DailyCheckInInsightsView,
): InsightDay[] {
  return view.days.map((day) => ({
    date: toIsoDate(day.checkedOn),
    own: {
      vibe: view.vibeEnabled ? (day.ownVibe ?? null) : null,
      energy: view.energyEnabled ? (day.ownEnergy ?? null) : null,
    },
    partner: {
      vibe:
        view.vibeEnabled && day.partnerVibe?.state === 'VISIBLE'
          ? day.partnerVibe.value
          : null,
      energy:
        view.energyEnabled && day.partnerEnergy?.state === 'VISIBLE'
          ? day.partnerEnergy.value
          : null,
    },
  }));
}

export function daysInRange(
  days: readonly InsightDay[],
  dates: readonly IsoDate[],
): InsightDay[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return dates.map(
    (date) =>
      byDate.get(date) ?? {
        date,
        own: { vibe: null, energy: null },
        partner: { vibe: null, energy: null },
      },
  );
}

/* Scales ------------------------------------------------------------------ */

/**
 * Vibe is categorical (six named states), not an ordinal scale. The lane order
 * is only a stable presentation order and implies no ranking.
 */
export const VIBE_LANES = [
  DailyVibe.GOOD,
  DailyVibe.OKAY,
  DailyVibe.NEEDS_CONNECTION,
  DailyVibe.NEEDS_SPACE,
  DailyVibe.STRESSED,
  DailyVibe.SAD,
] as const;

export const VIBE_GLYPHS: Record<DailyVibe, string> = {
  [DailyVibe.GOOD]: '☀',
  [DailyVibe.OKAY]: '●',
  [DailyVibe.STRESSED]: '↯',
  [DailyVibe.SAD]: '☂',
  [DailyVibe.NEEDS_CONNECTION]: '♡',
  [DailyVibe.NEEDS_SPACE]: '○',
};

export const ENERGY_MIN = 10;
export const ENERGY_MAX = 100;
export const HIGH_ENERGY_FROM = 70;

export type EnergyBand = 'veryLow' | 'low' | 'mid' | 'high' | 'veryHigh';

export const ENERGY_BANDS: readonly EnergyBand[] = [
  'veryHigh',
  'high',
  'mid',
  'low',
  'veryLow',
];

export function energyBand(level: number): EnergyBand {
  if (level >= 90) return 'veryHigh';
  if (level >= 70) return 'high';
  if (level >= 50) return 'mid';
  if (level >= 30) return 'low';
  return 'veryLow';
}

/** 0 (bottom) … 1 (top) plot position for an Energy level. */
export function energyPosition(level: number): number {
  const clamped = Math.min(ENERGY_MAX, Math.max(ENERGY_MIN, level));
  return (clamped - ENERGY_MIN) / (ENERGY_MAX - ENERGY_MIN);
}

export interface SeriesPoint {
  index: number;
  value: number;
}

/** Contiguous runs of present values; an absent day always breaks the line. */
export function energySegments(
  days: readonly InsightDay[],
  person: PersonKey,
): SeriesPoint[][] {
  const segments: SeriesPoint[][] = [];
  let current: SeriesPoint[] = [];
  days.forEach((day, index) => {
    const value = day[person].energy;
    if (value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    current.push({ index, value });
  });
  if (current.length > 0) segments.push(current);
  return segments;
}

/* Statistics helpers ------------------------------------------------------- */

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function energyValues(
  days: readonly InsightDay[],
  persons: readonly PersonKey[] = ['own', 'partner'],
): number[] {
  return days.flatMap((day) =>
    persons.flatMap((person) => {
      const value = day[person].energy;
      return value === null ? [] : [value];
    }),
  );
}

export function hasAnyValue(day: InsightDay): boolean {
  return (
    day.own.vibe !== null ||
    day.own.energy !== null ||
    day.partner.vibe !== null ||
    day.partner.energy !== null
  );
}

export function daysWithValues(days: readonly InsightDay[]): number {
  return days.filter(hasAnyValue).length;
}

/** Days on which both people have a value the caller may see. */
export function mutualDays(days: readonly InsightDay[]): InsightDay[] {
  return days.filter(
    (day) =>
      (day.own.vibe !== null || day.own.energy !== null) &&
      (day.partner.vibe !== null || day.partner.energy !== null),
  );
}

interface PersonSample {
  vibe: DailyVibe;
  energy: number;
}

/** One sample per person and day where that person has both dimensions. */
export function vibeEnergySamples(days: readonly InsightDay[]): PersonSample[] {
  return days.flatMap((day) =>
    (['own', 'partner'] as const).flatMap((person) => {
      const { vibe, energy } = day[person];
      return vibe !== null && energy !== null ? [{ vibe, energy }] : [];
    }),
  );
}

/* Insights ---------------------------------------------------------------- */

export interface InsightModules {
  vibe: boolean;
  energy: boolean;
}

export type InsightKind =
  | 'bothGood'
  | 'weekendEnergy'
  | 'vibeEnergy'
  | 'sharedDays'
  | 'energyVersusPrevious'
  | 'weekdayEnergy'
  | 'partnerEnergyVibe';

export interface DerivedInsight {
  kind: InsightKind;
  /** Interpolation values for the localized statement. */
  params: Record<string, string | number>;
}

const MIN_SAMPLES_PER_GROUP = 2;
const ENERGY_DIFFERENCE = 10;

function bothGoodDays(days: readonly InsightDay[]): InsightDay[] {
  return days.filter(
    (day) =>
      day.own.vibe === DailyVibe.GOOD && day.partner.vibe === DailyVibe.GOOD,
  );
}

export function deriveBothGood(
  days: readonly InsightDay[],
  modules: InsightModules,
): DerivedInsight | null {
  if (!modules.vibe) return null;
  const matches = bothGoodDays(days);
  if (matches.length === 0) return null;
  return {
    kind: 'bothGood',
    params: { count: matches.length, date: matches.at(-1)?.date ?? '' },
  };
}

export function deriveWeekendEnergy(
  days: readonly InsightDay[],
  modules: InsightModules,
): DerivedInsight | null {
  if (!modules.energy) return null;
  const weekend = energyValues(
    days.filter((day) => weekdayIndex(day.date) >= 5),
  );
  const weekdays = energyValues(
    days.filter((day) => weekdayIndex(day.date) < 5),
  );
  if (weekend.length < MIN_SAMPLES_PER_GROUP || weekdays.length < 3)
    return null;
  const difference = (mean(weekend) ?? 0) - (mean(weekdays) ?? 0);
  if (Math.abs(difference) < ENERGY_DIFFERENCE) return null;
  return {
    kind: 'weekendEnergy',
    params: { direction: difference > 0 ? 'higher' : 'lower' },
  };
}

export function deriveVibeEnergy(
  days: readonly InsightDay[],
  modules: InsightModules,
): DerivedInsight | null {
  if (!modules.vibe || !modules.energy) return null;
  const samples = vibeEnergySamples(days);
  const good = samples.filter((sample) => sample.vibe === DailyVibe.GOOD);
  const other = samples.filter((sample) => sample.vibe !== DailyVibe.GOOD);
  if (
    good.length < MIN_SAMPLES_PER_GROUP ||
    other.length < MIN_SAMPLES_PER_GROUP
  ) {
    return null;
  }
  const goodMean = mean(good.map((sample) => sample.energy)) ?? 0;
  const otherMean = mean(other.map((sample) => sample.energy)) ?? 0;
  if (goodMean - otherMean < ENERGY_DIFFERENCE) return null;
  return {
    kind: 'vibeEnergy',
    params: { good: Math.round(goodMean), other: Math.round(otherMean) },
  };
}

export function deriveSharedDays(
  days: readonly InsightDay[],
  minimum = 4,
): DerivedInsight | null {
  const shared = mutualDays(days).length;
  if (shared < minimum) return null;
  return { kind: 'sharedDays', params: { count: shared, total: days.length } };
}

export function deriveEnergyVersusPrevious(
  current: readonly InsightDay[],
  previous: readonly InsightDay[],
  modules: InsightModules,
): DerivedInsight | null {
  if (!modules.energy) return null;
  const now = energyValues(current);
  const before = energyValues(previous);
  if (now.length < 3 || before.length < 3) return null;
  const difference = (mean(now) ?? 0) - (mean(before) ?? 0);
  if (Math.abs(difference) < 5) return null;
  return {
    kind: 'energyVersusPrevious',
    params: { direction: difference > 0 ? 'higher' : 'lower' },
  };
}

export function deriveWeekdayEnergy(
  days: readonly InsightDay[],
  modules: InsightModules,
): DerivedInsight | null {
  if (!modules.energy) return null;
  const overall = mean(energyValues(days));
  if (overall === null) return null;
  let best: { weekday: number; difference: number } | null = null;
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const values = energyValues(
      days.filter((day) => weekdayIndex(day.date) === weekday),
    );
    if (values.length < 3) continue;
    const difference = (mean(values) ?? 0) - overall;
    if (
      Math.abs(difference) >= ENERGY_DIFFERENCE &&
      (best === null || Math.abs(difference) > Math.abs(best.difference))
    ) {
      best = { weekday, difference };
    }
  }
  if (best === null) return null;
  return {
    kind: 'weekdayEnergy',
    params: {
      weekday: best.weekday,
      direction: best.difference > 0 ? 'higher' : 'lower',
    },
  };
}

/**
 * "When one person had a lot of energy, the other one often felt good too" — a
 * descriptive co-occurrence over visible values only, never a causal claim.
 */
export function derivePartnerEnergyVibe(
  days: readonly InsightDay[],
  modules: InsightModules,
): DerivedInsight | null {
  if (!modules.vibe || !modules.energy) return null;
  let best: { energyOf: PersonKey; share: number } | null = null;
  for (const [energyOf, vibeOf] of [
    ['partner', 'own'],
    ['own', 'partner'],
  ] as const) {
    const paired = days.flatMap((day) => {
      const energy = day[energyOf].energy;
      const vibe = day[vibeOf].vibe;
      return energy !== null && vibe !== null ? [{ energy, vibe }] : [];
    });
    const high = paired.filter((entry) => entry.energy >= HIGH_ENERGY_FROM);
    const rest = paired.filter((entry) => entry.energy < HIGH_ENERGY_FROM);
    if (high.length < 3 || rest.length < 3) continue;
    const goodShare = (entries: typeof paired) =>
      entries.filter((entry) => entry.vibe === DailyVibe.GOOD).length /
      entries.length;
    const difference = goodShare(high) - goodShare(rest);
    if (difference >= 0.25 && (best === null || difference > best.share)) {
      best = { energyOf, share: difference };
    }
  }
  if (best === null) return null;
  return { kind: 'partnerEnergyVibe', params: { energyOf: best.energyOf } };
}

export function compact<T>(items: readonly (T | null)[]): T[] {
  return items.filter((item): item is T => item !== null);
}

/* Highlights -------------------------------------------------------------- */

export type HighlightKind = 'bothGood' | 'bothEnergy';

export interface Highlight {
  date: IsoDate;
  kind: HighlightKind;
  own: PersonDay;
  partner: PersonDay;
}

/** Up to three days on which both people shared a positive value. */
export function deriveHighlights(
  days: readonly InsightDay[],
  modules: InsightModules,
  limit = 3,
): Highlight[] {
  const candidates = days.flatMap<Highlight>((day) => {
    const bothGood =
      modules.vibe &&
      day.own.vibe === DailyVibe.GOOD &&
      day.partner.vibe === DailyVibe.GOOD;
    const bothEnergy =
      modules.energy &&
      (day.own.energy ?? 0) >= HIGH_ENERGY_FROM &&
      (day.partner.energy ?? 0) >= HIGH_ENERGY_FROM;
    if (bothGood) {
      return [
        {
          date: day.date,
          kind: 'bothGood',
          own: day.own,
          partner: day.partner,
        },
      ];
    }
    if (bothEnergy) {
      return [
        {
          date: day.date,
          kind: 'bothEnergy',
          own: day.own,
          partner: day.partner,
        },
      ];
    }
    return [];
  });
  return candidates.slice(0, limit);
}

/** Weekday indices on which both people most often had a good day. */
export function goodWeekdays(
  days: readonly InsightDay[],
  modules: InsightModules,
  limit = 3,
): number[] {
  const counts = new Map<number, number>();
  for (const day of days) {
    const good =
      (modules.vibe &&
        day.own.vibe === DailyVibe.GOOD &&
        day.partner.vibe === DailyVibe.GOOD) ||
      (modules.energy &&
        (day.own.energy ?? 0) >= HIGH_ENERGY_FROM &&
        (day.partner.energy ?? 0) >= HIGH_ENERGY_FROM);
    if (!good) continue;
    const weekday = weekdayIndex(day.date);
    counts.set(weekday, (counts.get(weekday) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([weekday]) => weekday);
}

/* Strip chart for Vibe and Energy in relation (Pro Screen B) --------------- */

export interface RelationSummary {
  samples: number;
  /** Per Vibe lane: Energy levels of that lane's person-days. */
  lanes: { vibe: DailyVibe; energies: number[] }[];
}

export function relationSummary(days: readonly InsightDay[]): RelationSummary {
  const samples = vibeEnergySamples(days);
  return {
    samples: samples.length,
    lanes: VIBE_LANES.map((vibe) => ({
      vibe,
      energies: samples
        .filter((sample) => sample.vibe === vibe)
        .map((sample) => sample.energy),
    })),
  };
}
