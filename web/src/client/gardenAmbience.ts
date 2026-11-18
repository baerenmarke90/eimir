/**
 * Ambience of the shared garden (#1907 H3 extensions): the time of day from
 * the device clock, seasonal particles, the together moments and the
 * celebrations of the day.
 *
 * Everything here is derived from the device clock, the existing garden view
 * and the couple's existing occasions. Nothing is stored, nothing counts and
 * nothing says whether the partner is looking right now: a together moment
 * only shows what both did today (Product Owner: partner presence stays off).
 */

import type { GardenPlantView } from '../api/generated/models/GardenPlantView';
import type { GardenUnlock } from '../api/generated/models/GardenUnlock';
import type { GardenView } from '../api/generated/models/GardenView';
import type { GardenWords } from '../api/generated/models/GardenWords';
import { seededRandom } from './garden';
import type { GardenSeason } from './gardenPresentation';
import { occasionsOn, type SpaceOccasion } from './occasionMatches';

/* Time of day ---------------------------------------------------------------- */

export type GardenDaytime = 'morning' | 'day' | 'evening' | 'night';

/**
 * The band of the device's local hour: morning 5–10, day 10–18, evening
 * 18–21 and night otherwise.
 */
export function gardenDaytime(now: Date): GardenDaytime {
  const hour = now.getHours();
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 18) return 'day';
  if (hour >= 18 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Watering always ends with a bow. At night there is no sun, so it is a pale
 * moonbow (#2048); otherwise a rainbow.
 */
export function moonbowWeather(daytime: GardenDaytime): boolean {
  return daytime === 'night';
}

/** Where the sun (or, at night, the moon) stands in the sky. */
export function sunPlace(
  daytime: GardenDaytime,
  width: number,
): { x: number; y: number } {
  switch (daytime) {
    case 'morning':
      return { x: 46, y: 80 };
    case 'evening':
      return { x: width - 44, y: 92 };
    default:
      return { x: width - 58, y: 44 };
  }
}

/* Seasonal particles --------------------------------------------------------- */

export interface AmbientParticle {
  x: number;
  /** Negative, so the loop is already running when the garden opens. */
  delay: number;
  duration: number;
  dx: number;
  size: number;
  rotate: number;
}

export const PARTICLES_MIN = 10;
export const PARTICLES_MAX = 24;

const SEASON_PARTICLES: Record<GardenSeason, number> = {
  spring: 14,
  summer: 10,
  autumn: 16,
  winter: 22,
};

/** A few petals, motes, leaves or flakes; between 10 and 24, never more. */
export function ambientParticles(
  season: GardenSeason,
  width: number,
): AmbientParticle[] {
  const count = Math.max(
    PARTICLES_MIN,
    Math.min(
      PARTICLES_MAX,
      Math.round((SEASON_PARTICLES[season] * width) / 340),
    ),
  );
  const random = seededRandom(season.length * 31 + 7);
  const slow = season === 'winter' ? 1.5 : season === 'summer' ? 1.3 : 1;
  return Array.from({ length: count }, (_, k) => {
    const duration = Math.round((7000 + random() * 5000) * slow);
    return {
      x: Math.round(((k + random() * 0.8) / count) * width),
      delay: -Math.round(random() * duration),
      duration,
      dx: Math.round((random() - 0.5) * 60),
      size: Math.round((0.8 + random() * 0.5) * 10) / 10,
      rotate: Math.round(random() * 360 - 180),
    };
  });
}

/* Together moments ----------------------------------------------------------- */

type TogetherView = Pick<
  GardenView,
  | 'localDate'
  | 'plants'
  | 'incoming'
  | 'partnerSentToday'
  | 'sharedToday'
  | 'wateredToday'
  | 'partnerWateredToday'
>;

export interface TogetherMoments {
  /** Both watered a plant today: a double rainbow. */
  bothWatered: boolean;
  /** Both sent a seed today (the shared day): two figures under the tree. */
  bothSent: boolean;
  /** The kind words of the partner's seed of today, if there are any. */
  partnerWords: GardenWords | null;
}

const sameDay = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

/** The partner's seed sent on the garden's day, waiting or already planted. */
function partnerSeedToday(
  view: TogetherView,
  accountId: string,
): GardenPlantView | null {
  if (!view.partnerSentToday) return null;
  const candidates = [view.incoming ?? null, ...view.plants];
  return (
    candidates.find(
      (entry): entry is GardenPlantView =>
        entry !== null &&
        entry.senderId !== accountId &&
        sameDay(entry.sentOn, view.localDate),
    ) ?? null
  );
}

export function togetherMoments(
  view: TogetherView,
  accountId: string,
): TogetherMoments {
  return {
    bothWatered: view.wateredToday != null && view.partnerWateredToday != null,
    bothSent: view.sharedToday,
    partnerWords: partnerSeedToday(view, accountId)?.words ?? null,
  };
}

export interface TogetherArrivals {
  /** The plant the partner just watered while the garden was open. */
  partnerWatered: string | null;
  bothWatered: boolean;
  bothSent: boolean;
  partnerWords: boolean;
}

/**
 * What the live sync just brought: compared with the view shown before, so
 * each moment plays once when it arrives and never again on a later read.
 */
export function togetherArrivals(
  previous: TogetherView,
  next: TogetherView,
  accountId: string,
): TogetherArrivals {
  const before = togetherMoments(previous, accountId);
  const after = togetherMoments(next, accountId);
  return {
    partnerWatered:
      previous.partnerWateredToday == null && next.partnerWateredToday != null
        ? next.partnerWateredToday
        : null,
    bothWatered: !before.bothWatered && after.bothWatered,
    bothSent: !before.bothSent && after.bothSent,
    partnerWords: before.partnerWords === null && after.partnerWords !== null,
  };
}

/** Where the two sit: on the swing, on a bench under the tree or the meadow. */
export function togetherSeat(
  unlocks: ReadonlyArray<GardenUnlock>,
): 'swing' | 'tree' | 'bench' {
  if (unlocks.includes('TREE'))
    return unlocks.includes('SWING') ? 'swing' : 'tree';
  return 'bench';
}

/* Celebrations --------------------------------------------------------------- */

export type GardenCelebration =
  | { kind: 'anniversary' }
  | { kind: 'birthday'; name: string; isViewer: boolean };

/** The device's calendar day as the date-only value the API uses. */
export function localCalendarDay(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Only on the day itself: the relationship anniversary or either partner's
 * birthday, from the occasions the Space already exposes. Shared important
 * dates do not decorate the garden; there is never a countdown.
 */
export function gardenCelebration(
  day: Date,
  occasions: readonly SpaceOccasion[],
): GardenCelebration | null {
  for (const match of occasionsOn(day, null, occasions)) {
    if (match.kind === 'relationship' && match.years >= 1)
      return { kind: 'anniversary' };
    if (match.kind === 'birthday')
      return {
        kind: 'birthday',
        name: match.displayName,
        isViewer: match.isViewer,
      };
  }
  return null;
}

/** The first day of the garden's winter: the first snow falls. */
export function isFirstSnowDay(localDate: Date): boolean {
  return localDate.getUTCMonth() === 11 && localDate.getUTCDate() === 1;
}
