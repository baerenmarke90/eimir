// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { animateFlight, flightEnded } from './flight';

describe('animateFlight', () => {
  it('starts the animation on the element with the given options', () => {
    const animation = { finished: Promise.resolve() } as unknown as Animation;
    const element = document.createElement('div');
    const animate = vi.fn(() => animation);
    element.animate = animate as never;
    const keyframes = [{ opacity: 1 }, { opacity: 0 }];
    const options: KeyframeAnimationOptions = {
      duration: 10,
      fill: 'forwards',
    };
    expect(animateFlight(element, keyframes, options)).toBe(animation);
    expect(animate).toHaveBeenCalledWith(keyframes, options);
  });

  it('returns null without Element.animate', () => {
    const element = document.createElement('div');
    (element as unknown as { animate: unknown }).animate = undefined;
    expect(animateFlight(element, [{ opacity: 0 }], { duration: 10 })).toBe(
      null,
    );
  });
});

describe('flightEnded', () => {
  it('resolves for a missing, finished or cancelled animation', async () => {
    await expect(flightEnded(null)).resolves.toBeUndefined();
    const done = { finished: Promise.resolve() } as unknown as Animation;
    await expect(flightEnded(done)).resolves.toBeUndefined();
    const cancelled = {
      finished: Promise.reject(new DOMException('cancelled', 'AbortError')),
    } as unknown as Animation;
    await expect(flightEnded(cancelled)).resolves.toBeUndefined();
  });
});
