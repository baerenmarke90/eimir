// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePullToRefresh } from './usePullToRefresh';

function setScrollTop(value: number) {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value,
  });
  if (document.scrollingElement) document.scrollingElement.scrollTop = value;
}

function touchEvent(type: string, y?: number): TouchEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as TouchEvent;
  Object.defineProperty(event, 'touches', {
    configurable: true,
    value: y === undefined ? [] : [{ clientY: y }],
  });
  return event;
}

function dispatchTouch(type: string, y?: number): TouchEvent {
  const event = touchEvent(type, y);
  document.dispatchEvent(event);
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
  document.documentElement.classList.remove('story-pull-refresh-enabled');
  vi.restoreAllMocks();
});

describe('usePullToRefresh', () => {
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
      document.documentElement.classList.contains('story-pull-refresh-enabled'),
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

  it('does nothing while another timeline fetch is blocking the gesture', () => {
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
});
