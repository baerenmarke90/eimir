import { describe, expect, it } from 'vitest';
import {
  anniversaryIn,
  dayCountDate,
  isMeaningfulAnniversary,
  nextMilestoneAnniversary,
  nextRoundDay,
  ROUND_DAYS,
  reachedMilestoneAnniversaries,
  reachedRoundDays,
  reachedWaymarks,
  waymarkToday,
} from './storyWaymarks';

const day = (value: string) => new Date(`${value}T00:00:00Z`);
const milestone = (id: string, title: string, happenedOn: string) => ({
  id,
  title,
  happenedOn: day(happenedOn),
});
const iso = (value: Date) => value.toISOString().slice(0, 10);

describe('round day series', () => {
  it('is 100, 200, 500 and 1,000, then every 1,000 days up to 10,000', () => {
    expect(ROUND_DAYS).toEqual([
      100, 200, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000,
      10_000,
    ]);
  });

  it('has no hundredth-day filler, no repdigits and nothing past 10,000', () => {
    for (const skipped of [300, 400, 600, 900, 1111, 1500, 2222, 9999, 10_500])
      expect(ROUND_DAYS).not.toContain(skipped);
    expect(ROUND_DAYS.at(-1)).toBe(10_000);
  });

  it('finds the next round day, counting today, and ends after 10,000', () => {
    expect(nextRoundDay(0)).toBe(100);
    expect(nextRoundDay(99)).toBe(100);
    expect(nextRoundDay(100)).toBe(100);
    expect(nextRoundDay(1000)).toBe(1000);
    expect(nextRoundDay(201)).toBe(500);
    expect(nextRoundDay(1001)).toBe(2000);
    expect(nextRoundDay(1230)).toBe(2000);
    expect(nextRoundDay(9001)).toBe(10_000);
    expect(nextRoundDay(10_000)).toBe(10_000);
    expect(nextRoundDay(10_001)).toBeNull();
    expect(nextRoundDay(-1)).toBeNull();
    expect(nextRoundDay(Number.NaN)).toBeNull();
  });

  it('lists the reached round days oldest first, today included', () => {
    expect(reachedRoundDays(99)).toEqual([]);
    expect(reachedRoundDays(100)).toEqual([100]);
    expect(reachedRoundDays(1230)).toEqual([100, 200, 500, 1000]);
    expect(reachedRoundDays(-5)).toEqual([]);
  });
});

describe('date-only UTC arithmetic', () => {
  it('moves 29 February to 28 February in other years', () => {
    expect(iso(anniversaryIn(day('2024-02-29'), 2025))).toBe('2025-02-28');
    expect(iso(anniversaryIn(day('2024-02-29'), 2028))).toBe('2028-02-29');
    expect(iso(anniversaryIn(day('2024-03-31'), 2025))).toBe('2025-03-31');
  });

  it('counts days from the start without touching the device time zone', () => {
    expect(iso(dayCountDate(day('2023-06-17'), 1000))).toBe('2026-03-13');
    expect(iso(dayCountDate(day('2023-06-17'), 0))).toBe('2023-06-17');
    // A start delivered with a time of day still counts from its UTC date.
    expect(iso(dayCountDate(new Date('2023-06-17T23:59:59Z'), 1))).toBe(
      '2023-06-18',
    );
  });

  it('anchors today on the server day count, not on the clock', () => {
    const duration = { startedOn: day('2023-06-17'), daysTogether: 1230 };
    expect(iso(waymarkToday(duration, day('2099-01-01')))).toBe('2026-10-29');
    expect(iso(waymarkToday(null, new Date('2026-11-15T23:30:00Z')))).toBe(
      '2026-11-15',
    );
    expect(
      iso(
        waymarkToday(
          { startedOn: day('2023-06-17'), daysTogether: -1 },
          day('2026-01-02'),
        ),
      ),
    ).toBe('2026-01-02');
  });
});

