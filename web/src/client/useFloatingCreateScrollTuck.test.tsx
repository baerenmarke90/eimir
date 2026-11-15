// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLOATING_CREATE_GESTURE_WINDOW_MS,
  FLOATING_CREATE_TUCKED_ATTRIBUTE,
  useFloatingCreateScrollTuck,
} from './useFloatingCreateScrollTuck';

function Harness() {
  useFloatingCreateScrollTuck();
  return null;
}

let now = 0;

function tucked() {
  return document.documentElement.hasAttribute(
    FLOATING_CREATE_TUCKED_ATTRIBUTE,
  );
}

function scrollTo(y: number, { own = true } = {}) {
  if (own) window.dispatchEvent(new Event('touchmove'));
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
}

beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    // Run synchronously; 0 marks no pending frame once the callback ran.
    callback(0);
    return 0;
  });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute(FLOATING_CREATE_TUCKED_ATTRIBUTE);
});

describe('useFloatingCreateScrollTuck', () => {
  it('tucks the action away while the viewer scrolls down and returns it on the way up', () => {
    render(<Harness />);
    scrollTo(60);
    scrollTo(120);
    expect(tucked()).toBe(true);
    scrollTo(300);
    expect(tucked()).toBe(true);
    scrollTo(295);
    expect(tucked()).toBe(true);
    scrollTo(280);
    expect(tucked()).toBe(false);
  });

  it('ignores small downward jitter', () => {
    render(<Harness />);
    scrollTo(200, { own: false });
    scrollTo(210);
    expect(tucked()).toBe(false);
    scrollTo(190);
    scrollTo(205);
    expect(tucked()).toBe(false);
  });

  it('always shows the action near the top of the page', () => {
    render(<Harness />);
    scrollTo(400);
    expect(tucked()).toBe(true);
    scrollTo(30);
    expect(tucked()).toBe(false);
  });

  it('shows the action again after programmatic scrolling such as a restored return position', () => {
    render(<Harness />);
    scrollTo(100);
    scrollTo(400);
    expect(tucked()).toBe(true);
    now += FLOATING_CREATE_GESTURE_WINDOW_MS + 1;
    scrollTo(900, { own: false });
    expect(tucked()).toBe(false);
  });

  it('does not treat a lone tap as scrolling', () => {
    render(<Harness />);
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('touchstart'));
    now += FLOATING_CREATE_GESTURE_WINDOW_MS + 1;
    scrollTo(900, { own: false });
    expect(tucked()).toBe(false);
  });

  it('keeps momentum scrolling after a fling as the viewer’s own gesture', () => {
    render(<Harness />);
    scrollTo(100);
    for (let y = 150; y <= 900; y += 150) {
      now += FLOATING_CREATE_GESTURE_WINDOW_MS - 100;
      scrollTo(y, { own: false });
    }
    expect(tucked()).toBe(true);
  });

  it('counts keyboard scrolling keys and clears the state on unmount', () => {
    const { unmount } = render(<Harness />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }));
    scrollTo(100, { own: false });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }));
    scrollTo(500, { own: false });
    expect(tucked()).toBe(true);
    unmount();
    expect(tucked()).toBe(false);
  });
});
