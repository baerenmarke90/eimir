// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidateMotionTokens } from '../tokens';
import {
  dragFeedbackMotion,
  dragSettleTiming,
  sortableTransition,
} from './dragAndDrop';
import { panzoomMotionOptions } from './panzoom';

function motion(reduced: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  document.documentElement.style.setProperty(
    '--duration-transition',
    reduced ? '0ms' : '180ms',
  );
  document.documentElement.style.setProperty(
    '--easing-standard',
    'cubic-bezier(0.2, 0, 0, 1)',
  );
  invalidateMotionTokens();
}

afterEach(() => {
  document.documentElement.removeAttribute('style');
  invalidateMotionTokens();
});

describe('gesture library wrappers', () => {
  it('gives @dnd-kit the token roles instead of its defaults', () => {
    motion(false);
    const timing = { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' };
    expect(dragSettleTiming()).toEqual(timing);
    expect(sortableTransition()).toEqual(timing);
    expect(dragFeedbackMotion()).toEqual({
      dropAnimation: timing,
      keyboardTransition: timing,
    });
  });

  it('makes the @dnd-kit drop instant with reduced motion', () => {
    motion(true);
    expect(sortableTransition()).toBeNull();
    expect(dragFeedbackMotion()).toEqual({
      dropAnimation: null,
      keyboardTransition: null,
    });
  });

  it('keeps @panzoom/panzoom steps instant with the token roles in place', () => {
    motion(false);
    expect(panzoomMotionOptions()).toEqual({
      animate: false,
      duration: 180,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    });
  });
});
