// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dropDust,
  flightAt,
  frameLoop,
  headScale,
  planFlight,
  type ScopeMotion,
  STARS_TIMING,
  scopeSettled,
  stepScope,
  trimTrail,
} from './constellation';

function motionAllowed() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Sternbild shooting star', () => {
  it('flies from the swipe to its star and slows down on the way', () => {
    const from = { x: 20, y: 40 };
    const to = { x: 220, y: 140 };
    const flight = planFlight(from, { x: 1, y: 0 }, to);
    expect(flight.duration).toBeGreaterThanOrEqual(STARS_TIMING.flightMin);
    expect(flight.duration).toBeLessThanOrEqual(STARS_TIMING.flightMax);
    expect(flightAt(flight, 0).at).toEqual(from);
    const end = flightAt(flight, flight.duration);
    expect(end.done).toBe(true);
    expect(end.at.x).toBeCloseTo(to.x);
    expect(end.at.y).toBeCloseTo(to.y);
    // Fast at first: past the middle of the curve at half time.
    expect(flightAt(flight, flight.duration / 2).eased).toBeCloseTo(0.875);
    expect(headScale(1)).toBeCloseTo(0.55);
  });

  it('keeps short and long flights within their bounds', () => {
    const near = planFlight({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: 0 });
    const far = planFlight({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 900, y: 0 });
    expect(near.duration).toBe(STARS_TIMING.flightMin);
    expect(far.duration).toBe(STARS_TIMING.flightMax);
  });

  it('lets the trail fade behind the head', () => {
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 1, y: 0, t: 200 },
      { x: 2, y: 0, t: 400 },
    ];
    expect(trimTrail(samples, 400, STARS_TIMING.trail)).toHaveLength(2);
    expect(trimTrail(samples, 1000, STARS_TIMING.trail)).toHaveLength(0);
  });

  it('spawns no dust with reduced motion', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    expect(dropDust(svg, { x: 1, y: 1 })).toBeNull();
    motionAllowed();
    const mote = dropDust(svg, { x: 1, y: 1 });
    expect(mote?.getAttribute('class')).toBe('memory-stars-dust');
    expect(svg.childNodes).toHaveLength(1);
  });
});

describe('the Sternbild telescope', () => {
  const motion = (): ScopeMotion => ({
    deg: -36,
    vel: 0,
    target: -120,
    reach: 160,
    reachTarget: 90,
    maxStep: 2,
  });

  it('follows its target on a soft spring with a speed limit', () => {
    motionAllowed();
    const scope = motion();
    stepScope(scope);
    expect(Math.abs(scope.vel)).toBeLessThanOrEqual(2);
    let frames = 1;
    while (!scopeSettled(scope) && frames < 1000) {
      stepScope(scope);
      frames += 1;
    }
    expect(scopeSettled(scope)).toBe(true);
    // At most 2 degrees a frame: a 84 degree swing takes a while.
    expect(frames).toBeGreaterThan(40);
    expect(scope.deg).toBeCloseTo(-120, 0);
  });

  it('is at its target at once with reduced motion', () => {
    const scope = motion();
    stepScope(scope);
    expect(scope.deg).toBe(-120);
    expect(scope.reach).toBe(90);
    expect(scopeSettled(scope)).toBe(true);
  });

  it('runs frames for as long as the step asks for more', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    let left = 3;
    const step = vi.fn(() => {
      left -= 1;
      return left > 0;
    });
    const loop = frameLoop(step);
    loop.start();
    loop.start();
    expect(frames).toHaveLength(1);
    while (frames.length) frames.shift()?.(0);
    expect(step).toHaveBeenCalledTimes(3);
  });
});
