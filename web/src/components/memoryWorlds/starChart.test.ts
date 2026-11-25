// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '../../i18n';
import copy from '../../i18n/locales/memoryWorlds';
import rediscovery from '../../i18n/locales/rediscovery';
import { entry } from './__fixtures__/stories';
import {
  angleTo,
  birthDelays,
  fieldAt,
  hillY,
  isShowerMonth,
  isWinterMonth,
  layoutStars,
  MAX_STARS,
  MIN_STAR_DISTANCE,
  moonLitPath,
  moonPhase,
  nightArc,
  pencilInk,
  pickTarget,
  readSeenStars,
  SCOPE,
  SEEN_STARS_KEY,
  SKY_W,
  STAR_X_MIN,
  type Star,
  seasonMarkLabel,
  seasonMarks,
  skyAt,
  skyTurn,
  starInField,
  starNear,
  visibleEntries,
  writeSeenStars,
} from './starChart';

const t = i18n.t.bind(i18n);

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

function dated(key: string, iso: string, overrides = {}) {
  return entry(key, { date: new Date(`${iso}T12:00:00`), ...overrides });
}

/** Memories one month apart, starting in January 2024. */
function months(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(2024, index, 15, 12);
    return entry(`m${index}`, { date });
  });
}

afterEach(() => {
  window.localStorage.clear();
});

