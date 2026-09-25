import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { UnifiedPushConfiguration } from '../api/generated/models/UnifiedPushConfiguration';
import {
  notificationsListQueryKey,
  notificationUnreadCountQueryKey,
} from './notificationQueries';
import { MORE_NOTIFICATIONS_ROUTE } from './routes';
import { isCapacitorNative } from '../pwa';
import type { QueryClient } from '@tanstack/react-query';

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

export type DevicePushState =
  | 'loading'
  | 'unavailable'
  | 'off'
  | 'connecting'
  | 'on'
  | 'error';

export interface DevicePushController {
  available: boolean;
  state: DevicePushState;
  error: string | null;
  enable(): Promise<void>;
  disable(): Promise<void>;
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
  await notificationsApi.revokeOwnPushEndpoint({ endpointId: id });
  clearEndpointId(key);
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
  const [configuration, setConfiguration] =
    useState<UnifiedPushConfiguration | null>(null);
  const key = endpointIdKey(apiBaseUrl, accountId);
  const currentSpaceId = useRef(spaceId);
  const handledLaunchUrl = useRef(false);
  currentSpaceId.current = spaceId;

  useEffect(() => {
    if (!native) return;
    let live = true;
    let sequence: Promise<void> = Promise.resolve();
    const subscriptions = [
      nativePush.addListener('endpoint', (event) => {
        if (event.accountId !== accountId) return;
        sequence = sequence
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
            if (!live) return;
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
            setError(null);
            setState('on');
            void queryClient.invalidateQueries({
              queryKey: ['notification-preferences', accountId],
            });
          })
          .catch(() => {
            if (live) {
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
      }),
      App.addListener('appUrlOpen', ({ url }) => {
        if (!live) return;
        if (isInboxLaunchUrl(url)) navigate(MORE_NOTIFICATIONS_ROUTE);
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
        const config = await notificationsApi.getUnifiedPushConfiguration();
        if (!live) return;
        setConfiguration(config);
        const nativeState = await nativePush.status();
        if (!live) return;
        if (nativeState.accountId && nativeState.accountId !== accountId) {
          await nativePush.disable();
          setState('off');
        } else if (nativeState.enabled) {
          if (!nativeState.permissionGranted) {
            setError('NOTIFICATION_PERMISSION_DENIED');
            setState('error');
          } else {
            setState('connecting');
            const refreshed = await nativePush.refresh({
              accountId,
              vapidPublicKey: config.vapidPublicKey,
            });
            if (!refreshed.enabled) {
              setError('NO_PUSH_DISTRIBUTOR');
              setState('error');
            }
          }
        } else {
          setState('off');
          try {
            await revokeSavedEndpoint(key, notificationsApi);
          } catch {
            setError('PUSH_DEVICE_CLEANUP_PENDING');
          }
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
  }, [accountId, key, native, navigate, notificationsApi, queryClient]);

  const enable = useCallback(async () => {
    if (!native || !configuration) return;
    setError(null);
    setState('connecting');
    try {
      await nativePush.enable({
        accountId,
        vapidPublicKey: configuration.vapidPublicKey,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'PUSH_DEVICE_REGISTRATION_FAILED',
      );
      setState('error');
    }
  }, [accountId, configuration, native]);

  const disable = useCallback(async () => {
    try {
      await nativePush.disable();
    } catch {
      setError('PUSH_DEVICE_DISABLE_FAILED');
      setState('error');
      return;
    }
    setError(null);
    setState('off');
    try {
      await revokeSavedEndpoint(key, notificationsApi);
      void queryClient.invalidateQueries({
        queryKey: ['notification-preferences', accountId],
      });
    } catch {
      setError('PUSH_DEVICE_CLEANUP_PENDING');
    }
  }, [accountId, key, notificationsApi, queryClient]);

  return { available: native, state, error, enable, disable };
}

export function stopNativePushForSignedOutAccount(): void {
  if (isCapacitorNative()) void nativePush.disable().catch(() => undefined);
}
