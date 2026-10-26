import { App } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
import type { QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { DevicePushConfiguration } from '../api/generated/models/DevicePushConfiguration';
import { ResponseError } from '../api/generated/runtime';
import { isCapacitorNative } from '../pwa';
import {
  notificationsListQueryKey,
  notificationUnreadCountQueryKey,
} from './notificationQueries';
import { MORE_NOTIFICATIONS_ROUTE } from './routes';
import { postSnackbar } from './snackbar';
import {
  isDocumentLeaveBlocked,
  useDocumentLeaveBlocked,
} from './useDocumentLeaveGuard';

type ProviderKey = 'unifiedpush' | 'fcm';

type ActivationEvent = {
  accountId: string;
  apiBaseUrl: string;
  providerKey: ProviderKey;
  activationId: string;
};

type EndpointEvent = ActivationEvent & {
  endpointValue: string;
};

type NativePushStatus = {
  accountId: string | null;
  apiBaseUrl: string | null;
  providerKey: ProviderKey | null;
  activationId: string | null;
  enabled: boolean;
  permissionGranted: boolean;
  fcmAvailable: boolean;
  firebaseProjectId: string | null;
  androidPackage: string;
};

type SelectedConfiguration =
  | { providerKey: 'unifiedpush'; vapidPublicKey: string }
  | {
      providerKey: 'fcm';
      firebaseProjectId: string;
      androidPackage: string;
    };

type RegistrationOptions = SelectedConfiguration & {
  accountId: string;
  apiBaseUrl: string;
};

type NativePushPlugin = {
  status(): Promise<NativePushStatus>;
  enable(options: RegistrationOptions): Promise<void>;
  refresh(options: RegistrationOptions): Promise<{ enabled: boolean }>;
  disable(): Promise<void>;
  openNotificationSettings(): Promise<void>;
  addListener(
    event: 'endpoint',
    callback: (event: EndpointEvent) => void,
  ): Promise<{ remove(): Promise<void> }>;
  addListener(
    event: 'wake' | 'notificationOpen',
    callback: (event: ActivationEvent) => void,
  ): Promise<{ remove(): Promise<void> }>;
  addListener(
    event: 'unavailable',
    callback: (event: ActivationEvent & { reason: string }) => void,
  ): Promise<{ remove(): Promise<void> }>;
};

const nativePush = registerPlugin<NativePushPlugin>('EimirPush');
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
  /** True only while this device is registered for this Account and API instance. */
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

function pendingEndpointIds(key: string): string[] {
  const stored = window.localStorage.getItem(`${key}:pending-revocations`);
  if (!stored) return [];
  const value: unknown = JSON.parse(stored);
  if (
    !Array.isArray(value) ||
    !value.every((id): id is string => typeof id === 'string' && id.length > 0)
  )
    throw new Error('PUSH_DEVICE_STORAGE_UNAVAILABLE');
  return [...new Set(value)];
}

function savePendingEndpointIds(key: string, ids: string[]): void {
  const pendingKey = `${key}:pending-revocations`;
  if (ids.length) window.localStorage.setItem(pendingKey, JSON.stringify(ids));
  else window.localStorage.removeItem(pendingKey);
}

function rememberPendingEndpoint(key: string, id: string): void {
  savePendingEndpointIds(key, [...new Set([...pendingEndpointIds(key), id])]);
}

async function revokeSavedEndpoint(
  key: string,
  notificationsApi: NotificationsApi,
  signal?: AbortSignal,
  keepCurrent = false,
): Promise<void> {
  const current = readEndpointId(key);
  const ids = new Set(pendingEndpointIds(key));
  if (current && !keepCurrent) ids.add(current);
  if (keepCurrent && current) ids.delete(current);
  let failure: unknown;
  for (const id of ids) {
    try {
      signal?.throwIfAborted();
      try {
        if (signal) {
          await notificationsApi.revokeOwnPushEndpoint(
            { endpointId: id },
            { signal },
          );
        } else {
          await notificationsApi.revokeOwnPushEndpoint({ endpointId: id });
        }
      } catch (error) {
        // Foreign and already-revoked IDs are intentionally indistinguishable.
        if (responseStatus(error) !== 404) throw error;
      }
      if (readEndpointId(key) === id) clearEndpointId(key);
      savePendingEndpointIds(
        key,
        pendingEndpointIds(key).filter((pending) => pending !== id),
      );
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
}

async function loadConfiguration(
  notificationsApi: NotificationsApi,
): Promise<
  | { configuration: DevicePushConfiguration; failure: null }
  | { configuration: null; failure: 'unavailable' | 'unreachable' }
> {
  try {
    return {
      configuration: await notificationsApi.getDevicePushConfiguration(),
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

function registeredFor(
  state: NativePushStatus,
  accountId: string,
  apiBaseUrl: string,
): boolean {
  return state.enabled && ownsActivation(state, accountId, apiBaseUrl);
}

function ownsActivation(
  state: NativePushStatus,
  accountId: string,
  apiBaseUrl: string,
): boolean {
  return (
    state.accountId === accountId &&
    state.apiBaseUrl === apiBaseUrl &&
    state.providerKey !== null &&
    state.activationId !== null
  );
}

function sameActivation(
  state: Pick<NativePushStatus, keyof ActivationEvent>,
  event: ActivationEvent,
): boolean {
  return (
    state.accountId === event.accountId &&
    state.apiBaseUrl === event.apiBaseUrl &&
    state.providerKey === event.providerKey &&
    state.activationId === event.activationId
  );
}

function selectConfiguration(
  available: DevicePushConfiguration,
  nativeState: NativePushStatus,
  activeProvider: ProviderKey | null,
): SelectedConfiguration | null {
  const fcm =
    available.fcm &&
    nativeState.fcmAvailable &&
    available.fcm.projectId === nativeState.firebaseProjectId &&
    available.fcm.androidPackage === nativeState.androidPackage
      ? {
          providerKey: 'fcm' as const,
          firebaseProjectId: available.fcm.projectId,
          androidPackage: available.fcm.androidPackage,
        }
      : null;
  const unifiedPush = available.unifiedPush
    ? {
        providerKey: 'unifiedpush' as const,
        vapidPublicKey: available.unifiedPush.vapidPublicKey,
      }
    : null;
  // An active transport keeps its ownership. A failure must not silently
  // create another provider registration for the same device.
  if (activeProvider === 'fcm') return fcm;
  if (activeProvider === 'unifiedpush') return unifiedPush;
  return fcm ?? unifiedPush;
}

export function useDevicePush({
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
  const [state, setState] = useState<DevicePushState>(
    native ? 'loading' : 'unavailable',
  );
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const configuration = useRef<SelectedConfiguration | null>(null);
  const errorRef = useRef<string | null>(null);
  const key = endpointIdKey(apiBaseUrl, accountId);
  const currentSpaceId = useRef(spaceId);
  const registrationAllowed = useRef(false);
  const lastActive = useRef<ActivationEvent | null>(null);
  const lifecycle = useRef(0);
  currentSpaceId.current = spaceId;
  errorRef.current = error;

  const openInbox = useCallback(() => {
    if (isDocumentLeaveBlocked()) {
      setPendingInbox(key);
      postSnackbar('snackbar.notificationWaiting');
      return;
    }
    setPendingInbox(null);
    navigateRef.current(MORE_NOTIFICATIONS_ROUTE);
  }, [key]);

  useEffect(() => {
    if (!pendingInbox) return;
    if (pendingInbox !== key) {
      setPendingInbox(null);
      return;
    }
    if (blocked) return;
    setPendingInbox(null);
    navigateRef.current(MORE_NOTIFICATIONS_ROUTE);
  }, [blocked, key, pendingInbox]);

  const syncRegistered = useCallback(async () => {
    const ownerGeneration = lifecycle.current;
    const generation = registrationGeneration;
    try {
      const nativeState = await nativePush.status();
      if (
        ownerGeneration !== lifecycle.current ||
        generation !== registrationGeneration
      )
        return;
      if (
        registeredFor(nativeState, accountId, apiBaseUrl) &&
        nativeState.providerKey &&
        nativeState.activationId
      ) {
        lastActive.current = {
          accountId,
          apiBaseUrl,
          providerKey: nativeState.providerKey,
          activationId: nativeState.activationId,
        };
      }
      setRegistered(registeredFor(nativeState, accountId, apiBaseUrl));
    } catch {
      // Keep the last known value; the next start re-reads native state.
    }
  }, [accountId, apiBaseUrl]);

  useEffect(() => {
    if (!native) return;
    lifecycle.current += 1;
    let live = true;
    configuration.current = null;
    registrationAllowed.current = false;
    lastActive.current = null;
    setError(null);
    setState('loading');
    const currentEvent = async (event: ActivationEvent, generation: number) => {
      if (
        !live ||
        generation !== registrationGeneration ||
        event.accountId !== accountId ||
        event.apiBaseUrl !== apiBaseUrl
      )
        return false;
      const nativeState = await nativePush.status();
      const current =
        live &&
        generation === registrationGeneration &&
        sameActivation(nativeState, event) &&
        nativeState.enabled;
      if (current && nativeState.enabled) lastActive.current = event;
      return current;
    };
    const subscriptions = [
      nativePush.addListener('endpoint', (event) => {
        if (
          !live ||
          !registrationAllowed.current ||
          event.accountId !== accountId ||
          event.apiBaseUrl !== apiBaseUrl ||
          event.providerKey !== configuration.current?.providerKey
        )
          return;
        const generation = registrationGeneration;
        endpointRegistrationSequence = endpointRegistrationSequence
          .catch(() => undefined)
          .then(async () => {
            if (
              !live ||
              !registrationAllowed.current ||
              generation !== registrationGeneration ||
              !(await currentEvent(event, generation))
            )
              return;
            const registration = await notificationsApi.registerOwnPushEndpoint(
              {
                pushEndpointRegistration: {
                  providerKey: event.providerKey,
                  endpointValue: event.endpointValue,
                },
              },
            );
            const previous = readEndpointId(key);
            try {
              // Keep a receipt even when its activation retired during the
              // authenticated POST. The next owned cleanup must not lose it.
              rememberPendingEndpoint(key, registration.id);
              if (
                !registrationAllowed.current ||
                !(await currentEvent(event, generation))
              ) {
                return;
              }
              if (previous && previous !== registration.id)
                rememberPendingEndpoint(key, previous);
              saveEndpointId(key, registration.id);
              savePendingEndpointIds(
                key,
                pendingEndpointIds(key).filter((id) => id !== registration.id),
              );
            } catch {
              if (
                live &&
                registrationAllowed.current &&
                generation === registrationGeneration
              ) {
                registrationAllowed.current = false;
                registrationGeneration += 1;
                lastActive.current = null;
                setRegistered(false);
                setError('PUSH_DEVICE_STORAGE_UNAVAILABLE');
                setState('error');
                await nativePush.disable().catch(() => undefined);
              }
              await notificationsApi
                .revokeOwnPushEndpoint({
                  endpointId: registration.id,
                })
                .catch(() => undefined);
              throw new Error('PUSH_DEVICE_STORAGE_UNAVAILABLE');
            }
            await revokeSavedEndpoint(
              key,
              notificationsApi,
              undefined,
              true,
            ).catch(() => undefined);
            if (
              live &&
              registrationAllowed.current &&
              generation === registrationGeneration
            ) {
              setRegistered(true);
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
              // The configured provider rejected this registration. Repeating
              // the same endpoint on every start cannot repair its contract.
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
        const generation = registrationGeneration;
        void (async () => {
          if (!(await currentEvent(event, generation))) return;
          const activeSpaceId = currentSpaceId.current;
          void queryClient.invalidateQueries({
            queryKey: notificationUnreadCountQueryKey(activeSpaceId),
          });
          void queryClient.invalidateQueries({
            queryKey: notificationsListQueryKey(activeSpaceId),
          });
        })().catch(() => undefined);
      }),
      nativePush.addListener('unavailable', (event) => {
        const generation = registrationGeneration;
        void (async () => {
          if (
            !live ||
            event.accountId !== accountId ||
            event.apiBaseUrl !== apiBaseUrl
          )
            return;
          const nativeState = await nativePush.status();
          if (!live || generation !== registrationGeneration) return;
          const retired =
            !nativeState.enabled &&
            nativeState.accountId === null &&
            nativeState.apiBaseUrl === null &&
            nativeState.providerKey === null &&
            nativeState.activationId === null &&
            lastActive.current !== null &&
            sameActivation(lastActive.current, event);
          if (!sameActivation(nativeState, event) && !retired) return;
          if (retired) {
            registrationAllowed.current = false;
            registrationGeneration += 1;
            lastActive.current = null;
            setRegistered(false);
          }
          setError(event.reason);
          setState('error');
          void syncRegistered();
        })().catch(() => undefined);
      }),
      nativePush.addListener('notificationOpen', (event) => {
        const generation = registrationGeneration;
        void (async () => {
          if (await currentEvent(event, generation)) openInbox();
        })().catch(() => undefined);
      }),
      App.addListener('resume', () => {
        // Returning from the system notification settings: re-check the
        // permission instead of reopening the prompt.
        if (!live || errorRef.current !== 'NOTIFICATION_PERMISSION_DENIED')
          return;
        void (async () => {
          const nativeState = await nativePush.status();
          if (!live || !nativeState.permissionGranted) return;
          const here = registeredFor(nativeState, accountId, apiBaseUrl);
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
        await pendingSignOutDisable;
        const nativeState = await nativePush.status();
        if (!live) return;
        const otherOwner =
          nativeState.accountId !== null &&
          (nativeState.accountId !== accountId ||
            nativeState.apiBaseUrl !== apiBaseUrl);
        if (otherOwner) {
          registrationAllowed.current = false;
          await nativePush.disable();
          if (!live) return;
        }
        const registeredHere =
          !otherOwner && registeredFor(nativeState, accountId, apiBaseUrl);
        const activationHere =
          !otherOwner && ownsActivation(nativeState, accountId, apiBaseUrl);
        if (
          activationHere &&
          nativeState.providerKey &&
          nativeState.activationId
        ) {
          lastActive.current = {
            accountId,
            apiBaseUrl,
            providerKey: nativeState.providerKey,
            activationId: nativeState.activationId,
          };
        }
        setRegistered(registeredHere);

        let cleanupPending = false;
        if (!activationHere) {
          registrationAllowed.current = false;
          if (readEndpointId(key)) setState('disconnecting');
          try {
            await endpointRegistrationSequence;
            if (!live) return;
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
        configuration.current = selectConfiguration(
          loaded.configuration,
          nativeState,
          activationHere ? nativeState.providerKey : null,
        );
        if (!configuration.current) {
          setState('unavailable');
          return;
        }
        if (!activationHere) {
          if (cleanupPending) setError('PUSH_DEVICE_CLEANUP_PENDING');
          setState('off');
          return;
        }
        if (!nativeState.permissionGranted) {
          setError('NOTIFICATION_PERMISSION_DENIED');
          setState('error');
          return;
        }
        await revokeSavedEndpoint(key, notificationsApi, undefined, true).catch(
          () => undefined,
        );
        if (!live) return;
        registrationAllowed.current = true;
        setState('connecting');
        const refreshed = await nativePush.refresh({
          accountId,
          apiBaseUrl,
          ...configuration.current,
        });
        if (!live || !registrationAllowed.current) return;
        if (!refreshed.enabled) {
          setRegistered(false);
          setError(
            configuration.current.providerKey === 'unifiedpush'
              ? 'NO_PUSH_DISTRIBUTOR'
              : 'PUSH_DEVICE_REGISTRATION_FAILED',
          );
          setState('error');
        } else await syncRegistered();
      } catch {
        if (live) setState('unavailable');
      }
    })();

    return () => {
      live = false;
      lifecycle.current += 1;
      for (const subscription of subscriptions) {
        void subscription
          .then((handle) => handle.remove())
          .catch(() => undefined);
      }
    };
  }, [
    accountId,
    apiBaseUrl,
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
    lastActive.current = null;
    const generation = ++registrationGeneration;
    const ownerGeneration = lifecycle.current;
    const current = () =>
      generation === registrationGeneration &&
      ownerGeneration === lifecycle.current;
    setError(null);
    setState('connecting');
    try {
      await pendingSignOutDisable;
      await endpointRegistrationSequence;
      if (!current()) return;
      const beforeEnable = await nativePush.status();
      if (!current()) return;
      try {
        await revokeSavedEndpoint(
          key,
          notificationsApi,
          undefined,
          ownsActivation(beforeEnable, accountId, apiBaseUrl),
        );
      } catch {
        if (!current()) return;
        registrationAllowed.current = false;
        setError(
          beforeEnable.activationId
            ? 'PUSH_DEVICE_REGISTRATION_FAILED'
            : 'PUSH_DEVICE_CLEANUP_PENDING',
        );
        setState(beforeEnable.activationId ? 'error' : 'off');
        return;
      }
      if (!current()) return;
      if (!configuration.current) {
        // The status check failed earlier; enabling retries it.
        const loaded = await loadConfiguration(notificationsApi);
        if (!current()) return;
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
        const nativeState = await nativePush.status();
        if (!current()) return;
        configuration.current = selectConfiguration(
          loaded.configuration,
          nativeState,
          registeredFor(nativeState, accountId, apiBaseUrl)
            ? nativeState.providerKey
            : null,
        );
      }
      if (!configuration.current) {
        registrationAllowed.current = false;
        setState('unavailable');
        return;
      }
      await nativePush.enable({
        accountId,
        apiBaseUrl,
        ...configuration.current,
      });
    } catch (cause) {
      if (!current()) return;
      registrationAllowed.current = false;
      setError(
        cause instanceof Error
          ? cause.message
          : 'PUSH_DEVICE_REGISTRATION_FAILED',
      );
      setState('error');
    } finally {
      if (current()) await syncRegistered();
    }
  }, [accountId, apiBaseUrl, key, native, notificationsApi, syncRegistered]);

  const disable = useCallback(async () => {
    registrationAllowed.current = false;
    lastActive.current = null;
    registrationGeneration += 1;
    const generation = registrationGeneration;
    const ownerGeneration = lifecycle.current;
    const current = () =>
      generation === registrationGeneration &&
      ownerGeneration === lifecycle.current;
    setState('disconnecting');
    let nativeCleanupPending = false;
    try {
      await nativePush.disable();
    } catch {
      if (!current()) return;
      const nativeState = await nativePush.status().catch(() => null);
      if (!current()) return;
      if (!nativeState || registeredFor(nativeState, accountId, apiBaseUrl)) {
        setError('PUSH_DEVICE_DISABLE_FAILED');
        setState('error');
        return;
      }
      // Receipt is already stopped locally. Server revocation must still run
      // while this Account is authenticated, even if provider deletion failed.
      nativeCleanupPending = true;
    }
    if (!current()) return;
    setRegistered(false);
    try {
      await endpointRegistrationSequence;
      if (!current()) return;
      await revokeSavedEndpoint(key, notificationsApi);
      if (!current()) return;
      setError(nativeCleanupPending ? 'PUSH_DEVICE_CLEANUP_PENDING' : null);
      void queryClient.invalidateQueries({
        queryKey: ['notification-preferences', accountId],
      });
    } catch {
      if (!current()) return;
      setError('PUSH_DEVICE_CLEANUP_PENDING');
    }
    setState('off');
  }, [accountId, apiBaseUrl, key, notificationsApi, queryClient]);

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