describe('the star chart', () => {
  it('keeps every memory up to the limit, oldest first', () => {
    const entries = [
      dated('c', '2025-03-01'),
      dated('a', '2023-03-01'),
      dated('b', '2024-03-01'),
    ];
    expect(visibleEntries(entries, []).map((item) => item.key)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('picks the kept stars and the rest evenly over time beyond the limit', () => {
    const entries = months(40);
    const visible = visibleEntries(entries, ['m7', 'm33', 'unknown']);
    expect(visible).toHaveLength(MAX_STARS);
    const keys = visible.map((item) => item.key);
    expect(keys).toContain('m7');
    expect(keys).toContain('m33');
    // The first and last memory are among the evenly picked ones.
    expect(keys[0]).toBe('m0');
    expect(keys.at(-1)).toBe('m39');
    // Still in the order of time.
    const times = visible.map((item) => item.date.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('places stars by time from left to right and keeps them apart', () => {
    const stars = layoutStars(visibleEntries(months(MAX_STARS), []));
    expect(stars).toHaveLength(MAX_STARS);
    for (let index = 1; index < stars.length; index += 1)
      expect(stars[index].x).toBeGreaterThan(stars[index - 1].x);
    expect(stars[0].x).toBeGreaterThanOrEqual(STAR_X_MIN - 5);
    expect(stars.at(-1)?.x).toBeLessThanOrEqual(SKY_W - STAR_X_MIN + 5);
    // With few enough stars there is room for every one of them.
    const few = layoutStars(months(8));
    for (const a of few)
      for (const b of few)
        if (a !== b)
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
            MIN_STAR_DISTANCE - 1e-6,
          );
  });

  it('centres a single star and lets the lead and milestones shine brighter', () => {
    const [only] = layoutStars([entry('a', { isLead: true })]);
    expect(only.x).toBe(SKY_W / 2);
    expect(only.size).toBe(1.6);
    const stars = layoutStars([
      entry('w'),
      entry('p', { kind: 'photo' }),
      entry('h', { kind: 'heart' }),
      entry('m', { kind: 'milestone' }),
    ]);
    expect(stars.map((star) => star.size)).toEqual([1, 1.25, 1.15, 1.5]);
  });

  it('is deterministic for the same memories', () => {
    const first = layoutStars(months(10));
    const second = layoutStars(months(10));
    expect(second.map((star) => [star.x, star.y])).toEqual(
      first.map((star) => [star.x, star.y]),
    );
  });

  it('engraves short season names and leaves out labels that would touch', () => {
    const season = rediscovery.season;
    expect(seasonMarkLabel(new Date(2025, 6, 1), t)).toBe(
      fill(copy.stars.seasonMark, { season: season.summer, year: '25' }),
    );
    // December belongs to the next winter.
    expect(seasonMarkLabel(new Date(2024, 11, 20), t)).toBe(
      fill(copy.stars.winterMark, {
        season: season.winter,
        from: '24',
        to: '25',
      }),
    );
    const stars = layoutStars([
      dated('a', '2024-04-01'),
      dated('b', '2024-04-20'),
      dated('c', '2024-07-01'),
      dated('d', '2025-01-10'),
    ]);
    const marks = seasonMarks(stars, t);
    // One label per season, never overlapping.
    expect(new Set(marks.map((mark) => mark.key)).size).toBe(marks.length);
    for (let index = 1; index < marks.length; index += 1)
      expect(marks[index].x).toBeGreaterThan(marks[index - 1].x);
    expect(marks[0].label).toBe(
      fill(copy.stars.seasonMark, { season: season.spring, year: '24' }),
    );
  });
});

describe('the live sky', () => {
  it('blends through night, dawn, day and dusk', () => {
    expect(skyAt(2)).toMatchObject({ from: 'night', to: 'night' });
    expect(skyAt(12)).toMatchObject({ from: 'day', to: 'day' });
    expect(skyAt(4.5)).toEqual({ from: 'night', to: 'predawn', blend: 0 });
    const dawn = skyAt(6.75);
    expect(dawn.from).toBe('predawn');
    expect(dawn.to).toBe('day');
    expect(dawn.blend).toBeCloseTo(0.5, 3);
    expect(skyAt(17.5).from).toBe('day');
    expect(skyAt(17.5).to).toBe('dusk');
    expect(skyAt(19.5)).toMatchObject({ from: 'dusk', to: 'night' });
    expect(skyAt(23.99).from).toBe('night');
  });

  it('switches to the blue-black pencil only in the light of day', () => {
    expect(pencilInk(6 + 42 / 60)).toBe(false);
    expect(pencilInk(6 + 43 / 60)).toBe(true);
    expect(pencilInk(12)).toBe(true);
    expect(pencilInk(17 + 26 / 60)).toBe(true);
    expect(pencilInk(17 + 27 / 60)).toBe(false);
    expect(pencilInk(23)).toBe(false);
  });

  it('turns the star field over the night', () => {
    expect(nightArc(18)).toBe(0);
    expect(nightArc(6)).toBe(1);
    expect(nightArc(0)).toBe(0.5);
    expect(skyTurn(18)).toBe(-12);
    expect(skyTurn(6)).toBe(12);
    expect(skyTurn(0)).toBe(0);
  });

  it("shows tonight's moon phase", () => {
    // 6 January 2000 was a new moon, 21 January 2000 a full moon.
    expect(moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14)))).toBeCloseTo(0, 5);
    expect(moonPhase(new Date(Date.UTC(2000, 0, 21, 4, 40)))).toBeCloseTo(
      0.49,
      1,
    );
    expect(moonLitPath(0.25, 15)).toMatch(/^M0 -15A15 15 0 0 1 0 15A/u);
    expect(moonLitPath(0.75, 15)).toMatch(/^M0 -15A15 15 0 0 0 0 15A/u);
  });

  it('knows the showers and the winter months', () => {
    expect([7, 11].every(isShowerMonth)).toBe(true);
    expect(isShowerMonth(3)).toBe(false);
    expect([11, 0, 1].every(isWinterMonth)).toBe(true);
    expect(isWinterMonth(2)).toBe(false);
  });
});

describe('aiming', () => {
  const stars: Star[] = layoutStars(months(6));

  it('sends a shooting star to the nearest star ahead', () => {
    const from = { x: 0, y: 140 };
    const { star } = pickTarget(stars, [from], { x: 1, y: 0 }, new Set());
    // Swiping to the right from the left edge lands on the leftmost stars.
    expect(star.index).toBeLessThanOrEqual(1);
    // Excluded stars are skipped.
    const skipped = pickTarget(
      stars,
      [from],
      { x: 1, y: 0 },
      new Set([star.entry.key]),
    );
    expect(skipped.star.entry.key).not.toBe(star.entry.key);
    // Nothing ahead: the star most in line with the swipe.
    const behind = pickTarget(
      stars,
      [{ x: SKY_W + 50, y: 140 }],
      { x: 1, y: 0 },
      new Set(),
    );
    expect(behind.star.index).toBe(stars.length - 1);
  });

  it('hooks a traced thread onto stars close to the finger', () => {
    const [first, second] = stars;
    expect(starNear(stars, { x: first.x + 5, y: first.y }, [])).toBe(first);
    expect(
      starNear(stars, { x: first.x + 5, y: first.y }, [first]),
    ).toBeUndefined();
    expect(starNear(stars, second, [first])).toBe(second);
  });

  it('points the telescope into the sky and finds the star in its field', () => {
    expect(angleTo({ x: SCOPE.x + 100, y: SCOPE.y + 10 })).toBe(-8);
    expect(angleTo({ x: SCOPE.x - 100, y: SCOPE.y - 1 })).toBe(-172);
    for (const star of stars) {
      const reach = Math.hypot(star.x - SCOPE.x, star.y - SCOPE.y);
      const centre = fieldAt(angleTo(star), reach);
      expect(centre.y).toBeLessThan(SCOPE.y);
      expect(starInField(stars, angleTo(star), reach).entry.key).toBe(
        star.entry.key,
      );
    }
  });

  it('tells the hill from the sky', () => {
    expect(hillY(0)).toBeCloseTo(294, 3);
    expect(hillY(196)).toBeCloseTo(264, 3);
    expect(hillY(400)).toBeCloseTo(258, 3);
  });
});

describe('growth', () => {
  it('has no newborn stars on the very first visit', () => {
    expect(readSeenStars()).toBeNull();
    expect(birthDelays(layoutStars(months(4)), null, 300, 3000).size).toBe(0);
  });

  it('lights newborn stars when the line reaches them', () => {
    const stars = layoutStars(months(4));
    writeSeenStars(new Set(['m0', 'm1']));
    expect(window.localStorage.getItem(SEEN_STARS_KEY)).toBe('["m0","m1"]');
    const births = birthDelays(stars, readSeenStars(), 300, 3000);
    expect([...births.keys()]).toEqual(['m2', 'm3']);
    const m2 = births.get('m2') ?? 0;
    expect(m2).toBeGreaterThan(300);
    expect(m2).toBeLessThan(3300);
    // The last star is reached when the line is complete.
    expect(births.get('m3')).toBe(3300);
  });

  it('ignores a damaged memory of the seen stars', () => {
    window.localStorage.setItem(SEEN_STARS_KEY, '{not json');
    expect(readSeenStars()).toBeNull();
    window.localStorage.setItem(SEEN_STARS_KEY, '{"a":1}');
    expect(readSeenStars()).toBeNull();
  });
});
