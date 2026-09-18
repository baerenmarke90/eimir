// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSurfacePullToRefresh } from './AppSurfacePullToRefresh';

function touchEvent(type: string, y?: number): TouchEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as TouchEvent;
  Object.defineProperty(event, 'touches', {
    configurable: true,
    value: y === undefined ? [] : [{ clientX: 0, clientY: y }],
  });
  return event;
}

function dispatchTouch(type: string, y?: number): void {
  document.dispatchEvent(touchEvent(type, y));
}

function ActiveSurfaceQuery({
  spaceId,
  load,
}: {
  spaceId: string;
  load: () => Promise<string>;
}) {
  useQuery({
    queryKey: ['surface-test', spaceId],
    queryFn: load,
    retry: false,
  });
  return null;
}

function TestProvider({
  client,
  children,
}: {
  client: QueryClient;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    value: 1,
  });
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value: 0,
  });
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('app-pull-refresh-enabled');
  vi.restoreAllMocks();
});

describe('AppSurfacePullToRefresh', () => {
  it('refetches the mounted surface without waking an inactive cache', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    });
    const activeLoad = vi.fn().mockResolvedValue('active');
    const inactiveLoad = vi.fn().mockResolvedValue('inactive');

    await client.prefetchQuery({
      queryKey: ['inactive-surface', 'other-space'],
      queryFn: inactiveLoad,
    });

    render(
      <TestProvider client={client}>
        <AppSurfacePullToRefresh pathname="/today" />
        <ActiveSurfaceQuery spaceId="space-a" load={activeLoad} />
      </TestProvider>,
    );

    await waitFor(() => expect(activeLoad).toHaveBeenCalledTimes(1));

    act(() => {
      dispatchTouch('touchstart', 100);
      dispatchTouch('touchmove', 190);
      dispatchTouch('touchend');
    });

    await waitFor(() => expect(activeLoad).toHaveBeenCalledTimes(2));
    expect(inactiveLoad).toHaveBeenCalledTimes(1);
  });

  it.each(['/search', '/more/settings', '/games/our-moments'])(
    'does not install document pull-to-refresh on interaction-sensitive route %s',
    (pathname) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <TestProvider client={client}>
          <AppSurfacePullToRefresh pathname={pathname} />
        </TestProvider>,
      );

      expect(
        document.documentElement.classList.contains(
          'app-pull-refresh-enabled',
        ),
      ).toBe(false);
    },
  );

  it('leaves Momente to its surface-owned refresh contract', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <TestProvider client={client}>
        <AppSurfacePullToRefresh pathname="/story" />
      </TestProvider>,
    );

    expect(
      document.documentElement.classList.contains('app-pull-refresh-enabled'),
    ).toBe(false);
  });
});
