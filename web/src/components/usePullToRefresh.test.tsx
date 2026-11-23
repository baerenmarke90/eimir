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

beforeEach(() => {
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

  it('does nothing while another surface fetch is blocking the gesture', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      usePullToRefresh({ enabled: true, blocked: true, onRefresh }),
    );

    act(() => {
      dispatchTouch('touchstart', 100);
      dispatchTouch('touchmove', 220);
      dispatchTouch('touchend');
    });
    expect(onRefresh).not.toHaveBeenCalled();
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
