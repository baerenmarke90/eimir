// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useViewportClamp } from './useViewportClamp';

const VIEWPORT = 390;

function Badge() {
  const ref = useRef<HTMLSpanElement>(null);
  useViewportClamp(ref);
  return (
    <span ref={ref} data-testid="badge">
      badge
    </span>
  );
}

/** A badge inside the shell surface and a tab panel, as on the Wir page. */
function renderInSurface() {
  const view = render(
    <main className="product-main" data-testid="surface">
      <div data-testid="panel" className="primary-tab-panel">
        <Badge />
      </div>
    </main>,
  );
  return {
    surface: view.getByTestId('surface'),
    panel: view.getByTestId('panel'),
    badge: view.getByTestId('badge'),
  };
}

function placeBadge(badge: HTMLElement, left: number, width = 100) {
  badge.getBoundingClientRect = () =>
    ({
      left,
      right: left + width,
      width,
      height: 28,
      top: 0,
      bottom: 28,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

const shiftOf = (badge: HTMLElement) =>
  badge.style.getPropertyValue('--viewport-clamp-shift');

const nextFrame = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(32);
  });

describe('useViewportClamp', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
    });
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: VIEWPORT,
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('pulls an overflowing badge back inside the viewport', () => {
    const prototypeRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function rect() {
      return {
        left: VIEWPORT - 60,
        right: VIEWPORT + 40,
        width: 100,
        height: 28,
      } as DOMRect;
    };
    try {
      const { badge } = renderInSurface();
      expect(shiftOf(badge)).toBe('-48px');
    } finally {
      Element.prototype.getBoundingClientRect = prototypeRect;
    }
  });

  it('does not freeze a shift measured while a swipe has the page off-screen', async () => {
    const { surface, badge } = renderInSurface();
    expect(shiftOf(badge)).toBe('0px');

    // Swipe starts: the page travels beside the screen, so its rectangle is
    // far outside the viewport.
    surface.dataset.primaryTabDragging = 'true';
    placeBadge(badge, -VIEWPORT - 20);
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    expect(shiftOf(badge)).toBe('0px');

    // Swipe settles: the page is back and the badge is in its real place.
    placeBadge(badge, 120);
    delete surface.dataset.primaryTabDragging;
    await nextFrame();
    expect(shiftOf(badge)).toBe('0px');
  });

  it('measures again once the swipe markers are gone', async () => {
    const { surface, badge } = renderInSurface();

    surface.dataset.primaryTabDragging = 'true';
    placeBadge(badge, VIEWPORT - 30);
    await nextFrame();

    // The badge really overhangs the screen edge after the page settles.
    delete surface.dataset.primaryTabDragging;
    await nextFrame();
    expect(shiftOf(badge)).toBe('-78px');
  });

  it('ignores a badge on a peeked neighbour page until it becomes the page', async () => {
    const { panel, badge } = renderInSurface();
    panel.dataset.primaryTabPeek = 'true';
    placeBadge(badge, -VIEWPORT + 10);
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    expect(shiftOf(badge)).toBe('0px');

    placeBadge(badge, 80);
    delete panel.dataset.primaryTabPeek;
    await nextFrame();
    expect(shiftOf(badge)).toBe('0px');
  });

  it('does not store a shift for a badge that is not laid out', async () => {
    const { badge } = renderInSurface();
    placeBadge(badge, 0, 0);
    badge.getBoundingClientRect = () =>
      ({ left: 0, right: 0, width: 0, height: 0 }) as DOMRect;
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    expect(shiftOf(badge)).toBe('0px');
  });
});
