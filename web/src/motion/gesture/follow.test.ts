// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FakeMediaQuery,
  installFakeAnimate,
  installReducedMotion,
} from '../__fixtures__/fakeAnimation';
import {
  attachGestureFollow,
  commitDistance,
  decideRelease,
  type GestureFollowConfig,
  resolveOwnership,
  rubberBand,
} from './follow';

let fake: ReturnType<typeof installFakeAnimate>;
let reduced: FakeMediaQuery;

beforeEach(() => {
  fake = installFakeAnimate();
  reduced = installReducedMotion(false);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  fake.restore();
  reduced.restore();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function pointer(type: string, t: number, y: number, x = 0): PointerEvent {
  const event = new Event(type, { bubbles: true }) as PointerEvent;
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    clientX: { value: x },
    clientY: { value: y },
    timeStamp: { value: t },
    button: { value: 0 },
  });
  return event;
}

function sheet(overrides: Partial<GestureFollowConfig> = {}) {
  const element = document.createElement('div');
  document.body.append(element);
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const follow = attachGestureFollow(element, {
    axis: 'y',
    direction: 1,
    size: () => 600,
    threshold: 'sheet',
    range: () => ({ min: 0, max: 600 }),
    committedOffset: () => 600,
    onCommit,
    onCancel,
    ...overrides,
  });
  const drag = (points: Array<[number, number]>, release: [number, number]) => {
    const [t0, y0] = points[0];
    element.dispatchEvent(pointer('pointerdown', t0, y0));
    for (const [t, y] of points.slice(1))
      element.dispatchEvent(pointer('pointermove', t, y));
    element.dispatchEvent(pointer('pointerup', release[0], release[1]));
  };
  return { element, follow, onCommit, onCancel, drag };
}

describe('gesture rules', () => {
  it('uses the tokenized commit distances', () => {
    expect(commitDistance('sheet', 600)).toBe(132);
    expect(commitDistance('sheet', 1200)).toBe(180);
    expect(commitDistance('pager', 390)).toBeCloseTo(70.2);
    expect(commitDistance('pull', 800)).toBe(72);
  });

  it('claims after the slop and lets vertical scroll win an ambiguous start', () => {
    expect(resolveOwnership('x', 4, 1)).toBe('pending');
    expect(resolveOwnership('x', 12, 2)).toBe('claim');
    expect(resolveOwnership('x', 10, 10)).toBe('reject');
    expect(resolveOwnership('y', 2, 9)).toBe('claim');
  });

  it('rubber-bands past the range, never a hard stop', () => {
    expect(rubberBand(-40, 0, 600)).toBe(-10);
    expect(rubberBand(-400, 0, 600)).toBe(-48);
    expect(rubberBand(300, 0, 600)).toBe(300);
  });

  it('commits on distance or fling, and cancels after a reversal', () => {
    expect(
      decideRelease({ travel: 140, peak: 140, velocity: 0, threshold: 132 }),
    ).toBe('commit');
    expect(
      decideRelease({ travel: 40, peak: 40, velocity: 0.8, threshold: 132 }),
    ).toBe('commit');
    expect(
      decideRelease({ travel: 20, peak: 20, velocity: 0.8, threshold: 132 }),
    ).toBe('cancel');
    expect(
      decideRelease({ travel: 140, peak: 170, velocity: 0, threshold: 132 }),
    ).toBe('cancel');
  });
});

describe('attachGestureFollow', () => {
  it('tracks 1:1 and commits at release, before the settle', () => {
    const { element, onCommit, drag } = sheet();
    drag(
      [
        [0, 100],
        [16, 160],
        [32, 240],
        [48, 300],
      ],
      [52, 300],
    );
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(element.style.transform).toBe('translateY(600px)');
    const settle = fake.animations[0];
    // The settle starts where the finger let go, with its velocity.
    const frames = settle.keyframes as Keyframe[];
    expect(frames[0].transform).toBe('translateY(200px)');
    expect(frames.at(-1)?.transform).toBe('translateY(600px)');
  });

  it('cancels a short slow drag and settles back to rest', () => {
    const { element, onCancel, drag } = sheet();
    drag(
      [
        [0, 100],
        [40, 120],
        [80, 140],
      ],
      [84, 140],
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(element.style.transform).toBe('translateY(0px)');
  });

  it('converges when the settling element is grabbed: no jump, one commit', () => {
    const { element, onCommit, drag } = sheet();
    drag(
      [
        [0, 100],
        [40, 115],
        [80, 130],
      ],
      [84, 130],
    );
    const settle = fake.animations[0];
    // The element is mid-settle at 40 px when the person grabs it again.
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      transform: 'matrix(1, 0, 0, 1, 0, 40)',
    } as CSSStyleDeclaration);
    vi.stubGlobal(
      'DOMMatrixReadOnly',
      class {
        m41 = 0;
        m42 = 40;
      },
    );
    element.dispatchEvent(pointer('pointerdown', 500, 300));
    expect(settle.committed).toBe(true);
    expect(settle.playState).toBe('idle');
    expect(element.style.transform).toBe('translateY(40px)');
    element.dispatchEvent(pointer('pointermove', 516, 310));
    expect(element.style.transform).toBe('translateY(50px)');
    vi.mocked(window.getComputedStyle).mockRestore();
    element.dispatchEvent(pointer('pointerup', 900, 310));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('settles instantly with reduced motion but still tracks and rubber-bands', () => {
    reduced.set(true);
    const { element, drag } = sheet();
    element.dispatchEvent(pointer('pointerdown', 0, 300));
    element.dispatchEvent(pointer('pointermove', 16, 200));
    expect(element.style.transform).toBe('translateY(-25px)');
    element.dispatchEvent(pointer('pointerup', 20, 200));
    expect(element.style.transform).toBe('translateY(0px)');
    drag(
      [
        [100, 100],
        [116, 300],
      ],
      [120, 300],
    );
    expect(element.style.transform).toBe('translateY(600px)');
    expect(fake.animations).toHaveLength(0);
  });

  it('rejects a horizontal start on a vertical gesture', () => {
    const { element, onCommit, onCancel } = sheet();
    element.dispatchEvent(pointer('pointerdown', 0, 100, 0));
    element.dispatchEvent(pointer('pointermove', 16, 102, 30));
    element.dispatchEvent(pointer('pointermove', 32, 300, 60));
    element.dispatchEvent(pointer('pointerup', 36, 300, 60));
    expect(element.style.transform).toBe('');
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels to rest at once on pointercancel or a hidden page', () => {
    const { element, onCancel, follow } = sheet();
    element.dispatchEvent(pointer('pointerdown', 0, 100));
    element.dispatchEvent(pointer('pointermove', 16, 200));
    element.dispatchEvent(pointer('pointercancel', 20, 200));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(element.style.transform).toBe('translateY(0px)');
    expect(follow.offset).toBe(0);
  });
});
