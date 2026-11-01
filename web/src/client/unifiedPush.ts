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
import { dashboardQueryKey } from './dashboardQueries';
import { notificationPath } from './m4Product';
import { postSnackbar } from './snackbar';
import {
  isDocumentLeaveBlocked,
  useDocumentLeaveBlocked,
} from './useDocumentLeaveGuard';

type EndpointEvent = {
  accountId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  notificationReferenceVersion?: number;
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
    event: 'wake' | 'notificationOpen',
    callback: (event: { accountId: string; notificationId?: string }) => void,
  ): Promise<{ remove(): Promise<void> }>;
  addListener(
    event: 'unavailable',
    callback: (event: { accountId: string; reason: string }) => void,
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
  signal?: AbortSignal,
): Promise<void> {
  const id = readEndpointId(key);
  if (!id) return;
  try {
    signal?.throwIfAborted();
    if (signal) {
      await notificationsApi.revokeOwnPushEndpoint(
        { endpointId: id },
        { signal },
      );
    } else {
      await notificationsApi.revokeOwnPushEndpoint({ endpointId: id });
    }
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
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  const blocked = useDocumentLeaveBlocked();
  const [pendingInbox, setPendingInbox] = useState<string | null>(null);
  const pendingNotification = useRef<string | undefined>(undefined);
  const openedHints = useRef(new Set<string>());
  const [state, setState] = useState<DevicePushState>(
    native ? 'loading' : 'unavailable',
  );
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const configuration = useRef<UnifiedPushConfiguration | null>(null);
  const errorRef = useRef<string | null>(null);
  const key = endpointIdKey(apiBaseUrl, accountId);
  const navigationScope = `${key}:${spaceId}`;
  const navigationOwner = useRef({ scope: navigationScope });
  if (navigationOwner.current.scope !== navigationScope) {
    navigationOwner.current = { scope: navigationScope };
    openedHints.current.clear();
  }
  const activeKey = useRef(key);
  activeKey.current = key;
  useEffect(() => {
    activeKey.current = key;
    return () => {
      activeKey.current = '';
    };
  }, [key]);
  const currentSpaceId = useRef(spaceId);
  const registrationAllowed = useRef(true);
  currentSpaceId.current = spaceId;
  errorRef.current = error;

  const openInbox = useCallback(
    (notificationId?: string) => {
      if (isDocumentLeaveBlocked()) {
        pendingNotification.current = notificationId;
        setPendingInbox(`${key}:${currentSpaceId.current}`);
        postSnackbar('snackbar.notificationWaiting');
        return;
      }
      setPendingInbox(null);
      if (
        !notificationId ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(notificationId)
      ) {
        navigateRef.current(MORE_NOTIFICATIONS_ROUTE);
        return;
      }
      const hintKey = `${key}:${notificationId}`;
      if (openedHints.current.has(hintKey)) return;
      openedHints.current.add(hintKey);
      if (openedHints.current.size > 64)
        openedHints.current.delete(
          openedHints.current.values().next().value as string,
        );
      const requestedSpace = currentSpaceId.current;
      const requestedOwner = navigationOwner.current;
      void notificationsApi
        .openNotification({ spaceId: requestedSpace, notificationId })
        .then((item) => {
          if (
            activeKey.current !== key ||
            navigationOwner.current !== requestedOwner ||
            requestedSpace !== currentSpaceId.current
          ) {
            openedHints.current.delete(hintKey);
            return;
          }
          void queryClient.invalidateQueries({
            queryKey: notificationUnreadCountQueryKey(requestedSpace),
          });
          void queryClient.invalidateQueries({
            queryKey: notificationsListQueryKey(requestedSpace),
          });
          if (isDocumentLeaveBlocked()) {
            openedHints.current.delete(hintKey);
            pendingNotification.current = notificationId;
            setPendingInbox(`${key}:${currentSpaceId.current}`);
            postSnackbar('snackbar.notificationWaiting');
            return;
          }
          navigateRef.current(
            notificationPath(item) ?? MORE_NOTIFICATIONS_ROUTE,
          );
        })
        .catch(() => {
          if (
            activeKey.current === key &&
            requestedSpace === currentSpaceId.current &&
            navigationOwner.current === requestedOwner
          ) {
            if (isDocumentLeaveBlocked()) {
              pendingNotification.current = undefined;
              setPendingInbox(`${key}:${currentSpaceId.current}`);
            } else navigateRef.current(MORE_NOTIFICATIONS_ROUTE);
          }
        });
    },
    [key, notificationsApi, queryClient],
  );

  useEffect(() => {
    if (!pendingInbox) return;
    if (pendingInbox !== `${key}:${spaceId}`) {
      pendingNotification.current = undefined;
      setPendingInbox(null);
      return;
    }
    if (blocked) return;
    setPendingInbox(null);
    const notificationId = pendingNotification.current;
    pendingNotification.current = undefined;
    openInbox(notificationId);
  }, [blocked, key, spaceId, pendingInbox, openInbox]);

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
            if (
              !live ||
              !registrationAllowed.current ||
              generation !== registrationGeneration
            )
              return;
            const registration = await notificationsApi.registerOwnPushEndpoint(
              {
                pushEndpointRegistration: {
                  providerKey: 'unifiedpush',
                  endpointValue: JSON.stringify({
                    endpoint: event.endpoint,
                    keys: { p256dh: event.p256dh, auth: event.auth },
                    ...(event.notificationReferenceVersion === 1 &&
                    configuration.current?.notificationReferenceVersion === 1
                      ? { notificationReferenceVersion: 1 }
                      : {}),
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
              if (
                live &&
                registrationAllowed.current &&
                generation === registrationGeneration
              )
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
              if (!current) return;
              registrationAllowed.current = false;
              registrationGeneration += 1;
              await nativePush.disable().catch(() => undefined);
              if (live) setRegistered(false);
              if (live && current) {
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
      nativePush.addListener('wake', (event) => {
        if (!live || event.accountId !== accountId) return;
        const activeSpaceId = currentSpaceId.current;
        void queryClient.invalidateQueries({
          queryKey: notificationUnreadCountQueryKey(activeSpaceId),
        });
        void queryClient.invalidateQueries({
          queryKey: notificationsListQueryKey(activeSpaceId),
        });
        void queryClient.invalidateQueries({
          queryKey: dashboardQueryKey(activeSpaceId),
        });
      }),
      nativePush.addListener(
        'unavailable',
        ({ accountId: eventAccountId, reason }) => {
          if (!live || eventAccountId !== accountId) return;
          setError(reason);
          setState('error');
          void syncRegistered();
        },
      ),
      nativePush.addListener('notificationOpen', (event) => {
        if (!live || event.accountId !== accountId) return;
        openInbox(event.notificationId);
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
        if (!live) return;
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
    openInbox,
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
  signal?: AbortSignal,
): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await endpointRegistrationSequence.catch(() => undefined);
    await revokeSavedEndpoint(
      endpointIdKey(apiBaseUrl, accountId),
      notificationsApi,
      signal,
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
