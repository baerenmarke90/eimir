import { expect, test } from '@playwright/test';
import copy from '../../src/i18n/locales/notificationSettings';
import {
  captureScreenshot,
  installMocks,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const endpoint = 'https://push.example.test/send/fixture';
const endpointId = 'bf9184d5-5225-4891-bda6-9fcaa51c7f5d';
const notificationId = '2f36b77e-e4f8-46a1-9600-6790e1117a05';

for (const [width, theme] of [
  [360, 'light'],
  [430, 'dark'],
  [1280, 'light'],
] as const) {
  test(`browser notification switch and authorized tap at ${width}px ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 880 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(
      ({ endpoint, theme }) => {
        localStorage.setItem('eimir.theme', theme);
        let subscription: object | null = null;
        const notifications = new EventTarget();
        const worker = {
          active: {
            postMessage: (_message: unknown, [port]: [MessagePort]) =>
              port.postMessage(1),
          },
          pushManager: {
            getSubscription: async () => subscription,
            subscribe: async () => {
              subscription = {
                endpoint,
                toJSON: () => ({
                  keys: { p256dh: 'fixture-key', auth: 'fixture-auth' },
                }),
                unsubscribe: async () => {
                  subscription = null;
                  return true;
                },
              };
              return subscription;
            },
          },
          getNotifications: async () => [],
        };
        Object.defineProperty(Notification, 'permission', { value: 'granted' });
        Object.defineProperty(window, 'PushManager', { value: class {} });
        Object.defineProperty(navigator, 'serviceWorker', {
          value: Object.assign(notifications, {
            ready: Promise.resolve(worker),
            getRegistration: async () => worker,
            register: async () => worker,
          }),
        });
      },
      { endpoint, theme },
    );
    await installMocks(page);
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/rules/*/preference`,
      (route) =>
        route.fulfill({
          json: {
            ruleKey: new URL(route.request().url()).pathname.split('/').at(-2),
            enabled: false,
            parameters: { daysBefore: [1], localTime: '09:00:00' },
          },
        }),
    );
    await page.route('**/api/v1/push-endpoints/configuration', (route) =>
      route.fulfill({
        json: {
          fcm: null,
          unifiedPush: null,
          apns: null,
          webPush: { providerKey: 'webpush', vapidPublicKey: 'test-vapid-key' },
        },
      }),
    );
    await page.route('**/api/v1/notification-preferences', (route) =>
      route.fulfill({
        json: {
          catalogVersion: 9,
          items: [
            'COMMENT_CREATED',
            'REMINDER_CREATED',
            'REMINDER_DUE',
            'THINKING_OF_YOU',
            'COUPLE_EXPERIENCE_SHARED',
            'PARTNER_KISS',
            'PARTNER_CHECK_IN',
            'GENTLE_PROMPT',
          ].map((kind) => ({
            kind,
            deliveryClass:
              kind === 'COMMENT_CREATED' ? 'DIGESTIBLE' : 'IMMEDIATE',
            channels: [
              {
                channel: 'IN_APP',
                enabled: kind !== 'GENTLE_PROMPT',
                configurable: false,
              },
              {
                channel: 'PUSH',
                enabled: kind !== 'GENTLE_PROMPT',
                configurable: true,
              },
              ...(kind === 'GENTLE_PROMPT'
                ? []
                : [{ channel: 'EMAIL', enabled: false, configurable: true }]),
            ],
          })),
          capabilities: [
            { channel: 'IN_APP', available: true, reason: null },
            { channel: 'PUSH', available: true, reason: null },
            {
              channel: 'EMAIL',
              available: true,
              reason: null,
              destination: 'anna@example.test',
            },
          ],
          quietHours: {
            enabled: false,
            start: null,
            end: null,
            timeZone: 'Europe/Berlin',
          },
        },
      }),
    );
    let activationId = '';
    await page.route('**/api/v1/push-endpoints', (route) => {
      const body = route.request().postDataJSON();
      expect(body.providerKey).toBe('webpush');
      const value = JSON.parse(body.endpointValue);
      expect(value.endpoint).toBe(endpoint);
      expect(value.notificationReferenceVersion).toBe(1);
      activationId = value.activationId;
      return route.fulfill({ json: { id: endpointId } });
    });
    await page.route(`**/api/v1/push-endpoints/${endpointId}`, (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/notifications/${notificationId}/open`,
      (route) =>
        route.fulfill({
          json: {
            id: notificationId,
            kind: 'PLAN_CANCELLED',
            targetType: null,
            targetId: null,
          },
        }),
    );
    await signIn(page);
    await page.goto('/more/settings/notifications');
    const browser = page.getByRole('switch', {
      name: copy.browserToggle,
    });
    await expect(browser).toBeEnabled();
    await expect(
      page.getByRole('switch', { name: copy.deviceToggle }),
    ).toHaveCount(0);
    await browser.click();
    await expect(browser).toHaveAttribute('aria-checked', 'true');
    await captureScreenshot(
      page,
      testInfo,
      `push-consent-browser-${width}-${theme}.png`,
      { fullPage: true },
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    const opened = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().endsWith(`/notifications/${notificationId}/open`),
    );
    const acknowledge = await page.evaluate(
      ({ activationId, notificationId }) => {
        function tap(activation: string) {
          const channel = new MessageChannel();
          return new Promise<string>((resolve) => {
            channel.port1.onmessage = (event) => {
              channel.port1.close();
              channel.port2.close();
              resolve(event.data);
            };
            navigator.serviceWorker.dispatchEvent(
              new MessageEvent('message', {
                data: {
                  type: 'eimir-notification-open',
                  activationId: activation,
                  notificationId,
                },
                ports: [channel.port2],
              }),
            );
          });
        }
        return tap('d9749f8c-19eb-424a-89fc-5778cc5aee2e').then(
          async (stale) => [stale, await tap(activationId)],
        );
      },
      { activationId, notificationId },
    );
    expect(acknowledge).toEqual(['ignored', 'received']);
    await opened;
    await expect(page).toHaveURL(/\/plan$/);
    await page.goto('/more/settings/notifications');
    // The mock keeps one subscription within a document. Re-enable after a
    // full document load and verify that explicit disable revokes the endpoint.
    await expect(browser).toBeEnabled();
    await browser.click();
    await expect(browser).toHaveAttribute('aria-checked', 'true');
    const revoked = page.waitForRequest(
      (request) =>
        request.method() === 'DELETE' && request.url().endsWith(endpointId),
    );
    await browser.click();
    await revoked;
    await expect(browser).toHaveAttribute('aria-checked', 'false');
  });
}
