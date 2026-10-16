/*
 * Today ("Wir") composition contracts.
 *
 * `docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 3 requires Today to be a
 * curated orchestration surface rather than a widget dashboard: deterministic
 * product rules, no black-box relevance ranking, and modules that disappear
 * when they have nothing to say.
 *
 * The two selections below are the parts of that orchestration that carry real
 * product rules, so they live here as pure functions the component only
 * renders. Everything they consume is already-authorized, Space-scoped server
 * data from the Dashboard and Activity projections; nothing is derived from a
 * client-side heuristic, a random rotation, or a per-viewer stored state.
 */
import type { ActivityItem } from '../api/generated/models/ActivityItem';
import type { DashboardItem } from '../api/generated/models/DashboardItem';

/** How many photos the monthly strip shows at most. */
export const MONTHLY_STRIP_MAX_ITEMS = 3;

/**
 * The kinds of module the single `Gerade bei euch` slot can hold, in the
 * order they take precedence.
 */
export type LivingModuleKind =
  | 'partner_signal'
  | 'retrospective'
  | 'wish'
  | 'plan'
  | 'milestone';

export type LivingModule =
  | { kind: 'partner_signal'; activityItem: ActivityItem }
  | {
      kind: 'retrospective' | 'wish' | 'plan' | 'milestone';
      item: DashboardItem;
    };

export type TodayFocalItem = {
  kind: 'keepsake' | 'shared_text';
  item: DashboardItem;
};

const FOCAL_SHARED_TYPES = new Set<DashboardItem['type']>([
  'MEMORY',
  'HEART_MOMENT',
  'MILESTONE',
]);

/**
 * Select the one real shared item that carries Today's emotional focus.
 *
 * The server-selected Keepsake always wins because it is the authoritative
 * cross-window selection and may carry a suitable photo. When it is absent,
 * the first shared story item becomes a deliberate text-first focal point.
 * Plans, Wishes and utility records stay in their own current/context roles.
 * Returning `null` removes the region entirely; callers must never substitute
 * a photo-shaped placeholder merely because the domain exists.
 */
export function selectTodayFocalItem({
  keepsake,
  recentShared,
}: {
  keepsake: DashboardItem | null | undefined;
  recentShared: readonly DashboardItem[];
}): TodayFocalItem | null {
  if (keepsake) return { kind: 'keepsake', item: keepsake };

  const sharedText = recentShared.find((item) =>
    FOCAL_SHARED_TYPES.has(item.type),
  );
  return sharedText ? { kind: 'shared_text', item: sharedText } : null;
}

/**
 * Pick the one contextual relationship module for `Gerade bei euch`.
 *
 * Exactly one module is shown, never a stack. The chain is ordered by how
 * *current* and how *mutual* each candidate is:
 *
 * 1. a genuine partner interaction (the partner commented on shared content) —
 *    the only candidate that represents the partner acting today;
 * 2. the server-curated retrospective (`Weißt du noch?`) — date-specific, so it
 *    is only ever offered on the day it actually applies;
 * 3. a shared wish, then a shared plan, then a shared milestone — stable shared
 *    content that keeps the slot meaningful on a quiet day.
 *
 * `excludeItemIds` keeps the slot from repeating something the page already
 * shows prominently above it (the `Euer Moment` photo in particular). It
 * applies to every candidate, including a partner signal: a comment *about*
 * the memory already displayed large above is still that same memory, so it
 * is skipped and the search continues down the chain. Exclusion is matched by
 * content id alone, with no knowledge of routes or item types.
 *
 * Returns `null` when nothing qualifies; the section is then omitted entirely
 * rather than rendered as an empty placeholder.
 */
