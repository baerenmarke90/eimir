// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { ResponseError } from '../api/generated/runtime';
import { notificationUnreadCountQueryKey } from './notificationQueries';
import {
  revokeDevicePushBeforeSignOut,
  stopNativePushForSignedOutAccount,
  useUnifiedPush,
} from './unifiedPush';
import { useDocumentLeaveGuard } from './useDocumentLeaveGuard';

const native = vi.hoisted(() => {
  const listeners = new Map<string, (event: unknown) => void>();
  return {
    listeners,
    retainedNotificationAccount: null as string | null,
    status: vi.fn(
      async (): Promise<{
        accountId: string | null;
        enabled: boolean;
        permissionGranted: boolean;
      }> => ({
        accountId: null,
        enabled: false,
        permissionGranted: true,
      }),
    ),
    enable: vi.fn(async () => undefined),
    refresh: vi.fn(async () => ({ enabled: true })),
    disable: vi.fn(async () => undefined),
    openNotificationSettings: vi.fn(async () => undefined),
    addListener: vi.fn(
      async (event: string, callback: (value: unknown) => void) => {
        listeners.set(event, callback);
        if (
          event === 'notificationOpen' &&
          native.retainedNotificationAccount
        ) {
          const accountId = native.retainedNotificationAccount;
          native.retainedNotificationAccount = null;
          callback({ accountId });
        }
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

function createApi() {
  return {
    getUnifiedPushConfiguration: vi.fn(async () => ({
      providerKey: 'unifiedpush',
      vapidPublicKey: 'A'.repeat(87),
    })),
    registerOwnPushEndpoint: vi.fn(async () => ({ id: 'endpoint-id' })),
    revokeOwnPushEndpoint: vi.fn(async () => undefined),
  };
}

function setup(
  spaceId = 'space-a',
  prepare?: (api: ReturnType<typeof createApi>) => void,
  activeAccountId = accountId,
  initialBlocked = false,
) {
  const api = createApi();
  prepare?.(api);
  const queryClient = new QueryClient();
  const hook = renderHook<
    ReturnType<typeof useUnifiedPush>,
    { spaceId: string; blocked?: boolean }
  >(
    ({ spaceId: activeSpaceId, blocked = false }) => {
      useDocumentLeaveGuard(blocked);
      return useUnifiedPush({
        accountId: activeAccountId,
        apiBaseUrl,
        notificationsApi: api as unknown as NotificationsApi,
        queryClient,
        spaceId: activeSpaceId,
      });
    },
    { initialProps: { spaceId, blocked: initialBlocked }, wrapper },
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
  native.retainedNotificationAccount = null;
  app.listeners.clear();
  vi.clearAllMocks();
  native.status.mockReset().mockResolvedValue({
    accountId: null,
    enabled: false,
    permissionGranted: true,
  });
  native.enable.mockReset().mockResolvedValue(undefined);
  native.refresh.mockReset().mockResolvedValue({ enabled: true });
  native.disable.mockReset().mockResolvedValue(undefined);
  app.getLaunchUrl.mockReset().mockResolvedValue(null);
});

function httpError(status: number) {
  return new ResponseError(new Response(null, { status }));
}

function emitEndpoint() {
  act(() =>
    native.listeners.get('endpoint')?.({
      accountId,
      endpoint: 'https://push.example.test/id',
      p256dh: 'public-key',
      auth: 'auth-secret',
    }),
  );
}

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
  act(() => native.listeners.get('wake')?.({ accountId }));
  expect(invalidation).toHaveBeenCalledWith({
    queryKey: notificationUnreadCountQueryKey('space-b'),
  });
  expect(api.getUnifiedPushConfiguration).toHaveBeenCalledTimes(1);

  act(() => native.listeners.get('notificationOpen')?.({ accountId }));
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

it('consumes a retained notification after authentication without an original launch URL', async () => {
  native.retainedNotificationAccount = accountId;
  setup();
  await waitFor(() =>
    expect(screen.getByTestId('route').textContent).toBe('/more/notifications'),
  );
});

it('does not route a retained notification into a replacement Account', async () => {
  native.retainedNotificationAccount = 'previous-account';
  const { result } = setup();
  await waitFor(() => expect(result.current.state).toBe('off'));
  expect(screen.getByTestId('route').textContent).toBe('/today');
});

it('does not reactivate a device when registration finishes after disable', async () => {
  const { api, result } = setup();
  await waitFor(() => expect(result.current.state).toBe('off'));
  let finishRegistration: ((value: { id: string }) => void) | undefined;
  api.registerOwnPushEndpoint.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRegistration = resolve;
      }),
  );
  await act(async () => result.current.enable());
  act(() =>
    native.listeners.get('endpoint')?.({
      accountId,
      endpoint: 'https://push.example.test/late',
      p256dh: 'public-key',
      auth: 'auth-secret',
    }),
  );
  await waitFor(() =>
    expect(api.registerOwnPushEndpoint).toHaveBeenCalledOnce(),
  );

  let disabling: Promise<void> | undefined;
  act(() => {
    disabling = result.current.disable();
  });
  await waitFor(() => expect(native.disable).toHaveBeenCalledOnce());
  expect(result.current.state).toBe('disconnecting');
  await act(async () => {
    finishRegistration?.({ id: 'endpoint-id' });
    await disabling;
  });

  expect(api.revokeOwnPushEndpoint).toHaveBeenCalledWith({
    endpointId: 'endpoint-id',
  });
  expect(window.localStorage.getItem(storageKey)).toBeNull();
  expect(result.current.state).toBe('off');
});

it('retains a late logout registration ID for cleanup at the next sign-in', async () => {
  const { api, result, unmount } = setup();
  await waitFor(() => expect(result.current.state).toBe('off'));
  let finishRegistration: ((value: { id: string }) => void) | undefined;
  api.registerOwnPushEndpoint.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRegistration = resolve;
      }),
  );
  await act(async () => result.current.enable());
  act(() =>
    native.listeners.get('endpoint')?.({
      accountId,
      endpoint: 'https://push.example.test/logout',
      p256dh: 'public-key',
      auth: 'auth-secret',
    }),
  );
  await waitFor(() =>
    expect(api.registerOwnPushEndpoint).toHaveBeenCalledOnce(),
  );
  act(() => {
    stopNativePushForSignedOutAccount();
    unmount();
  });
  const nextLogin = setup();
  await waitFor(() =>
    expect(nextLogin.api.getUnifiedPushConfiguration).toHaveBeenCalledOnce(),
  );
  expect(nextLogin.api.revokeOwnPushEndpoint).not.toHaveBeenCalled();
  await act(async () => finishRegistration?.({ id: 'endpoint-id' }));
  expect(api.revokeOwnPushEndpoint).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(nextLogin.api.revokeOwnPushEndpoint).toHaveBeenCalledWith({
      endpointId: 'endpoint-id',
    }),
  );
  expect(window.localStorage.getItem(storageKey)).toBeNull();
});

