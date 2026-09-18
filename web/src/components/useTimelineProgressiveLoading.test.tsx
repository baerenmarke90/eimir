// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useDiscoverReveal,
  useTimelineAutoPagination,
  useTimelineReveal,
} from './useTimelineProgressiveLoading';

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  private readonly callback: IntersectionObserverCallback;

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? '0px';
    this.thresholds = Array.isArray(options?.threshold)
      ? options.threshold
      : [options?.threshold ?? 0];
    MockIntersectionObserver.instances.push(this);
  }

  trigger(target: Element, isIntersecting = true) {
    this.callback(
      [
        {
          target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal(
    'IntersectionObserver',
    MockIntersectionObserver as unknown as typeof IntersectionObserver,
  );
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useTimelineReveal', () => {
  it('reveals an entry once and remembers it across a Timeline remount', () => {
    const firstRoot = document.createElement('div');
    const firstEntry = document.createElement('article');
    firstEntry.dataset.timelineRevealKey = 'memory:one';
    firstRoot.append(firstEntry);
    document.body.append(firstRoot);

    const first = renderHook(() =>
      useTimelineReveal({
        rootRef: { current: firstRoot },
        enabled: true,
        scopeKey: 'space:default',
        revision: 1,
      }),
    );

    expect(firstEntry.dataset.timelineRevealed).toBeUndefined();
    act(() => {
      MockIntersectionObserver.instances[0].trigger(firstEntry);
    });
    expect(firstEntry.dataset.timelineRevealed).toBe('true');
    first.unmount();

    const secondRoot = document.createElement('div');
    const sameEntry = document.createElement('article');
    sameEntry.dataset.timelineRevealKey = 'memory:one';
    secondRoot.append(sameEntry);
    document.body.append(secondRoot);

    renderHook(() =>
      useTimelineReveal({
        rootRef: { current: secondRoot },
        enabled: true,
        scopeKey: 'space:default',
        revision: 1,
      }),
    );

    expect(sameEntry.dataset.timelineRevealed).toBe('true');
  });

  it('shows content immediately when reduced motion is requested', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const root = document.createElement('div');
    const heading = document.createElement('header');
    heading.dataset.timelineRevealKey = 'month:2026-09';
    root.append(heading);
    document.body.append(root);

    renderHook(() =>
      useTimelineReveal({
        rootRef: { current: root },
        enabled: true,
        scopeKey: 'space:reduced',
        revision: 1,
      }),
    );

    expect(heading.dataset.timelineRevealed).toBe('true');
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });
});

describe('useDiscoverReveal (#977)', () => {
  it('reveals a tapestry entry once and remembers it across a Discover remount', () => {
    const firstRoot = document.createElement('div');
    const firstEntry = document.createElement('a');
    firstEntry.dataset.discoverRevealKey = 'item:memory:one';
    firstRoot.append(firstEntry);
    document.body.append(firstRoot);

    const first = renderHook(() =>
      useDiscoverReveal({
        rootRef: { current: firstRoot },
        enabled: true,
        scopeKey: 'discover:account-1:space-1',
        revision: 1,
      }),
    );

    expect(firstEntry.dataset.discoverRevealed).toBeUndefined();
    act(() => {
      MockIntersectionObserver.instances[0].trigger(firstEntry);
    });
    expect(firstEntry.dataset.discoverRevealed).toBe('true');
    first.unmount();

    const secondRoot = document.createElement('div');
    const sameEntry = document.createElement('a');
    sameEntry.dataset.discoverRevealKey = 'item:memory:one';
    secondRoot.append(sameEntry);
    document.body.append(secondRoot);

    renderHook(() =>
      useDiscoverReveal({
        rootRef: { current: secondRoot },
        enabled: true,
        scopeKey: 'discover:account-1:space-1',
        revision: 1,
      }),
    );

    expect(sameEntry.dataset.discoverRevealed).toBe('true');
  });

  it('shows tapestry content immediately when reduced motion is requested', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const root = document.createElement('div');
    const entry = document.createElement('a');
    entry.dataset.discoverRevealKey = 'item:memory:two';
    root.append(entry);
    document.body.append(root);

    renderHook(() =>
      useDiscoverReveal({
        rootRef: { current: root },
        enabled: true,
        scopeKey: 'discover:account-1:space-1',
        revision: 1,
      }),
    );

    expect(entry.dataset.discoverRevealed).toBe('true');
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });

  it('never marks a Timeline reveal node through the Discover attribute namespace', () => {
    const root = document.createElement('div');
    const timelineEntry = document.createElement('article');
    timelineEntry.dataset.timelineRevealKey = 'item:memory:three';
    root.append(timelineEntry);
    document.body.append(root);

    renderHook(() =>
      useDiscoverReveal({
        rootRef: { current: root },
        enabled: true,
        scopeKey: 'discover:account-1:space-1',
        revision: 1,
      }),
    );

    expect(
      MockIntersectionObserver.instances[0]?.observe,
    ).not.toHaveBeenCalled();
    expect(timelineEntry.dataset.discoverRevealed).toBeUndefined();
  });
});

