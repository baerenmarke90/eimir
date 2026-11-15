import type { QueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { ResponseError } from '../api/generated/runtime';
import { isCapacitorNative } from '../pwa';
import { isClientOnline } from './connectivity';
import type { DevicePushController, DevicePushState } from './devicePush';
import { MORE_NOTIFICATIONS_ROUTE } from './routes';

const CACHE = 'eimir-browser-push-v1';
const BINDING = '/_eimir/browser-push-binding';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const LOCK = 'eimir-browser-push';

type Owner = { accountId: string; apiBaseUrl: string };
type Binding = Owner & {
  activationId: string;
  endpointId: string;
  subscriptionHash: string;
};
type NotificationOpen = { activationId: string; notificationId: string };

function supported(): boolean {
  return (
    !isCapacitorNative() &&
    window.isSecureContext &&
    'PushManager' in window &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'caches' in window
  );
}

function owns(binding: Binding | null, owner: Owner): binding is Binding {
  return (
    binding !== null &&
    binding.accountId === owner.accountId &&
    binding.apiBaseUrl === owner.apiBaseUrl
  );
}

async function readBinding(): Promise<Binding | null> {
  const cached = await (await caches.open(CACHE)).match(BINDING);
  return cached ? await cached.json() : null;
}

async function saveBinding(binding: Binding): Promise<void> {
  await (await caches.open(CACHE)).put(
    BINDING,
    new Response(JSON.stringify(binding)),
  );
}

function endpointValue(subscription: PushSubscription): string {
  const { keys } = subscription.toJSON();
  if (!keys?.p256dh || !keys.auth)
    throw new Error('PUSH_DEVICE_REGISTRATION_FAILED');
  return JSON.stringify({ endpoint: subscription.endpoint, keys });
}

function usesPublicKey(subscription: PushSubscription, publicKey: string) {
  const key = subscription.options?.applicationServerKey;
  if (!key) return true;
  const encoded = btoa(String.fromCharCode(...new Uint8Array(key)));
  return (
    encoded.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') ===
    publicKey
  );
}

async function subscriptionHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

let localOperation = Promise.resolve<unknown>(undefined);
let browserRegistration: Promise<PushSubscription> | null = null;

function withRegistrationLock<T>(run: () => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request(LOCK, run);
  const operation = localOperation.then(run, run);
  localOperation = operation;
  return operation;
}

function supportsPushMessages(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    function complete(supported: boolean) {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(supported);
    }
    const timeout = window.setTimeout(() => complete(false), 750);
    channel.port1.onmessage = (event) => complete(event.data === 1);
    try {
      worker.postMessage({ type: 'eimir-browser-push-version' }, [
        channel.port2,
      ]);
    } catch {
      channel.port2.close();
      complete(false);
    }
  });
}

async function revoke(
  api: NotificationsApi,
  endpointId: string,
  signal?: AbortSignal,
) {
  try {
    await api.revokeOwnPushEndpoint({ endpointId }, signal ? { signal } : {});
  } catch (error) {
    if (!(error instanceof ResponseError && error.response.status === 404))
      throw error;
  }
}

async function clearBrowser(
  registration: ServiceWorkerRegistration | undefined,
) {
  await (await caches.open(CACHE)).delete(BINDING);
  if (!registration) return;
  const notifications = await registration.getNotifications();
  for (const notification of notifications) {
    if (notification.tag.startsWith('eimir-push:')) notification.close();
  }
  await (await registration.pushManager.getSubscription())?.unsubscribe();
}

let signedOutGeneration = 0;

export async function revokeBrowserPushBeforeSignOut(
  owner: Owner,
  api: NotificationsApi,
  signal: AbortSignal,
): Promise<void> {
  if (!supported()) return;
  signedOutGeneration += 1;
  await withRegistrationLock(async () => {
    const binding = await readBinding();
    if (!owns(binding, owner)) return;
    const registration = await navigator.serviceWorker.getRegistration('/');
    try {
      await clearBrowser(registration);
    } finally {
      await revoke(api, binding.endpointId, signal);
    }
  });
}

