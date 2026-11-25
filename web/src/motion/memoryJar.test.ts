// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createJarDriver,
  createJarSim,
  dragFold,
  FOLD_COMMIT,
  foldFlaps,
  JAR_GEOMETRY,
  JAR_SHAKES,
  JAR_TIMING,
  JAR_WALL,
  type JarParts,
  jarEaseInOut,
  jarFollow,
  jarPose,
  jumpVars,
  measureFold,
  paintFold,
  runJarTween,
  stageFlightVars,
  stepJar,
} from './memoryJar';

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Runs the jar from `start` in 16 ms frames until it rests (or `limit`). */
function settle(
  sim: ReturnType<typeof createJarSim>,
  start: number,
  limit = 2000,
  onImpact?: (intensity: number) => void,
) {
  let now = start;
  for (let frame = 0; frame < limit; frame += 1) {
    now += 16;
    const rest = stepJar(sim, now, onImpact);
    if (rest !== 'moving') return { rest, frames: frame + 1, now };
  }
  return { rest: 'moving' as const, frames: limit, now };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the Glas jar frame', () => {
  it('rests at once when nothing moves, exactly at zero', () => {
    const sim = createJarSim();
    expect(stepJar(sim, 16)).toBe('rest');
    expect(jarPose(sim).body).toBe('translate3d(0.00px, 0, 0) rotate(0.00deg)');
    expect(jarPose(sim).tag).toBe('rotate(-18.00deg)');
  });

  it('follows the held jar, lets the slips hit the glass and settles after letting go', () => {
    const sim = createJarSim();
    sim.dragging = true;
    sim.target = jarFollow(200);
    const impacts: number[] = [];
    let now = 0;
    for (let frame = 0; frame < 30; frame += 1) {
      now += 16;
      stepJar(sim, now, (intensity) => impacts.push(intensity));
    }
    // The finger holds it at most 46 px away; the slips lag and hit the wall.
    expect(sim.target).toBeLessThanOrEqual(46);
    expect(sim.x).toBeGreaterThan(30);
    expect(Math.abs(sim.s)).toBeLessThanOrEqual(JAR_WALL);
    expect(impacts.length).toBeGreaterThan(0);
    for (const intensity of impacts) {
      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeLessThanOrEqual(1);
    }
    expect(sim.tilt).toBeGreaterThan(0);
    expect(sim.tilt).toBeLessThanOrEqual(14);
    sim.dragging = false;
    const end = settle(sim, now);
    expect(end.rest).toBe('rest');
    expect(sim.x).toBe(0);
    expect(sim.s).toBe(0);
    expect(sim.tilt).toBe(0);
  });

  it('plays a scripted shake for its length, then rocks back', () => {
    const sim = createJarSim();
    sim.script = { ...JAR_SHAKES.tap, start: 0 };
    let now = 0;
    let furthest = 0;
    while (now < JAR_SHAKES.tap.duration * 1000) {
      now += 16;
      stepJar(sim, now);
      furthest = Math.max(furthest, Math.abs(sim.x));
    }
    expect(furthest).toBeGreaterThan(4);
    stepJar(sim, now + 16);
    expect(sim.script).toBeNull();
    expect(settle(sim, now + 16).rest).toBe('rest');
  });

  it('keeps the pose with a loosened lid', () => {
    const sim = createJarSim();
    sim.looseTarget = 0.5;
    const end = settle(sim, 0);
    expect(end.rest).toBe('loose');
    expect(sim.loose).toBeCloseTo(0.5, 2);
    const lid = /translate3d\(0, ([-\d.]+)px, 0\) rotate\(([-\d.]+)deg\)/u.exec(
      jarPose(sim).lid,
    );
    expect(Number(lid?.[1])).toBeCloseTo(-1.5, 1);
    expect(Number(lid?.[2])).toBeCloseTo(1.25, 1);
    sim.looseTarget = 0;
    expect(settle(sim, end.now).rest).toBe('rest');
    expect(sim.loose).toBe(0);
  });

  it('moves the pile as three layers, the top one the most', () => {
    const sim = createJarSim();
    sim.s = JAR_WALL;
    const groups = jarPose(sim).groups;
    expect(groups).toHaveLength(3);
    const shift = (pose: string) =>
      Number.parseFloat(/translate3d\(([-\d.]+)px/u.exec(pose)?.[1] ?? '0');
    expect(shift(groups[0])).toBeLessThan(shift(groups[1]));
    expect(shift(groups[1])).toBeLessThan(shift(groups[2]));
  });
});