it('waits for the prior account to stop before checking a new sign-in', async () => {
  let finishDisable: (() => void) | undefined;
  native.disable.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishDisable = () => resolve(undefined);
      }),
  );
  stopNativePushForSignedOutAccount();
  const nextLogin = setup();
  await waitFor(() =>
    expect(nextLogin.api.getUnifiedPushConfiguration).toHaveBeenCalledOnce(),
  );
  expect(native.status).not.toHaveBeenCalled();

  await act(async () => finishDisable?.());
  await waitFor(() => expect(native.status).toHaveBeenCalledOnce());
  await waitFor(() => expect(nextLogin.result.current.state).toBe('off'));
});

it('keeps an unconfigured installation unavailable without enabling the device', async () => {
  const { result } = setup('space-a', (api) => {
    api.getUnifiedPushConfiguration.mockRejectedValue(httpError(503));
  });
  await waitFor(() => expect(result.current.state).toBe('unavailable'));
  expect(result.current.error).toBeNull();
  expect(result.current.registered).toBe(false);
  expect(native.enable).not.toHaveBeenCalled();
});

it('retries an unreachable status check when the user enables Push', async () => {
  const { api, result } = setup('space-a', (api) => {
    api.getUnifiedPushConfiguration.mockRejectedValueOnce(new Error('offline'));
  });
  await waitFor(() => expect(result.current.state).toBe('error'));
  expect(result.current.error).toBe('PUSH_DEVICE_STATUS_UNAVAILABLE');
  expect(result.current.registered).toBe(false);
  expect(native.enable).not.toHaveBeenCalled();

  await act(async () => result.current.enable());
  expect(api.getUnifiedPushConfiguration).toHaveBeenCalledTimes(2);
  expect(native.enable).toHaveBeenCalledOnce();
  expect(result.current.error).toBeNull();
});

it('shows transport absence if an unreachable status retry returns 503', async () => {
  const { result } = setup('space-a', (api) => {
    api.getUnifiedPushConfiguration
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(httpError(503));
  });
  await waitFor(() => expect(result.current.state).toBe('error'));
  await act(async () => result.current.enable());
  expect(result.current.state).toBe('unavailable');
  expect(result.current.error).toBeNull();
  expect(native.enable).not.toHaveBeenCalled();
});

