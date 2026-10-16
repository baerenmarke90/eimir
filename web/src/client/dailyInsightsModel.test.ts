import { describe, expect, it } from 'vitest';
import type { DailyCheckInInsightsView } from '../api/generated/models/DailyCheckInInsightsView';
import { DailyVibe } from '../api/generated/models/DailyVibe';
import {
  addDays,
  daysInRange,
  deriveBothGood,
  deriveEnergyVersusPrevious,
  deriveHighlights,
  derivePartnerEnergyVibe,
  deriveSharedDays,
  deriveVibeEnergy,
  deriveWeekdayEnergy,
  deriveWeekendEnergy,
  energyBand,
  energyPosition,
  energySegments,
  goodWeekdays,
  type InsightDay,
  mondayOf,
  monthEnd,
  monthStart,
  monthWeeks,
  projectInsightDays,
  relationSummary,
  shiftMonth,
  weekDates,
  weekdayIndex,
} from './dailyInsightsModel';

const BOTH = { vibe: true, energy: true };

function day(
  date: string,
  own: Partial<InsightDay['own']> = {},
  partner: Partial<InsightDay['partner']> = {},
): InsightDay {
  return {
    date,
    own: { vibe: null, energy: null, ...own },
    partner: { vibe: null, energy: null, ...partner },
  };
}

function view(
  days: DailyCheckInInsightsView['days'],
  flags: Partial<
    Pick<DailyCheckInInsightsView, 'vibeEnabled' | 'energyEnabled'>
  > = {},
): DailyCheckInInsightsView {
  return {
    startDate: new Date('2026-09-14'),
    endDate: new Date('2026-09-20'),
    dailyContextTimezone: 'Europe/Berlin',
    vibeEnabled: true,
    energyEnabled: true,
    days,
    summary: {
      totalDays: days.length,
      daysWithOwnCheckIn: 0,
      daysWithPartnerCheckIn: 0,
      daysWithMutualCheckIn: 0,
    },
    ...flags,
  };
}

describe('calendar arithmetic', () => {
  it('anchors weeks on Monday regardless of the browser time zone', () => {
    // 2026-09-21 is a Monday.
    expect(weekdayIndex('2026-09-21')).toBe(0);
    expect(weekdayIndex('2026-09-27')).toBe(6);
    expect(mondayOf('2026-09-24')).toBe('2026-09-21');
    expect(mondayOf('2026-09-27')).toBe('2026-09-21');
    expect(weekDates('2026-09-21')).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
  });

  it('crosses month and year boundaries deterministically', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(monthStart('2026-09-21')).toBe('2026-09-01');
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-01');
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-01');
  });

  it('groups a month into Monday-first weeks with null padding', () => {
    const weeks = monthWeeks('2026-09-10');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    // September 2026 starts on a Tuesday.
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]).toBe('2026-09-01');
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  it('fills missing dates with empty days', () => {
    const filled = daysInRange(
      [day('2026-09-22', { energy: 50 })],
      ['2026-09-21', '2026-09-22'],
    );
    expect(filled[0].own.energy).toBeNull();
    expect(filled[1].own.energy).toBe(50);
  });
});

describe('server projection', () => {
  it('shows a partner value only when the server projected it as VISIBLE', () => {
    const projected = projectInsightDays(
      view([
        {
          checkedOn: new Date('2026-09-14'),
          ownVibe: DailyVibe.GOOD,
          ownEnergy: 70,
          partnerVibe: { state: 'VISIBLE', value: DailyVibe.OKAY },
          partnerEnergy: { state: 'VISIBLE', value: 40 },
        },
      ]),
    );
    expect(projected[0]).toEqual({
      date: '2026-09-14',
      own: { vibe: DailyVibe.GOOD, energy: 70 },
      partner: { vibe: DailyVibe.OKAY, energy: 40 },
    });
  });

  it('renders HIDDEN_UNTIL_SELF_CHECK_IN and NO_CHECK_IN identically', () => {
    // The insights endpoint distinguishes these per day. Preserving that in the
    // client would reveal whether the partner checked in while Mutual Reveal
    // keeps the day closed, so both must collapse into the same absent value.
    const hidden = projectInsightDays(
      view([
        {
          checkedOn: new Date('2026-09-14'),
          partnerVibe: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
          partnerEnergy: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
        },
      ]),
    );
    const none = projectInsightDays(
      view([
        {
          checkedOn: new Date('2026-09-14'),
          partnerVibe: { state: 'NO_CHECK_IN' },
          partnerEnergy: { state: 'NO_CHECK_IN' },
        },
      ]),
    );
    expect(hidden).toEqual(none);
    expect(hidden[0].partner).toEqual({ vibe: null, energy: null });
  });

  it('drops a disabled dimension even if a value is present in the payload', () => {
    const projected = projectInsightDays(
      view(
        [
          {
            checkedOn: new Date('2026-09-14'),
            ownVibe: DailyVibe.GOOD,
            ownEnergy: 60,
            partnerVibe: { state: 'VISIBLE', value: DailyVibe.GOOD },
            partnerEnergy: { state: 'VISIBLE', value: 80 },
          },
        ],
        { energyEnabled: false },
      ),
    );
    expect(projected[0].own).toEqual({ vibe: DailyVibe.GOOD, energy: null });
    expect(projected[0].partner).toEqual({
      vibe: DailyVibe.GOOD,
      energy: null,
    });
  });
});

