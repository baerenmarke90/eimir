// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { DevicePushConfiguration } from '../api/generated/models/DevicePushConfiguration';
import { ResponseError } from '../api/generated/runtime';
import {
  revokeDevicePushBeforeSignOut,
  stopNativePushForSignedOutAccount,
  useDevicePush,
} from './devicePush';
import { notificationUnreadCountQueryKey } from './notificationQueries';
import { useDocumentLeaveGuard } from './useDocumentLeaveGuard';

const native = vi.hoisted(() => {
  const listeners = new Map<string, (event: unknown) => void>();
  return {
    listeners,
    retainedNotificationAccount: null as string | null,
    state: {
      accountId: null as string | null,
      apiBaseUrl: null as string | null,
      providerKey: null as 'unifiedpush' | 'fcm' | null,
      activationId: null as string | null,
      enabled: false,
      permissionGranted: true,
      fcmAvailable: false,
      firebaseProjectId: 'firebase-project' as string | null,
      androidPackage: 'de.eimir.app',
    },
    status: vi.fn(async () => native.state),
    enable: vi.fn(
      async (_options: {
        accountId: string;
        apiBaseUrl: string;
        providerKey: 'unifiedpush' | 'fcm';
      }) => undefined,
    ),
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
          callback({ ...native.state, accountId });
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
const activationId = '965f8ce8-46e3-43a5-b0ed-3844b85bfcbd';

function statusFixture(state: {
  accountId: string | null;
  enabled: boolean;
  permissionGranted: boolean;
}) {
  return {
    ...state,
    apiBaseUrl: state.accountId ? apiBaseUrl : null,
    providerKey: state.accountId ? ('unifiedpush' as const) : null,
    activationId: state.accountId ? activationId : null,
    fcmAvailable: false,
    firebaseProjectId: 'firebase-project' as string | null,
    androidPackage: 'de.eimir.app',
  };
}

function activationEvent(overrides: Record<string, unknown> = {}) {
  return {
    accountId,
    apiBaseUrl,
    providerKey: 'unifiedpush',
    activationId,
    ...overrides,
  };
}

function endpointEvent(endpoint = 'https://push.example.test/id') {
  return {
    ...activationEvent(),
    endpointValue: JSON.stringify({
      endpoint,
      keys: { p256dh: 'public-key', auth: 'auth-secret' },
    }),
  };
}
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
    openNotification: vi.fn(async () => ({
      kind: 'COUPLE_EXPERIENCE_SHARED',
      targetType: 'MEMORY',
      targetId: 'saved-note',
    })),
    getUnifiedPushConfiguration: vi.fn(async () => ({
      providerKey: 'unifiedpush',
      vapidPublicKey: 'A'.repeat(87),
      notificationReferenceVersion: 1 as const,
    })),
    getDevicePushConfiguration: vi.fn(
      async (): Promise<DevicePushConfiguration> => ({
        unifiedPush: {
          providerKey: 'unifiedpush',
          vapidPublicKey: 'A'.repeat(87),
        },
        fcm: null,
      }),
    ),
    registerOwnPushEndpoint: vi.fn(
      async (
        _request: Parameters<NotificationsApi['registerOwnPushEndpoint']>[0],
      ) => ({ id: 'endpoint-id' }),
    ),
    revokeOwnPushEndpoint: vi.fn(
      async (
        _request: Parameters<NotificationsApi['revokeOwnPushEndpoint']>[0],
      ) => undefined,
    ),
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
  if (native.retainedNotificationAccount) {
    native.state = statusFixture({
      accountId: native.retainedNotificationAccount,
      enabled: true,
      permissionGranted: true,
    });
  }
  const queryClient = new QueryClient();
  const hook = renderHook<
    ReturnType<typeof useDevicePush>,
    { spaceId: string; blocked?: boolean; account?: string; apiBase?: string }
  >(
    ({ spaceId: activeSpaceId, blocked = false, account, apiBase }) => {
      useDocumentLeaveGuard(blocked);
      return useDevicePush({
        accountId: account ?? activeAccountId,
        apiBaseUrl: apiBase ?? apiBaseUrl,
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
  native.state = statusFixture({
    accountId: null,
    enabled: false,
    permissionGranted: true,
  });
  native.status.mockReset().mockImplementation(async () => native.state);
  native.enable.mockReset().mockImplementation(async (options) => {
    native.state = { ...native.state, ...options, activationId, enabled: true };
  });
  native.refresh.mockReset().mockResolvedValue({ enabled: true });
  native.disable.mockReset().mockImplementation(async () => {
    native.state = {
      ...native.state,
      accountId: null,
      apiBaseUrl: null,
      providerKey: null,
      activationId: null,
      enabled: false,
    };
  });
  app.getLaunchUrl.mockReset().mockResolvedValue(null);
});

function httpError(status: number) {
  return new ResponseError(new Response(null, { status }));
}

function emitEndpoint() {
  act(() =>
    native.listeners.get('endpoint')?.(
      endpointEvent('https://push.example.test/id'),
    ),
  );
}

it('registers a device endpoint, refreshes the current Space, routes a tap, and revokes on disable', async () => {
  const { api, queryClient, result, rerender } = setup();
  const invalidation = vi.spyOn(queryClient, 'invalidateQueries');
  await waitFor(() => expect(result.current.state).toBe('off'));

  await act(async () => result.current.enable());
  expect(native.enable).toHaveBeenCalledWith({
    accountId,
    apiBaseUrl,
    providerKey: 'unifiedpush',
    vapidPublicKey: 'A'.repeat(87),
  });
  act(() =>
    native.listeners.get('endpoint')?.(
      endpointEvent('https://push.example.test/id'),
    ),
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
  await act(async () => native.listeners.get('wake')?.(activationEvent()));
  expect(invalidation).toHaveBeenCalledWith({
    queryKey: notificationUnreadCountQueryKey('space-b'),
  });
  expect(api.getDevicePushConfiguration).toHaveBeenCalledTimes(1);

  await act(async () =>
    native.listeners.get('notificationOpen')?.(activationEvent()),
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
    native.listeners.get('endpoint')?.(
      endpointEvent('https://push.example.test/late'),
    ),
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
    native.listeners.get('endpoint')?.(
      endpointEvent('https://push.example.test/logout'),
    ),
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
    expect(nextLogin.api.getDevicePushConfiguration).toHaveBeenCalledOnce(),
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
    expect(nextLogin.api.getDevicePushConfiguration).toHaveBeenCalledOnce(),
  );
  expect(native.status).not.toHaveBeenCalled();

  await act(async () => finishDisable?.());
  await waitFor(() => expect(native.status).toHaveBeenCalledOnce());
  await waitFor(() => expect(nextLogin.result.current.state).toBe('off'));
});

it('keeps an unconfigured installation unavailable without enabling the device', async () => {
  const { result } = setup('space-a', (api) => {
    api.getDevicePushConfiguration.mockRejectedValue(httpError(503));
  });
  await waitFor(() => expect(result.current.state).toBe('unavailable'));
  expect(result.current.error).toBeNull();
  expect(result.current.registered).toBe(false);
  expect(native.enable).not.toHaveBeenCalled();
});

it('retries an unreachable status check when the user enables Push', async () => {
  const { api, result } = setup('space-a', (api) => {
    api.getDevicePushConfiguration.mockRejectedValueOnce(new Error('offline'));
  });
  await waitFor(() => expect(result.current.state).toBe('error'));
  expect(result.current.error).toBe('PUSH_DEVICE_STATUS_UNAVAILABLE');
  expect(result.current.registered).toBe(false);
  expect(native.enable).not.toHaveBeenCalled();

  await act(async () => result.current.enable());
  expect(api.getDevicePushConfiguration).toHaveBeenCalledTimes(2);
  expect(native.enable).toHaveBeenCalledOnce();
  expect(result.current.error).toBeNull();
});

it('shows transport absence if an unreachable status retry returns 503', async () => {
  const { result } = setup('space-a', (api) => {
    api.getDevicePushConfiguration
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
  native.status.mockResolvedValue(
    statusFixture({
      accountId: null,
      enabled: false,
      permissionGranted: false,
    }),
  );
  await act(async () => result.current.enable());
  expect(result.current.error).toBe('NOTIFICATION_PERMISSION_DENIED');
  expect(result.current.registered).toBe(false);
  await act(async () => result.current.openSettings());
  expect(native.openNotificationSettings).toHaveBeenCalledOnce();

  await act(async () => app.listeners.get('resume')?.({ url: '' }));
  expect(result.current.error).toBe('NOTIFICATION_PERMISSION_DENIED');
  native.status.mockResolvedValue(
    statusFixture({
      accountId: null,
      enabled: false,
      permissionGranted: true,
    }),
  );
  await act(async () => app.listeners.get('resume')?.({ url: '' }));
  expect(result.current.state).toBe('off');
  expect(result.current.error).toBeNull();
  expect(native.enable).toHaveBeenCalledOnce();
});

it('retains an active registration during an app-level permission block', async () => {
  native.status.mockResolvedValue(
    statusFixture({
      accountId,
      enabled: true,
      permissionGranted: false,
    }),
  );
  const { result } = setup();
  await waitFor(() =>
    expect(result.current.error).toBe('NOTIFICATION_PERMISSION_DENIED'),
  );
  expect(result.current.registered).toBe(true);
  expect(native.refresh).not.toHaveBeenCalled();
  native.status.mockResolvedValue(
    statusFixture({
      accountId,
      enabled: true,
      permissionGranted: true,
    }),
  );
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
  native.status.mockResolvedValue(
    statusFixture({
      accountId: nextAccountId,
      enabled: true,
      permissionGranted: true,
    }),
  );
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
    native.listeners.get('wake')?.(
      activationEvent({ accountId: 'previous-account' }),
    );
    native.listeners.get('unavailable')?.({
      ...activationEvent({ accountId: 'previous-account' }),
      reason: 'UNREGISTERED',
    });
  });
  expect(invalidate).not.toHaveBeenCalled();
  expect(result.current.state).toBe('off');
  expect(result.current.error).toBeNull();
  await act(async () => result.current.enable());
  await act(async () =>
    native.listeners.get('unavailable')?.({
      ...activationEvent(),
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
    if (kind === 'warm') {
      await waitFor(() => expect(result.current.state).toBe('off'));
      await act(async () => result.current.enable());
      await act(async () =>
        native.listeners.get('notificationOpen')?.(activationEvent()),
      );
    } else {
      await waitFor(() => expect(result.current.registered).toBe(true));
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

const fcmConfiguration = {
  providerKey: 'fcm',
  projectId: 'firebase-project',
  androidPackage: 'de.eimir.app',
};

function configureBoth(api: ReturnType<typeof createApi>) {
  api.getDevicePushConfiguration.mockResolvedValue({
    unifiedPush: { providerKey: 'unifiedpush', vapidPublicKey: 'A'.repeat(87) },
    fcm: fcmConfiguration,
  });
}

function fcmEndpointEvent(overrides: Record<string, unknown> = {}) {
  return {
    ...activationEvent({ providerKey: 'fcm' }),
    endpointValue: JSON.stringify({
      fid: 'c0123456789012345678901',
      activationId,
    }),
    ...overrides,
  };
}

it('selects matching configured FCM and writes its opaque endpoint through the existing API', async () => {
  native.state.fcmAvailable = true;
  const { api, result } = setup('space-a', configureBoth);
  await waitFor(() => expect(result.current.state).toBe('off'));
  await act(async () => result.current.enable());
  expect(native.enable).toHaveBeenCalledWith({
    accountId,
    apiBaseUrl,
    providerKey: 'fcm',
    firebaseProjectId: 'firebase-project',
    androidPackage: 'de.eimir.app',
  });
  await act(async () => native.listeners.get('endpoint')?.(fcmEndpointEvent()));
  await waitFor(() => expect(result.current.state).toBe('on'));
  expect(api.registerOwnPushEndpoint).toHaveBeenCalledExactlyOnceWith({
    pushEndpointRegistration: {
      providerKey: 'fcm',
      endpointValue: fcmEndpointEvent().endpointValue,
    },
  });
});

it('uses configured UnifiedPush when the device has no matching FCM capability', async () => {
  const { result } = setup('space-a', configureBoth);
  await waitFor(() => expect(result.current.state).toBe('off'));
  await act(async () => result.current.enable());
  expect(native.enable).toHaveBeenCalledWith({
    accountId,
    apiBaseUrl,
    providerKey: 'unifiedpush',
    vapidPublicKey: 'A'.repeat(87),
  });
});

it('keeps FCM-only installation unavailable on a device without FCM support', async () => {
  const { result } = setup('space-a', (api) => {
    api.getDevicePushConfiguration.mockResolvedValue({
      unifiedPush: null,
      fcm: fcmConfiguration,
    });
  });
  await waitFor(() => expect(result.current.state).toBe('unavailable'));
  expect(native.enable).not.toHaveBeenCalled();
});

it('preserves an active UnifiedPush transport when FCM becomes available', async () => {
  native.state = {
    ...statusFixture({ accountId, enabled: true, permissionGranted: true }),
    fcmAvailable: true,
  };
  const { api, result } = setup('space-a', configureBoth);
  await waitFor(() => expect(native.refresh).toHaveBeenCalledOnce());
  expect(native.refresh).toHaveBeenCalledWith({
    accountId,
    apiBaseUrl,
    providerKey: 'unifiedpush',
    vapidPublicKey: 'A'.repeat(87),
  });
  emitEndpoint();
  await waitFor(() => expect(result.current.state).toBe('on'));
  expect(
    api.registerOwnPushEndpoint.mock.calls[0][0].pushEndpointRegistration
      .providerKey,
  ).toBe('unifiedpush');
  expect(native.enable).not.toHaveBeenCalled();
});

it('does not silently register UnifiedPush after FCM activation fails', async () => {
  native.state.fcmAvailable = true;
  native.enable.mockRejectedValueOnce(new Error('FCM_REGISTRATION_FAILED'));
  const { api, result } = setup('space-a', configureBoth);
  await waitFor(() => expect(result.current.state).toBe('off'));
  await act(async () => result.current.enable());
  expect(result.current.state).toBe('error');
  expect(native.enable).toHaveBeenCalledOnce();
  expect(native.enable.mock.calls[0][0].providerKey).toBe('fcm');
  expect(api.registerOwnPushEndpoint).not.toHaveBeenCalled();
});

it.each([
  { apiBaseUrl: 'https://another-instance.test' },
  { activationId: '29837741-84b4-4f4f-949c-c2e844311cd5' },
  { providerKey: 'unifiedpush' },
])('rejects old endpoint, wake and tap bindings: %j', async (obsolete) => {
  native.state.fcmAvailable = true;
  const { api, queryClient, result } = setup('space-a', configureBoth);
  await waitFor(() => expect(result.current.state).toBe('off'));
  await act(async () => result.current.enable());
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const event = fcmEndpointEvent(obsolete);
  await act(async () => {
    native.listeners.get('endpoint')?.(event);
    native.listeners.get('wake')?.(event);
    native.listeners.get('notificationOpen')?.(event);
    native.listeners.get('unavailable')?.({ ...event, reason: 'UNREGISTERED' });
  });
  expect(api.registerOwnPushEndpoint).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  expect(screen.getByTestId('route').textContent).toBe('/today');
  expect(result.current.error).toBeNull();
  await act(async () => native.listeners.get('endpoint')?.(fcmEndpointEvent()));
  await waitFor(() => expect(result.current.state).toBe('on'));
});

it('retains a retired registration receipt and revokes it when the new activation registers', async () => {
  native.state.fcmAvailable = true;
  let complete: ((value: { id: string }) => void) | undefined;
  const { api, result } = setup('space-a', (api) => {
    configureBoth(api);
    api.registerOwnPushEndpoint.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    api.registerOwnPushEndpoint.mockResolvedValueOnce({ id: 'new-endpoint' });
  });
  await waitFor(() => expect(result.current.state).toBe('off'));
  await act(async () => result.current.enable());
  await act(async () => native.listeners.get('endpoint')?.(fcmEndpointEvent()));
  await waitFor(() =>
    expect(api.registerOwnPushEndpoint).toHaveBeenCalledOnce(),
  );
  const nextActivation = '29837741-84b4-4f4f-949c-c2e844311cd5';
  native.state.activationId = nextActivation;
  await act(async () => complete?.({ id: 'retired-endpoint' }));
  expect(window.localStorage.getItem(storageKey)).toBeNull();
  expect(window.localStorage.getItem(`${storageKey}:pending-revocations`)).toBe(
    '["retired-endpoint"]',
  );
  await act(async () =>
    native.listeners.get('endpoint')?.(
      fcmEndpointEvent({
        activationId: nextActivation,
        endpointValue: JSON.stringify({
          fid: 'c0123456789012345678901',
          activationId: nextActivation,
        }),
      }),
    ),
  );
  await waitFor(() =>
    expect(window.localStorage.getItem(storageKey)).toBe('new-endpoint'),
  );
  await waitFor(() =>
    expect(api.revokeOwnPushEndpoint).toHaveBeenCalledWith({
      endpointId: 'retired-endpoint',
    }),
  );
  expect(
    window.localStorage.getItem(`${storageKey}:pending-revocations`),
  ).toBeNull();
});

it('preserves a failed rotation revoke until later owned cleanup', async () => {
  native.state.fcmAvailable = true;
  const { api, result } = setup('space-a', (api) => {
    configureBoth(api);
    api.registerOwnPushEndpoint
      .mockResolvedValueOnce({ id: 'old-target' })
      .mockResolvedValueOnce({ id: 'new-target' });
    api.revokeOwnPushEndpoint.mockRejectedValueOnce(new Error('offline'));
  });
  await waitFor(() => expect(result.current.state).toBe('off'));
  await act(async () => result.current.enable());
  await act(async () => native.listeners.get('endpoint')?.(fcmEndpointEvent()));
  await waitFor(() =>
    expect(window.localStorage.getItem(storageKey)).toBe('old-target'),
  );
  await act(async () =>
    native.listeners.get('endpoint')?.(
      fcmEndpointEvent({
        endpointValue: JSON.stringify({
          fid: 'c1123456789012345678901',
          activationId,
        }),
      }),
    ),
  );
  await waitFor(() =>
    expect(api.revokeOwnPushEndpoint).toHaveBeenCalledWith({
      endpointId: 'old-target',
    }),
  );
  expect(window.localStorage.getItem(`${storageKey}:pending-revocations`)).toBe(
    '["old-target"]',
  );
  await act(async () => result.current.disable());
  expect(
    api.revokeOwnPushEndpoint.mock.calls.filter(
      ([request]) => request.endpointId === 'old-target',
    ),
  ).toHaveLength(2);
  expect(api.revokeOwnPushEndpoint).toHaveBeenCalledWith({
    endpointId: 'new-target',
  });
  expect(window.localStorage.getItem(storageKey)).toBeNull();
  expect(
    window.localStorage.getItem(`${storageKey}:pending-revocations`),
  ).toBeNull();
});

it('does not enable an old API instance after its configuration request completes late', async () => {
  let complete: ((value: DevicePushConfiguration) => void) | undefined;
  const { api, result, rerender } = setup('space-a', (api) => {
    api.getDevicePushConfiguration.mockRejectedValueOnce(new Error('offline'));
  });
  await waitFor(() => expect(result.current.state).toBe('error'));
  api.getDevicePushConfiguration.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  let enabling: Promise<void> | undefined;
  act(() => {
    enabling = result.current.enable();
  });
  await waitFor(() =>
    expect(api.getDevicePushConfiguration).toHaveBeenCalledTimes(2),
  );
  rerender({ spaceId: 'space-a', apiBase: 'https://new-instance.test' });
  await waitFor(() => expect(result.current.state).toBe('off'));
  await act(async () => {
    complete?.({
      unifiedPush: {
        providerKey: 'unifiedpush',
        vapidPublicKey: 'A'.repeat(87),
      },
      fcm: null,
    });
    await enabling;
  });
  expect(native.enable).not.toHaveBeenCalled();
});

it('revokes the server endpoint after immediate local disable even if FCM deletion is pending', async () => {
  native.state.fcmAvailable = true;
  const { api, result } = setup('space-a', configureBoth);
  await waitFor(() => expect(result.current.state).toBe('off'));
  await act(async () => result.current.enable());
  await act(async () => native.listeners.get('endpoint')?.(fcmEndpointEvent()));
  await waitFor(() => expect(result.current.state).toBe('on'));
  native.disable.mockImplementationOnce(async () => {
    native.state = statusFixture({
      accountId: null,
      enabled: false,
      permissionGranted: true,
    });
    throw new Error('FCM_CLEANUP_PENDING');
  });
  await act(async () => result.current.disable());
  expect(api.revokeOwnPushEndpoint).toHaveBeenCalledWith({
    endpointId: 'endpoint-id',
  });
  expect(result.current.registered).toBe(false);
  expect(result.current.state).toBe('off');
  expect(result.current.error).toBe('PUSH_DEVICE_CLEANUP_PENDING');
});

it.each([
  { firebaseProjectId: 'another-project' },
  { androidPackage: 'another.app' },
])(
  'selects UnifiedPush before registration when the compiled FCM identity does not match %o',
  async (identity) => {
    native.state = { ...native.state, fcmAvailable: true, ...identity };
    const { result } = setup('space-a', configureBoth);
    await waitFor(() => expect(result.current.state).toBe('off'));
    await act(async () => result.current.enable());
    expect(native.enable).toHaveBeenCalledWith({
      accountId,
      apiBaseUrl,
      providerKey: 'unifiedpush',
      vapidPublicKey: 'A'.repeat(87),
    });
  },
);

it.each([false, true])(
  'retires native ownership when receipt/server cleanup fail, even with a failed status read: %s',
  async (statusFails) => {
    native.state.fcmAvailable = true;
    const { api, result } = setup('space-a', configureBoth);
    await waitFor(() => expect(result.current.state).toBe('off'));
    await act(async () => result.current.enable());
    api.revokeOwnPushEndpoint.mockRejectedValue(new Error('offline'));
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      if (statusFails)
        native.status.mockRejectedValueOnce(new Error('status unavailable'));
      throw new Error('storage full');
    });
    await act(async () =>
      native.listeners.get('endpoint')?.(fcmEndpointEvent()),
    );
    await waitFor(() => expect(native.disable).toHaveBeenCalledOnce());
    expect(native.state.enabled).toBe(false);
    expect(result.current.registered).toBe(false);
    expect(result.current.state).toBe('error');
    expect(api.revokeOwnPushEndpoint).toHaveBeenCalledWith({
      endpointId: 'endpoint-id',
    });
  },
);

it('reflects a valid native retirement failure after native ownership has already been cleared', async () => {
  native.state.fcmAvailable = true;
  const { result } = setup('space-a', configureBoth);
  await waitFor(() => expect(result.current.state).toBe('off'));
  await act(async () => result.current.enable());
  await act(async () => native.listeners.get('endpoint')?.(fcmEndpointEvent()));
  await waitFor(() => expect(result.current.state).toBe('on'));
  native.state = {
    ...native.state,
    accountId: null,
    apiBaseUrl: null,
    providerKey: null,
    activationId: null,
    enabled: false,
  };
  await act(async () =>
    native.listeners.get('unavailable')?.({
      ...activationEvent({ providerKey: 'fcm' }),
      reason: 'PUSH_DEVICE_STORAGE_UNAVAILABLE',
    }),
  );
  expect(result.current.state).toBe('error');
  expect(result.current.error).toBe('PUSH_DEVICE_STORAGE_UNAVAILABLE');
  expect(result.current.registered).toBe(false);
});

it('keeps a still-active device visible when retry cleanup cannot remove an old rotation', async () => {
  native.state = {
    ...statusFixture({ accountId, enabled: true, permissionGranted: true }),
    providerKey: 'fcm',
    fcmAvailable: true,
  };
  stored.set(storageKey, 'current-endpoint');
  stored.set(`${storageKey}:pending-revocations`, '["old-endpoint"]');
  const { api, result } = setup('space-a', (api) => {
    api.getDevicePushConfiguration.mockRejectedValueOnce(new Error('offline'));
    api.revokeOwnPushEndpoint.mockRejectedValue(new Error('offline'));
  });
  await waitFor(() => expect(result.current.state).toBe('error'));
  await act(async () => result.current.enable());
  expect(result.current.state).toBe('error');
  expect(result.current.error).not.toBe('PUSH_DEVICE_CLEANUP_PENDING');
  expect(result.current.registered).toBe(true);
  expect(native.state.enabled).toBe(true);
  expect(api.revokeOwnPushEndpoint).not.toHaveBeenCalledWith({
    endpointId: 'current-endpoint',
  });
});

it.each(['fcm', 'unifiedpush'] as const)(
  'restores a consented %s activation while its native registration is still pending',
  async (providerKey) => {
    native.state = {
      ...statusFixture({ accountId, enabled: false, permissionGranted: true }),
      providerKey,
      fcmAvailable: true,
    };
    const { api, result } = setup('space-a', configureBoth);
    await waitFor(() => expect(native.refresh).toHaveBeenCalledOnce());
    expect(native.enable).not.toHaveBeenCalled();
    native.state.enabled = true;
    await act(async () =>
      native.listeners.get('endpoint')?.(
        providerKey === 'fcm' ? fcmEndpointEvent() : endpointEvent(),
      ),
    );
    await waitFor(() => expect(result.current.state).toBe('on'));
    expect(api.registerOwnPushEndpoint).toHaveBeenCalledOnce();
    expect(result.current.registered).toBe(true);
  },
);

it('resolves a notification tap through authenticated recipient state and opens its source once', async () => {
  native.state = statusFixture({
    accountId,
    enabled: true,
    permissionGranted: true,
  });
  const { api } = setup();
  await waitFor(() =>
    expect(native.listeners.has('notificationOpen')).toBe(true),
  );
  const notificationId = 'ed0ca1ae-ad80-4876-8a39-1d909b18f8e8';
  act(() => {
    native.listeners.get('notificationOpen')?.(
      activationEvent({ notificationId }),
    );
    native.listeners.get('notificationOpen')?.(
      activationEvent({ notificationId }),
    );
  });
  await waitFor(() =>
    expect(screen.getByTestId('route').textContent).toBe(
      '/story/memories/saved-note',
    ),
  );
  expect(api.openNotification).toHaveBeenCalledExactlyOnceWith({
    spaceId: 'space-a',
    notificationId,
  });
});

it('falls back to the safe inbox when a tapped source is no longer authorized', async () => {
  native.state = statusFixture({
    accountId,
    enabled: true,
    permissionGranted: true,
  });
  const { api } = setup('space-a', (api) =>
    api.openNotification.mockRejectedValue(new Error('Unavailable')),
  );
  await waitFor(() =>
    expect(native.listeners.has('notificationOpen')).toBe(true),
  );
  act(() =>
    native.listeners.get('notificationOpen')?.(
      activationEvent({
        notificationId: 'ed0ca1ae-ad80-4876-8a39-1d909b18f8e8',
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.getByTestId('route').textContent).toBe('/more/notifications'),
  );
  expect(api.openNotification).toHaveBeenCalledOnce();
});

it('does not navigate from a pending tap after leaving and returning to the same Space', async () => {
  let finish!: (value: {
    kind: string;
    targetType: string;
    targetId: string;
  }) => void;
  native.state = statusFixture({
    accountId,
    enabled: true,
    permissionGranted: true,
  });
  const { api, rerender } = setup('space-a', (api) => {
    api.openNotification.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  });
  await waitFor(() =>
    expect(native.listeners.has('notificationOpen')).toBe(true),
  );
  act(() =>
    native.listeners.get('notificationOpen')?.(
      activationEvent({
        notificationId: 'ed0ca1ae-ad80-4876-8a39-1d909b18f8e8',
      }),
    ),
  );
  await waitFor(() => expect(api.openNotification).toHaveBeenCalledOnce());
  rerender({ spaceId: 'space-b' });
  rerender({ spaceId: 'space-a' });
  await act(async () =>
    finish({
      kind: 'COUPLE_EXPERIENCE_SHARED',
      targetType: 'MEMORY',
      targetId: 'saved-note',
    }),
  );
  expect(screen.getByTestId('route').textContent).toBe('/today');
});

it('keeps older servers usable through the authenticated UnifiedPush configuration route', async () => {
  const { api, result } = setup('space-a', (api) => {
    api.getDevicePushConfiguration.mockRejectedValue(
      new ResponseError(new Response(null, { status: 404 })),
    );
  });
  await waitFor(() => expect(result.current.state).toBe('off'));
  expect(api.getUnifiedPushConfiguration).toHaveBeenCalledOnce();
  await act(() => result.current.enable());
  expect(native.enable).toHaveBeenCalledWith(
    expect.objectContaining({
      accountId,
      apiBaseUrl,
      providerKey: 'unifiedpush',
      notificationReferenceVersion: 1,
    }),
  );
});

it('does not switch configuration routes after a temporary failure', async () => {
  const { api, result } = setup('space-a', (api) => {
    api.getDevicePushConfiguration.mockRejectedValue(
      new Error('Synthetic outage'),
    );
  });
  await waitFor(() => expect(result.current.state).toBe('error'));
  expect(api.getUnifiedPushConfiguration).not.toHaveBeenCalled();
});

it.each([
  { server: 1, connector: 1, expected: 1 },
  { server: 1, connector: undefined, expected: undefined },
  { server: undefined, connector: 1, expected: undefined },
])(
  'negotiates encrypted notification references with server $server and connector $connector',
  async ({ server, connector, expected }) => {
    native.state = statusFixture({
      accountId,
      enabled: true,
      permissionGranted: true,
    });
    const { api } = setup('space-a', (api) => {
      api.getDevicePushConfiguration.mockResolvedValue({
        unifiedPush: {
          providerKey: 'unifiedpush',
          vapidPublicKey: 'A'.repeat(87),
          ...(server === 1 ? { notificationReferenceVersion: 1 } : {}),
        },
        fcm: null,
      });
    });
    await waitFor(() => expect(native.refresh).toHaveBeenCalled());
    const event = endpointEvent();
    const subscription = JSON.parse(event.endpointValue);
    if (connector !== undefined)
      subscription.notificationReferenceVersion = connector;
    act(() =>
      native.listeners.get('endpoint')?.({
        ...event,
        endpointValue: JSON.stringify(subscription),
      }),
    );
    await waitFor(() =>
      expect(api.registerOwnPushEndpoint).toHaveBeenCalledOnce(),
    );
    const registration = api.registerOwnPushEndpoint.mock.calls[0][0];
    if (!registration) throw new Error('Expected endpoint registration');
    const registered = JSON.parse(
      registration.pushEndpointRegistration.endpointValue,
    );
    expect(registered.notificationReferenceVersion).toBe(expected);
    expect(registered.endpoint).toBe(subscription.endpoint);
    expect(registered.keys).toEqual(subscription.keys);
  },
);