describe('the Glas jar driver', () => {
  function parts(): JarParts {
    return {
      jar: document.createElement('div'),
      body: document.createElement('div'),
      shadow: document.createElement('span'),
      groups: [
        document.createElement('div'),
        document.createElement('div'),
        document.createElement('div'),
      ],
      lid: document.createElement('div'),
      tag: document.createElement('span'),
    };
  }

  function frames() {
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queue.push(callback);
      return queue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      queue.length = 0;
    });
    return {
      run(count: number) {
        for (let index = 0; index < count && queue.length; index += 1)
          queue.shift()?.(0);
      },
      pending: () => queue.length,
    };
  }

  it('writes transforms while it moves and clears them at rest', () => {
    const loop = frames();
    const els = parts();
    let now = 0;
    const driver = createJarDriver(() => els, vi.fn(), {
      clock: () => {
        now += 16;
        return now;
      },
      random: () => 0.5,
    });
    driver.hold(40);
    expect(els.jar?.dataset.shaking).toBe('true');
    expect(driver.busy()).toBe(true);
    loop.run(10);
    expect(els.body?.style.transform).toMatch(/^translate3d\(/u);
    expect(els.groups[2]?.style.transform).toMatch(/rotate\(/u);
    driver.release();
    expect(driver.busy()).toBe(false);
    loop.run(3000);
    expect(loop.pending()).toBe(0);
    expect(els.body?.style.transform).toBe('');
    expect(els.jar?.dataset.shaking).toBeUndefined();
  });

  it('runs one loop only, also when an impact clinks during a frame', () => {
    const loop = frames();
    const els = parts();
    let now = 0;
    const onImpact = vi.fn();
    const driver = createJarDriver(
      () => els,
      (intensity) => {
        onImpact(intensity);
        driver.clink(intensity, true);
      },
      {
        clock: () => {
          now += 16;
          return now;
        },
        random: () => 0.5,
      },
    );
    driver.shake(JAR_SHAKES.hard);
    for (let frame = 0; frame < 120; frame += 1) {
      expect(loop.pending()).toBeLessThanOrEqual(1);
      loop.run(1);
    }
    expect(onImpact).toHaveBeenCalled();
    driver.stop();
    expect(loop.pending()).toBe(0);
    expect(els.lid?.style.transform).toBe('');
  });

  it('ignores a shaken phone while the finger holds the jar', () => {
    frames();
    const els = parts();
    const driver = createJarDriver(() => els, vi.fn(), { clock: () => 0 });
    driver.hold(10);
    driver.push(6);
    driver.release();
    driver.calm();
    expect(driver.busy()).toBe(false);
    driver.stop();
  });
});

