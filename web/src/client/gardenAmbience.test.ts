import { describe, expect, it } from 'vitest';
import type { GardenPlantView } from '../api/generated/models/GardenPlantView';
import {
  ambientParticles,
  gardenCelebration,
  gardenDaytime,
  isFirstSnowDay,
  localCalendarDay,
  moonbowWeather,
  PARTICLES_MAX,
  PARTICLES_MIN,
  sunPlace,
  togetherArrivals,
  togetherMoments,
  togetherSeat,
} from './gardenAmbience';
import type { GardenSeason } from './gardenPresentation';
import { collectSpaceOccasions } from './occasionMatches';

const ME = 'me';
const PARTNER = 'partner';
const DAY = new Date('2026-11-16T00:00:00Z');

const at = (hour: number, minute = 0) =>
  new Date(2026, 10, 16, hour, minute, 0);

function seed(overrides: Partial<GardenPlantView> = {}): GardenPlantView {
  return {
    id: 'seed',
    species: 'POPPY',
    words: 'FOR_YOU',
    senderId: PARTNER,
    sentOn: DAY,
    stage: 0,
    slot: null,
    ...overrides,
  };
}

function view(overrides: Record<string, unknown> = {}) {
  return {
    localDate: DAY,
    plants: [] as GardenPlantView[],
    incoming: null as GardenPlantView | null,
    partnerSentToday: false,
    sharedToday: false,
    wateredToday: null as string | null,
    partnerWateredToday: null as string | null,
    ...overrides,
  };
}

describe('garden time of day', () => {
  it('follows the bands of the device clock', () => {
    expect(gardenDaytime(at(4, 59))).toBe('night');
    expect(gardenDaytime(at(5))).toBe('morning');
    expect(gardenDaytime(at(9, 59))).toBe('morning');
    expect(gardenDaytime(at(10))).toBe('day');
    expect(gardenDaytime(at(17, 59))).toBe('day');
    expect(gardenDaytime(at(18))).toBe('evening');
    expect(gardenDaytime(at(20, 59))).toBe('evening');
    expect(gardenDaytime(at(21))).toBe('night');
    expect(gardenDaytime(at(0))).toBe('night');
  });

  it('turns the bow into a moonbow at night', () => {
    expect(moonbowWeather('morning')).toBe(false);
    expect(moonbowWeather('day')).toBe(false);
    expect(moonbowWeather('evening')).toBe(false);
    expect(moonbowWeather('night')).toBe(true);
  });

  it('rises on the left and sets low on the right', () => {
    expect(sunPlace('morning', 340)).toEqual({ x: 46, y: 80 });
    expect(sunPlace('day', 340)).toEqual({ x: 282, y: 44 });
    expect(sunPlace('evening', 520).x).toBe(476);
    expect(sunPlace('night', 340)).toEqual(sunPlace('day', 340));
  });
});

describe('seasonal particles', () => {
  it('stay between 10 and 24 for every season and width', () => {
    for (const season of [
      'spring',
      'summer',
      'autumn',
      'winter',
    ] as GardenSeason[]) {
      for (const width of [340, 520, 700, 2000]) {
        const particles = ambientParticles(season, width);
        expect(particles.length).toBeGreaterThanOrEqual(PARTICLES_MIN);
        expect(particles.length).toBeLessThanOrEqual(PARTICLES_MAX);
        for (const particle of particles) {
          expect(particle.delay).toBeLessThanOrEqual(0);
          expect(particle.x).toBeGreaterThanOrEqual(0);
          expect(particle.x).toBeLessThanOrEqual(width);
        }
      }
    }
  });

  it('is deterministic, so nothing flickers between renders', () => {
    expect(ambientParticles('winter', 340)).toEqual(
      ambientParticles('winter', 340),
    );
  });
});