describe('Milestone anniversaries', () => {
  const today = day('2026-11-15');

  it('reaches one anniversary per full year, never year zero', () => {
    const reached = reachedMilestoneAnniversaries(
      [milestone('m1', 'Engaged', '2023-12-24')],
      today,
    );
    expect(reached.map((entry) => iso(entry.date))).toEqual([
      '2024-12-24',
      '2025-12-24',
    ]);
    expect(reached.map((entry) => entry.kind)).toEqual([
      'milestoneAnniversary',
      'milestoneAnniversary',
    ]);
    expect(
      reachedMilestoneAnniversaries(
        [milestone('m2', 'Today', '2026-11-15')],
        today,
      ),
    ).toEqual([]);
  });

  it('counts the anniversary on its own day and not the day before', () => {
    const onTheDay = reachedMilestoneAnniversaries(
      [milestone('m1', 'Moved in', '2025-11-15')],
      today,
    );
    expect(onTheDay.map((entry) => iso(entry.date))).toEqual(['2026-11-15']);
    expect(
      reachedMilestoneAnniversaries(
        [milestone('m1', 'Moved in', '2025-11-16')],
        today,
      ),
    ).toEqual([]);
  });

  it('puts a leap-day Milestone on 28 February in other years', () => {
    const reached = reachedMilestoneAnniversaries(
      [milestone('leap', 'Leap day', '2024-02-29')],
      today,
    );
    expect(reached.map((entry) => iso(entry.date))).toEqual([
      '2025-02-28',
      '2026-02-28',
    ]);
    const next = nextMilestoneAnniversary(
      [milestone('leap', 'Leap day', '2024-02-29')],
      today,
    );
    expect(next && iso(next.date)).toBe('2027-02-28');
    expect(next?.years).toBe(3);
    const leapYear = nextMilestoneAnniversary(
      [milestone('leap', 'Leap day', '2024-02-29')],
      day('2027-03-01'),
    );
    expect(leapYear && iso(leapYear.date)).toBe('2028-02-29');
  });

  it('ignores Milestones from the future and corrupt dates', () => {
    const milestones = [
      milestone('future', 'Wedding', '2027-05-01'),
      { id: 'bad', title: 'Broken', happenedOn: new Date('invalid') },
    ];
    expect(reachedMilestoneAnniversaries(milestones, today)).toEqual([]);
    expect(nextMilestoneAnniversary(milestones, today)).toBeNull();
  });

  it('picks the nearest upcoming anniversary, today included', () => {
    const milestones = [
      milestone('far', 'Met', '2022-03-01'),
      milestone('near', 'Engaged', '2023-12-24'),
      milestone('young', 'Moved in', '2026-01-01'),
    ];
    const next = nextMilestoneAnniversary(milestones, today);
    expect(next).toMatchObject({
      milestoneId: 'near',
      years: 3,
      daysRemaining: 39,
      title: 'Engaged',
    });
    expect(next && iso(next.date)).toBe('2026-12-24');
    const sameDay = nextMilestoneAnniversary(
      [milestone('m', 'Moved in', '2024-11-15')],
      today,
    );
    expect(sameDay).toMatchObject({ years: 2, daysRemaining: 0 });
    expect(nextMilestoneAnniversary([], today)).toBeNull();
  });

  it('first anniversary of a recent Milestone is the next one, a year out', () => {
    const next = nextMilestoneAnniversary(
      [milestone('young', 'Moved in', '2026-01-01')],
      today,
    );
    expect(next && iso(next.date)).toBe('2027-01-01');
    expect(next?.years).toBe(1);
  });
});

describe('reached waymarks', () => {
  const duration = { startedOn: day('2023-06-17'), daysTogether: 1230 };
  const today = waymarkToday(duration);

  it('lists round days and Milestone anniversaries newest first', () => {
    const waymarks = reachedWaymarks({
      duration,
      milestones: [milestone('m1', 'Engaged', '2024-02-01')],
      today,
    });
    expect(waymarks.map((entry) => `${iso(entry.date)} ${entry.kind}`)).toEqual(
      [
        '2026-03-13 roundDay',
        '2026-02-01 milestoneAnniversary',
        '2025-02-01 milestoneAnniversary',
        '2024-10-29 roundDay',
        '2024-06-17 relationshipAnniversary',
        '2024-01-03 roundDay',
        '2023-09-25 roundDay',
      ],
    );
  });

  it('keeps only the first and every fifth relationship anniversary', () => {
    const years = (start: string, daysTogether: number) =>
      reachedWaymarks({
        duration: { startedOn: day(start), daysTogether },
        milestones: [],
        today: waymarkToday({ startedOn: day(start), daysTogether }),
      })
        .filter((entry) => entry.kind === 'relationshipAnniversary')
        .map((entry) => iso(entry.date));
    // Three years in: only the first anniversary is a milestone.
    expect(years('2023-06-17', 1230)).toEqual(['2024-06-17']);
    // Eleven years in: 1, 5 and 10; the years in between stay out.
    expect(years('2015-01-10', 4000)).toEqual([
      '2025-01-10',
      '2020-01-10',
      '2016-01-10',
    ]);
    expect(years('2026-04-01', 210)).toEqual([]);
    expect(
      [1, 2, 3, 4, 5, 6, 9, 10, 15, 25, 50].filter(isMeaningfulAnniversary),
    ).toEqual([1, 5, 10, 15, 25, 50]);
    expect(isMeaningfulAnniversary(0)).toBe(false);
  });

  it('is empty while nothing is reached', () => {
    expect(
      reachedWaymarks({
        duration: { startedOn: day('2026-11-01'), daysTogether: 14 },
        milestones: [],
        today: waymarkToday({ startedOn: day('2026-11-01'), daysTogether: 14 }),
      }),
    ).toEqual([]);
    expect(
      reachedWaymarks({
        duration: null,
        milestones: [],
        today: day('2026-11-15'),
      }),
    ).toEqual([]);
  });

  it('keeps Milestone anniversaries when there is no relationship start', () => {
    const waymarks = reachedWaymarks({
      duration: null,
      milestones: [milestone('m1', 'Met', '2024-03-02')],
      today: day('2026-11-15'),
    });
    expect(waymarks.map((entry) => entry.kind)).toEqual([
      'milestoneAnniversary',
      'milestoneAnniversary',
    ]);
  });

  it('breaks ties on one day with a stable order', () => {
    // 1,000 days after 2023-06-17 is 2026-03-13; a Milestone from 2025-03-13
    // has its first anniversary the same day.
    const waymarks = reachedWaymarks({
      duration,
      milestones: [milestone('m1', 'Moved in', '2025-03-13')],
      today,
    });
    const sameDay = waymarks.filter(
      (entry) => iso(entry.date) === '2026-03-13',
    );
    expect(sameDay.map((entry) => entry.kind)).toEqual([
      'roundDay',
      'milestoneAnniversary',
    ]);
  });
});
