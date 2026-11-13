// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REVEAL_AFTER_CACHE_MS,
  useRevealAfterCache,
} from '../client/useRevealAfterCache';
import { OverviewCacheNotice } from './OverviewCacheNotice';

describe('OverviewCacheNotice', () => {
  it('renders nothing until a saved read exists', () => {
    const { container } = render(<OverviewCacheNotice />);
    expect(container.firstChild).toBeNull();
  });

  it('announces a saved read and collapses, not unmounts, once live', () => {
    const cachedAt = new Date('2026-11-13T08:00:00Z');
    const { container, rerender } = render(
      <OverviewCacheNotice cachedAt={cachedAt} />,
    );
    const slot = container.querySelector('.overview-cache-notice-slot');
    expect(slot?.getAttribute('data-open')).toBe('true');
    expect(screen.getByRole('status')).toBeTruthy();

    rerender(<OverviewCacheNotice />);
    expect(slot?.getAttribute('data-open')).toBe('false');
    expect(slot?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('useRevealAfterCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is true briefly after saved data is replaced by live data', () => {
    const { result, rerender } = renderHook(
      ({ cached }) => useRevealAfterCache(cached),
      { initialProps: { cached: true } },
    );
    expect(result.current).toBe(false);
    rerender({ cached: false });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(REVEAL_AFTER_CACHE_MS + 1);
    });
    expect(result.current).toBe(false);
  });

  it('never reveals when the page was live from the start', () => {
    const { result } = renderHook(() => useRevealAfterCache(false));
    expect(result.current).toBe(false);
  });
});
