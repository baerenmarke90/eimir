// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storyReadingDuration, useStoryPlayback } from './useStoryPlayback';

let reduce = false;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  reduce = false;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
});
const initial = (onAdvance = vi.fn()) => ({
  pageKey: 'cover',
  duration: 6000,
  ready: true,
  blocked: false,
  autoStart: true,
  onAdvance,
});

describe('finite story playback', () => {
  it('preserves remaining reading time across an explicit pause', () => {
    const props = initial();
    const { result } = renderHook(() => useStoryPlayback(props));
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(20000));
    expect(props.onAdvance).not.toHaveBeenCalled();
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(3999));
    expect(props.onAdvance).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(props.onAdvance).toHaveBeenCalledOnce();
  });
  it('waits for media and resets dwell time for each new page', () => {
    const props = { ...initial(), ready: false };
    const { rerender } = renderHook((value) => useStoryPlayback(value), {
      initialProps: props,
    });
    act(() => vi.advanceTimersByTime(30000));
    expect(props.onAdvance).not.toHaveBeenCalled();
    rerender({ ...props, ready: true });
    act(() => vi.advanceTimersByTime(6000));
    expect(props.onAdvance).toHaveBeenCalledOnce();
    rerender({ ...props, ready: true, pageKey: 'photo' });
    act(() => vi.advanceTimersByTime(5999));
    expect(props.onAdvance).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(props.onAdvance).toHaveBeenCalledTimes(2);
  });
  it('does not restart the timer when a callback is refreshed', () => {
    const props = initial();
    const next = vi.fn();
    const { rerender } = renderHook((value) => useStoryPlayback(value), {
      initialProps: props,
    });
    act(() => vi.advanceTimersByTime(3000));
    rerender({ ...props, onAdvance: next });
    act(() => vi.advanceTimersByTime(3000));
    expect(props.onAdvance).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
  it('pauses on backgrounding and never resumes invisibly', () => {
    const props = initial();
    const { result } = renderHook(() => useStoryPlayback(props));
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.playing).toBe(false);
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(30000);
    });
    expect(props.onAdvance).not.toHaveBeenCalled();
  });
  it('stops for tasks and the final page, and cancels on unmount', () => {
    const props = initial();
    const { result, rerender, unmount } = renderHook(
      (value) => useStoryPlayback(value),
      { initialProps: props },
    );
    rerender({ ...props, blocked: true });
    act(() => vi.advanceTimersByTime(6000));
    expect(result.current.playing).toBe(false);
    expect(props.onAdvance).not.toHaveBeenCalled();
    rerender(props);
    expect(result.current.playing).toBe(false);
    act(() => result.current.play());
    unmount();
    act(() => vi.advanceTimersByTime(6000));
    expect(props.onAdvance).not.toHaveBeenCalled();
  });
  it('starts paused with reduced motion but permits deliberate static playback', () => {
    reduce = true;
    const props = initial();
    const { result } = renderHook(() => useStoryPlayback(props));
    expect(result.current.playing).toBe(false);
    act(() => vi.advanceTimersByTime(6000));
    expect(props.onAdvance).not.toHaveBeenCalled();
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(6000));
    expect(props.onAdvance).toHaveBeenCalledOnce();
  });
  it('gives long text more reading time than a short photo caption', () => {
    expect(storyReadingDuration('A walk')).toBeLessThan(
      storyReadingDuration('word '.repeat(120)),
    );
  });
});