describe('the Glas slip', () => {
  it('jumps from its place through the neck and out on the left', () => {
    const values = jumpVars({ left: 100, top: 200, w: 40, h: 20, rot: -12 });
    expect(values).toEqual({
      '--memory-jar-r0': '-12deg',
      '--memory-jar-nx': `${JAR_GEOMETRY.neckX - 120}px`,
      '--memory-jar-ny': `${JAR_GEOMETRY.neckY - 210}px`,
      '--memory-jar-ax': `${JAR_GEOMETRY.exitX - 120}px`,
      '--memory-jar-ay': `${JAR_GEOMETRY.exitY - 210}px`,
    });
  });

  it('flies onto the stage from where it jumped out, or rises from below', () => {
    const sheet = rect(20, 100, 300, 400);
    expect(stageFlightVars(sheet, { cx: 80, cy: 50, w: 45 }, 800)).toEqual({
      '--memory-jar-fx': '-90.0px',
      '--memory-jar-fy': '-250.0px',
      '--memory-jar-fs': '0.150',
      '--memory-jar-fr': '-10deg',
    });
    expect(stageFlightVars(sheet, null, 800)['--memory-jar-fy']).toBe(
      '500.0px',
    );
    expect(stageFlightVars(null, null, 800)).toMatchObject({
      '--memory-jar-fx': '0.0px',
      '--memory-jar-fy': '280.0px',
      '--memory-jar-fs': '0.140',
    });
  });

  it('folds the bottom third first, then the top one', () => {
    expect(foldFlaps(0)).toEqual({ bottom: 0, top: 0 });
    expect(foldFlaps(0.25)).toEqual({ bottom: 0.5, top: 0 });
    expect(foldFlaps(0.5)).toEqual({ bottom: 1, top: 0 });
    expect(foldFlaps(1)).toEqual({ bottom: 1, top: 1 });
    expect(jarEaseInOut(0)).toBe(0);
    expect(jarEaseInOut(0.5)).toBe(0.5);
    expect(jarEaseInOut(1)).toBe(1);
  });

  it('measures the way to the jar mouth and folds as the finger pulls it up', () => {
    const jar = rect(60, 0, 148.8, 204.6);
    expect(measureFold(rect(0, 0, 0, 0), jar)).toBeNull();
    const track = measureFold(rect(20, 400, 300, 300), jar);
    if (!track) throw new Error('no track');
    expect(track.tx).toBeCloseTo(60 + 74.4 - 170);
    expect(track.ty).toBeCloseTo(30 * 0.62 - 550);
    expect(track.dist).toBeCloseTo(550 - 30 * 0.62);
    dragFold(track, 40);
    expect(track.dragY).toBe(30);
    expect(track.p).toBe(0);
    dragFold(track, -track.dist * 0.3);
    expect(track.p).toBeCloseTo(0.5);
    expect(track.p).toBeGreaterThanOrEqual(FOLD_COMMIT);
    dragFold(track, -10_000);
    expect(track.dragY).toBeCloseTo(-track.dist * 1.05);
    expect(track.p).toBe(1);
  });

  it('paints the fold with transforms and opacities only', () => {
    const paper = document.createElement('div');
    const top = document.createElement('span');
    const bottom = document.createElement('span');
    const diary = document.createElement('a');
    const back = document.createElement('button');
    const track = {
      p: 0,
      dragY: 0,
      tx: 10,
      ty: -300,
      ts: 0.1,
      dist: 300,
    };
    // The DOM normalises the written numbers; compare the values.
    const angle = (el: HTMLElement) =>
      Number(/rotateX\(([-\d.]+)deg\)/u.exec(el.style.transform)?.[1]);
    paintFold({ paper, top, bottom, diary, back }, track, 0.5, 0);
    expect(angle(bottom)).toBe(180);
    expect(Math.abs(angle(top))).toBe(0);
    expect(diary.style.opacity).toBe('0');
    expect(paper.style.opacity).toBe('');
    paintFold({ paper, top, bottom, diary, back }, track, 1, 1);
    expect(angle(top)).toBe(-180);
    expect(back.style.opacity).toBe('0');
    expect(paper.style.transform).toMatch(
      /^translate3d\(10px, -300px, 0(px)?\) scale\(0\.1\) rotate\(-4deg\)$/u,
    );
    expect(paper.style.opacity).toBe('0');
  });

  it('tweens over its length, or ends at once without one', () => {
    const frame = vi.fn();
    const done = vi.fn();
    runJarTween(0, frame, done);
    expect(frame).toHaveBeenCalledWith(1);
    expect(done).toHaveBeenCalledTimes(1);

    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queue.push(callback);
      return queue.length;
    });
    let now = 0;
    const seen: number[] = [];
    const finished = vi.fn();
    runJarTween(
      JAR_TIMING.carry,
      (t) => seen.push(t),
      finished,
      () => now,
    );
    while (queue.length) {
      now += 205;
      queue.shift()?.(0);
    }
    expect(seen[0]).toBeCloseTo(205 / JAR_TIMING.carry);
    expect(seen.at(-1)).toBe(1);
    expect(finished).toHaveBeenCalledTimes(1);
  });
});
