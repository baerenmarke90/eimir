// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentLeaveGuard } from '../client/useDocumentLeaveGuard';
import { usePrimaryTabSwipe } from './usePrimaryTabSwipe';
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
  usePrimaryTabSwipe({ surfaceRef: ref, pathname, routeKey, onNavigate });
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

describe('primary tab swipe ownership', () => {
  it('accepts another gesture as soon as a new destination commits', () => {
    const onNavigate = vi.fn();
    function CommitProbe({ pathname }: { pathname: string }) {
      const ref = useRef<HTMLElement>(null);
      usePrimaryTabSwipe({
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
    Object.defineProperty(surface, 'animate', {
      configurable: true,
      value: animate,
    });
    view.rerender(
      <Harness pathname="/plan" routeKey="second" onNavigate={navigate} />,
    );
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: 180 });
    expect(surface.getAttribute('data-primary-tab-animating')).toBe('true');
    // No screenshot overlay owns input: the immediate next swipe uses the
    // same live main element and cancels its previous entrance animation.
    act(() => swipe(screen.getByTestId('reading')));
    expect(cancel).toHaveBeenCalled();
    expect(surface.hasAttribute('data-primary-tab-animating')).toBe(false);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/more');
    view.rerender(
      <Harness pathname="/more" routeKey="third" onNavigate={navigate} />,
    );
    expect(animate).toHaveBeenCalledTimes(2);
    expect(surface.getAttribute('data-primary-tab-animating')).toBe('true');
    view.unmount();
    expect(surface.hasAttribute('data-primary-tab-animating')).toBe(false);
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
    expect(surface.getAttribute('data-primary-tab-animating')).toBe('true');
    act(() =>
      second.onfinish?.call(
        second,
        new Event('finish') as AnimationPlaybackEvent,
      ),
    );
    expect(surface.hasAttribute('data-primary-tab-animating')).toBe(false);
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

  it('bounds snap-back motion and cancels it when reduced motion becomes active', () => {
    const media = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    window.matchMedia = vi.fn().mockReturnValue(media);
    const animation = { cancel: vi.fn() } as unknown as Animation;
    const navigate = vi.fn();
    render(<Harness onNavigate={navigate} />);
    const surface = screen.getByTestId('surface');
    Object.defineProperty(surface, 'animate', {
      configurable: true,
      value: vi.fn().mockReturnValue(animation),
    });
    act(() => swipe(screen.getByTestId('reading'), 200, 225));
    expect(navigate).not.toHaveBeenCalled();
    expect(surface.getAttribute('data-primary-tab-animating')).toBe('true');
    const changed = media.addEventListener.mock.calls.find(
      ([type]) => type === 'change',
    )?.[1];
    expect(changed).toBeTypeOf('function');
    media.matches = true;
    act(() => changed());
    expect(animation.cancel).toHaveBeenCalled();
    expect(surface.hasAttribute('data-primary-tab-animating')).toBe(false);
    expect(media.removeEventListener).toHaveBeenCalledWith('change', changed);
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
      screen.getByTestId('surface').hasAttribute('data-primary-tab-entry'),
    ).toBe(false);
  });
});
