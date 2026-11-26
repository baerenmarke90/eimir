// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrimaryTabPeek } from '../client/primaryTabPeek';
import { useDocumentLeaveGuard } from '../client/useDocumentLeaveGuard';
import {
  configureHapticsForTests,
  registerHapticsBackend,
} from '../motion/haptics';
import { invalidateMotionTokens } from '../motion/tokens';
import { useNavigationMotion } from './useNavigationMotion';

/** A Web Animation's `finished` that the test settles by hand. */
function CommitProbe({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: (root: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useNavigationMotion({
    surfaceRef: ref,
    pathname,
    routeKey: pathname,
    onNavigate,
  });
  useLayoutEffect(() => {
    if (pathname === '/plan' && ref.current) swipe(ref.current);
  }, [pathname]);
  return <main ref={ref}>Committed reading surface</main>;
}

const pending = () => new Promise<Animation>(() => {});

import { usePullToRefresh } from './usePullToRefresh';

type Point = { clientX: number; clientY: number; identifier: number };
const point = (x: number, y = 200, identifier = 1): Point => ({
  clientX: x,
  clientY: y,
  identifier,
});
function touch(
  target: EventTarget,
  type: string,
  points: Point[],
  changed = points,
  timeStamp?: number,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: points },
    changedTouches: { value: changed },
  });
  if (timeStamp !== undefined)
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  target.dispatchEvent(event);
  return event;
}
function swipe(target: EventTarget, from = 280, to = 90) {
  touch(target, 'touchstart', [point(from)]);
  const move = touch(target, 'touchmove', [point(to)]);
  touch(target, 'touchend', [], [point(to)]);
  return move;
}

function Harness({
  pathname = '/story',
  routeKey = pathname,
  onNavigate,
  onRefresh = vi.fn(),
  dirty = false,
}: {
  pathname?: string;
  routeKey?: string;
  onNavigate: (path: string) => void;
  onRefresh?: () => void;
  dirty?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useNavigationMotion({ surfaceRef: ref, pathname, routeKey, onNavigate });
  usePullToRefresh({ enabled: true, blocked: false, onRefresh });
  useDocumentLeaveGuard(dirty);
  return (
    <main ref={ref} data-testid="surface">
      <p data-testid="reading">Shared content</p>
      <a href="/story/memories/example" data-testid="card">
        A memory
      </a>
      <form>
        <input aria-label="Draft" defaultValue="Keep these words" />
      </form>
      <button type="button">An action</button>
      <div className="eimir-media-snap-track" data-testid="gallery">
        Photos
      </div>
      <div data-testid="scroller" style={{ overflowX: 'auto' }}>
        <span>Horizontal content</span>
      </div>
    </main>
  );
}

function PageMotionHarness({
  pathname = '/story',
  onNavigate,
  loading = false,
  returning = false,
}: {
  pathname?: string;
  onNavigate: (path: string) => void;
  loading?: boolean;
  returning?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const peek = usePrimaryTabPeek();
  useNavigationMotion({
    surfaceRef: ref,
    pathname,
    routeKey: pathname,
    returning,
    onNavigate,
  });
  return (
    <div className="product-shell" data-testid="shell">
      <main ref={ref} data-testid="motion-surface">
        <div
          className="primary-tab-panel"
          data-primary-tab-prewarm="true"
          inert
        >
          <section className="page">
            <div className="ui-state-loading">Preparing the map</div>
          </section>
        </div>
        {peek ? (
          <div className="primary-tab-panel" data-primary-tab-peek="true">
            <section
              className="page"
              data-testid="peek-page"
              data-peek={peek}
            />
          </div>
        ) : null}
        <section className="page" data-testid="motion-page">
          {loading ? (
            <div className="ui-state-loading" role="status">
              Loading destination
            </div>
          ) : (
            <p data-testid="motion-reading">Shared content</p>
          )}
        </section>
      </main>
    </div>
  );
}

beforeEach(() => {
  // The motion layer reads its token roles from the root element.
  document.documentElement.style.setProperty('--duration-transition', '180ms');
  document.documentElement.style.setProperty(
    '--easing-standard',
    'cubic-bezier(0.2, 0, 0, 1)',
  );
  invalidateMotionTokens();
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 390,
  });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    value: 1,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: coarse)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--duration-transition');
  document.documentElement.style.removeProperty('--easing-standard');
  invalidateMotionTokens();
  document.body.style.overflow = '';
  vi.restoreAllMocks();
});

