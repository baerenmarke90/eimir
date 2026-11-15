import { describe, expect, it } from 'vitest';
import { alignWirIntroAnimations } from './wirIntroClock';

function fakeAnimation(animationName: string, startTime: number | null) {
  return { animationName, startTime } as unknown as Animation;
}

function rootWith(animations: Animation[]) {
  return {
    getAnimations: () => animations,
  } as unknown as Element;
}

describe('alignWirIntroAnimations', () => {
  it('pins every intro animation to the start of the sequence', () => {
    const portrait = fakeAnimation('wir-intro-portrait', 4200);
    const pending = fakeAnimation('wir-intro-caption', null);
    alignWirIntroAnimations(rootWith([portrait, pending]), 1000);
    expect(portrait.startTime).toBe(1000);
    expect(pending.startTime).toBe(1000);
  });

  it('leaves other animations and transitions on their own clock', () => {
    const other = fakeAnimation('gesture-pulse', 4200);
    const transition = { startTime: 4200 } as unknown as Animation;
    alignWirIntroAnimations(rootWith([other, transition]), 1000);
    expect(other.startTime).toBe(4200);
    expect(transition.startTime).toBe(4200);
  });

  it('does nothing before the intro started or without animation support', () => {
    const portrait = fakeAnimation('wir-intro-portrait', 4200);
    alignWirIntroAnimations(rootWith([portrait]), null);
    expect(portrait.startTime).toBe(4200);
    expect(() => alignWirIntroAnimations({} as Element, 1000)).not.toThrow();
  });
});
