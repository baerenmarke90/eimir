// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureHapticsForTests,
  type HapticsBackend,
  registerHapticsBackend,
} from '../motion/haptics';
import { usePullToRefresh } from './usePullToRefresh';

function setScrollTop(value: number) {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value,
  });
  if (document.scrollingElement) document.scrollingElement.scrollTop = value;
}

function touchEvent(type: string, y?: number, x = 0): TouchEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as TouchEvent;
  Object.defineProperty(event, 'touches', {
    configurable: true,
    value: y === undefined ? [] : [{ clientX: x, clientY: y }],
  });
  return event;
}

function dispatchTouch(
  type: string,
  y?: number,
  x = 0,
  target: EventTarget = document,
): TouchEvent {
  const event = touchEvent(type, y, x);
  target.dispatchEvent(event);
  return event;
}

/** The indicator's resting offset below the top of its clip, in px. */
function offsetOf(disc: HTMLElement): number {
  const match = /calc\((?:([-\d.]+)px - 100%|-100% \+ ([-\d.]+)px)\)/.exec(
    disc.style.transform,
  );
  if (!match) throw new Error(`No offset in "${disc.style.transform}"`);
  return Number(match[1] ?? match[2]);
}

function attachDisc(ref: (element: HTMLElement | null) => void): HTMLElement {
  const disc = document.createElement('span');
  document.body.append(disc);
  act(() => ref(disc));
  return disc;
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    value: 1,
  });
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  setScrollTop(0);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('app-pull-refresh-enabled');
  vi.restoreAllMocks();
});

