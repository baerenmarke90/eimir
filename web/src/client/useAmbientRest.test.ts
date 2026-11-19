// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAmbientRest } from './useAmbientRest';

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;
let observed: Callback | null = null;
let disconnected = 0;

class FakeObserver {
  constructor(callback: Callback) {
    observed = callback;
  }
  observe() {}
  disconnect() {
    disconnected += 1;
  }
}

function seen(isIntersecting: boolean) {
  act(() => observed?.([{ isIntersecting }]));
}

beforeEach(() => {
  vi.useFakeTimers();
  observed = null;
  disconnected = 0;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  document.documentElement.style.setProperty('--duration-ambient-rest', '12s');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty('--duration-ambient-rest');
});

const node = { current: document.createElement('div') };

it('rests until seen, plays while seen and rests offscreen', () => {
  const { result } = renderHook(() => useAmbientRest(node, true));
  expect(result.current).toBe(true);
  seen(true);
  expect(result.current).toBe(false);
  seen(false);
  expect(result.current).toBe(true);
});

it('rests for good once its visible time is used up, across visits', () => {
  const { result } = renderHook(() => useAmbientRest(node, true));
  seen(true);
  act(() => vi.advanceTimersByTime(8_000));
  seen(false);
  seen(true);
  expect(result.current).toBe(false);
  // 8 s seen before, 4 s now: the 12 s budget is spent.
  act(() => vi.advanceTimersByTime(4_000));
  expect(result.current).toBe(true);
  expect(disconnected).toBeGreaterThan(0);
  seen(true);
  expect(result.current).toBe(true);
});

it('stays at rest when disabled, for example with reduced motion', () => {
  const { result } = renderHook(() => useAmbientRest(node, false));
  seen(true);
  expect(result.current).toBe(true);
});