describe('together moments', () => {
  it('derives today’s moments only from the view', () => {
    expect(togetherMoments(view(), ME)).toEqual({
      bothWatered: false,
      bothSent: false,
      partnerWords: null,
    });
    expect(
      togetherMoments(
        view({
          wateredToday: 'a',
          partnerWateredToday: 'b',
          sharedToday: true,
          partnerSentToday: true,
          incoming: seed(),
        }),
        ME,
      ),
    ).toEqual({ bothWatered: true, bothSent: true, partnerWords: 'FOR_YOU' });
  });

  it('finds the partner’s words of today, waiting or planted', () => {
    const planted = seed({ id: 'planted', stage: 1, slot: 3 });
    expect(
      togetherMoments(view({ partnerSentToday: true, plants: [planted] }), ME)
        .partnerWords,
    ).toBe('FOR_YOU');
    // An older seed, an own seed or a seed without words is not today's note.
    expect(
      togetherMoments(
        view({
          partnerSentToday: true,
          plants: [
            seed({ sentOn: new Date('2026-11-15T00:00:00Z') }),
            seed({ senderId: ME }),
          ],
          incoming: seed({ words: null }),
        }),
        ME,
      ).partnerWords,
    ).toBeNull();
    expect(
      togetherMoments(view({ incoming: seed() }), ME).partnerWords,
    ).toBeNull();
  });

  it('plays what the live sync brought exactly once', () => {
    const before = view({ wateredToday: 'a' });
    const after = view({ wateredToday: 'a', partnerWateredToday: 'b' });
    expect(togetherArrivals(before, after, ME)).toEqual({
      partnerWatered: 'b',
      bothWatered: true,
      bothSent: false,
      partnerWords: false,
    });
    expect(togetherArrivals(after, after, ME)).toEqual({
      partnerWatered: null,
      bothWatered: false,
      bothSent: false,
      partnerWords: false,
    });
    const sent = view({
      sharedToday: true,
      partnerSentToday: true,
      incoming: seed(),
    });
    expect(togetherArrivals(view(), sent, ME)).toMatchObject({
      bothSent: true,
      partnerWords: true,
    });
  });

  it('sits on the swing, under the tree or on a bench', () => {
    expect(togetherSeat(['TREE', 'SWING'])).toBe('swing');
    expect(togetherSeat(['TREE'])).toBe('tree');
    expect(togetherSeat(['BENCH'])).toBe('bench');
    expect(togetherSeat([])).toBe('bench');
  });
});

describe('garden celebrations', () => {
  const occasions = collectSpaceOccasions({
    relationshipStartedOn: new Date('2023-06-17T00:00:00Z'),
    birthdays: [
      {
        accountId: PARTNER,
        displayName: 'Alex',
        birthday: new Date('1992-11-16T00:00:00Z'),
      },
      {
        accountId: ME,
        displayName: 'Lea',
        birthday: new Date('1994-02-03T00:00:00Z'),
      },
    ],
    importantDates: [],
    viewerAccountId: ME,
  });

  it('decorates the garden only on the day itself', () => {
    expect(gardenCelebration(DAY, occasions)).toEqual({
      kind: 'birthday',
      name: 'Alex',
      isViewer: false,
    });
    // No countdown: the day before and after are ordinary days.
    expect(
      gardenCelebration(new Date('2026-11-15T00:00:00Z'), occasions),
    ).toBeNull();
    expect(
      gardenCelebration(new Date('2026-11-17T00:00:00Z'), occasions),
    ).toBeNull();
    expect(
      gardenCelebration(new Date('2027-02-03T00:00:00Z'), occasions),
    ).toEqual({ kind: 'birthday', name: 'Lea', isViewer: true });
  });

  it('celebrates the anniversary, not the first day itself', () => {
    expect(
      gardenCelebration(new Date('2026-06-17T00:00:00Z'), occasions),
    ).toEqual({ kind: 'anniversary' });
    expect(
      gardenCelebration(new Date('2023-06-17T00:00:00Z'), occasions),
    ).toBeNull();
  });

  it('reads the device day as a date-only value', () => {
    expect(localCalendarDay(at(23, 30)).toISOString()).toBe(
      '2026-11-16T00:00:00.000Z',
    );
  });

  it('notes the first snow on the first day of winter only', () => {
    expect(isFirstSnowDay(new Date('2026-12-01T00:00:00Z'))).toBe(true);
    expect(isFirstSnowDay(new Date('2026-12-02T00:00:00Z'))).toBe(false);
    expect(isFirstSnowDay(new Date('2027-01-01T00:00:00Z'))).toBe(false);
  });
});
