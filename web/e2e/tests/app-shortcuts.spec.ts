import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import snackbar from '../../src/i18n/locales/snackbar';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  signIn,
  SPACE_ID,
} from '../support/storyTimelineFixture';

async function nativeShortcuts(
  page: Page,
  platform: 'android' | 'ios',
  action: string,
) {
  await page.addInitScript(
    ({ platform, action }) => {
      const callbacks = new Map<
        string,
        { plugin: string; event: string; callback: () => void }
      >();
      let serial = 0;
      let pending: { id: string; action: string } | undefined = {
        id: crypto.randomUUID(),
        action,
      };
      const host = window as unknown as {
        CapacitorCustomPlatform: unknown;
        Capacitor: unknown;
        shortcutCalls: string[];
        openShortcut(action: string): void;
      };
      host.CapacitorCustomPlatform = { name: platform };
      host.shortcutCalls = [];
      host.openShortcut = (action) => {
        pending = { id: crypto.randomUUID(), action };
        for (const listener of callbacks.values()) {
          if (
            listener.plugin === 'AppShortcuts' &&
            listener.event === 'shortcutOpen'
          )
            listener.callback();
        }
      };
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
            methods: ['read', 'write', 'clear', 'clearMediaKey'].map(
              (name) => ({ name, rtype: 'promise' }),
            ),
          },
          {
            name: 'AppShortcuts',
            methods: [
              { name: 'addListener', rtype: 'callback' },
              ...['peek', 'acknowledge', 'removeListener'].map((name) => ({
                name,
                rtype: 'promise',
              })),
            ],
          },
        ],
        nativeCallback: (
          plugin: string,
          _method: string,
          options: { eventName: string },
          callback: () => void,
        ) => {
          const id = String(++serial);
          callbacks.set(id, { plugin, event: options.eventName, callback });
          return id;
        },
        nativePromise: async (
          plugin: string,
          method: string,
          options: Record<string, string> = {},
        ) => {
          if (method === 'removeListener') {
            callbacks.delete(options.callbackId);
            return {};
          }
          if (plugin === 'NativeSessionStorage') {
            if (method === 'write')
              sessionStorage.setItem('native-test-session', options.value);
            if (method === 'clear')
              sessionStorage.removeItem('native-test-session');
            return {
              value: sessionStorage.getItem('native-test-session') ?? undefined,
            };
          }
          if (plugin === 'AppShortcuts') {
            host.shortcutCalls.push(method);
            if (method === 'peek') return { request: pending };
            if (method === 'acknowledge' && options.id === pending?.id)
              pending = undefined;
            return {};
          }
          return undefined;
        },
      };
    },
    { platform, action },
  );
}

async function setup(page: Page) {
  await installMocks(page);
  const records = new Map<string, object>();
  const writes: string[] = [];
  await page.route('**/api/v1/spaces/*/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const resource = path.split('/').at(-1) ?? '';
    if (
      request.method() === 'POST' &&
      ['memories', 'wishes', 'plans'].includes(resource)
    ) {
      const id = crypto.randomUUID();
      const body = request.postDataJSON();
      const record = {
        ...body,
        id,
        spaceId: SPACE_ID,
        author: ME,
        authorId: ACCOUNT_ID,
        createdBy: ME,
        status: 'OPEN',
        version: 1,
        capabilities: CAPABILITIES,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachment: null,
        attachments: [],
        tags: [],
        places: [],
        fileAttachments: [],
        checklistItems: [],
        checklists: [],
        description: body.description ?? null,
      };
      records.set(id, record);
      writes.push(resource);
      return route.fulfill({ status: 201, json: record });
    }
    if (request.method() === 'GET' && records.has(resource))
      return route.fulfill({ json: records.get(resource) });
    return route.fallback();
  });
  return writes;
}

const targets = [
  {
    action: 'moment',
    route: '/story/memories',
    field: de.memory.bodyLabel,
    save: de.memory.save,
  },
  {
    action: 'wish',
    route: '/plan/wishes',
    field: m5s3.wish.intentionLabel,
    save: m5s3.common.save,
  },
  {
    action: 'plan',
    route: '/plan/plans',
    field: m5s3.plan.intentionLabel,
    save: m5s3.common.save,
  },
];
for (const platform of ['android', 'ios'] as const) {
  for (const target of targets) {
    test(`${platform}: cold ${target.action} waits for login, then saves through its existing composer`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      if (platform === 'ios')
        await page.emulateMedia({
          colorScheme: 'dark',
          reducedMotion: 'reduce',
        });
      await nativeShortcuts(page, platform, target.action);
      const writes = await setup(page);
      await page.goto('/');
      await expect(page.getByLabel(de.login.email)).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { shortcutCalls: string[] }).shortcutCalls,
        ),
      ).toEqual([]);
      await page.getByLabel(de.login.email).fill('lea@example.org');
      await page
        .getByLabel(de.login.password)
        .fill('a-long-enough-test-password');
      await page.getByRole('button', { name: de.login.submit }).click();
      await expect(page).toHaveURL(`${target.route}/new`);
      const input = page.getByLabel(target.field, { exact: true });
      await expect(input).toBeVisible();
      expect(writes).toEqual([]);
      expect(
        await page.evaluate(() => document.activeElement?.tagName),
      ).not.toMatch(/INPUT|TEXTAREA/);
      await captureScreenshot(
        page,
        info,
        `${platform}-${target.action}-390.png`,
      );
      await input.fill('A small adventure together');
      await page
        .getByRole('button', { name: target.save, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`${target.route}/(?!new)[^/]+$`));
      await expect(
        page.getByText('A small adventure together', { exact: true }).first(),
      ).toBeVisible();
      expect(writes).toEqual([target.route.split('/').at(-1)]);
    });
  }
  test(`${platform}: warm reselect preserves a draft and a different action waits for save`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await nativeShortcuts(page, platform, 'moment');
    const writes = await setup(page);
    await signIn(page);
    await expect(page).toHaveURL('/story/memories/new');
    const input = page.getByLabel(de.memory.bodyLabel, { exact: true });
    await input.fill('Our unfinished thought');
    await page.evaluate(() =>
      (
        window as unknown as { openShortcut(action: string): void }
      ).openShortcut('moment'),
    );
    await expect(input).toHaveValue('Our unfinished thought');
    await page.evaluate(() =>
      (
        window as unknown as { openShortcut(action: string): void }
      ).openShortcut('wish'),
    );
    await expect(
      page.getByText(snackbar.snackbar.appShortcutWaiting, { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL('/story/memories/new');
    await expect(input).toHaveValue('Our unfinished thought');
    await captureScreenshot(page, info, `${platform}-waiting-1024.png`);
    await page
      .getByRole('button', { name: de.memory.save, exact: true })
      .click();
    await expect(page).toHaveURL('/plan/wishes/new');
    await expect(
      page.getByLabel(m5s3.wish.intentionLabel, { exact: true }),
    ).toHaveValue('');
    expect(writes).toEqual(['memories']);
  });
}
