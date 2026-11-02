import type { Page } from '@playwright/test';

/** Synthetic plugin transport, deliberately independent of browser visibility. */
export async function installNativeAppLifecycle(
  page: Page,
  withPush = false,
): Promise<void> {
  await page.addInitScript((pushEnabled) => {
    const nativeWindow = window as unknown as {
      CapacitorCustomPlatform: { name: string };
      Capacitor: unknown;
    };
    const callbacks = new Map<
      string,
      { event: string; callback: (state: { isActive: boolean }) => void }
    >();
    let sequence = 0;
    let pushState = {
      accountId: null as string | null,
      apiBaseUrl: null as string | null,
      providerKey: null as string | null,
      activationId: null as string | null,
      enabled: false,
      permissionGranted: false,
      fcmAvailable: true,
      firebaseProjectId: 'fixture-project',
      androidPackage: 'de.eimir.app',
    };
    nativeWindow.CapacitorCustomPlatform = { name: 'android' };
    nativeWindow.Capacitor = {
      PluginHeaders: [
        ...(pushEnabled
          ? [
              {
                name: 'EimirPush',
                methods: [
                  ...[
                    'status',
                    'enable',
                    'disable',
                    'refresh',
                    'openNotificationSettings',
                    'removeListener',
                  ].map((name) => ({ name, rtype: 'promise' })),
                  { name: 'addListener', rtype: 'callback' },
                ],
              },
            ]
          : []),
        {
          name: 'App',
          methods: [
            { name: 'addListener', rtype: 'callback' },
            { name: 'removeListener', rtype: 'promise' },
            { name: 'getLaunchUrl', rtype: 'promise' },
          ],
        },
        {
          name: 'NativeSessionStorage',
          methods: ['read', 'write', 'clear'].map((name) => ({
            name,
            rtype: 'promise',
          })),
        },
      ],
      nativeCallback: (
        plugin: string,
        method: string,
        options: { eventName: string },
        callback: (state: { isActive: boolean }) => void,
      ) => {
        if (
          !['App', ...(pushEnabled ? ['EimirPush'] : [])].includes(plugin) ||
          method !== 'addListener'
        )
          throw new Error('Unexpected native callback');
        const id = String(++sequence);
        callbacks.set(id, { event: options.eventName, callback });
        return id;
      },
      nativePromise: async (
        plugin: string,
        method: string,
        options?: {
          callbackId?: string;
          value?: string;
          accountId?: string;
          apiBaseUrl?: string;
          providerKey?: string;
        },
      ) => {
        if (plugin === 'EimirPush' && pushEnabled) {
          if (method === 'status') return { ...pushState };
          if (method === 'removeListener') {
            callbacks.delete(options?.callbackId ?? '');
            return {};
          }
          if (method === 'disable') {
            pushState.enabled = false;
            return {};
          }
          if (method === 'enable' || method === 'refresh') {
            pushState = {
              ...pushState,
              accountId: options?.accountId ?? null,
              apiBaseUrl: options?.apiBaseUrl ?? null,
              providerKey: options?.providerKey ?? null,
              activationId: '88888888-8888-4888-8888-888888888888',
              enabled: true,
              permissionGranted: true,
            };
            const event = {
              ...pushState,
              endpointValue: JSON.stringify({
                fid: 'aaaaaaaaaaaaaaaaaaaaaa',
                activationId: pushState.activationId,
              }),
            };
            for (const entry of callbacks.values()) {
              if (entry.event === 'endpoint')
                entry.callback(event as unknown as { isActive: boolean });
            }
            return { enabled: true };
          }
          return {};
        }
        if (plugin === 'App' && method === 'getLaunchUrl') return {};
        if (plugin === 'App' && method === 'removeListener') {
          callbacks.delete(options?.callbackId ?? '');
          return {};
        }
        if (plugin === 'NativeSessionStorage') {
          const key = 'native-continuity-test-session';
          if (method === 'write')
            sessionStorage.setItem(key, options?.value ?? '');
          if (method === 'clear') sessionStorage.removeItem(key);
          return { value: sessionStorage.getItem(key) ?? undefined };
        }
        throw new Error('Unexpected native promise');
      },
    };
    window.addEventListener('eimir-test-native-state', (event) => {
      const state = (event as CustomEvent<{ isActive: boolean }>).detail;
      for (const entry of callbacks.values()) {
        if (entry.event === 'appStateChange') entry.callback(state);
      }
    });
  }, withPush);
}

export async function nativeAppState(
  page: Page,
  isActive: boolean,
): Promise<void> {
  await page.evaluate((active) => {
    window.dispatchEvent(
      new CustomEvent('eimir-test-native-state', {
        detail: { isActive: active },
      }),
    );
  }, isActive);
}
