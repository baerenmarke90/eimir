import type { Page } from '@playwright/test';

/** Synthetic plugin transport, deliberately independent of browser visibility. */
export async function installNativeAppLifecycle(
  page: Page,
  { planFiles = false } = {},
): Promise<void> {
  const install = (planFiles: boolean) => {
    const nativeWindow = window as unknown as {
      CapacitorCustomPlatform: { name: string };
      Capacitor: unknown;
      CapacitorWebXMLHttpRequest?: {
        constructor: typeof XMLHttpRequest;
      } & Pick<
        XMLHttpRequest,
        | 'open'
        | 'send'
        | 'abort'
        | 'setRequestHeader'
        | 'getResponseHeader'
        | 'getAllResponseHeaders'
      >;
      openedPlanPdf?: string;
    };
    const callbacks = new Map<
      string,
      { event: string; callback: (state: { isActive: boolean }) => void }
    >();
    let sequence = 0;
    nativeWindow.CapacitorCustomPlatform = { name: 'android' };
    if (planFiles)
      nativeWindow.CapacitorWebXMLHttpRequest = {
        constructor: XMLHttpRequest,
        open: XMLHttpRequest.prototype.open,
        send: XMLHttpRequest.prototype.send,
        abort: XMLHttpRequest.prototype.abort,
        setRequestHeader: XMLHttpRequest.prototype.setRequestHeader,
        getResponseHeader: XMLHttpRequest.prototype.getResponseHeader,
        getAllResponseHeaders: XMLHttpRequest.prototype.getAllResponseHeaders,
      };
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
        ...(planFiles
          ? [
              {
                name: 'PlanFiles',
                methods: ['preparePdf', 'openPdf', 'discardPdf'].map(
                  (name) => ({ name, rtype: 'promise' }),
                ),
              },
            ]
          : []),
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
        options?: {
          callbackId?: string;
          value?: string;
          url?: string;
          authorization?: string;
          name?: string;
          fileId?: string;
        },
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
        if (planFiles && plugin === 'PlanFiles') {
          if (method === 'preparePdf') {
            if (
              !options?.url?.endsWith('/content') ||
              !options.authorization?.startsWith('Bearer ')
            )
              throw new Error('Expected an authorized PDF request');
            return { status: 200, fileId: 'prepared-pdf' };
          }
          if (method === 'openPdf' && options?.fileId === 'prepared-pdf') {
            nativeWindow.openedPlanPdf = options.name;
            return {};
          }
          if (method === 'discardPdf') return {};
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
  };
  await page.addInitScript(install, planFiles);
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