export function selectLivingModule({
  partnerId,
  activityItems,
  retrospective,
  recentShared,
  excludeItemIds,
  suppressPlanningFallback = false,
}: {
  partnerId: string | null | undefined;
  activityItems: readonly ActivityItem[] | undefined;
  retrospective: DashboardItem | null | undefined;
  recentShared: readonly DashboardItem[];
  excludeItemIds?: readonly string[];
  suppressPlanningFallback?: boolean;
}): LivingModule | null {
  const excluded = new Set(excludeItemIds ?? []);

  // Only a genuine partner comment counts. An item the viewer wrote, or one
  // with no attributable actor, is not a signal *from* the partner.
  //
  // A comment whose target is already featured above is skipped rather than
  // ending the search, so the next genuine partner comment still gets the
  // slot before the chain falls through to the stable candidates. A comment
  // with no target cannot duplicate anything, so it stays eligible.
  const partnerSignal =
    partnerId != null
      ? activityItems?.find(
          (item) =>
            item.kind === 'COMMENT_CREATED' &&
            item.actorId != null &&
            item.actorId === partnerId &&
            (item.targetId == null || !excluded.has(item.targetId)),
        )
      : undefined;
  if (partnerSignal) {
    return { kind: 'partner_signal', activityItem: partnerSignal };
  }

  if (retrospective && !excluded.has(retrospective.id)) {
    return { kind: 'retrospective', item: retrospective };
  }

  const firstOfType = (type: DashboardItem['type']) =>
    recentShared.find((item) => item.type === type && !excluded.has(item.id));

  if (!suppressPlanningFallback) {
    const wish = firstOfType('WISH');
    if (wish) return { kind: 'wish', item: wish };

    const plan = firstOfType('PLAN');
    if (plan) return { kind: 'plan', item: plan };
  }

  const milestone = firstOfType('MILESTONE');
  if (milestone) return { kind: 'milestone', item: milestone };

  return null;
}

/**
 * The id of the shared content a selected module is *about*.
 *
 * For a partner signal that is the commented item, not the activity entry —
 * which is exactly the id the sections below must not repeat. Returning one
 * plain id keeps the page's no-duplicate rule a single generic comparison
 * rather than a per-module special case.
 *
 * `null` when the module refers to no shared item (a comment whose target is
 * unknown), in which case there is nothing to exclude.
 */
export function livingModuleContentId(
  module: LivingModule | null | undefined,
): string | null {
  if (!module) return null;
  return module.kind === 'partner_signal'
    ? module.activityItem.targetId
    : module.item.id;
}

/**
 * The calendar year and month a Dashboard item belongs to.
 *
 * `occurredOn` is an OpenAPI `format: date` value. The generated client
 * materializes it with `new Date('YYYY-MM-DD')`, which JavaScript reads as
 * midnight *UTC*, and serializes it back with `toISOString().substring(0, 10)`
 * — so UTC components are the authoritative calendar date the API encoded.
 * Because midnight UTC can only shift *backwards* into the previous day under
 * a negative offset, reading it with local components moves September 1 into
 * August for every viewer west of Greenwich.
 *
 * `createdAt` is a real `format: date-time` instant, so it keeps the
 * browser-local reading the rest of the client already presents it with.
 */
export function itemCalendarMonth(
  item: DashboardItem,
): { year: number; month: number } | null {
  if (item.occurredOn) {
    return {
      year: item.occurredOn.getUTCFullYear(),
      month: item.occurredOn.getUTCMonth(),
    };
  }
  if (item.createdAt) {
    return {
      year: item.createdAt.getFullYear(),
      month: item.createdAt.getMonth(),
    };
  }
  return null;
}

/**
 * Pick up to {@link MONTHLY_STRIP_MAX_ITEMS} real shared photos from the
 * current calendar month for `Diesen Monat`.
 *
 * Only Memories carry a preview attachment in the Dashboard projection, so the
 * strip is by construction made of genuine shared photos — never a generated
 * placeholder, never a decorative stock tile.
 *
 * The strip deliberately makes no claim about *how many* shared moments the
 * month contains. `DashboardView.recentShared` is capped server-side for
 * presentation, so any total counted from it would silently understate a busy
 * month. Showing life truthfully beats showing a number that can be wrong.
 *
 * `now` defines the viewer's current browser calendar month; each item is
 * classified by {@link itemCalendarMonth}, which reads a date-only
 * `occurredOn` as the calendar date the API actually encoded.
 */
export function selectMonthlyStrip({
  recentShared,
  now,
  excludeItemIds,
}: {
  recentShared: readonly DashboardItem[];
  now: Date;
  excludeItemIds?: readonly string[];
}): DashboardItem[] {
  const excluded = new Set(excludeItemIds ?? []);
  const year = now.getFullYear();
  const month = now.getMonth();

  return recentShared
    .filter((item) => {
      if (item.type !== 'MEMORY') return false;
      if (!item.previewAttachmentId) return false;
      if (excluded.has(item.id)) return false;
      const calendar = itemCalendarMonth(item);
      if (!calendar) return false;
      return calendar.year === year && calendar.month === month;
    })
    .slice(0, MONTHLY_STRIP_MAX_ITEMS);
}