describe('useTimelineAutoPagination', () => {
  it('prefetches the current cursor once and uses a 1.25 viewport margin', async () => {
    const sentinel = document.createElement('div');
    document.body.append(sentinel);
    const loadNextPage = vi.fn().mockResolvedValue(true);
    const { rerender } = renderHook(
      ({ cursor }) =>
        useTimelineAutoPagination({
          sentinelRef: { current: sentinel },
          enabled: true,
          blocked: false,
          hasNextPage: true,
          isFetchingNextPage: false,
          cursor,
          scopeKey: 'space:timeline',
          loadNextPage,
        }),
      { initialProps: { cursor: 'cursor-1' } },
    );

    expect(MockIntersectionObserver.instances[0].rootMargin).toBe(
      '0px 0px 125% 0px',
    );
    await act(async () => {
      MockIntersectionObserver.instances[0].trigger(sentinel);
      await Promise.resolve();
    });
    await act(async () => {
      MockIntersectionObserver.instances[0].trigger(sentinel);
      await Promise.resolve();
    });
    expect(loadNextPage).toHaveBeenCalledTimes(1);

    rerender({ cursor: 'cursor-2' });
    const latest = MockIntersectionObserver.instances.at(-1);
    await act(async () => {
      latest?.trigger(sentinel);
      await Promise.resolve();
    });
    expect(loadNextPage).toHaveBeenCalledTimes(2);
  });

  it('stops automatic retries after a failure and keeps explicit retry available', async () => {
    const sentinel = document.createElement('div');
    document.body.append(sentinel);
    const loadNextPage = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const { result } = renderHook(() =>
      useTimelineAutoPagination({
        sentinelRef: { current: sentinel },
        enabled: true,
        blocked: false,
        hasNextPage: true,
        isFetchingNextPage: false,
        cursor: 'cursor-failure',
        scopeKey: 'space:failure',
        loadNextPage,
      }),
    );

    await act(async () => {
      MockIntersectionObserver.instances[0].trigger(sentinel);
      await Promise.resolve();
    });
    expect(result.current.manualFallback).toBe(true);
    expect(loadNextPage).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.retry();
    });
    expect(loadNextPage).toHaveBeenCalledTimes(2);
    expect(result.current.manualFallback).toBe(false);
  });

  it('does not observe or request while refresh/restore work blocks pagination', () => {
    const sentinel = document.createElement('div');
    const loadNextPage = vi.fn().mockResolvedValue(true);

    renderHook(() =>
      useTimelineAutoPagination({
        sentinelRef: { current: sentinel },
        enabled: true,
        blocked: true,
        hasNextPage: true,
        isFetchingNextPage: false,
        cursor: 'cursor-blocked',
        scopeKey: 'space:blocked',
        loadNextPage,
      }),
    );

    expect(MockIntersectionObserver.instances).toHaveLength(0);
    expect(loadNextPage).not.toHaveBeenCalled();
  });
});