it('stops native receipt after a rejected endpoint without retrying registration', async () => {
  const { api, result } = setup('space-a', (api) => {
    api.registerOwnPushEndpoint.mockRejectedValue(httpError(422));
  });
  await waitFor(() => expect(result.current.state).toBe('off'));
  await act(async () => result.current.enable());
  emitEndpoint();
  await waitFor(() =>
    expect(result.current.error).toBe('PUSH_ENDPOINT_UNSUPPORTED'),
  );
  expect(result.current.state).toBe('error');
  expect(result.current.registered).toBe(false);
  expect(native.disable).toHaveBeenCalledOnce();
  expect(window.localStorage.getItem(storageKey)).toBeNull();

  emitEndpoint();
  await act(async () => undefined);
  expect(api.registerOwnPushEndpoint).toHaveBeenCalledOnce();
});

it('retains a failed revoke for later cleanup while stopping native receipt', async () => {
  const { api, result } = setup('space-a', (api) => {
    api.revokeOwnPushEndpoint.mockRejectedValue(new Error('offline'));
  });
  await waitFor(() => expect(result.current.state).toBe('off'));
  window.localStorage.setItem(storageKey, 'endpoint-id');
  await act(async () => result.current.disable());
  expect(native.disable).toHaveBeenCalledOnce();
  expect(api.revokeOwnPushEndpoint).toHaveBeenCalledOnce();
  expect(result.current.state).toBe('off');
  expect(result.current.registered).toBe(false);
  expect(result.current.error).toBe('PUSH_DEVICE_CLEANUP_PENDING');
  expect(window.localStorage.getItem(storageKey)).toBe('endpoint-id');
});

it('clears an endpoint already absent on the server during disable', async () => {
  const { result } = setup('space-a', (api) => {
    api.revokeOwnPushEndpoint.mockRejectedValue(httpError(404));
  });
  await waitFor(() => expect(result.current.state).toBe('off'));
  window.localStorage.setItem(storageKey, 'endpoint-id');
  await act(async () => result.current.disable());
  expect(result.current.state).toBe('off');
  expect(result.current.error).toBeNull();
  expect(window.localStorage.getItem(storageKey)).toBeNull();
});

it('clears a stale endpoint already absent on the server during startup', async () => {
  window.localStorage.setItem(storageKey, 'stale-endpoint');
  const { result } = setup('space-a', (api) => {
    api.revokeOwnPushEndpoint.mockRejectedValue(httpError(404));
  });
  await waitFor(() => expect(result.current.state).toBe('off'));
  expect(result.current.error).toBeNull();
  expect(window.localStorage.getItem(storageKey)).toBeNull();
});

it('opens system settings after denial and rechecks permission on resume without prompting', async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.state).toBe('off'));
  native.enable.mockRejectedValueOnce(
    new Error('NOTIFICATION_PERMISSION_DENIED'),
  );
  native.status.mockResolvedValue({
    accountId: null,
    enabled: false,
    permissionGranted: false,
  });
  await act(async () => result.current.enable());
  expect(result.current.error).toBe('NOTIFICATION_PERMISSION_DENIED');
  expect(result.current.registered).toBe(false);
  await act(async () => result.current.openSettings());
  expect(native.openNotificationSettings).toHaveBeenCalledOnce();

  await act(async () => app.listeners.get('resume')?.({ url: '' }));
  expect(result.current.error).toBe('NOTIFICATION_PERMISSION_DENIED');
  native.status.mockResolvedValue({
    accountId: null,
    enabled: false,
    permissionGranted: true,
  });
  await act(async () => app.listeners.get('resume')?.({ url: '' }));
  expect(result.current.state).toBe('off');
  expect(result.current.error).toBeNull();
  expect(native.enable).toHaveBeenCalledOnce();
});

it('retains an active registration during an app-level permission block', async () => {
  native.status.mockResolvedValue({
    accountId,
    enabled: true,
    permissionGranted: false,
  });
  const { result } = setup();
  await waitFor(() =>
    expect(result.current.error).toBe('NOTIFICATION_PERMISSION_DENIED'),
  );
  expect(result.current.registered).toBe(true);
  expect(native.refresh).not.toHaveBeenCalled();
  native.status.mockResolvedValue({
    accountId,
    enabled: true,
    permissionGranted: true,
  });
  await act(async () => app.listeners.get('resume')?.({ url: '' }));
  expect(result.current.state).toBe('on');
  expect(result.current.registered).toBe(true);
  expect(native.enable).not.toHaveBeenCalled();
});

