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
import { useNavigationMotion } from './useNavigationMotion';
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
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: points },
    changedTouches: { value: changed },
  });
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
}: {
  pathname?: string;
  onNavigate: (path: string) => void;
  loading?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const peek = usePrimaryTabPeek();
  useNavigationMotion({
    surfaceRef: ref,
    pathname,
    routeKey: pathname,
    onNavigate,
  });
  return (
    <main ref={ref} data-testid="motion-surface">
      {peek ? (
        <div className="primary-tab-panel" data-primary-tab-peek="true">
          <section className="page" data-testid="peek-page" data-peek={peek} />
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
  );
}

beforeEach(() => {
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
  document.body.style.overflow = '';
  vi.restoreAllMocks();
});

describe('primary tab slide feedback', () => {
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
    } as unknown as Animation;
    const peekSettle = {
      cancel: vi.fn(),
      finish: vi.fn(),
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
      touch(reading, 'touchstart', [point(280)]);
      touch(reading, 'touchmove', [point(90)]);
    });
    // The page follows the finger one to one and the next tab travels beside it.
    expect(surface.getAttribute('data-primary-tab-dragging')).toBe('true');
    expect(surface.style.getPropertyValue('--primary-tab-offset')).toBe(
      '-190px',
    );
    expect(surface.style.getPropertyValue('--primary-tab-peek-offset')).toBe(
      '200px',
    );
    const peekPage = screen.getByTestId('peek-page');
    expect(peekPage.dataset.peek).toBe('/plan');
    Object.defineProperty(peekPage, 'animate', {
      configurable: true,
      value: peekAnimate,
    });

    act(() => touch(reading, 'touchend', [], [point(90)]));
    // Both pages finish their travel first; the route follows the settle.
    expect(navigate).not.toHaveBeenCalled();
    expect(currentAnimate).toHaveBeenCalledWith(
      [
        { transform: 'translate3d(-190px, 0, 0)' },
        { transform: 'translate3d(-390px, 0, 0)' },
      ],
      expect.objectContaining({ duration: 180, fill: 'forwards' }),
    );
    expect(peekAnimate).toHaveBeenCalledWith(
      [
        { transform: 'translate3d(200px, 0, 0)' },
        { transform: 'translate3d(0px, 0, 0)' },
      ],
      expect.objectContaining({ duration: 180, fill: 'forwards' }),
    );
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
    expect(screen.queryByTestId('peek-page')).toBeNull();
    expect(currentSettle.cancel).toHaveBeenCalled();
    view.unmount();
    frame.mockRestore();
  });

  it('settles at once when a second touch interrupts a committing swipe', () => {
    const navigate = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const settle = { cancel: vi.fn(), finish: vi.fn() } as unknown as Animation;
    render(<PageMotionHarness onNavigate={navigate} />);
    Object.defineProperty(screen.getByTestId('motion-page'), 'animate', {
      configurable: true,
      value: vi.fn().mockReturnValue(settle),
    });
    const reading = screen.getByTestId('motion-reading');
    act(() => {
      touch(reading, 'touchstart', [point(280)]);
      touch(reading, 'touchmove', [point(90)]);
      touch(reading, 'touchend', [], [point(90)]);
    });
    expect(navigate).not.toHaveBeenCalled();
    act(() => touch(reading, 'touchstart', [point(200)]));
    expect(settle.finish).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/plan');
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
  ])(
    'slides direct tab navigation from %s to %s by %spx',
    (from, to, offset) => {
      const navigate = vi.fn();
      const slide = { cancel: vi.fn() } as unknown as Animation;
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
          { transform: 'translate3d(0, 0, 0)' },
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
    const slide = vi.fn().mockReturnValue({ cancel: vi.fn() });
    const fade = vi.fn().mockReturnValue({ cancel: vi.fn() });
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

  it('does not slide a nested destination or animate when motion is reduced', () => {
    const navigate = vi.fn();
    const view = render(<PageMotionHarness onNavigate={navigate} />);
    const page = screen.getByTestId('motion-page');
    const animate = vi.fn().mockReturnValue({ cancel: vi.fn() });
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
    expect(animate).not.toHaveBeenCalled();

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    view.rerender(<PageMotionHarness pathname="/plan" onNavigate={navigate} />);
    expect(animate).not.toHaveBeenCalled();
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
    expect(animate).toHaveBeenCalledWith(
      [
        { transform: 'translate3d(-25px, 0, 0)' },
        { transform: 'translate3d(0px, 0, 0)' },
      ],
      expect.anything(),
    );
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
  it('accepts another gesture as soon as a new destination commits', () => {
    const onNavigate = vi.fn();
    function CommitProbe({ pathname }: { pathname: string }) {
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
    const view = render(<CommitProbe pathname="/story" />);
    view.rerender(<CommitProbe pathname="/plan" />);
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/more');
  });
  it('keeps a live reading surface interactive during rapid consecutive tab changes', () => {
    const navigate = vi.fn();
    const cancel = vi.fn();
    const animate = vi.fn(
      (_frames: Keyframe[], _options: KeyframeAnimationOptions) =>
        ({ cancel }) as unknown as Animation,
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
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/more');
    view.rerender(
      <Harness pathname="/more" routeKey="third" onNavigate={navigate} />,
    );
    // The swipe already travelled the pages; it does not replay an entrance.
    expect(animate).toHaveBeenCalledTimes(1);
    expect(surface.hasAttribute('data-navigation-motion')).toBe(false);
    view.unmount();
    expect(surface.hasAttribute('data-navigation-motion')).toBe(false);
  });

  it('releases motion bounds on completion without letting an older animation clear its replacement', () => {
    const first = { cancel: vi.fn() } as unknown as Animation;
    const second = { cancel: vi.fn() } as unknown as Animation;
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
    ['/plan', 280, 90, '/more'],
    ['/more', 90, 280, '/plan'],
    ['/plan', 90, 280, '/story'],
    ['/story', 90, 280, '/today'],
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
