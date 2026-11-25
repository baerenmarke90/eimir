import { describe, expect, it, vi } from 'vitest';
import {
  SCRATCH_TIMING,
  type TearPose,
  tearFrames,
  tearOff,
} from './scratchCard';

function offsets(frames: Keyframe[]) {
  return frames.map((frame) => frame.offset as number);
}

describe('the Rubbellos tear flight', () => {
  it('flies from where the finger let go, falling and fading out', () => {
    const pose: TearPose = { dir: 1, x: 90, rot: 4.8, auto: false };
    const frames = tearFrames(pose, 300);
    expect(frames).toHaveLength(11);
    expect(frames[0].transform).toBe(
      'translate(90.0px, 0.0px) rotate(4.80deg)',
    );
    expect(frames[0].opacity).toBe(1);
    expect(frames.at(-1)?.opacity).toBeCloseTo(0);
    expect(frames.at(-1)?.offset).toBe(1);
    const list = offsets(frames);
    expect([...list].sort((a, b) => a - b)).toEqual(list);
  });

  it('tugs against the pull first when a control tears it off', () => {
    const left = tearFrames({ dir: -1, x: 0, rot: 0, auto: true }, 300);
    expect(left[0].transform).toBe('translate(0px, 0px) rotate(0deg)');
    expect(left[1].transform).toBe('translate(6px, 1px) rotate(0.6deg)');
    expect(left[2].offset).toBe(0.42);
    expect(left.at(-1)?.offset).toBe(1);
    // The flight continues to the left, from the end of the tug.
    expect(String(left.at(-1)?.transform)).toMatch(/^translate\(-/u);
  });

  it('plays the flight with its own length, or not without Web Animations', () => {
    expect(tearOff(null, { dir: 1, x: 0, rot: 0, auto: false })).toBeNull();
    const animate = vi.fn(() => ({}) as Animation);
    const element = { animate, offsetWidth: 320 } as unknown as HTMLElement;
    tearOff(element, { dir: 1, x: 0, rot: 0, auto: true });
    expect(animate).toHaveBeenCalledWith(expect.any(Array), {
      duration: SCRATCH_TIMING.autoTear,
      easing: 'linear',
      fill: 'forwards',
    });
    tearOff(element, { dir: 1, x: 0, rot: 0, auto: false });
    expect(animate).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ duration: SCRATCH_TIMING.flight }),
    );
  });
});
