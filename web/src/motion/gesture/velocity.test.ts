import { describe, expect, it } from 'vitest';
import { HORIZON_MS, VelocityTracker } from './velocity';

/**
 * Pointer traces for the release-velocity tuning (#2073, acceptance ±5 %).
 *
 * Each trace models a finger by its velocity profile `v(t)` (px/ms) and
 * records it the way a device delivers it: at the device's sample rate,
 * with timestamp jitter, positions quantized to device pixels
 * (Pixel 10 Pro Fold, DPR 2.625), optionally as coalesced batches that arrive
 * late, out of order or with repeated timestamps. The release (`pointerup`)
 * comes a few ms after the last move, as on Android.
 *
 * Ground truth follows the gesture test #2071: the finger's travel from the
 * first pointer sample within the final 100 ms up to the release, divided by
 * that time, computed on the exact finger path. A finger that stopped before
 * lifting has a velocity of 0.
 */

const DPR = 2.625;

function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

interface Profile {
  /** Finger velocity at time t (ms since down), px/ms. */
  v: (t: number) => number;
  /** When the finger lifts, ms since down. */
  release: number;
  /** Times without pointer events (the finger rests). */
  still?: (t: number) => boolean;
}

interface Recording {
  rateHz: number;
  jitterMs: number;
  seed: number;
  /** Deliver events in batches every `batchMs` (a busy main thread). */
  batchMs?: number;
  /** Swap one pair of neighbouring samples (a late event). */
  swapOne?: boolean;
  /** Repeat one timestamp (a coalesced duplicate). */
  duplicateOne?: boolean;
  /** Last move this long before the release. */
  liftDelayMs?: number;
}

function position(profile: Profile, t: number): number {
  // Midpoint integration at 0.1 ms is exact enough for px resolution.
  let p = 0;
  for (let at = 0.05; at < t; at += 0.1) p += profile.v(at) * 0.1;
  return p;
}

function record(profile: Profile, recording: Recording) {
  const random = prng(recording.seed);
  const interval = 1000 / recording.rateHz;
  const lastMove = profile.release - (recording.liftDelayMs ?? 4);
  const samples: { t: number; p: number }[] = [];
  for (let t = interval; t <= lastMove; t += interval) {
    if (profile.still?.(t)) continue;
    const jittered = t + (random() * 2 - 1) * recording.jitterMs;
    const p = Math.round(position(profile, jittered) * DPR) / DPR;
    samples.push({ t: jittered, p });
  }
  let delivered = samples;
  if (recording.duplicateOne && samples.length > 6) {
    const index = samples.length - 4;
    delivered = [...samples];
    delivered.splice(index + 1, 0, {
      t: samples[index].t,
      p: samples[index].p,
    });
  }
  if (recording.swapOne && delivered.length > 6) {
    const index = delivered.length - 5;
    delivered = [...delivered];
    [delivered[index], delivered[index + 1]] = [
      delivered[index + 1],
      delivered[index],
    ];
  }
  if (recording.batchMs) {
    // Batched delivery keeps true timestamps; only arrival is late.
    const batches = new Map<number, typeof delivered>();
    for (const sample of delivered) {
      const key = Math.ceil(sample.t / recording.batchMs);
      batches.set(key, [...(batches.get(key) ?? []), sample]);
    }
    delivered = [...batches.values()].flat();
  }
  const up = {
    t: profile.release,
    p: Math.round(position(profile, profile.release) * DPR) / DPR,
  };
  return { down: { t: 0, p: 0 }, moves: delivered, up };
}

/**
 * The gesture test's definition (#2071 `fingerVelocity`), applied to the
 * exact finger path instead of quantized samples: travel from the first
 * pointer sample within the 100 ms before the release up to the release.
 */
function truth(profile: Profile, trace: ReturnType<typeof record>): number {
  const end = trace.up.t;
  const inWindow = trace.moves
    .map((move) => move.t)
    .filter((t) => t >= end - HORIZON_MS)
    .sort((a, b) => a - b);
  const start = inWindow[0] ?? end - HORIZON_MS;
  return (position(profile, end) - position(profile, start)) / (end - start);
}

function estimate(trace: ReturnType<typeof record>): number {
  const tracker = new VelocityTracker();
  tracker.add(trace.down.t, trace.down.p);
  for (const move of trace.moves) tracker.add(move.t, move.p);
  return tracker.velocity(trace.up);
}

/** Smooth ramp from 0 to `peak` over `ms`. */
const ramp = (t: number, ms: number, peak: number) =>
  t >= ms ? peak : peak * (0.5 - 0.5 * Math.cos((Math.PI * t) / ms));

