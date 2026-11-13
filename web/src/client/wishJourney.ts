import type { WishDetail } from '../api/generated/models/WishDetail';
import type { WishPlanReference } from '../api/generated/models/WishPlanReference';
import { resolvedLocale } from '../i18n';
import {
  formatCompactCalendarDate,
  formatCompactWeekdayDate,
} from './formatRecency';

/**
 * #1790 F2: a Wish's visible journey, derived only from existing data
 * (`status`, the originating Plan and a linked Memory). Nothing is entered
 * manually and nothing here writes; there is no "prepared" stage.
 */
export const WISH_JOURNEY_STAGES = [
  'wished',
  'planned',
  'experienced',
  'remembered',
] as const;
export type WishJourneyStage = (typeof WISH_JOURNEY_STAGES)[number];

export function wishJourneyStage(
  wish: Pick<WishDetail, 'status' | 'hasMemory'>,
): WishJourneyStage {
  if (wish.status === 'PLANNED') return 'planned';
  if (wish.status === 'COMPLETED')
    return wish.hasMemory ? 'remembered' : 'experienced';
  return 'wished';
}

export function wishJourneyIndex(stage: WishJourneyStage): number {
  return WISH_JOURNEY_STAGES.indexOf(stage);
}

/** Day of the originating Plan; a date-only schedule keeps its encoded day. */
export function wishPlanDateLabel(
  plan: Pick<WishPlanReference, 'plannedOn' | 'plannedStart'> | null,
  locale = resolvedLocale(),
): string | null {
  if (plan?.plannedOn) return formatCompactCalendarDate(plan.plannedOn, locale);
  if (plan?.plannedStart)
    return formatCompactWeekdayDate(plan.plannedStart, locale);
  return null;
}

function planSortTime(wish: WishDetail): number {
  const plan = wish.plan;
  if (plan?.plannedOn) return plan.plannedOn.getTime();
  if (plan?.plannedStart) return plan.plannedStart.getTime();
  return Number.POSITIVE_INFINITY;
}

/** Planned wishes in the order they will happen; undated plans come last. */
export function sortPlannedWishes(
  wishes: WishDetail[],
  compareTitles: (left: WishDetail, right: WishDetail) => number,
): WishDetail[] {
  return [...wishes].sort(
    (left, right) =>
      planSortTime(left) - planSortTime(right) || compareTitles(left, right),
  );
}

export type WishJourneyHint =
  | { kind: 'underway'; count: number }
  | { kind: 'awaitingMemory'; count: number };

/**
 * The single quiet hint above the Plans list, only when it is relevant:
 * wishes underway first, otherwise fulfilled wishes still waiting for a memory.
 * Only wishes experienced through their Plan count as waiting, because the
 * Plan's memory capture links the new Memory and so resolves the hint.
 */
export function wishJourneyHint(
  wishes: Pick<WishDetail, 'status' | 'hasMemory' | 'plan'>[],
): WishJourneyHint | null {
  const underway = wishes.filter((wish) => wish.status === 'PLANNED').length;
  if (underway) return { kind: 'underway', count: underway };
  const awaitingMemory = wishes.filter(
    (wish) => wish.status === 'COMPLETED' && wish.plan && !wish.hasMemory,
  ).length;
  if (awaitingMemory) return { kind: 'awaitingMemory', count: awaitingMemory };
  return null;
}
