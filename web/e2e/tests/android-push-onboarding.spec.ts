import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import copy from '../../src/i18n/locales/notificationSettings';
import {
  ACCOUNT_ID,
  SPACE_ID,
  captureScreenshot,
  installMocks,
} from '../support/storyTimelineFixture';

async function nativePush(page: Page, deny = false) {
  await page.addInitScript(
    ({ deny }) => {
      const callbacks = new Map<string, (event: unknown) => void>();
      let sequence = 0;
      let state = {
        accountId: null as string | null,
        apiBaseUrl: null as string | null,
        providerKey: null as string | null,
        activationId: null as string | null,
        enabled: false,
        permissionGranted: false,
        fcmAvailable: true,
        firebaseProjectId: 'test-project',
        androidPackage: 'de.eimir.app',
      };
      const host = window as unknown as {
        CapacitorCustomPlatform: unknown;
        Capacitor: unknown;
        pushCalls: string[];
      };
      host.CapacitorCustomPlatform = { name: 'android' };
      host.pushCalls = [];
      host.Capacitor = {
        PluginHeaders: [
          {
            name: 'App',
            methods: [
              { name: 'addListener', rtype: 'callback' },
              ...['removeListener', 'getLaunchUrl', 'minimizeApp'].map(
                (name) => ({ name, rtype: 'promise' }),
              ),
            ],
          },
          {
            name: 'NativeSessionStorage',
            methods: ['read', 'write', 'clear'].map((name) => ({
              name,
              rtype: 'promise',
            })),
          },
          {
            name: 'EimirPush',
            methods: [
              { name: 'addListener', rtype: 'callback' },
              ...[
                'removeListener',
                'status',
                'enable',
                'refresh',
                'disable',
                'openNotificationSettings',
              ].map((name) => ({ name, rtype: 'promise' })),
            ],
          },
        ],
        nativeCallback: (
          plugin: string,
          _method: string,
          options: { eventName: string },
          callback: (value: unknown) => void,
        ) => {
          callbacks.set(`${plugin}:${options.eventName}`, callback);
          return String(++sequence);
        },
        nativePromise: async (
          plugin: string,
          method: string,
          options: Record<string, string> = {},
        ) => {
          if (plugin === 'NativeSessionStorage') {
            if (method === 'write')
              sessionStorage.setItem('native-test-session', options.value);
            if (method === 'clear')
              sessionStorage.removeItem('native-test-session');
            return {
              value: sessionStorage.getItem('native-test-session') ?? undefined,
            };
          }
          if (method === 'removeListener') {
            callbacks.delete(`${plugin}:${options.eventName}`);
            return {};
          }
          if (plugin === 'App') return undefined;
          if (plugin !== 'EimirPush')
            throw new Error('Unexpected native plugin');
          if (method === 'status') return state;
          if (method === 'disable') {
            state = {
              ...state,
              accountId: null,
              apiBaseUrl: null,
              providerKey: null,
              activationId: null,
              enabled: false,
            };
            return {};
          }
          if (method === 'enable') {
            host.pushCalls.push(method);
            if (deny) throw new Error('NOTIFICATION_PERMISSION_DENIED');
            state = {
              ...state,
              ...options,
              activationId: '11111111-1111-4111-8111-111111111112',
              permissionGranted: true,
              enabled: true,
            };
            callbacks.get('EimirPush:endpoint')?.({
              ...state,
              endpointValue: JSON.stringify({
                fid: 'synthetic-fcm-token',
                activationId: state.activationId,
              }),
            });
            return {};
          }
          if (method === 'openNotificationSettings')
            host.pushCalls.push(method);
          return { enabled: state.enabled };
        },
      };
    },
    { deny },
  );
}

