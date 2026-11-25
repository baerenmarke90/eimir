// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { entry } from './__fixtures__/stories';
import {
  addRattle,
  buildSlips,
  createShakeDetector,
  JAR_DRAW_KEY,
  jarDay,
  newRattleSeries,
  newReversalTrack,
  pickNextSlip,
  RATTLES_TO_OPEN,
  REVERSAL_PX,
  hasDrawnToday,
  readTodayDraw,
  rememberDraw,
  rememberReturn,
  SERIES_GAP_MS,
  SHAKE_DEBOUNCE_MS,
  SHAKE_OPEN_MS,
  SLIP_COUNT_MIN,
  SLIP_REAL_MAX,
  trackReversal,
} from './jarRules';

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the Glas' draw of the day", () => {
  it('remembers only the key of the slip drawn today, on this device', () => {
    const morning = new Date(2026, 10, 25, 8, 30);
    rememberDraw('memory-a', morning);
    expect(JSON.parse(window.localStorage.getItem(JAR_DRAW_KEY) ?? '')).toEqual(
      { day: '2026-11-25', key: 'memory-a', returned: false },
    );
    expect(readTodayDraw(new Date(2026, 10, 25, 23, 59))).toBe('memory-a');
    // The next day the jar is full again.
    expect(readTodayDraw(new Date(2026, 10, 26, 0, 0))).toBeNull();
    // Put back: the slip is in the jar again, but today's draw is used up.
    rememberReturn('memory-a', morning);
    expect(readTodayDraw(morning)).toBeNull();
    expect(hasDrawnToday(morning)).toBe(true);
    expect(hasDrawnToday(new Date(2026, 10, 26, 0, 0))).toBe(false);
  });

  it('uses the local calendar day and today by default', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 5, 12));
    expect(jarDay(new Date())).toBe('2026-01-05');
    rememberDraw('heart-b');
    expect(readTodayDraw()).toBe('heart-b');
  });

  it('ignores a damaged entry and storage that is not available', () => {
    window.localStorage.setItem(JAR_DRAW_KEY, '{nope');
    expect(readTodayDraw()).toBeNull();
    window.localStorage.setItem(JAR_DRAW_KEY, JSON.stringify(['a']));
    expect(readTodayDraw()).toBeNull();
    window.localStorage.setItem(
      JAR_DRAW_KEY,
      JSON.stringify({ day: jarDay(new Date()), key: 7 }),
    );
    expect(readTodayDraw()).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readTodayDraw()).toBeNull();
    expect(() => rememberDraw('memory-a')).not.toThrow();
  });

  it('draws the lead first, then never the slip that was just put back', () => {
    const entries = [entry('a'), entry('b', { isLead: true }), entry('c')];
    expect(pickNextSlip(entries, null)?.key).toBe('b');
    expect(pickNextSlip(entries, 'b', () => 0)?.key).toBe('a');
    expect(pickNextSlip(entries, 'b', () => 0.999)?.key).toBe('c');
    expect(pickNextSlip([entry('a')], 'a')?.key).toBe('a');
    expect(pickNextSlip([], null)).toBeNull();
    // Without a lead the first draw is any slip.
    expect(pickNextSlip([entry('x'), entry('y')], null, () => 0.6)?.key).toBe(
      'y',
    );
  });
});

describe("the Glas' pile", () => {
  it('fills the jar generously, the diary slips on top of decorative ones', () => {
    const entries = [
      entry('a', { kind: 'photo', isLead: true }),
      entry('b', { kind: 'heart' }),
      entry('c', { kind: 'milestone' }),
    ];
    const slips = buildSlips(entries);
    expect(slips).toHaveLength(SLIP_COUNT_MIN);
    // The lead lies on top, in the upper layer.
    expect(slips.at(-1)).toMatchObject({ key: 'a', tone: 'photo', group: 2 });
    expect(slips.slice(-3).map((slip) => slip.key)).toEqual(['c', 'b', 'a']);
    expect(slips[0].group).toBe(0);
    for (const slip of slips) {
      expect(slip.left).toBeGreaterThanOrEqual(20);
      expect(slip.left + slip.w).toBeLessThanOrEqual(220);
      expect(slip.top + slip.h).toBeLessThanOrEqual(305);
      expect(Math.abs(slip.rot)).toBeLessThanOrEqual(35);
    }
    // The places derive from the keys: the pile never changes.
    expect(buildSlips(entries)).toEqual(slips);
  });

  it('shows at most the newest diary slips and keeps room for four more', () => {
    const many = Array.from({ length: SLIP_REAL_MAX + 10 }, (_, index) =>
      entry(`m${index}`),
    );
    const slips = buildSlips(many);
    expect(slips).toHaveLength(SLIP_REAL_MAX + 4);
    expect(slips.filter((slip) => slip.key.startsWith('m'))).toHaveLength(
      SLIP_REAL_MAX,
    );
  });
});