describe('scales', () => {
  it('maps Energy levels to five qualitative bands', () => {
    expect(energyBand(10)).toBe('veryLow');
    expect(energyBand(30)).toBe('low');
    expect(energyBand(50)).toBe('mid');
    expect(energyBand(70)).toBe('high');
    expect(energyBand(100)).toBe('veryHigh');
  });

  it('positions Energy between 0 and 1 and clamps out-of-range values', () => {
    expect(energyPosition(10)).toBe(0);
    expect(energyPosition(100)).toBe(1);
    expect(energyPosition(55)).toBeCloseTo(0.5);
    expect(energyPosition(0)).toBe(0);
    expect(energyPosition(500)).toBe(1);
  });

  it('breaks the Energy line on every absent day', () => {
    const days = [
      day('2026-09-21', { energy: 50 }),
      day('2026-09-22', { energy: 60 }),
      day('2026-09-23'),
      day('2026-09-24', { energy: 70 }),
    ];
    expect(energySegments(days, 'own')).toEqual([
      [
        { index: 0, value: 50 },
        { index: 1, value: 60 },
      ],
      [{ index: 3, value: 70 }],
    ]);
    expect(energySegments(days, 'partner')).toEqual([]);
  });
});

describe('derived insights', () => {
  const monday = '2026-09-21';
  const dates = weekDates(monday);

  it('reports days on which both people shared a good vibe', () => {
    const days = [
      day(dates[0], { vibe: DailyVibe.GOOD }, { vibe: DailyVibe.GOOD }),
      day(dates[3], { vibe: DailyVibe.GOOD }, { vibe: DailyVibe.GOOD }),
      day(dates[4], { vibe: DailyVibe.GOOD }, { vibe: DailyVibe.OKAY }),
    ];
    expect(deriveBothGood(days, BOTH)).toEqual({
      kind: 'bothGood',
      params: { count: 2, date: dates[3] },
    });
    expect(deriveBothGood(days, { vibe: false, energy: true })).toBeNull();
    expect(deriveBothGood([], BOTH)).toBeNull();
  });

  it('describes weekend Energy only with enough data and a clear difference', () => {
    const high = [
      day(dates[0], { energy: 40 }),
      day(dates[1], { energy: 40 }),
      day(dates[2], { energy: 50 }),
      day(dates[5], { energy: 80 }),
      day(dates[6], { energy: 80 }),
    ];
    expect(deriveWeekendEnergy(high, BOTH)?.params.direction).toBe('higher');
    // Too few weekend samples: no statement instead of a weak one.
    expect(deriveWeekendEnergy(high.slice(0, 4), BOTH)).toBeNull();
    // Difference below the threshold.
    const flat = [
      day(dates[0], { energy: 60 }),
      day(dates[1], { energy: 60 }),
      day(dates[2], { energy: 60 }),
      day(dates[5], { energy: 60 }),
      day(dates[6], { energy: 60 }),
    ];
    expect(deriveWeekendEnergy(flat, BOTH)).toBeNull();
    expect(deriveWeekendEnergy(high, { vibe: true, energy: false })).toBeNull();
  });

  it('describes Vibe and Energy occurring together without a score', () => {
    const days = [
      day(dates[0], { vibe: DailyVibe.GOOD, energy: 90 }),
      day(dates[1], { vibe: DailyVibe.GOOD, energy: 80 }),
      day(dates[2], { vibe: DailyVibe.STRESSED, energy: 30 }),
      day(dates[3], { vibe: DailyVibe.SAD, energy: 40 }),
    ];
    const insight = deriveVibeEnergy(days, BOTH);
    expect(insight?.kind).toBe('vibeEnergy');
    expect(insight?.params).toEqual({ good: 85, other: 35 });
    expect(deriveVibeEnergy(days.slice(0, 3), BOTH)).toBeNull();
    expect(deriveVibeEnergy(days, { vibe: true, energy: false })).toBeNull();
  });

  it('counts shared days only from visible values', () => {
    const days = dates.map((date, index) =>
      index < 3
        ? day(date, { vibe: DailyVibe.OKAY }, { vibe: DailyVibe.OKAY })
        : day(date, { vibe: DailyVibe.OKAY }),
    );
    expect(deriveSharedDays(days)).toBeNull();
    expect(deriveSharedDays(days, 3)?.params).toEqual({ count: 3, total: 7 });
  });

  it('compares with the previous week from visible values only', () => {
    const now = [10, 10, 10].map((energy, index) =>
      day(dates[index], { energy }),
    );
    const before = [60, 70, 80].map((energy, index) =>
      day(addDays(dates[index], -7), { energy }),
    );
    expect(
      deriveEnergyVersusPrevious(now, before, BOTH)?.params.direction,
    ).toBe('lower');
    expect(
      deriveEnergyVersusPrevious(now, before.slice(0, 2), BOTH),
    ).toBeNull();
  });

  it('finds a weekday whose Energy differs clearly from the month', () => {
    const days: InsightDay[] = [];
    for (let week = 0; week < 4; week += 1) {
      const start = addDays(monday, week * 7);
      weekDates(start).forEach((date, index) => {
        days.push(day(date, { energy: index === 0 ? 30 : 70 }));
      });
    }
    const insight = deriveWeekdayEnergy(days, BOTH);
    expect(insight?.params).toEqual({ weekday: 0, direction: 'lower' });
    expect(deriveWeekdayEnergy(days.slice(0, 7), BOTH)).toBeNull();
  });

  it('describes cross-partner co-occurrence as a share, not a cause', () => {
    const days = [
      day(dates[0], { vibe: DailyVibe.GOOD }, { energy: 90 }),
      day(dates[1], { vibe: DailyVibe.GOOD }, { energy: 80 }),
      day(dates[2], { vibe: DailyVibe.GOOD }, { energy: 70 }),
      day(dates[3], { vibe: DailyVibe.SAD }, { energy: 20 }),
      day(dates[4], { vibe: DailyVibe.STRESSED }, { energy: 30 }),
      day(dates[5], { vibe: DailyVibe.OKAY }, { energy: 40 }),
    ];
    expect(derivePartnerEnergyVibe(days, BOTH)).toEqual({
      kind: 'partnerEnergyVibe',
      params: { energyOf: 'partner' },
    });
    expect(derivePartnerEnergyVibe(days.slice(0, 5), BOTH)).toBeNull();
  });

  it('never invents a statement from hidden partner data', () => {
    // Own values only: nothing about the partner may be inferred or derived.
    const days = dates.map((date) =>
      day(date, { vibe: DailyVibe.GOOD, energy: 70 }),
    );
    expect(deriveBothGood(days, BOTH)).toBeNull();
    expect(derivePartnerEnergyVibe(days, BOTH)).toBeNull();
    expect(deriveSharedDays(days)).toBeNull();
    expect(deriveHighlights(days, BOTH)).toEqual([]);
  });
});