const TRACES: Array<{ name: string; profile: Profile; recording: Recording }> =
  [
    {
      name: 'slow fling (0.25 px/ms, 60 Hz)',
      profile: { v: (t) => ramp(t, 60, 0.25), release: 360 },
      recording: { rateHz: 60, jitterMs: 1, seed: 1 },
    },
    {
      name: 'slow fling (0.3 px/ms, 120 Hz coalesced)',
      profile: { v: (t) => ramp(t, 80, 0.3), release: 300 },
      recording: { rateHz: 120, jitterMs: 0.5, seed: 2 },
    },
    {
      name: 'normal fling (1 px/ms)',
      profile: { v: (t) => ramp(t, 80, 1), release: 240 },
      recording: { rateHz: 60, jitterMs: 1, seed: 3 },
    },
    {
      name: 'normal fling that slows before lifting (1.4 → 0.9 px/ms)',
      profile: {
        v: (t) => (t < 140 ? ramp(t, 60, 1.4) : 1.4 - ((t - 140) / 100) * 0.5),
        release: 240,
      },
      recording: { rateHz: 120, jitterMs: 0.5, seed: 4 },
    },
    {
      name: 'fast fling (3 px/ms, 120 Hz)',
      profile: { v: (t) => ramp(t, 40, 3), release: 150 },
      recording: { rateHz: 120, jitterMs: 0.5, seed: 5 },
    },
    {
      name: 'fast fling (4 px/ms, 60 Hz)',
      profile: { v: (t) => ramp(t, 30, 4), release: 140 },
      recording: { rateHz: 60, jitterMs: 1, seed: 6 },
    },
    {
      name: 'hold, then flick (2 px/ms after 400 ms still)',
      profile: {
        v: (t) => (t < 400 ? 0 : ramp(t - 400, 15, 2)),
        still: (t) => t < 400,
        release: 470,
      },
      recording: { rateHz: 120, jitterMs: 0.5, seed: 7 },
    },
    {
      name: 'coalesced events delivered late in 50 ms batches',
      profile: { v: (t) => ramp(t, 60, 1.2), release: 260 },
      recording: { rateHz: 120, jitterMs: 0.5, seed: 8, batchMs: 50 },
    },
    {
      name: 'a late out-of-order sample and a repeated timestamp',
      profile: { v: (t) => ramp(t, 60, 1.6), release: 220 },
      recording: {
        rateHz: 120,
        jitterMs: 0.5,
        seed: 9,
        swapOne: true,
        duplicateOne: true,
      },
    },
    {
      name: 'release 16 ms after the last move',
      profile: { v: (t) => ramp(t, 60, 0.8), release: 260 },
      recording: { rateHz: 60, jitterMs: 1, seed: 10, liftDelayMs: 16 },
    },
  ];

describe('VelocityTracker release velocity', () => {
  it.each(TRACES)(
    '$name is within ±5 % of the finger',
    ({ profile, recording }) => {
      const trace = record(profile, recording);
      const expected = truth(profile, trace);
      const measured = estimate(trace);
      expect(Math.abs(measured - expected) / expected).toBeLessThanOrEqual(
        0.05,
      );
    },
  );

  // The gesture test's own pointer scripts (#2071 `measure.mjs`): a press,
  // evenly spaced moves of a fixed step, and a release at the last position
  // after a short delay. Ground truth is #2071's `fingerVelocity`. The #2071
  // tracker read +17 % to +44 % on these.
  it.each([
    { name: 'fling', moves: 6, step: 16, interval: 12, lift: 12 },
    {
      name: 'fling on a slow event loop',
      moves: 6,
      step: 16,
      interval: 20,
      lift: 20,
    },
    { name: 'dismiss', moves: 22, step: 10, interval: 20, lift: 20 },
    {
      name: 'dismiss with a late release',
      moves: 22,
      step: 10,
      interval: 17,
      lift: 30,
    },
  ])('#2071 $name script is within ±5 %', ({ moves, step, interval, lift }) => {
    const pointer = [{ t: 0, p: 0 }];
    for (let index = 1; index <= moves; index += 1)
      pointer.push({ t: index * interval, p: index * step });
    const up = { t: moves * interval + lift, p: moves * step };
    const inWindow = pointer.filter((sample) => sample.t >= up.t - HORIZON_MS);
    const expected = (up.p - inWindow[0].p) / (up.t - inWindow[0].t);
    const tracker = new VelocityTracker();
    for (const sample of pointer) tracker.add(sample.t, sample.p);
    const measured = tracker.velocity(up);
    expect(Math.abs(measured - expected) / expected).toBeLessThanOrEqual(0.05);
  });

  it('#2071 cancel script (a 150 ms rest before lifting) reads 0', () => {
    const tracker = new VelocityTracker();
    tracker.add(0, 0);
    for (let index = 1; index <= 16; index += 1)
      tracker.add(index * 27, index * 5);
    expect(tracker.velocity({ t: 16 * 27 + 150, p: 80 })).toBe(0);
  });

  it('reads 0 when the finger stopped before lifting', () => {
    const profile: Profile = {
      v: (t) => (t < 200 ? ramp(t, 60, 1) : 0),
      still: (t) => t >= 200,
      release: 320,
    };
    expect(
      estimate(record(profile, { rateHz: 60, jitterMs: 1, seed: 11 })),
    ).toBe(0);
  });

  it('reads 0 for a press without movement', () => {
    const tracker = new VelocityTracker();
    tracker.add(0, 100);
    expect(tracker.velocity({ t: 120, p: 100 })).toBe(0);
  });

  it('keeps direction: an upward fling is negative', () => {
    const tracker = new VelocityTracker();
    for (let t = 0; t <= 100; t += 8) tracker.add(t, 500 - t * 1.5);
    expect(tracker.velocity({ t: 104, p: 500 - 104 * 1.5 })).toBeCloseTo(
      -1.5,
      2,
    );
  });
});
