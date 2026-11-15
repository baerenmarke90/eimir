// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESUME_SETTLE_GRACE_MS,
  RESUME_SETTLE_MAX_MS,
  useHeldQuery,
  useResumeSettling,
} from './useResumeSettling';

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useResumeSettling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    focusManager.setFocused(true);
  });
  afterEach(() => {
    focusManager.setFocused(undefined);
    vi.useRealTimers();
  });

  it('settles right after the grace period when nothing is refetching', () => {
    const client = new QueryClient();
    const { result } = renderHook(() => useResumeSettling(), {
      wrapper: wrapperFor(client),
    });
    expect(result.current).toBe(false);
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(RESUME_SETTLE_GRACE_MS + 1);
    });
    expect(result.current).toBe(false);
  });

  it('holds while a refetch runs, then ends once it settles', async () => {
    const client = new QueryClient();
    let fetching = 1;
    vi.spyOn(client, 'isFetching').mockImplementation(() => fetching);
    const { result } = renderHook(() => useResumeSettling(), {
      wrapper: wrapperFor(client),
    });
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    act(() => {
      vi.advanceTimersByTime(RESUME_SETTLE_GRACE_MS + 1);
    });
    expect(result.current).toBe(true);
    await act(async () => {
      fetching = 0;
      // Any cache event after the last response re-checks the fetch count.
      client.setQueryData(['slow'], 'done');
      await vi.advanceTimersByTimeAsync(5);
    });
    expect(result.current).toBe(false);
  });

  it('never holds longer than the ceiling', () => {
    const client = new QueryClient();
    vi.spyOn(client, 'isFetching').mockReturnValue(1);
    const { result } = renderHook(() => useResumeSettling(), {
      wrapper: wrapperFor(client),
    });
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(RESUME_SETTLE_MAX_MS - 10);
    });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(result.current).toBe(false);
  });

  it('lets a tap through immediately', () => {
    const client = new QueryClient();
    vi.spyOn(client, 'isFetching').mockReturnValue(1);
    const { result } = renderHook(() => useResumeSettling(), {
      wrapper: wrapperFor(client),
    });
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    expect(result.current).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    expect(result.current).toBe(false);
  });
});

describe('useHeldQuery', () => {
  it('keeps the earlier data while held and adopts the new data on release', () => {
    const { result, rerender } = renderHook(
      ({ value, hold }) => useHeldQuery(value, hold),
      { initialProps: { value: { data: 'old' }, hold: false } },
    );
    rerender({ value: { data: 'new' }, hold: true });
    expect(result.current.data).toBe('old');
    rerender({ value: { data: 'new' }, hold: false });
    expect(result.current.data).toBe('new');
  });

  it('never holds an initial load', () => {
    const { result, rerender } = renderHook(
      ({ value, hold }) => useHeldQuery<{ data?: string }>(value, hold),
      { initialProps: { value: {} as { data?: string }, hold: true } },
    );
    rerender({ value: { data: 'first' }, hold: true });
    expect(result.current.data).toBe('first');
  });
});