describe('primary tab slide feedback', () => {
  it('updates the page offsets without restarting the drag on successive frames', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
      frames.push(callback),
    );
    render(<PageMotionHarness onNavigate={vi.fn()} />);
    const surface = screen.getByTestId('motion-surface');
    const reading = screen.getByTestId('motion-reading');
    const markers = new MutationObserver(() => {});
    markers.observe(surface, {
      attributeFilter: ['data-primary-tab-dragging'],
    });
    act(() => touch(reading, 'touchstart', [point(280)]));
    for (const x of [230, 180, 130]) {
      act(() => {
        touch(reading, 'touchmove', [point(x + 5)]);
        touch(reading, 'touchmove', [point(x)]);
      });
      expect(frames).toHaveLength(1);
      act(() => frames.pop()?.(0));
      expect(surface.style.getPropertyValue('--primary-tab-offset')).toBe(
        `${x - 280}px`,
      );
      expect(markers.takeRecords()).toHaveLength(x === 230 ? 1 : 0);
    }
    markers.disconnect();
  });

  it('drags the page beside its neighbour and settles both before navigating', () => {
    const navigate = vi.fn();
    const frame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    const currentSettle = {
      cancel: vi.fn(),
      finish: vi.fn(),
      finished: pending(),
    } as unknown as Animation;
    const peekSettle = {
      cancel: vi.fn(),
      finish: vi.fn(),
      finished: pending(),
    } as unknown as Animation;
    const currentAnimate = vi.fn().mockReturnValue(currentSettle);
    const peekAnimate = vi.fn().mockReturnValue(peekSettle);
    const view = render(<PageMotionHarness onNavigate={navigate} />);
    const surface = screen.getByTestId('motion-surface');
    const page = screen.getByTestId('motion-page');
    surface.style.setProperty('--duration-transition', '.18s');
    Object.defineProperty(page, 'animate', {
      configurable: true,
      value: currentAnimate,
    });

    const reading = screen.getByTestId('motion-reading');
    act(() => {
      touch(reading, 'touchstart', [point(280)], undefined, 0);
      touch(reading, 'touchmove', [point(90)], undefined, 32);
    });
    // The page follows the finger one to one and the next tab travels beside it.
    expect(surface.getAttribute('data-primary-tab-dragging')).toBe('true');
    // The shell carries the moving state itself (no `:has()` on the surface).
    expect(screen.getByTestId('shell').hasAttribute('data-pages-moving')).toBe(
      true,
    );
    expect(surface.style.getPropertyValue('--primary-tab-offset')).toBe(
      '-190px',
    );
    expect(surface.style.getPropertyValue('--primary-tab-peek-offset')).toBe(
      '200px',
    );
    const peekPage = screen.getByTestId('peek-page');
    expect(peekPage.dataset.peek).toBe('/plan');
    Object.defineProperty(peekPage.parentElement, 'animate', {
      configurable: true,
      value: peekAnimate,
    });

    act(() => touch(reading, 'touchend', [], [point(90)], 64));
    // Both pages continue from the finger through the sampled settle spring;
    // the end state is applied first, so nothing is held with a fill.
    expect(navigate).not.toHaveBeenCalled();
    expect(surface.style.getPropertyValue('--primary-tab-offset')).toBe(
      '-390px',
    );
    const [currentFrames, currentOptions] = currentAnimate.mock.calls[0];
    expect(currentFrames[0]).toEqual({
      transform: 'translate3d(-190px, 0, 0)',
    });
    expect(currentFrames.at(-1)).toEqual({
      transform: 'translate3d(-390px, 0, 0)',
    });
    expect(currentFrames.length).toBeGreaterThan(2);
    expect(currentOptions).toEqual(
      expect.objectContaining({ easing: 'linear', fill: 'none' }),
    );
    expect(currentOptions.duration).toBeGreaterThan(0);
    const [peekFrames] = peekAnimate.mock.calls[0];
    expect(peekFrames[0]).toEqual({ transform: 'translate3d(200px, 0, 0)' });
    expect(peekFrames.at(-1)).toEqual({
      transform: 'translate3d(0px, 0, 0)',
    });
    expect(peekFrames).toHaveLength(currentFrames.length);
    for (const keyframe of [...currentFrames, ...peekFrames])
      expect(Object.keys(keyframe)).toEqual(['transform']);
    act(() => {
      currentSettle.onfinish?.call(
        currentSettle,
        new Event('finish') as AnimationPlaybackEvent,
      );
      peekSettle.onfinish?.call(
        peekSettle,
        new Event('finish') as AnimationPlaybackEvent,
      );
    });
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/plan');

    // The committed route replaces the pages without a second entry motion.
    view.rerender(<PageMotionHarness pathname="/plan" onNavigate={navigate} />);
    expect(currentAnimate).toHaveBeenCalledTimes(1);
    expect(surface.hasAttribute('data-primary-tab-dragging')).toBe(false);
    expect(surface.hasAttribute('data-navigation-slide')).toBe(false);
    expect(screen.getByTestId('shell').hasAttribute('data-pages-moving')).toBe(
      false,
    );
    expect(screen.queryByTestId('peek-page')).toBeNull();
    expect(currentSettle.cancel).toHaveBeenCalled();
    view.unmount();
    frame.mockRestore();
  });

  it('plays one haptic for a committed swipe, none for crossing the commit distance', () => {
    const backend = {
      selectionChanged: vi.fn(),
      impact: vi.fn(),
      notification: vi.fn(),
    };
    configureHapticsForTests({ native: true });
    registerHapticsBackend(backend);
    try {
      const onNavigate = vi.fn();
      render(<Harness onNavigate={onNavigate} />);
      const surface = screen.getByTestId('surface');
      touch(surface, 'touchstart', [point(280)]);
      touch(surface, 'touchmove', [point(200)]);
      touch(surface, 'touchmove', [point(60)]);
      expect(backend.selectionChanged).not.toHaveBeenCalled();
      touch(surface, 'touchend', [], [point(60)]);
      expect(backend.selectionChanged).not.toHaveBeenCalled();
      expect(backend.impact).toHaveBeenCalledExactlyOnceWith('light');
    } finally {
      registerHapticsBackend(null);
      configureHapticsForTests({});
    }
  });

  it('grabs a settling swipe where it is and continues it without a jump', () => {
    const navigate = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const settle = {
      cancel: vi.fn(),
      finish: vi.fn(),
      currentTime: 0,
      finished: pending(),
    } as unknown as Animation;
    render(<PageMotionHarness onNavigate={navigate} />);
    const surface = screen.getByTestId('motion-surface');
    const animate = vi.fn().mockReturnValue(settle);
    Object.defineProperty(screen.getByTestId('motion-page'), 'animate', {
      configurable: true,
      value: animate,
    });
    const reading = screen.getByTestId('motion-reading');
    act(() => {
      touch(reading, 'touchstart', [point(280)]);
      touch(reading, 'touchmove', [point(90)]);
      touch(reading, 'touchend', [], [point(90)]);
    });
    expect(navigate).not.toHaveBeenCalled();
    // The settle has not advanced yet: the pages stop where the finger left
    // them, and the new touch continues the same swipe from there.
    act(() => touch(reading, 'touchstart', [point(200)]));
    expect(settle.cancel).toHaveBeenCalled();
    expect(settle.finish).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(surface.style.getPropertyValue('--primary-tab-offset')).toBe(
      '-190px',
    );
    act(() => touch(reading, 'touchmove', [point(220)]));
    expect(surface.style.getPropertyValue('--primary-tab-offset')).toBe(
      '-170px',
    );
    act(() => touch(reading, 'touchend', [], [point(220)]));
    expect(animate).toHaveBeenCalledTimes(2);
    act(() =>
      settle.onfinish?.call(
        settle,
        new Event('finish') as AnimationPlaybackEvent,
      ),
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/plan');
  });

  it.each(['tap', 'scroll', 'pull'] as const)(
    'keeps a committed destination on a follow-up %s',
    (followUp) => {
      const navigate = vi.fn();
      render(<PageMotionHarness onNavigate={navigate} />);
      const animation = {
        currentTime: 0,
        cancel: vi.fn(),
        finished: pending(),
      };
      Object.defineProperty(screen.getByTestId('motion-page'), 'animate', {
        configurable: true,
        value: () => animation,
      });
      const target = screen.getByTestId('motion-reading');
      act(() => swipe(target));
      expect(navigate).not.toHaveBeenCalled();
      act(() => {
        touch(target, 'touchstart', [point(150)]);
        const y = followUp === 'pull' ? 280 : followUp === 'scroll' ? 120 : 200;
        if (followUp !== 'tap')
          expect(
            touch(target, 'touchmove', [point(150, y)]).defaultPrevented,
          ).toBe(false);
        touch(target, 'touchend', [], [point(150, y)]);
      });
      expect(navigate).toHaveBeenCalledExactlyOnceWith('/plan');
    },
  );

  it('keeps a cancelled reversal when the next contact is a tap', () => {
    const navigate = vi.fn();
    render(<PageMotionHarness onNavigate={navigate} />);
    Object.defineProperty(screen.getByTestId('motion-page'), 'animate', {
      configurable: true,
      value: () => ({ currentTime: 0, cancel: vi.fn(), finished: pending() }),
    });
    const target = screen.getByTestId('motion-reading');
    act(() => {
      touch(target, 'touchstart', [point(300)]);
      touch(target, 'touchmove', [point(60)]);
      touch(target, 'touchmove', [point(105)]);
      touch(target, 'touchend', [], [point(105)]);
      touch(target, 'touchstart', [point(150)]);
      touch(target, 'touchend', [], [point(150)]);
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(
      screen
        .getByTestId('motion-surface')
        .hasAttribute('data-primary-tab-dragging'),
    ).toBe(false);
  });

  it('applies edge resistance once when re-grabbing the outer page', () => {
    const navigate = vi.fn();
    render(<PageMotionHarness pathname="/today" onNavigate={navigate} />);
    Object.defineProperty(screen.getByTestId('motion-page'), 'animate', {
      configurable: true,
      value: () => ({ currentTime: 0, cancel: vi.fn(), finished: pending() }),
    });
    const target = screen.getByTestId('motion-reading');
    const surface = screen.getByTestId('motion-surface');
    act(() => swipe(target, 100, 220));
    act(() => touch(target, 'touchstart', [point(170)]));
    const offset = () =>
      Number.parseFloat(surface.style.getPropertyValue('--primary-tab-offset'));
    const initial = offset();
    expect(initial).toBeGreaterThan(0);
    let draw: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      draw = callback;
      return 1;
    });
    act(() => {
      touch(target, 'touchmove', [point(193)]);
      draw?.(0);
    });
    expect(offset()).toBeGreaterThan(initial);
    act(() => {
      touch(target, 'touchmove', [point(40)]);
      draw?.(0);
    });
    expect(offset()).toBe(initial - 130);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('cancels a swipe that reverses before release', () => {
    const navigate = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(<PageMotionHarness onNavigate={navigate} />);
    const reading = screen.getByTestId('motion-reading');
    act(() => {
      touch(reading, 'touchstart', [point(280)]);
      touch(reading, 'touchmove', [point(150)]);
      touch(reading, 'touchmove', [point(185)]);
      touch(reading, 'touchend', [], [point(185)]);
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('lets the last tab give a little instead of revealing a neighbour', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(<PageMotionHarness pathname="/today" onNavigate={vi.fn()} />);
    const surface = screen.getByTestId('motion-surface');
    const reading = screen.getByTestId('motion-reading');
    act(() => {
      touch(reading, 'touchstart', [point(90)]);
      touch(reading, 'touchmove', [point(290)]);
    });
    expect(surface.style.getPropertyValue('--primary-tab-offset')).toBe('48px');
    expect(screen.queryByTestId('peek-page')).toBeNull();
  });

  it.each([
    ['/today', '/story', 32],
    ['/story', '/today', -32],
    ['/today', '/more', 32],
    ['/more', '/plan', -32],
    ['/story/map', '/plan', 32],
    ['/more/notes', '/plan', -32],
  ])(
    'slides direct tab navigation from %s to %s by %spx',
    (from, to, offset) => {
      const navigate = vi.fn();
      const slide = {
        cancel: vi.fn(),
        finished: pending(),
      } as unknown as Animation;
      const view = render(
        <PageMotionHarness pathname={from} onNavigate={navigate} />,
      );
      const surface = screen.getByTestId('motion-surface');
      const page = screen.getByTestId('motion-page');
      const animate = vi.fn().mockReturnValue(slide);
      Object.defineProperty(page, 'animate', {
        configurable: true,
        value: animate,
      });
      view.rerender(<PageMotionHarness pathname={to} onNavigate={navigate} />);
      expect(animate).toHaveBeenCalledWith(
        [
          { transform: `translate3d(${offset}px, 0, 0)` },
          { transform: 'translate3d(0px, 0, 0)' },
        ],
        expect.objectContaining({ easing: expect.any(String) }),
      );
      expect(surface.dataset.navigationSlide).toBe('true');
      expect(surface.style.transform).toBe('');
    },
  );

  it('slides an incoming tab while loading, then reveals its content', async () => {
    const navigate = vi.fn();
    const view = render(<PageMotionHarness onNavigate={navigate} />);
    const surface = screen.getByTestId('motion-surface');
    const page = screen.getByTestId('motion-page');
    const slide = vi
      .fn()
      .mockReturnValue({ cancel: vi.fn(), finished: pending() });
    const fade = vi
      .fn()
      .mockReturnValue({ cancel: vi.fn(), finished: pending() });
    Object.defineProperty(page, 'animate', {
      configurable: true,
      value: slide,
    });
    Object.defineProperty(surface, 'animate', {
      configurable: true,
      value: fade,
    });

    view.rerender(
      <PageMotionHarness pathname="/plan" loading onNavigate={navigate} />,
    );
    expect(slide).toHaveBeenCalledTimes(1);
    expect(fade).not.toHaveBeenCalled();
    expect(surface.dataset.navigationSlide).toBe('true');

    view.rerender(<PageMotionHarness pathname="/plan" onNavigate={navigate} />);
    await waitFor(() => expect(fade).toHaveBeenCalledTimes(1));
    expect(surface.dataset.navigationMotion).toBe('content');
  });

  it('slides a deeper destination in from the inline end, and nothing when motion is reduced', () => {
    const navigate = vi.fn();
    const view = render(<PageMotionHarness onNavigate={navigate} />);
    const page = screen.getByTestId('motion-page');
    const animate = vi
      .fn()
      .mockReturnValue({ cancel: vi.fn(), finished: pending() });
    Object.defineProperty(page, 'animate', {
      configurable: true,
      value: animate,
    });
    view.rerender(
      <PageMotionHarness
        pathname="/story/memories/example"
        onNavigate={navigate}
      />,
    );
    // Motion Contract 4.2: forward arrives from the inline end.
    expect(animate).toHaveBeenCalledExactlyOnceWith(
      [{ left: '32px' }, { left: '0px' }],
      expect.objectContaining({ duration: 180 }),
    );

    animate.mockClear();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    view.rerender(<PageMotionHarness pathname="/plan" onNavigate={navigate} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('slides Back in from the inline start and a forward step from the inline end', () => {
    const navigate = vi.fn();
    const view = render(
      <PageMotionHarness
        pathname="/story/memories/example"
        onNavigate={navigate}
      />,
    );
    const page = screen.getByTestId('motion-page');
    const animate = vi
      .fn()
      .mockReturnValue({ cancel: vi.fn(), finished: pending() });
    Object.defineProperty(page, 'animate', {
      configurable: true,
      value: animate,
    });
    view.rerender(
      <PageMotionHarness pathname="/story" onNavigate={navigate} returning />,
    );
    expect(animate).toHaveBeenCalledWith(
      [{ left: '-32px' }, { left: '0px' }],
      expect.anything(),
    );

    animate.mockClear();
    view.rerender(
      <PageMotionHarness
        pathname="/story/memories/example"
        onNavigate={navigate}
      />,
    );
    expect(animate).toHaveBeenCalledExactlyOnceWith(
      [{ left: '32px' }, { left: '0px' }],
      expect.anything(),
    );
  });

  it('keeps a switch to a peer view of the same tab in place', () => {
    const navigate = vi.fn();
    const view = render(<PageMotionHarness onNavigate={navigate} />);
    const page = screen.getByTestId('motion-page');
    const animate = vi
      .fn()
      .mockReturnValue({ cancel: vi.fn(), finished: pending() });
    Object.defineProperty(page, 'animate', {
      configurable: true,
      value: animate,
    });
    view.rerender(
      <PageMotionHarness pathname="/story/map" onNavigate={navigate} />,
    );
    expect(animate).not.toHaveBeenCalled();
  });

  it('mirrors the direction in a right-to-left layout', () => {
    const navigate = vi.fn();
    const view = render(<PageMotionHarness onNavigate={navigate} />);
    const page = screen.getByTestId('motion-page');
    page.style.direction = 'rtl';
    const animate = vi
      .fn()
      .mockReturnValue({ cancel: vi.fn(), finished: pending() });
    Object.defineProperty(page, 'animate', {
      configurable: true,
      value: animate,
    });
    view.rerender(
      <PageMotionHarness
        pathname="/story/memories/example"
        onNavigate={navigate}
      />,
    );
    expect(animate).toHaveBeenCalledExactlyOnceWith(
      [{ left: '-32px' }, { left: '0px' }],
      expect.anything(),
    );
  });

  it('only fades the content for a change in place, such as a tab chosen from a detail', () => {
    const navigate = vi.fn();
    const view = render(
      <PageMotionHarness
        pathname="/story/memories/example"
        onNavigate={navigate}
      />,
    );
    const surface = screen.getByTestId('motion-surface');
    const page = screen.getByTestId('motion-page');
    const slide = vi
      .fn()
      .mockReturnValue({ cancel: vi.fn(), finished: pending() });
    const fade = vi
      .fn()
      .mockReturnValue({ cancel: vi.fn(), finished: pending() });
    Object.defineProperty(page, 'animate', {
      configurable: true,
      value: slide,
    });
    Object.defineProperty(surface, 'animate', {
      configurable: true,
      value: fade,
    });
    view.rerender(<PageMotionHarness pathname="/plan" onNavigate={navigate} />);
    expect(slide).not.toHaveBeenCalled();
    expect(surface.hasAttribute('data-navigation-slide')).toBe(false);
    expect(fade).toHaveBeenCalledExactlyOnceWith(
      [{ opacity: 0.92 }, { opacity: 1 }],
      expect.objectContaining({ duration: 180 }),
    );
  });

  it('settles a cancelled swipe back and releases the neighbour', () => {
    const navigate = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const animation = {
      cancel: vi.fn(),
      finish: vi.fn(),
      finished: pending(),
    } as unknown as Animation;
    const animate = vi.fn().mockReturnValue(animation);
    render(<PageMotionHarness onNavigate={navigate} />);
    const surface = screen.getByTestId('motion-surface');
    const page = screen.getByTestId('motion-page');
    Object.defineProperty(page, 'animate', {
      configurable: true,
      value: animate,
    });
    const reading = screen.getByTestId('motion-reading');
    act(() => {
      touch(reading, 'touchstart', [point(200)]);
      touch(reading, 'touchmove', [point(175)]);
      touch(reading, 'touchend', [], [point(175)]);
    });
    expect(navigate).not.toHaveBeenCalled();
    const [frames] = animate.mock.calls[0];
    expect(frames[0]).toEqual({ transform: 'translate3d(-25px, 0, 0)' });
    expect(frames.at(-1)).toEqual({ transform: 'translate3d(0px, 0, 0)' });
    expect(surface.style.transform).toBe('');
    act(() =>
      animation.onfinish?.call(
        animation,
        new Event('finish') as AnimationPlaybackEvent,
      ),
    );
    expect(surface.hasAttribute('data-primary-tab-dragging')).toBe(false);
    expect(screen.queryByTestId('peek-page')).toBeNull();
    expect(animation.cancel).toHaveBeenCalled();
  });
});

describe('primary tab swipe ownership', () => {
  it('leaves taps and vertical scrolling free of pager layout measurements', () => {
    render(<PageMotionHarness onNavigate={vi.fn()} />);
    const reading = screen.getByTestId('motion-reading');
    const styles = vi.spyOn(window, 'getComputedStyle');
    act(() => {
      touch(reading, 'touchstart', [point(180, 200)]);
      touch(reading, 'touchend', [], [point(180, 200)]);
      touch(reading, 'touchstart', [point(180, 200)]);
      touch(reading, 'touchmove', [point(181, 205)]);
      touch(reading, 'touchmove', [point(182, 90)]);
      touch(reading, 'touchend', [], [point(182, 90)]);
    });
    expect(styles).not.toHaveBeenCalled();
  });

  it('accepts another gesture as soon as a new destination commits', () => {
    const onNavigate = vi.fn();
    const view = render(
      <CommitProbe onNavigate={onNavigate} pathname="/story" />,
    );
    view.rerender(<CommitProbe onNavigate={onNavigate} pathname="/plan" />);
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/more/collections');
  });
  it('keeps a live reading surface interactive during rapid consecutive tab changes', () => {
    const navigate = vi.fn();
    const cancel = vi.fn();
    const animate = vi.fn(
      (_frames: Keyframe[], _options: KeyframeAnimationOptions) =>
        ({ cancel, finished: pending() }) as unknown as Animation,
    );
    const view = render(
      <Harness pathname="/story" routeKey="first" onNavigate={navigate} />,
    );
    const surface = screen.getByTestId('surface');
    surface.style.setProperty('--duration-transition', '.18s');
    Object.defineProperty(surface, 'animate', {
      configurable: true,
      value: animate,
    });
    view.rerender(
      <Harness pathname="/plan" routeKey="second" onNavigate={navigate} />,
    );
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: 180 });
    expect(surface.getAttribute('data-navigation-motion')).toBe('content');
    // No screenshot overlay owns input: the immediate next swipe uses the
    // same live main element and cancels its previous entrance animation.
    act(() => swipe(screen.getByTestId('reading')));
    expect(cancel).toHaveBeenCalled();
    expect(surface.hasAttribute('data-navigation-motion')).toBe(false);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/more/collections');
    view.rerender(
      <Harness
        pathname="/more/collections"
        routeKey="third"
        onNavigate={navigate}
      />,
    );
    // The swipe already travelled the pages; it does not replay an entrance.
    expect(animate).toHaveBeenCalledTimes(1);
    expect(surface.hasAttribute('data-navigation-motion')).toBe(false);
    view.unmount();
    expect(surface.hasAttribute('data-navigation-motion')).toBe(false);
  });

  it('releases motion bounds on completion without letting an older animation clear its replacement', () => {
    const first = {
      cancel: vi.fn(),
      finished: pending(),
    } as unknown as Animation;
    const second = {
      cancel: vi.fn(),
      finished: pending(),
    } as unknown as Animation;
    const animate = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const navigate = vi.fn();
    const view = render(<Harness pathname="/story" onNavigate={navigate} />);
    const surface = screen.getByTestId('surface');
    Object.defineProperty(surface, 'animate', {
      configurable: true,
      value: animate,
    });
    view.rerender(<Harness pathname="/plan" onNavigate={navigate} />);
    const oldComplete = first.onfinish;
    expect(oldComplete).toBeTypeOf('function');
    view.rerender(<Harness pathname="/more" onNavigate={navigate} />);
    expect(first.cancel).toHaveBeenCalled();
    act(() =>
      oldComplete?.call(first, new Event('finish') as AnimationPlaybackEvent),
    );
    expect(surface.getAttribute('data-navigation-motion')).toBe('content');
    act(() =>
      second.onfinish?.call(
        second,
        new Event('finish') as AnimationPlaybackEvent,
      ),
    );
    expect(surface.hasAttribute('data-navigation-motion')).toBe(false);
    expect(second.onfinish).toBeNull();
    expect(second.oncancel).toBeNull();
  });

  it.each([
    ['/today', 280, 90, '/story'],
    ['/story', 280, 90, '/plan'],
    ['/plan', 280, 90, '/more/collections'],
    ['/more/collections', 280, 90, '/more'],
    ['/more', 90, 280, '/more/collections'],
    ['/more/collections', 90, 280, '/plan'],
    ['/plan', 90, 280, '/story'],
    ['/story', 90, 280, '/today'],
    ['/story/map', 280, 90, '/plan'],
    ['/story/map', 90, 280, '/today'],
    ['/more/notes', 280, 90, '/more'],
    ['/more/notes', 90, 280, '/plan'],
  ])(
    'swipes %s to its adjacent tab %s → %s',
    (pathname, from, to, destination) => {
      const onNavigate = vi.fn();
      render(<Harness pathname={pathname} onNavigate={onNavigate} />);
      act(() => swipe(screen.getByTestId('reading'), from, to));
      expect(onNavigate).toHaveBeenCalledExactlyOnceWith(destination);
    },
  );

  it.each([
    ['/today', 90, 280],
    ['/more', 280, 90],
  ])('does not wrap from %s', (pathname, from, to) => {
    const onNavigate = vi.fn();
    render(<Harness pathname={pathname} onNavigate={onNavigate} />);
    act(() => swipe(screen.getByTestId('reading'), from, to));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each([
    '/story/memories/example',
    '/story/memories/new',
    '/more/settings',
    '/games',
    '/search',
  ])('does not route gestures from %s', (pathname) => {
    const onNavigate = vi.fn();
    render(<Harness pathname={pathname} onNavigate={onNavigate} />);
    act(() => swipe(screen.getByTestId('reading')));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('leaves vertical scrolling/pull-to-refresh owned by the vertical primitive', () => {
    const onNavigate = vi.fn();
    const onRefresh = vi.fn();
    render(<Harness onNavigate={onNavigate} onRefresh={onRefresh} />);
    const target = screen.getByTestId('reading');
    act(() => {
      touch(target, 'touchstart', [point(200, 100)]);
      touch(target, 'touchmove', [point(200, 200)]);
      touch(target, 'touchend', [], [point(200, 200)]);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each([
    ['/story/map', 'class', 'place-map-viewport'],
    ['/more/notes', 'role', 'tablist'],
  ])(
    'keeps local gestures on %s with their owner',
    (pathname, attribute, value) => {
      const onNavigate = vi.fn();
      render(<Harness pathname={pathname} onNavigate={onNavigate} />);
      const owner = screen.getByTestId('reading');
      owner.setAttribute(attribute, value);
      act(() => swipe(owner));
      expect(onNavigate).not.toHaveBeenCalled();
    },
  );

  it('never reclassifies a vertical-first drag as a tab swipe', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const target = screen.getByTestId('reading');
    act(() => {
      touch(target, 'touchstart', [point(280, 200)]);
      touch(target, 'touchmove', [point(278, 160)]);
      touch(target, 'touchmove', [point(90, 155)]);
      touch(target, 'touchend', [], [point(90, 155)]);
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does not refresh during a horizontal swipe', () => {
    const onNavigate = vi.fn();
    const onRefresh = vi.fn();
    render(<Harness onNavigate={onNavigate} onRefresh={onRefresh} />);
    act(() => swipe(screen.getByTestId('reading')));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/plan');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('leaves galleries and native horizontal scrollers owned even at either end', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const scroller = screen.getByTestId('scroller');
    Object.defineProperties(scroller, {
      scrollWidth: { value: 600 },
      clientWidth: { value: 200 },
    });
    act(() => {
      swipe(screen.getByTestId('gallery'));
      swipe(scroller.firstChild ?? scroller);
      scroller.scrollLeft = 400;
      swipe(scroller.firstChild ?? scroller, 90, 280);
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('keeps a horizontal content region owned even when every item fits', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const scroller = screen.getByTestId('scroller');
    Object.defineProperties(scroller, {
      scrollWidth: { value: 200 },
      clientWidth: { value: 200 },
    });
    act(() => {
      swipe(scroller.firstChild ?? scroller);
      swipe(scroller.firstChild ?? scroller, 90, 280);
    });
    expect(onNavigate).not.toHaveBeenCalled();
    act(() => swipe(screen.getByTestId('reading')));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/plan');
  });

  it('preserves a dirty document owner after its field loses focus', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} dirty />);
    act(() => swipe(screen.getByTestId('reading')));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('allows horizontal root navigation inside a vertical-only scroller', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const scroller = screen.getByTestId('scroller');
    scroller.style.overflowY = 'auto';
    Object.defineProperties(scroller, {
      scrollWidth: { value: 200 },
      clientWidth: { value: 200 },
      scrollHeight: { value: 800 },
      clientHeight: { value: 200 },
    });
    act(() => swipe(scroller.firstChild ?? scroller));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/plan');
  });

  it('accepts a deliberate horizontal drag over a simple button without activating it', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const button = screen.getByRole('button');
    const action = vi.fn();
    button.addEventListener('click', action);
    act(() => swipe(button));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/plan');
    fireEvent.click(button, { detail: 1 });
    expect(action).not.toHaveBeenCalled();
  });

  it('cancels if a dirty owner appears during a gesture', () => {
    const onNavigate = vi.fn();
    const view = render(<Harness onNavigate={onNavigate} />);
    const target = screen.getByTestId('reading');
    act(() => {
      touch(target, 'touchstart', [point(280)]);
      touch(target, 'touchmove', [point(90)]);
    });
    view.rerender(<Harness onNavigate={onNavigate} dirty />);
    act(() => touch(target, 'touchend', [], [point(90)]));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('releases the page when a menu opens during a swipe', async () => {
    const navigate = vi.fn();
    const { container } = render(<PageMotionHarness onNavigate={navigate} />);
    const reading = screen.getByTestId('motion-reading');
    act(() => {
      touch(reading, 'touchstart', [point(280)]);
      touch(reading, 'touchmove', [point(90)]);
    });
    expect(screen.getByTestId('peek-page')).toBeTruthy();
    const menu = document.createElement('div');
    await act(async () => {
      container.append(menu);
      menu.setAttribute('role', 'menu');
    });
    expect(screen.queryByTestId('peek-page')).toBeNull();
    menu.remove();
    act(() => touch(reading, 'touchend', [], [point(90)]));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('protects controls and keeps an active draft safe when a swipe starts elsewhere', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    act(() => {
      swipe(screen.getByRole('textbox'));
      screen.getByRole('textbox').focus();
      swipe(screen.getByTestId('reading'));
    });
    expect(onNavigate).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(
      'Keep these words',
    );
  });

  it.each(['dialog', 'menu'])(
    'protects an open %s even for touches on the underlying page',
    (role) => {
      const onNavigate = vi.fn();
      const view = render(<Harness onNavigate={onNavigate} />);
      const overlay = document.createElement('div');
      overlay.setAttribute('role', role);
      if (role === 'dialog') overlay.setAttribute('aria-modal', 'true');
      view.container.append(overlay);
      act(() => swipe(screen.getByTestId('reading')));
      expect(onNavigate).not.toHaveBeenCalled();
    },
  );

  it.each([
    [5, 180],
    [385, 190],
  ])('leaves system edge gestures starting at %s alone', (from, to) => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    act(() => swipe(screen.getByTestId('reading'), from, to));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('cancels multitouch even when the second finger lands outside main', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const target = screen.getByTestId('reading');
    act(() => {
      touch(target, 'touchstart', [point(280)]);
      touch(document.body, 'touchstart', [point(280), point(320, 240, 2)]);
      touch(target, 'touchmove', [point(90)]);
      touch(target, 'touchend', [], [point(90)]);
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each(['touchcancel', 'visibilitychange', 'blur', 'contextmenu'])(
    'cancels on %s',
    (type) => {
      const onNavigate = vi.fn();
      render(<Harness onNavigate={onNavigate} />);
      const target = screen.getByTestId('reading');
      act(() => {
        touch(target, 'touchstart', [point(280)]);
        touch(target, 'touchmove', [point(90)]);
        if (type === 'touchcancel') touch(target, type, []);
        else if (type === 'contextmenu')
          target.dispatchEvent(new Event(type, { bubbles: true }));
        else
          (type === 'blur' ? window : document).dispatchEvent(new Event(type));
        touch(target, 'touchend', [], [point(90)]);
      });
      expect(onNavigate).not.toHaveBeenCalled();
    },
  );

  it('cancels if the document scrolls or a route changes mid-gesture', () => {
    const onNavigate = vi.fn();
    const view = render(<Harness onNavigate={onNavigate} />);
    const target = screen.getByTestId('reading');
    act(() => {
      touch(target, 'touchstart', [point(280)]);
      Object.defineProperty(window, 'scrollY', { value: 90 });
      touch(target, 'touchmove', [point(90)]);
      touch(target, 'touchend', [], [point(90)]);
      touch(target, 'touchstart', [point(280)]);
    });
    view.rerender(<Harness routeKey="changed" onNavigate={onNavigate} />);
    act(() => {
      touch(target, 'touchmove', [point(90)]);
      touch(target, 'touchend', [], [point(90)]);
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('suppresses a drag click on content links, including a sub-threshold cancelled swipe', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const card = screen.getByTestId('card');
    act(() => swipe(card, 200, 175));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(fireEvent.click(card, { detail: 1 })).toBe(false);
    const click = vi.fn((event: Event) => event.preventDefault());
    card.addEventListener('click', click);
    fireEvent.pointerDown(card);
    fireEvent.click(card, { detail: 1 });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('keeps the pages still and navigates immediately when motion is reduced', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const animate = vi.fn();
    const navigate = vi.fn();
    render(<PageMotionHarness onNavigate={navigate} />);
    Object.defineProperty(screen.getByTestId('motion-page'), 'animate', {
      configurable: true,
      value: animate,
    });
    act(() => swipe(screen.getByTestId('motion-reading'), 280, 90));
    expect(screen.queryByTestId('peek-page')).toBeNull();
    expect(animate).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/plan');
  });

  it('uses the current navigation callback and keeps reduced-motion navigation immediate', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const oldNavigate = vi.fn();
    const onNavigate = vi.fn();
    const view = render(<Harness onNavigate={oldNavigate} />);
    view.rerender(<Harness onNavigate={onNavigate} />);
    act(() => swipe(screen.getByTestId('reading')));
    view.rerender(<Harness pathname="/plan" onNavigate={onNavigate} />);
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/plan');
    expect(oldNavigate).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('surface').hasAttribute('data-navigation-motion'),
    ).toBe(false);
  });
});
