// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { notificationUnreadCountQueryKey } from './notificationQueries';
import { useUnifiedPush } from './unifiedPush';

const native = vi.hoisted(() => {
  const listeners = new Map<string, (event: unknown) => void>();
  return {
    listeners,
    status: vi.fn(async () => ({
      accountId: null,
      enabled: false,
      permissionGranted: true,
    })),
    enable: vi.fn(async () => undefined),
    refresh: vi.fn(async () => ({ enabled: true })),
    disable: vi.fn(async () => undefined),
    addListener: vi.fn(
      async (event: string, callback: (value: unknown) => void) => {
        listeners.set(event, callback);
        return { remove: async () => listeners.delete(event) };
      },
    ),
  };
});

const app = vi.hoisted(() => {
  const listeners = new Map<string, (event: { url: string }) => void>();
  return {
    listeners,
    addListener: vi.fn(
      async (event: string, callback: (value: { url: string }) => void) => {
        listeners.set(event, callback);
        return { remove: async () => listeners.delete(event) };
      },
    ),
    getLaunchUrl: vi.fn(async (): Promise<{ url: string } | null> => null),
  };
});

vi.mock('@capacitor/core', () => ({ registerPlugin: () => native }));
vi.mock('@capacitor/app', () => ({ App: app }));
vi.mock('../pwa', () => ({ isCapacitorNative: () => true }));

const accountId = '0d569eb8-93fa-4a24-ae50-b4fcfca464b0';
const apiBaseUrl = 'https://example.test';
const storageKey = `eimir-unifiedpush-endpoint-v1:${apiBaseUrl}:${accountId}`;
const stored = new Map<string, string>();

function CurrentRoute() {
  const location = useLocation();
  return <span data-testid="route">{location.pathname}</span>;
}

function wrapper({ children }: PropsWithChildren) {
  return (
    <MemoryRouter initialEntries={['/today']}>
      {children}
      <CurrentRoute />
    </MemoryRouter>
  );
}

function setup(spaceId = 'space-a') {
  const api = {
    getUnifiedPushConfiguration: vi.fn(async () => ({
      providerKey: 'unifiedpush',
      vapidPublicKey: 'A'.repeat(87),
    })),
    registerOwnPushEndpoint: vi.fn(async () => ({ id: 'endpoint-id' })),
    revokeOwnPushEndpoint: vi.fn(async () => undefined),
  };
  const queryClient = new QueryClient();
  const hook = renderHook(
    ({ spaceId: activeSpaceId }) =>
      useUnifiedPush({
        accountId,
        apiBaseUrl,
        notificationsApi: api as unknown as NotificationsApi,
        queryClient,
        spaceId: activeSpaceId,
      }),
    { initialProps: { spaceId }, wrapper },
  );
  return { api, queryClient, ...hook };
}

beforeEach(() => {
  stored.clear();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    },
  });
  native.listeners.clear();
  app.listeners.clear();
  vi.clearAllMocks();
});

it('registers a device endpoint, refreshes the current Space, routes a tap, and revokes on disable', async () => {
  const { api, queryClient, result, rerender } = setup();
  const invalidation = vi.spyOn(queryClient, 'invalidateQueries');
  await waitFor(() => expect(result.current.state).toBe('off'));

  await act(async () => result.current.enable());
  expect(native.enable).toHaveBeenCalledWith({
    accountId,
    vapidPublicKey: 'A'.repeat(87),
  });
  act(() =>
    native.listeners.get('endpoint')?.({
      accountId,
      endpoint: 'https://push.example.test/id',
      p256dh: 'public-key',
      auth: 'auth-secret',
    }),
  );
  await waitFor(() => expect(result.current.state).toBe('on'));
  expect(api.registerOwnPushEndpoint).toHaveBeenCalledWith({
    pushEndpointRegistration: {
      providerKey: 'unifiedpush',
      endpointValue: JSON.stringify({
        endpoint: 'https://push.example.test/id',
        keys: { p256dh: 'public-key', auth: 'auth-secret' },
      }),
    },
  });
  expect(window.localStorage.getItem(storageKey)).toBe('endpoint-id');

  rerender({ spaceId: 'space-b' });
  act(() => native.listeners.get('wake')?.({}));
  expect(invalidation).toHaveBeenCalledWith({
    queryKey: notificationUnreadCountQueryKey('space-b'),
  });
  expect(api.getUnifiedPushConfiguration).toHaveBeenCalledTimes(1);

  act(() =>
    app.listeners.get('appUrlOpen')?.({
      url: 'de.sidebyside.app://notifications',
    }),
  );
  expect(screen.getByTestId('route').textContent).toBe('/more/notifications');

  await act(async () => result.current.disable());
  expect(native.disable).toHaveBeenCalledOnce();
  expect(api.revokeOwnPushEndpoint).toHaveBeenCalledWith({
    endpointId: 'endpoint-id',
  });
  expect(native.disable.mock.invocationCallOrder[0]).toBeLessThan(
    api.revokeOwnPushEndpoint.mock.invocationCallOrder[0],
  );
  expect(window.localStorage.getItem(storageKey)).toBeNull();
  expect(result.current.state).toBe('off');
});

it('retries server cleanup on startup after device push was stopped offline', async () => {
  window.localStorage.setItem(storageKey, 'stale-endpoint');
  const { api, result } = setup();
  await waitFor(() =>
    expect(api.revokeOwnPushEndpoint).toHaveBeenCalledWith({
      endpointId: 'stale-endpoint',
    }),
  );
  await waitFor(() => expect(result.current.state).toBe('off'));
  expect(window.localStorage.getItem(storageKey)).toBeNull();
});

it('opens the inbox from a notification that launched a stopped app', async () => {
  app.getLaunchUrl.mockResolvedValueOnce({
    url: 'de.sidebyside.app://notifications',
  });
  setup();
  await waitFor(() =>
    expect(screen.getByTestId('route').textContent).toBe('/more/notifications'),
  );
});