async function mocks(page: Page) {
  await installMocks(page);
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/dashboard/preferences`,
    (route) => route.fulfill({ json: { items: [] } }),
  );
  await page.route(`**/api/v1/spaces/${SPACE_ID}/activity?*`, (route) =>
    route.fulfill({ json: { items: [], hasMore: false, nextCursor: null } }),
  );
  await page.route('**/api/v1/push-endpoints/configuration', (route) =>
    route.fulfill({
      json: {
        unifiedPush: null,
        fcm: {
          providerKey: 'fcm',
          projectId: 'test-project',
          androidPackage: 'de.eimir.app',
        },
      },
    }),
  );
  await page.route('**/api/v1/push-endpoints', (route) =>
    route.fulfill({ json: { id: 'registered-endpoint' } }),
  );
}

async function signIn(page: Page) {
  await page.goto('/today');
  await expect(
    page.getByRole('dialog', { name: copy.onboardingTitle }),
  ).toHaveCount(0);
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.locator('.today-content')).toBeVisible();
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
}

for (const width of [360, 390, 430, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`native post-sign-in consent ${width}px ${theme}`, async ({
      page,
    }, info) => {
      await nativePush(page);
      await mocks(page);
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(
        (value) => localStorage.setItem('eimir.theme', value),
        theme,
      );
      await signIn(page);
      const dialog = page.getByRole('dialog', { name: copy.onboardingTitle });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(copy.deviceIntro)).toBeVisible();
      expect(
        await page.evaluate(
          () => (window as unknown as { pushCalls: string[] }).pushCalls,
        ),
      ).toEqual([]);
      expect(
        (await new AxeBuilder({ page }).include('dialog[open]').analyze())
          .violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await captureScreenshot(page, info, `push-consent-${width}-${theme}.png`);
      if (width === 360 && theme === 'dark') {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
        });
        await expect(
          dialog.getByRole('button', { name: copy.onboardingLater }),
        ).toBeVisible();
        const reading = dialog.getByRole('region', {
          name: copy.onboardingTitle,
        });
        await reading.focus();
        await page.keyboard.press('End');
        await expect
          .poll(() => reading.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        expect(
          (await new AxeBuilder({ page }).include('dialog[open]').analyze())
            .violations,
        ).toEqual([]);
        await captureScreenshot(
          page,
          info,
          'push-consent-360-dark-text200.png',
        );
      }
      await dialog.getByRole('button', { name: copy.onboardingLater }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(/\/today$/);
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Lea & Alex' }),
      ).toBeVisible();
      await expect(dialog).toHaveCount(0);
    });
  }
}

test('activation waits for authenticated endpoint registration before confirming success', async ({
  page,
}) => {
  await nativePush(page);
  await mocks(page);
  let release!: () => void;
  const registration = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/push-endpoints', async (route) => {
    expect(route.request().headers().authorization).toBe(
      'Bearer timeline-ref-access-token',
    );
    expect(route.request().postDataJSON().providerKey).toBe('fcm');
    await registration;
    await route.fulfill({ json: { id: 'registered-endpoint' } });
  });
  await signIn(page);
  const dialog = page.getByRole('dialog', { name: copy.onboardingTitle });
  await dialog.getByRole('button', { name: copy.onboardingActivate }).click();
  await expect(dialog.getByRole('status')).toHaveText(copy.deviceConnecting);
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem(
        `eimir-device-push-onboarding-v1:${location.origin}:${'11111111-1111-4111-8111-111111111111'}`,
      ),
    ),
  ).toBe('answered');
});

test('permission denial offers system settings and does not register an endpoint', async ({
  page,
}) => {
  await nativePush(page, true);
  await mocks(page);
  let registrations = 0;
  await page.route('**/api/v1/push-endpoints', async (route) => {
    registrations += 1;
    await route.fulfill({ json: { id: 'unexpected' } });
  });
  await signIn(page);
  const dialog = page.getByRole('dialog', { name: copy.onboardingTitle });
  await dialog.getByRole('button', { name: copy.onboardingActivate }).click();
  await expect(dialog.getByRole('status')).toHaveText(
    copy.devicePermissionDenied,
  );
  await dialog.getByRole('button', { name: copy.deviceOpenSettings }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { pushCalls: string[] }).pushCalls,
    ),
  ).toEqual(['enable', 'openNotificationSettings']);
  expect(registrations).toBe(0);
  await dialog.getByRole('button', { name: copy.onboardingLater }).click();
  await expect(dialog).toHaveCount(0);
});

test('ordinary Web sign-in does not offer native notification setup', async ({
  page,
}) => {
  await mocks(page);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Lea & Alex' })).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: copy.onboardingTitle }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      (account) =>
        localStorage.getItem(
          `eimir-device-push-onboarding-v1:${location.origin}:${account}`,
        ),
      ACCOUNT_ID,
    ),
  ).toBeNull();
});