describe('highlights and relation', () => {
  const dates = weekDates('2026-09-21');

  it('selects up to three days where both people shared something positive', () => {
    const days = [
      day(dates[0], { vibe: DailyVibe.GOOD }, { vibe: DailyVibe.GOOD }),
      day(dates[1], { energy: 80 }, { energy: 90 }),
      day(dates[2], { energy: 80 }, { energy: 30 }),
      day(dates[3], { vibe: DailyVibe.GOOD }, { vibe: DailyVibe.GOOD }),
      day(dates[4], { vibe: DailyVibe.GOOD }, { vibe: DailyVibe.GOOD }),
    ];
    const highlights = deriveHighlights(days, BOTH);
    expect(highlights.map((entry) => [entry.date, entry.kind])).toEqual([
      [dates[0], 'bothGood'],
      [dates[1], 'bothEnergy'],
      [dates[3], 'bothGood'],
    ]);
  });

  it('ranks weekdays with repeated good days and ignores single occurrences', () => {
    const days: InsightDay[] = [];
    for (let week = 0; week < 3; week += 1) {
      const saturday = addDays(dates[5], week * 7);
      days.push(
        day(saturday, { vibe: DailyVibe.GOOD }, { vibe: DailyVibe.GOOD }),
      );
    }
    days.push(
      day(dates[1], { vibe: DailyVibe.GOOD }, { vibe: DailyVibe.GOOD }),
    );
    expect(goodWeekdays(days, BOTH)).toEqual([5]);
  });

  it('groups Energy levels by the Vibe of the same person and day', () => {
    const summary = relationSummary([
      day(
        dates[0],
        { vibe: DailyVibe.GOOD, energy: 90 },
        { vibe: DailyVibe.SAD, energy: 20 },
      ),
      day(
        dates[1],
        { vibe: DailyVibe.GOOD, energy: 70 },
        { vibe: DailyVibe.OKAY },
      ),
    ]);
    expect(summary.samples).toBe(3);
    expect(
      summary.lanes.find((lane) => lane.vibe === DailyVibe.GOOD)?.energies,
    ).toEqual([90, 70]);
    expect(
      summary.lanes.find((lane) => lane.vibe === DailyVibe.SAD)?.energies,
    ).toEqual([20]);
  });
});
