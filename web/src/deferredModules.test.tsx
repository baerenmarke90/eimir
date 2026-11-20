// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DeferredModules = typeof import('./deferredModules');

async function loadFresh(): Promise<DeferredModules> {
  vi.resetModules();
  vi.doMock('./components/PlaceMapCanvas', () => ({ default: () => null }));
  return import('./deferredModules');
}

function Page({ label }: { label: string }) {
  return <p>{label}</p>;
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no idle callback; the scheduler falls back to a short timeout.
  Reflect.deleteProperty(window, 'requestIdleCallback');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.doUnmock('./components/PlaceMapCanvas');
  Reflect.deleteProperty(navigator, 'connection');
});

describe('deferredComponent', () => {
  it('suspends before its chunk loaded and renders a loaded chunk in the first frame', async () => {
    vi.useRealTimers();
    const { deferredComponent } = await loadFresh();
    const load = vi.fn(async () => Page);
    const Deferred = deferredComponent(load);

    const first = render(
      <Suspense fallback={<p role="status">loading</p>}>
        <Deferred label="first visit" />
      </Suspense>,
    );
    expect(screen.getByRole('status')).toBeDefined();
    expect(await screen.findByText('first visit')).toBeDefined();
    first.unmount();

    render(
      <Suspense fallback={<p role="status">loading</p>}>
        <Deferred label="second visit" />
      </Suspense>,
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('second visit')).toBeDefined();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('scheduleDeferredPrefetch', () => {
  it('loads every deferred chunk one after another, only after the delay', async () => {
    const modules = await loadFresh();
    const order: string[] = [];
    const later = vi.fn(async () => {
      order.push('later');
    });
    modules.registerDeferredModule(async () => {
      order.push('first');
      // A loaded chunk may register further deferred chunks.
      modules.registerDeferredModule(later);
    });
    const Deferred = modules.deferredComponent(async () => {
      order.push('page');
      return Page;
    });

    modules.scheduleDeferredPrefetch();
    await vi.advanceTimersByTimeAsync(modules.DEFERRED_PREFETCH_DELAY_MS - 1);
    expect(order).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(order).toEqual(['first', 'page', 'later']);

    vi.useRealTimers();
    render(
      <Suspense fallback={<p role="status">loading</p>}>
        <Deferred label="from memory" />
      </Suspense>,
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('from memory')).toBeDefined();
  });

  it('continues after a failed chunk, which then loads on demand', async () => {
    const modules = await loadFresh();
    const after = vi.fn(async () => undefined);
    modules.registerDeferredModule(async () => {
      throw new Error('offline');
    });
    modules.registerDeferredModule(after);

    modules.scheduleDeferredPrefetch(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('runs once per page and stops when cancelled', async () => {
    const modules = await loadFresh();
    const load = vi.fn(async () => undefined);
    modules.registerDeferredModule(load);

    const cancel = modules.scheduleDeferredPrefetch(100);
    expect(modules.scheduleDeferredPrefetch(100)).not.toBe(cancel);
    cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).not.toHaveBeenCalled();

    modules.scheduleDeferredPrefetch(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('respects a request to save data', async () => {
    const modules = await loadFresh();
    const load = vi.fn(async () => undefined);
    modules.registerDeferredModule(load);
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });

    modules.scheduleDeferredPrefetch(0);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(load).not.toHaveBeenCalled();
  });
});