export function stopBrowserPushForSignedOutAccount(owner: Owner): void {
  if (!supported()) return;
  signedOutGeneration += 1;
  void withRegistrationLock(async () => {
    if (!owns(await readBinding(), owner)) return;
    await clearBrowser(await navigator.serviceWorker.getRegistration('/'));
  }).catch(() => undefined);
}

function parseOpen(value: unknown): NotificationOpen | null {
  if (typeof value !== 'object' || value === null) return null;
  const { activationId, notificationId } = value as Partial<NotificationOpen>;
  return typeof activationId === 'string' &&
    typeof notificationId === 'string' &&
    UUID.test(activationId) &&
    UUID.test(notificationId)
    ? { activationId, notificationId }
    : null;
}

export function useBrowserPush({
  accountId,
  apiBaseUrl,
  notificationsApi,
  queryClient,
  openNotification,
  settingsOpen,
}: Owner & {
  notificationsApi: NotificationsApi;
  queryClient: QueryClient;
  openNotification(id?: string): void;
  settingsOpen: boolean;
}): DevicePushController {
  const available = supported();
  const [state, setState] = useState<DevicePushState>(
    available ? 'loading' : 'unavailable',
  );
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const publicKey = useRef<string | undefined>(undefined);
  const operation = useRef(0);
  const scope = JSON.stringify([accountId, apiBaseUrl]);
  const current = useRef({ scope, notificationsApi, openNotification });
  current.current = { scope, notificationsApi, openNotification };
  const owner = useRef<Owner>({ accountId, apiBaseUrl });
  owner.current = { accountId, apiBaseUrl };
  const initialOpen = useRef<{ scope: string; hash: string } | null>(null);

  // The current page may be a background tab from an older login. Only the
  // owner may re-register or consume its cached browser activation.
  useLayoutEffect(() => {
    if (!available) return;
    const hash = window.location.hash;
    if (
      window.location.pathname !== MORE_NOTIFICATIONS_ROUTE ||
      !hash.startsWith('#eimir-push=')
    )
      return;
    initialOpen.current = { scope, hash };
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }, [available, scope]);

  const register = useCallback(
    async (subscription: PushSubscription, stillCurrent: () => boolean) =>
      withRegistrationLock(async () => {
        if (!stillCurrent()) return;
        const own = owner.current;
        const previous = await readBinding();
        if (previous && !owns(previous, own))
          throw new Error('PUSH_BROWSER_OTHER_ACCOUNT');
        const value = endpointValue(subscription);
        const hash = await subscriptionHash(value);
        const activationId = owns(previous, own)
          ? previous.activationId
          : crypto.randomUUID();
        const api = current.current.notificationsApi;
        if (!stillCurrent()) return;
        const { id } = await api.registerOwnPushEndpoint({
          pushEndpointRegistration: {
            providerKey: 'webpush',
            endpointValue: JSON.stringify({
              ...JSON.parse(value),
              activationId,
              notificationReferenceVersion: 1,
              localeVersion: 1,
            }),
          },
        });
        try {
          if (!stillCurrent()) throw new Error('PUSH_REQUEST_CANCELLED');
          if (owns(previous, own) && previous.endpointId !== id)
            await revoke(api, previous.endpointId);
          await saveBinding({
            ...own,
            activationId,
            endpointId: id,
            subscriptionHash: hash,
          });
        } catch (cause) {
          await revoke(api, id).catch(() => undefined);
          throw cause;
        }
        if (!stillCurrent()) return;
        setRegistered(true);
        setState('on');
        setError(null);
        void queryClient.invalidateQueries({
          queryKey: ['notification-preferences', own.accountId],
        });
      }),
    [queryClient],
  );

  const initialize = useCallback(async () => {
    const request = ++operation.current;
    const signOut = signedOutGeneration;
    const stillCurrent = () =>
      request === operation.current &&
      scope === current.current.scope &&
      signOut === signedOutGeneration;
    registration.current = undefined;
    publicKey.current = undefined;
    setState('loading');
    setError(null);
    try {
      const [config, worker] = await Promise.all([
        current.current.notificationsApi.getDevicePushConfiguration(),
        navigator.serviceWorker.getRegistration('/'),
      ]);
      if (!stillCurrent()) return;
      const key = config.webPush?.vapidPublicKey;
      publicKey.current = key;
      if (!key) {
        const existing = await readBinding();
        if (!stillCurrent()) return;
        setRegistered(owns(existing, owner.current));
        setState('unavailable');
        return;
      }
      const ready = worker?.active
        ? worker
        : await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<never>((_, reject) => {
              const timeout = window.setTimeout(reject, 5_000);
              void navigator.serviceWorker.ready.then(() =>
                clearTimeout(timeout),
              );
            }),
          ]);
      if (!stillCurrent()) return;
      if (!ready.active || !(await supportsPushMessages(ready.active))) {
        if (!stillCurrent()) return;
        void ready.update().catch(() => undefined);
        setError('PUSH_BROWSER_UPDATE_PENDING');
        setState('unavailable');
        return;
      }
      if (!stillCurrent()) return;
      registration.current = ready;
      const activeWorker = ready;
      const binding = await withRegistrationLock(async () => {
        const existing = await readBinding();
        if (existing && !owns(existing, owner.current))
          throw new Error('PUSH_BROWSER_OTHER_ACCOUNT');
        return existing;
      });
      const subscription = await activeWorker.pushManager.getSubscription();
      if (!stillCurrent()) return;
      const rotated =
        subscription !== null && !usesPublicKey(subscription, key);
      if (
        owns(binding, owner.current) &&
        subscription &&
        !rotated &&
        Notification.permission === 'granted'
      ) {
        await register(subscription, stillCurrent);
        return;
      }
      if (owns(binding, owner.current) || rotated) {
        await withRegistrationLock(async () => {
          if (!stillCurrent()) return;
          const currentBinding = await readBinding();
          if (currentBinding && !owns(currentBinding, owner.current)) return;
          await clearBrowser(activeWorker);
          if (currentBinding)
            await revoke(
              current.current.notificationsApi,
              currentBinding.endpointId,
            );
        });
      }
      if (!stillCurrent()) return;
      setRegistered(false);
      setError(
        Notification.permission === 'denied'
          ? 'PUSH_BROWSER_PERMISSION_DENIED'
          : null,
      );
      setState('off');
    } catch (cause) {
      if (!stillCurrent()) return;
      setRegistered(false);
      if (
        cause instanceof Error &&
        cause.message === 'PUSH_BROWSER_OTHER_ACCOUNT'
      ) {
        setError(cause.message);
        setState('unavailable');
        return;
      }
      setState(
        cause instanceof ResponseError &&
          (cause.response.status === 404 || cause.response.status === 503)
          ? 'unavailable'
          : 'error',
      );
      setError(
        !isClientOnline()
          ? 'PUSH_BROWSER_OFFLINE'
          : 'PUSH_DEVICE_STATUS_UNAVAILABLE',
      );
    }
  }, [scope, register]);

  useEffect(() => {
    if (!available) return;
    let live = true;
    if (settingsOpen) {
      void initialize();
    } else {
      const before = operation.current;
      void readBinding()
        .then((binding) => {
          if (
            live &&
            before === operation.current &&
            owns(binding, owner.current)
          )
            void initialize();
        })
        .catch(() => undefined);
    }
    const open = async (input: unknown) => {
      const hint = parseOpen(input);
      if (!hint) return false;
      const binding = await readBinding();
      if (
        !live ||
        current.current.scope !== scope ||
        !owns(binding, owner.current) ||
        binding.activationId !== hint.activationId
      ) {
        return false;
      }
      current.current.openNotification(hint.notificationId);
      return true;
    };
    const receive = (event: MessageEvent) => {
      if (event.data?.type !== 'eimir-notification-open') return;
      void open(event.data)
        .catch(() => false)
        .then((accepted) =>
          event.ports[0]?.postMessage(accepted ? 'received' : 'ignored'),
        );
    };
    navigator.serviceWorker.addEventListener('message', receive);
    const pending = initialOpen.current;
    const hint =
      pending?.scope === scope
        ? new URLSearchParams(pending.hash.slice(1))
            .get('eimir-push')
            ?.split('.')
        : undefined;
    if (hint?.length === 2) {
      void open({ activationId: hint[0], notificationId: hint[1] })
        .catch(() => undefined)
        .finally(() => {
          if (live && initialOpen.current === pending)
            initialOpen.current = null;
        });
    }
    const reconcile = async () => {
      if (document.visibilityState !== 'visible') return;
      const currentWorker = registration.current;
      if (!currentWorker) {
        if (publicKey.current) await initialize();
        return;
      }
      const before = operation.current;
      const binding = await readBinding();
      if (
        !live ||
        before !== operation.current ||
        !owns(binding, owner.current)
      )
        return;
      const subscription = await currentWorker.pushManager.getSubscription();
      if (!live || before !== operation.current) return;
      if (
        !subscription ||
        Notification.permission !== 'granted' ||
        binding.subscriptionHash !==
          (await subscriptionHash(endpointValue(subscription)))
      )
        await initialize();
    };
    const onFocus = () => void reconcile().catch(() => undefined);
    navigator.serviceWorker.addEventListener('controllerchange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      live = false;
      operation.current += 1;
      window.removeEventListener('focus', onFocus);
      navigator.serviceWorker.removeEventListener('controllerchange', onFocus);
      navigator.serviceWorker.removeEventListener('message', receive);
    };
  }, [available, scope, initialize, settingsOpen]);

  async function enable() {
    if (browserRegistration) return;
    if (!isClientOnline()) {
      setError('PUSH_BROWSER_OFFLINE');
      setState('error');
      return;
    }
    const worker = registration.current;
    const key = publicKey.current;
    if (!worker || !key) {
      await initialize();
      return;
    }
    const request = ++operation.current;
    const signOut = signedOutGeneration;
    const stillCurrent = () =>
      request === operation.current &&
      scope === current.current.scope &&
      signOut === signedOutGeneration;
    setState('connecting');
    setError(null);
    try {
      // subscribe initiates the browser permission prompt from the switch gesture.
      const pending = worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      browserRegistration = pending;
      const subscription = await pending;
      if (!stillCurrent()) {
        await withRegistrationLock(async () => {
          if (!(await readBinding())) await subscription.unsubscribe();
        });
        return;
      }
      await register(subscription, stillCurrent);
    } catch (cause) {
      if (!stillCurrent()) return;
      setError(
        Notification.permission === 'denied'
          ? 'PUSH_BROWSER_PERMISSION_DENIED'
          : cause instanceof Error &&
              cause.message === 'PUSH_BROWSER_OTHER_ACCOUNT'
            ? cause.message
            : cause instanceof ResponseError && cause.response.status === 422
              ? 'PUSH_ENDPOINT_UNSUPPORTED'
              : 'PUSH_DEVICE_REGISTRATION_FAILED',
      );
      setState('error');
    } finally {
      browserRegistration = null;
    }
  }

  async function disable() {
    const request = ++operation.current;
    const own = { accountId, apiBaseUrl };
    const api = current.current.notificationsApi;
    setState('disconnecting');
    await withRegistrationLock(async () => {
      const binding = await readBinding();
      if (binding && !owns(binding, own)) return;
      // Failed server revocation must leave the switch on so the user can retry.
      if (binding) await revoke(api, binding.endpointId);
      await clearBrowser(registration.current);
    })
      .then(() => {
        if (request !== operation.current || current.current.scope !== scope)
          return;
        setRegistered(false);
        setError(null);
        setState('off');
        void queryClient.invalidateQueries({
          queryKey: ['notification-preferences', accountId],
        });
      })
      .catch(() => {
        if (request !== operation.current || current.current.scope !== scope)
          return;
        setError('PUSH_DEVICE_DISABLE_FAILED');
        setState('error');
      });
  }

  return {
    available,
    browser: true,
    state,
    error,
    registered,
    enable,
    disable,
    openSettings: async () => undefined,
  };
}
