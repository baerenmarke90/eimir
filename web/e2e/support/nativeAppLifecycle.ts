import type { Page } from '@playwright/test';

/** Synthetic plugin transport, deliberately independent of browser visibility. */
export async function installNativeAppLifecycle(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const nativeWindow = window as unknown as {
      CapacitorCustomPlatform: { name: string };
      Capacitor: unknown;
    };
    const callbacks = new Map<
      string,
      { event: string; callback: (state: { isActive: boolean }) => void }
    >();
    let sequence = 0;
    nativeWindow.CapacitorCustomPlatform = { name: 'android' };
    nativeWindow.Capacitor = {
      PluginHeaders: [
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
        if (plugin !== 'App' || method !== 'addListener')
          throw new Error('Unexpected native callback');
        const id = String(++sequence);
        callbacks.set(id, { event: options.eventName, callback });
        return id;
      },
      nativePromise: async (
        plugin: string,
        method: string,
        options?: { callbackId?: string; value?: string },
      ) => {
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
  });
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