describe("the Glas' rattles", () => {
  it('opens the lid after four rattles in a row, or a long enough shake', () => {
    const series = newRattleSeries();
    for (let count = 1; count < RATTLES_TO_OPEN; count += 1)
      expect(addRattle(series, count * 100, SERIES_GAP_MS)).toBe(false);
    expect(addRattle(series, 400, SERIES_GAP_MS)).toBe(true);

    // A pause starts a new count.
    const paused = newRattleSeries();
    addRattle(paused, 0, SERIES_GAP_MS);
    addRattle(paused, 1000, SERIES_GAP_MS);
    expect(paused.count).toBe(1);

    // Two rattles across a long continuous shake are enough.
    const long = newRattleSeries();
    for (let at = 0; at < SHAKE_OPEN_MS; at += 350)
      addRattle(long, at, SERIES_GAP_MS);
    expect(addRattle(long, SHAKE_OPEN_MS, SERIES_GAP_MS)).toBe(true);
  });

  it('counts a turn of the finger after enough travel', () => {
    const track = newReversalTrack(100);
    expect(trackReversal(track, 100 + REVERSAL_PX - 1)).toBeNull();
    expect(trackReversal(track, 130)).toBeNull();
    expect(trackReversal(track, 150)).toBeNull();
    // Back by less than the travel: not yet a turn.
    expect(trackReversal(track, 140)).toBeNull();
    expect(trackReversal(track, 150 - REVERSAL_PX)).toBe(50);
    expect(trackReversal(track, 100)).toBeNull();
    expect(trackReversal(track, 100 + REVERSAL_PX)).toBe(50);
  });
});

describe('a shaken phone', () => {
  it('needs three strong peaks in a short time, then rests a while', () => {
    const detect = createShakeDetector();
    const still = { x: 0, y: 9.8, z: 0 };
    expect(detect(still, 0)).toBeNull();
    expect(detect(still, 16)).toEqual({ lateral: 0, shake: false });
    const jolt = (x: number) => ({ x, y: 9.8, z: 0 });
    expect(detect(jolt(20), 100)?.shake).toBe(false);
    expect(detect(jolt(-20), 250)?.shake).toBe(false);
    const reading = detect(jolt(22), 400);
    expect(reading?.shake).toBe(true);
    expect(reading?.lateral).toBeGreaterThan(10);
    // Within the rest after a shake, more peaks do not shake again.
    detect(jolt(-24), 550);
    detect(jolt(24), 700);
    expect(detect(jolt(-24), 850)?.shake).toBe(false);
    detect(jolt(24), 400 + SHAKE_DEBOUNCE_MS + 10);
    detect(jolt(-24), 400 + SHAKE_DEBOUNCE_MS + 200);
    expect(detect(jolt(24), 400 + SHAKE_DEBOUNCE_MS + 400)?.shake).toBe(true);
  });

  it('ignores peaks too close together or too far apart', () => {
    const detect = createShakeDetector();
    detect({ x: 0, y: 9.8, z: 0 }, 0);
    detect({ x: 20, y: 9.8, z: 0 }, 100);
    // One jolt sampled twice is one peak.
    detect({ x: -20, y: 9.8, z: 0 }, 150);
    expect(detect({ x: 20, y: 9.8, z: 0 }, 2000)?.shake).toBe(false);
  });
});
