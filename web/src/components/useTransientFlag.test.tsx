// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTransientFlag } from './useTransientFlag';

afterEach(() => {
  cleanup();
});

describe('useTransientFlag', () => {
  it('restarts the owned timeout when activated again', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useTransientFlag(2000));

      act(() => {
        result.current[1]();
      });
      expect(result.current[0]).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1500);
        result.current[1]();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current[0]).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(result.current[0]).toBe(false);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('clears a pending timeout on unmount', () => {
    vi.useFakeTimers();
    try {
      const view = renderHook(() => useTransientFlag(2000));

      act(() => {
        view.result.current[1]();
      });
      expect(vi.getTimerCount()).toBe(1);

      view.unmount();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