describe('usePullToRefresh', () => {
  it('checks nested scroll layout only once a downward gesture could refresh', () => {
    const onRefresh = vi.fn();
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    Object.defineProperty(scroller, 'scrollHeight', { value: 200 });
    Object.defineProperty(scroller, 'clientHeight', { value: 100 });
    const target = scroller.appendChild(document.createElement('span'));
    document.body.append(scroller);
    renderHook(() =>
      usePullToRefresh({ enabled: true, blocked: false, onRefresh }),
    );
    const style = vi.spyOn(window, 'getComputedStyle');
    act(() => {
      dispatchTouch('touchstart', 100, 100, target);
      dispatchTouch('touchend', undefined, 100, target);
      dispatchTouch('touchstart', 100, 100, target);
      dispatchTouch('touchmove', 108, 180, target);
      dispatchTouch('touchend', undefined, 180, target);
    });
    expect(style).not.toHaveBeenCalled();
    act(() => {
      dispatchTouch('touchstart', 100, 100, target);
      const move = dispatchTouch('touchmove', 190, 100, target);
      expect(move.defaultPrevented).toBe(false);
      dispatchTouch('touchend', undefined, 100, target);
    });
    expect(style).toHaveBeenCalledWith(scroller);
    expect(onRefresh).not.toHaveBeenCalled();
    scroller.remove();
  });

  it('does not refresh for ordinary scrolling or a pull below the threshold', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      usePullToRefresh({ enabled: true, blocked: false, onRefresh }),
    );

    act(() => {
      dispatchTouch('touchstart', 100);
      dispatchTouch('touchmove', 150);
      dispatchTouch('touchend');
    });
    expect(onRefresh).not.toHaveBeenCalled();

    setScrollTop(20);
    act(() => {
      dispatchTouch('touchstart', 100);
      dispatchTouch('touchmove', 210);
      dispatchTouch('touchend');
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('refreshes once after a deliberate top-edge pull and suppresses browser overscroll', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePullToRefresh({ enabled: true, blocked: false, onRefresh }),
    );

    let browserRefreshSuppressed = false;
    act(() => {
      dispatchTouch('touchstart', 100);
      const moveEvent = dispatchTouch('touchmove', 190);
      browserRefreshSuppressed = moveEvent.defaultPrevented;
    });

    expect(browserRefreshSuppressed).toBe(true);
    expect(result.current.ready).toBe(true);

    await act(async () => {
      dispatchTouch('touchend');
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(
      document.documentElement.classList.contains('app-pull-refresh-enabled'),
    ).toBe(true);
  });

  it('keeps a single refresh in flight across repeated gestures', async () => {
    let resolveRefresh: (() => void) | undefined;
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const { result } = renderHook(() =>
      usePullToRefresh({ enabled: true, blocked: false, onRefresh }),
    );

    act(() => {
      dispatchTouch('touchstart', 100);
      dispatchTouch('touchmove', 190);
      dispatchTouch('touchend');
    });
    expect(result.current.refreshing).toBe(true);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    act(() => {
      dispatchTouch('touchstart', 100);
      dispatchTouch('touchmove', 210);
      dispatchTouch('touchend');
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRefresh?.();
      await Promise.resolve();
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('cancels a horizontal gesture before it can become a refresh', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      usePullToRefresh({ enabled: true, blocked: false, onRefresh }),
    );

    act(() => {
      dispatchTouch('touchstart', 100, 100);
      dispatchTouch('touchmove', 112, 180);
      dispatchTouch('touchend');
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores gestures that begin on form controls', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      usePullToRefresh({ enabled: true, blocked: false, onRefresh }),
    );
    const button = document.createElement('input');
    document.body.append(button);

    act(() => {
      dispatchTouch('touchstart', 100, 0, button);
      dispatchTouch('touchmove', 220, 0, button);
      dispatchTouch('touchend', undefined, 0, button);
    });

    expect(onRefresh).not.toHaveBeenCalled();
    button.remove();
  });

  it('keeps the pull alive while another fetch runs and starts the refresh when it ends', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ blocked }) => usePullToRefresh({ enabled: true, blocked, onRefresh }),
      { initialProps: { blocked: true } },
    );

    act(() => {
      dispatchTouch('touchstart', 100);
      dispatchTouch('touchmove', 190);
    });
    // The person sees the pull follow their finger, not a dead surface.
    expect(result.current.ready).toBe(true);

    act(() => {
      dispatchTouch('touchend');
    });
    expect(result.current.refreshing).toBe(true);
    expect(onRefresh).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ blocked: false });
      await Promise.resolve();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(false);
  });

  it('does not lose the pull when a fetch starts in the middle of it', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ blocked }) => usePullToRefresh({ enabled: true, blocked, onRefresh }),
      { initialProps: { blocked: false } },
    );
    act(() => {
      dispatchTouch('touchstart', 100);
      dispatchTouch('touchmove', 150);
    });
    rerender({ blocked: true });
    act(() => {
      dispatchTouch('touchmove', 190);
    });
    expect(result.current.ready).toBe(true);
  });

  it('refreshes after a bounded wait when a fetch never ends', async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      usePullToRefresh({ enabled: true, blocked: true, onRefresh }),
    );
    act(() => {
      dispatchTouch('touchstart', 100);
      dispatchTouch('touchmove', 190);
      dispatchTouch('touchend');
    });
    expect(onRefresh).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  describe('indicator motion', () => {
    it('moves the disc by transform, fully shown exactly at the commit distance', () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          enabled: true,
          blocked: false,
          onRefresh: vi.fn(),
        }),
      );
      const disc = attachDisc(result.current.indicatorRef);
      act(() => {
        dispatchTouch('touchstart', 100);
        dispatchTouch('touchmove', 100 + 72);
      });
      // Half the finger travel, which is the disc's own height at 72 px.
      expect(offsetOf(disc)).toBe(36);
      expect(result.current.ready).toBe(true);
      expect(disc.style.opacity).toBe('1');
    });

    it('gives way with resistance instead of stopping hard', () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          enabled: true,
          blocked: false,
          onRefresh: vi.fn(),
        }),
      );
      const disc = attachDisc(result.current.indicatorRef);
      act(() => {
        dispatchTouch('touchstart', 100);
        dispatchTouch('touchmove', 100 + 140);
      });
      const first = offsetOf(disc);
      act(() => {
        dispatchTouch('touchmove', 100 + 200);
      });
      const second = offsetOf(disc);
      expect(first).toBeGreaterThan(64);
      expect(second).toBeGreaterThan(first);
      expect(second).toBeLessThan(64 + 48 + 0.001);
    });

    it('returns the disc to rest when released short of the commit distance', () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          enabled: true,
          blocked: false,
          onRefresh: vi.fn(),
        }),
      );
      const disc = attachDisc(result.current.indicatorRef);
      act(() => {
        dispatchTouch('touchstart', 100);
        dispatchTouch('touchmove', 150);
      });
      expect(offsetOf(disc)).toBe(25);
      act(() => {
        dispatchTouch('touchend');
      });
      expect(offsetOf(disc)).toBe(0);
      expect(disc.style.opacity).toBe('0');
    });

    it('holds the disc at its resting place while refreshing and hides it after', async () => {
      let resolveRefresh: (() => void) | undefined;
      const onRefresh = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveRefresh = resolve;
          }),
      );
      const { result } = renderHook(() =>
        usePullToRefresh({ enabled: true, blocked: false, onRefresh }),
      );
      const disc = attachDisc(result.current.indicatorRef);
      act(() => {
        dispatchTouch('touchstart', 100);
        dispatchTouch('touchmove', 100 + 110);
        dispatchTouch('touchend');
      });
      expect(result.current.refreshing).toBe(true);
      expect(offsetOf(disc)).toBe(36);
      await act(async () => {
        resolveRefresh?.();
        await Promise.resolve();
      });
      expect(result.current.refreshing).toBe(false);
      expect(offsetOf(disc)).toBe(0);
    });

    function stubAnimate(disc: HTMLElement) {
      const animate = vi.fn((_keyframes: Keyframe[]) => ({
        finished: new Promise<void>(() => {}),
        currentTime: 0,
        cancel: vi.fn(),
        commitStyles: vi.fn(),
      }));
      Object.defineProperty(disc, 'animate', {
        configurable: true,
        value: animate,
      });
      return animate;
    }

    it('settles back on the shared spring from where the finger left it', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('pointer: coarse'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      const { result } = renderHook(() =>
        usePullToRefresh({
          enabled: true,
          blocked: false,
          onRefresh: vi.fn(),
        }),
      );
      const disc = attachDisc(result.current.indicatorRef);
      const animate = stubAnimate(disc);
      act(() => {
        dispatchTouch('touchstart', 100);
        dispatchTouch('touchmove', 150);
        dispatchTouch('touchend');
      });
      expect(animate).toHaveBeenCalledTimes(1);
      const frames = animate.mock.calls[0][0];
      expect(String(frames[0].transform)).toContain('calc(25px - 100%)');
      expect(String(frames.at(-1)?.transform)).toContain('calc(0px - 100%)');
      expect(frames.length).toBeGreaterThan(3);
      // The element's own style is already the end state: nothing is held.
      expect(offsetOf(disc)).toBe(0);
    });

    it('lands at once with reduced motion', () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          enabled: true,
          blocked: false,
          onRefresh: vi.fn(),
        }),
      );
      const disc = attachDisc(result.current.indicatorRef);
      const animate = stubAnimate(disc);
      act(() => {
        dispatchTouch('touchstart', 100);
        dispatchTouch('touchmove', 150);
        dispatchTouch('touchend');
      });
      expect(animate).not.toHaveBeenCalled();
      expect(offsetOf(disc)).toBe(0);
    });
  });

  it.each(['a', 'button'])(
    'refreshes from a content %s without activating it and keeps ordinary taps working',
    async (tag) => {
      const refresh = vi.fn().mockResolvedValue(undefined);
      const activate = vi.fn();
      const target = document.createElement(tag);
      document.body.append(target);
      target.addEventListener('click', activate);
      renderHook(() =>
        usePullToRefresh({ enabled: true, blocked: false, onRefresh: refresh }),
      );
      await act(async () => {
        dispatchTouch('touchstart', 100, 100, target);
        dispatchTouch('touchmove', 200, 100, target);
        dispatchTouch('touchend', undefined, 100, target);
      });
      const trailingClick = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      });
      target.dispatchEvent(trailingClick);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(trailingClick.defaultPrevented).toBe(true);
      expect(activate).not.toHaveBeenCalled();
      act(() => {
        dispatchTouch('touchstart', 100, 100, target);
        dispatchTouch('touchend', undefined, 100, target);
      });
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 1 }),
      );
      expect(activate).toHaveBeenCalledTimes(1);
      target.remove();
    },
  );

  it.each([
    '<form><button>Save</button></form>',
    '<div class="place-map-viewport"><button>Map</button></div>',
    '<section role="dialog" aria-modal="true"><button>Pick</button></section>',
  ])('leaves owned gestures alone: %s', (html) => {
    const refresh = vi.fn();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.append(wrapper);
    const target = wrapper.querySelector('button')!;
    renderHook(() =>
      usePullToRefresh({ enabled: true, blocked: false, onRefresh: refresh }),
    );
    act(() => {
      dispatchTouch('touchstart', 100, 100, target);
      dispatchTouch('touchmove', 200, 100, target);
      dispatchTouch('touchend', undefined, 100, target);
    });
    expect(refresh).not.toHaveBeenCalled();
    wrapper.remove();
  });

  it('cancels a pull that reverses before release, and ticks at the threshold (#2076)', async () => {
    const backend: HapticsBackend = {
      selectionChanged: vi.fn(),
      impact: vi.fn(),
      notification: vi.fn(),
    };
    let now = 0;
    configureHapticsForTests({ native: true, now: () => (now += 1000) });
    registerHapticsBackend(backend);
    try {
      const onRefresh = vi.fn().mockResolvedValue(undefined);
      renderHook(() =>
        usePullToRefresh({ enabled: true, blocked: false, onRefresh }),
      );
      act(() => {
        dispatchTouch('touchstart', 100);
        dispatchTouch('touchmove', 200);
        // Back by more than the reversal slop, though still past 72 px.
        dispatchTouch('touchmove', 175);
        dispatchTouch('touchend');
      });
      expect(onRefresh).not.toHaveBeenCalled();
      expect(backend.selectionChanged).toHaveBeenCalledTimes(1);
      expect(backend.impact).not.toHaveBeenCalled();

      await act(async () => {
        dispatchTouch('touchstart', 100);
        dispatchTouch('touchmove', 190);
        dispatchTouch('touchend');
        await Promise.resolve();
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(backend.impact).toHaveBeenCalledWith('light');
    } finally {
      registerHapticsBackend(null);
      configureHapticsForTests({});
    }
  });
});