it('waits for in-flight registration and revokes its endpoint before server sign-out', async () => {
  const { api, result } = setup();
  await waitFor(() => expect(result.current.state).toBe('off'));
  let finishRegistration: ((value: { id: string }) => void) | undefined;
  api.registerOwnPushEndpoint.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRegistration = resolve;
      }),
  );
  await act(async () => result.current.enable());
  emitEndpoint();
  await waitFor(() =>
    expect(api.registerOwnPushEndpoint).toHaveBeenCalledOnce(),
  );
  const serverSignOut = vi.fn();
  let signingOut: Promise<void> | undefined;
  act(() => {
    signingOut = revokeDevicePushBeforeSignOut(
      apiBaseUrl,
      accountId,
      api as unknown as NotificationsApi,
    ).then(serverSignOut);
    stopNativePushForSignedOutAccount();
  });
  expect(serverSignOut).not.toHaveBeenCalled();
  expect(api.revokeOwnPushEndpoint).not.toHaveBeenCalled();
  await act(async () => {
    finishRegistration?.({ id: 'endpoint-id' });
    await signingOut;
  });
  expect(api.revokeOwnPushEndpoint).toHaveBeenCalledWith({
    endpointId: 'endpoint-id',
  });
  expect(api.revokeOwnPushEndpoint.mock.invocationCallOrder[0]).toBeLessThan(
    serverSignOut.mock.invocationCallOrder[0],
  );
  expect(window.localStorage.getItem(storageKey)).toBeNull();
});

it('lets server sign-out continue after failed endpoint cleanup and retains its retry ID', async () => {
  const api = createApi();
  api.revokeOwnPushEndpoint.mockRejectedValueOnce(new Error('offline'));
  window.localStorage.setItem(storageKey, 'endpoint-id');
  const serverSignOut = vi.fn();
  await revokeDevicePushBeforeSignOut(
    apiBaseUrl,
    accountId,
    api as unknown as NotificationsApi,
  ).then(serverSignOut);
  expect(serverSignOut).toHaveBeenCalledOnce();
  expect(window.localStorage.getItem(storageKey)).toBe('endpoint-id');
});

it('discards an endpoint queued by a component that has already unmounted', async () => {
  const { api, result, unmount } = setup();
  await waitFor(() => expect(result.current.state).toBe('off'));
  await act(async () => result.current.enable());
  act(() => {
    emitEndpoint();
    unmount();
  });
  await act(async () => undefined);
  expect(api.registerOwnPushEndpoint).not.toHaveBeenCalled();
  expect(window.localStorage.getItem(storageKey)).toBeNull();
});

it('does not disable a replacement account after an obsolete endpoint is rejected', async () => {
  let rejectRegistration: ((error: Error) => void) | undefined;
  const previous = setup('space-a', (api) => {
    api.registerOwnPushEndpoint.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRegistration = reject;
        }),
    );
  });
  await waitFor(() => expect(previous.result.current.state).toBe('off'));
  await act(async () => previous.result.current.enable());
  emitEndpoint();
  await waitFor(() =>
    expect(previous.api.registerOwnPushEndpoint).toHaveBeenCalledOnce(),
  );
  await act(async () => previous.unmount());

  const nextAccountId = 'f576091e-5811-46d6-a092-721b471c8798';
  native.status.mockResolvedValue({
    accountId: nextAccountId,
    enabled: true,
    permissionGranted: true,
  });
  const next = setup('space-b', undefined, nextAccountId);
  await waitFor(() => expect(next.result.current.registered).toBe(true));
  await act(async () => rejectRegistration?.(httpError(422)));
  expect(native.disable).not.toHaveBeenCalled();
  expect(next.result.current.registered).toBe(true);
});

it('ignores retained native status and wake events belonging to another account', async () => {
  const { result, queryClient } = setup();
  await waitFor(() => expect(result.current.state).toBe('off'));
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  act(() => {
    native.listeners.get('wake')?.({ accountId: 'previous-account' });
    native.listeners.get('unavailable')?.({
      accountId: 'previous-account',
      reason: 'UNREGISTERED',
    });
  });
  expect(invalidate).not.toHaveBeenCalled();
  expect(result.current.state).toBe('off');
  expect(result.current.error).toBeNull();
  act(() =>
    native.listeners.get('unavailable')?.({
      accountId,
      reason: 'UNREGISTERED',
    }),
  );
  expect(result.current.state).toBe('error');
  expect(result.current.error).toBe('UNREGISTERED');
});

it.each(['warm', 'cold'] as const)(
  'preserves an active draft for a %s notification entry until its shared guard releases',
  async (kind) => {
    if (kind === 'cold') {
      native.retainedNotificationAccount = accountId;
    }
    const { result, rerender } = setup('space-a', undefined, accountId, true);
    await waitFor(() => expect(result.current.state).toBe('off'));
    if (kind === 'warm') {
      act(() => native.listeners.get('notificationOpen')?.({ accountId }));
    }
    await act(async () => undefined);
    expect(screen.getByTestId('route').textContent).toBe('/today');
    rerender({ spaceId: 'space-a', blocked: false });
    await waitFor(() =>
      expect(screen.getByTestId('route').textContent).toBe(
        '/more/notifications',
      ),
    );
  },
);
