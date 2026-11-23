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

describe('deferredModule', () => {
  it('shares one load, forgets a failed one and keeps the loaded value', async () => {
    vi.useRealTimers();
    const { deferredModule } = await loadFresh();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue('sheet');
    const module = deferredModule(load);

    expect(module.current()).toBeNull();
    await expect(module.load()).rejects.toThrow('offline');
    expect(module.current()).toBeNull();

    const [first, second] = await Promise.all([module.load(), module.load()]);
    expect([first, second]).toEqual(['sheet', 'sheet']);
    expect(module.current()).toBe('sheet');
    await module.load();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('optionalDeferredComponent', () => {
  it('renders nothing and does not throw when its chunk fails, then loads on the next mount', async () => {
    vi.useRealTimers();
    const { optionalDeferredComponent } = await loadFresh();
    const load = vi
      .fn<() => Promise<typeof Page>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(Page);
    const Optional = optionalDeferredComponent(load);

    // No Suspense boundary: a failed load must not suspend or throw.
    const failed = render(
      <div data-testid="around">
        <Optional label="reply" />
      </div>,
    );
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('around').innerHTML).toBe('');
    failed.unmount();

    render(<Optional label="reply" />);
    expect(await screen.findByText('reply')).toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('renders a loaded chunk in the first frame', async () => {
    vi.useRealTimers();
    const { optionalDeferredComponent } = await loadFresh();
    const load = vi.fn(async () => Page);
    const Optional = optionalDeferredComponent(load);
    const first = render(<Optional label="first" />);
    expect(await screen.findByText('first')).toBeDefined();
    first.unmount();

    render(<Optional label="again" />);
    expect(screen.getByText('again')).toBeDefined();
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
