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
      secureScreen?: boolean;
      hapticCalls?: string[];
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
          // @capacitor/haptics (#2076): calls are recorded, never vibrated.
          name: 'Haptics',
          methods: [
            'impact',
            'notification',
            'vibrate',
            'selectionStart',
            'selectionChanged',
            'selectionEnd',
          ].map((name) => ({ name, rtype: 'promise' })),
        },
        {
          // FLAG_SECURE for private surfaces (#683): private content stays
          // unpainted until the window reports the flag.
          name: 'SecureScreen',
          methods: [{ name: 'setSecure', rtype: 'promise' }],
        },
        {
          name: 'NativeSessionStorage',
          methods: ['read', 'write', 'clear', 'mediaKey', 'clearMediaKey'].map(
            (name) => ({
              name,
              rtype: 'promise',
            }),
          ),
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
          secure?: boolean;
          style?: string;
          type?: string;
        },
      ) => {
        if (plugin === 'Haptics') {
          nativeWindow.hapticCalls ??= [];
          const detail = options?.style ?? options?.type;
          nativeWindow.hapticCalls.push(
            detail ? `${method}:${detail}` : method,
          );
          return {};
        }
        if (plugin === 'SecureScreen' && method === 'setSecure') {
          nativeWindow.secureScreen = options?.secure === true;
          return { secure: nativeWindow.secureScreen };
        }
        if (plugin === 'App' && method === 'getLaunchUrl') return {};
        if (plugin === 'App' && method === 'removeListener') {
          callbacks.delete(options?.callbackId ?? '');
          return {};
        }
        if (plugin === 'NativeSessionStorage') {
          const key = 'native-continuity-test-session';
          const mediaKey = 'native-continuity-test-media-key';
          if (method === 'mediaKey') {
            let value = sessionStorage.getItem(mediaKey);
            if (!value) {
              const raw = crypto.getRandomValues(new Uint8Array(32));
              value = btoa(String.fromCharCode(...raw));
              sessionStorage.setItem(mediaKey, value);
            }
            return { value };
          }
          // Like the device: logout deletes the media key with the session.
          if (method === 'clearMediaKey' || method === 'clear')
            sessionStorage.removeItem(mediaKey);
          if (method === 'clearMediaKey') return {};
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

/** The `@capacitor/haptics` calls the synthetic app received (#2076). */
export async function nativeHapticCalls(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      (window as unknown as { hapticCalls?: string[] }).hapticCalls?.slice() ??
      [],
  );
}

/** Whether the synthetic app window currently holds FLAG_SECURE (#683). */
export async function nativeSecureScreen(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      (window as unknown as { secureScreen?: boolean }).secureScreen === true,
  );
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
