import { App } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
import type { QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { UnifiedPushConfiguration } from '../api/generated/models/UnifiedPushConfiguration';
import { ResponseError } from '../api/generated/runtime';
import { isCapacitorNative } from '../pwa';
import {
  notificationsListQueryKey,
  notificationUnreadCountQueryKey,
} from './notificationQueries';
import { MORE_NOTIFICATIONS_ROUTE } from './routes';

type EndpointEvent = {
  accountId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type NativePushPlugin = {
  status(): Promise<{
    accountId: string | null;
    enabled: boolean;
    permissionGranted: boolean;
  }>;
  enable(options: { accountId: string; vapidPublicKey: string }): Promise<void>;
  refresh(options: {
    accountId: string;
    vapidPublicKey: string;
  }): Promise<{ enabled: boolean }>;
  disable(): Promise<void>;
  openNotificationSettings(): Promise<void>;
  addListener(
    event: 'endpoint',
    callback: (event: EndpointEvent) => void,
  ): Promise<{ remove(): Promise<void> }>;
  addListener(
    event: 'wake',
    callback: () => void,
  ): Promise<{ remove(): Promise<void> }>;
  addListener(
    event: 'unavailable',
    callback: (event: { reason: string }) => void,
  ): Promise<{ remove(): Promise<void> }>;
};

const nativePush = registerPlugin<NativePushPlugin>('EimirUnifiedPush');
let registrationGeneration = 0;
let pendingSignOutDisable: Promise<void> = Promise.resolve();
let endpointRegistrationSequence: Promise<void> = Promise.resolve();

export type DevicePushState =
  | 'loading'
  | 'unavailable'
  | 'off'
  | 'connecting'
  | 'disconnecting'
  | 'on'
  | 'error';

export interface DevicePushController {
  available: boolean;
  state: DevicePushState;
  error: string | null;
  /** True only while this device is registered with a distributor for this Account. */
  registered: boolean;
  enable(): Promise<void>;
  disable(): Promise<void>;
  openSettings(): Promise<void>;
}

function responseStatus(error: unknown): number | null {
  return error instanceof ResponseError ? error.response.status : null;
}

function endpointIdKey(apiBaseUrl: string, accountId: string): string {
  return `eimir-unifiedpush-endpoint-v1:${apiBaseUrl}:${accountId}`;
}

function readEndpointId(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveEndpointId(key: string, value: string): void {
  window.localStorage.setItem(key, value);
}

function clearEndpointId(key: string): void {
  window.localStorage.removeItem(key);
}

async function revokeSavedEndpoint(
  key: string,
  notificationsApi: NotificationsApi,
): Promise<void> {
  const id = readEndpointId(key);
  if (!id) return;
  try {
    await notificationsApi.revokeOwnPushEndpoint({ endpointId: id });
  } catch (error) {
    // 404: already revoked or expired on the server; nothing is left to retry.
    if (responseStatus(error) !== 404) throw error;
  }
  if (readEndpointId(key) === id) clearEndpointId(key);
}

async function loadConfiguration(
  notificationsApi: NotificationsApi,
): Promise<
  | { configuration: UnifiedPushConfiguration; failure: null }
  | { configuration: null; failure: 'unavailable' | 'unreachable' }
> {
  try {
    return {
      configuration: await notificationsApi.getUnifiedPushConfiguration(),
      failure: null,
    };
  } catch (error) {
    // 503 means the installation has no Push transport; anything else is a
    // transient inability to check and must not read as a permanent absence.
    return {
      configuration: null,
      failure: responseStatus(error) === 503 ? 'unavailable' : 'unreachable',
    };
  }
}

function isInboxLaunchUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'de.sidebyside.app:' &&
      url.hostname === 'notifications' &&
      (url.pathname === '' || url.pathname === '/') &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function useUnifiedPush({
  accountId,
  apiBaseUrl,
  notificationsApi,
  queryClient,
  spaceId,
}: {
  accountId: string;
  apiBaseUrl: string;
  notificationsApi: NotificationsApi;
  queryClient: QueryClient;
  spaceId: string;
}): DevicePushController {
  const native = isCapacitorNative();
  const navigate = useNavigate();
  const [state, setState] = useState<DevicePushState>(
    native ? 'loading' : 'unavailable',
  );
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const configuration = useRef<UnifiedPushConfiguration | null>(null);
  const errorRef = useRef<string | null>(null);
  const key = endpointIdKey(apiBaseUrl, accountId);
  const currentSpaceId = useRef(spaceId);
  const handledLaunchUrl = useRef(false);
  const registrationAllowed = useRef(true);
  currentSpaceId.current = spaceId;
  errorRef.current = error;

  const syncRegistered = useCallback(async () => {
    try {
      const nativeState = await nativePush.status();
      setRegistered(nativeState.enabled && nativeState.accountId === accountId);
    } catch {
      // Keep the last known value; the next start re-reads native state.
    }
  }, [accountId]);

  useEffect(() => {
    if (!native) return;
    let live = true;
    const subscriptions = [
      nativePush.addListener('endpoint', (event) => {
        if (
          !live ||
          !registrationAllowed.current ||
          event.accountId !== accountId
        )
          return;
        const generation = registrationGeneration;
        endpointRegistrationSequence = endpointRegistrationSequence
          .catch(() => undefined)
          .then(async () => {
            const registration = await notificationsApi.registerOwnPushEndpoint(
              {
                pushEndpointRegistration: {
                  providerKey: 'unifiedpush',
                  endpointValue: JSON.stringify({
                    endpoint: event.endpoint,
                    keys: { p256dh: event.p256dh, auth: event.auth },
                  }),
                },
              },
            );
            const previous = readEndpointId(key);
            try {
              saveEndpointId(key, registration.id);
            } catch {
              await notificationsApi.revokeOwnPushEndpoint({
                endpointId: registration.id,
              });
              await nativePush.disable();
              throw new Error('PUSH_DEVICE_STORAGE_UNAVAILABLE');
            }
            if (previous && previous !== registration.id) {
              try {
                await notificationsApi.revokeOwnPushEndpoint({
                  endpointId: previous,
                });
              } catch {
                // The current registration is usable; stale rows expire on delivery.
              }
            }
            if (
              live &&
              registrationAllowed.current &&
              generation === registrationGeneration
            ) {
              setError(null);
              setState('on');
              void queryClient.invalidateQueries({
                queryKey: ['notification-preferences', accountId],
              });
            }
          })
          .catch(async (cause: unknown) => {
            const current =
              live &&
              registrationAllowed.current &&
              generation === registrationGeneration;
            if (responseStatus(cause) === 422) {
              // The backend does not accept this distributor's origin. A retry
              // cannot succeed, so stop device receipt instead of re-registering
              // on every start.
              if (current) {
                registrationAllowed.current = false;
                registrationGeneration += 1;
              }
              await nativePush.disable().catch(() => undefined);
              if (live) setRegistered(false);
              if (current) {
                setError('PUSH_ENDPOINT_UNSUPPORTED');
                setState('error');
              }
              return;
            }
            if (current) {
              setError('PUSH_DEVICE_REGISTRATION_FAILED');
              setState('error');
            }
          });
      }),
      nativePush.addListener('wake', () => {
        if (!live) return;
        const activeSpaceId = currentSpaceId.current;
        void queryClient.invalidateQueries({
          queryKey: notificationUnreadCountQueryKey(activeSpaceId),
        });
        void queryClient.invalidateQueries({
          queryKey: notificationsListQueryKey(activeSpaceId),
        });
      }),
      nativePush.addListener('unavailable', ({ reason }) => {
        if (!live) return;
        setError(reason);
        setState('error');
        void syncRegistered();
      }),
      App.addListener('appUrlOpen', ({ url }) => {
        if (!live) return;
        if (isInboxLaunchUrl(url)) navigate(MORE_NOTIFICATIONS_ROUTE);
      }),
      App.addListener('resume', () => {
        // Returning from the system notification settings: re-check the
        // permission instead of reopening the prompt.
        if (!live || errorRef.current !== 'NOTIFICATION_PERMISSION_DENIED')
          return;
        void (async () => {
          const nativeState = await nativePush.status();
          if (!live || !nativeState.permissionGranted) return;
          const here =
            nativeState.enabled && nativeState.accountId === accountId;
          setRegistered(here);
          setError(null);
          setState(here ? 'on' : 'off');
        })().catch(() => undefined);
      }),
    ];

    void (async () => {
      try {
        await Promise.all(subscriptions);
        if (!handledLaunchUrl.current) {
          const launch = await App.getLaunchUrl();
          if (launch?.url && isInboxLaunchUrl(launch.url)) {
            handledLaunchUrl.current = true;
            navigate(MORE_NOTIFICATIONS_ROUTE);
          }
        }
        const loaded = await loadConfiguration(notificationsApi);
        if (!live) return;
        configuration.current = loaded.configuration;
        await pendingSignOutDisable;
        const nativeState = await nativePush.status();
        if (!live) return;
        const otherAccount =
          nativeState.accountId !== null && nativeState.accountId !== accountId;
        if (otherAccount) {
          registrationAllowed.current = false;
          await nativePush.disable();
        }
        const registeredHere = !otherAccount && nativeState.enabled;
        setRegistered(registeredHere);

        let cleanupPending = false;
        if (!registeredHere) {
          registrationAllowed.current = false;
          if (readEndpointId(key)) setState('disconnecting');
          try {
            await endpointRegistrationSequence;
            await revokeSavedEndpoint(key, notificationsApi);
          } catch {
            cleanupPending = true;
          }
        }
        if (!live) return;

        if (!loaded.configuration) {
          if (loaded.failure === 'unreachable') {
            setError('PUSH_DEVICE_STATUS_UNAVAILABLE');
            setState('error');
          } else {
            setState('unavailable');
          }
          return;
        }
        if (!registeredHere) {
          if (cleanupPending) setError('PUSH_DEVICE_CLEANUP_PENDING');
          setState('off');
          return;
        }
        if (!nativeState.permissionGranted) {
          setError('NOTIFICATION_PERMISSION_DENIED');
          setState('error');
          return;
        }
        setState('connecting');
        const refreshed = await nativePush.refresh({
          accountId,
          vapidPublicKey: loaded.configuration.vapidPublicKey,
        });
        if (!live || !registrationAllowed.current) return;
        if (!refreshed.enabled) {
          setRegistered(false);
          setError('NO_PUSH_DISTRIBUTOR');
          setState('error');
        }
      } catch {
        if (live) setState('unavailable');
      }
    })();

    return () => {
      live = false;
      for (const subscription of subscriptions) {
        void subscription
          .then((handle) => handle.remove())
          .catch(() => undefined);
      }
    };
  }, [
    accountId,
    key,
    native,
    navigate,
    notificationsApi,
    queryClient,
    syncRegistered,
  ]);

  const enable = useCallback(async () => {
    if (!native) return;
    registrationAllowed.current = true;
    const generation = registrationGeneration;
    setError(null);
    setState('connecting');
    if (!configuration.current) {
      // The status check failed earlier; enabling retries it.
      const loaded = await loadConfiguration(notificationsApi);
      if (generation !== registrationGeneration) return;
      if (!loaded.configuration) {
        registrationAllowed.current = false;
        setError(
          loaded.failure === 'unavailable'
            ? null
            : 'PUSH_DEVICE_STATUS_UNAVAILABLE',
        );
        setState(loaded.failure === 'unavailable' ? 'unavailable' : 'error');
        return;
      }
      configuration.current = loaded.configuration;
    }
    const { vapidPublicKey } = configuration.current;
    try {
      await nativePush.enable({ accountId, vapidPublicKey });
      if (
        generation !== registrationGeneration &&
        !registrationAllowed.current
      ) {
        await nativePush.disable();
      }
    } catch (cause) {
      if (generation !== registrationGeneration) return;
      registrationAllowed.current = false;
      setError(
        cause instanceof Error
          ? cause.message
          : 'PUSH_DEVICE_REGISTRATION_FAILED',
      );
      setState('error');
    } finally {
      await syncRegistered();
    }
  }, [accountId, native, notificationsApi, syncRegistered]);

  const disable = useCallback(async () => {
    registrationAllowed.current = false;
    registrationGeneration += 1;
    setState('disconnecting');
    try {
      await nativePush.disable();
    } catch {
      setError('PUSH_DEVICE_DISABLE_FAILED');
      setState('error');
      return;
    }
    setRegistered(false);
    try {
      await endpointRegistrationSequence;
      await revokeSavedEndpoint(key, notificationsApi);
      setError(null);
      void queryClient.invalidateQueries({
        queryKey: ['notification-preferences', accountId],
      });
    } catch {
      setError('PUSH_DEVICE_CLEANUP_PENDING');
    }
    setState('off');
  }, [accountId, key, notificationsApi, queryClient]);

  const openSettings = useCallback(async () => {
    if (!native) return;
    try {
      await nativePush.openNotificationSettings();
    } catch {
      // The status line already explains where to allow notifications.
    }
  }, [native]);

  return {
    available: native,
    state,
    error,
    registered,
    enable,
    disable,
    openSettings,
  };
}

/**
 * Revoke this device's server endpoint while the session is still valid.
 *
 * Called on explicit sign-out before the session is revoked, so the server
 * stops sending wakes to a device that no longer receives them. A failure is
 * left to the existing cleanup at the next sign-in of the same Account.
 */
export async function revokeDevicePushBeforeSignOut(
  apiBaseUrl: string,
  accountId: string,
  notificationsApi: NotificationsApi,
): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await endpointRegistrationSequence.catch(() => undefined);
    await revokeSavedEndpoint(
      endpointIdKey(apiBaseUrl, accountId),
      notificationsApi,
    );
  } catch {
    // Retried after the next sign-in of this Account on this device.
  }
}

export function stopNativePushForSignedOutAccount(): void {
  if (isCapacitorNative()) {
    registrationGeneration += 1;
    pendingSignOutDisable = nativePush.disable().catch(() => undefined);
  }
}
