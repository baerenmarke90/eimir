import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import copy from '../../src/i18n/locales/appIcon';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const PARTNER_ID = '00000000-0000-4000-8000-000000000002';
const SPACE_ID = '00000000-0000-4000-8000-000000000010';

async function signIn(page: Page) {
  await page.goto('/more/settings/appearance');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByRole('button', { name: copy.all })).toBeVisible();
  await expect(page.getByText(copy.loading, { exact: true })).toHaveCount(0);
}

async function capture(page: Page, info: TestInfo, name: string) {
  const output = info.outputPath(name);
  await page.screenshot({ path: output });
  if (process.env.VISUAL_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.VISUAL_EVIDENCE_DIR, { recursive: true });
    fs.copyFileSync(output, path.join(process.env.VISUAL_EVIDENCE_DIR, name));
  }
}

async function installMocks(
  page: Page,
  pro: boolean,
  initialIcon = 'original',
): Promise<string[]> {
  let iconId = initialIcon;
  let version = initialIcon === 'original' ? 0 : 1;
  const writes: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const respond = async (body: unknown) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (pathname.endsWith('/partner-nickname')) {
      await respond({ nickname: null, partnerId: PARTNER_ID, version: 0 });
      return;
    }

    if (pathname.endsWith('/appearance/app-icon')) {
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON() as { iconId: string };
        writes.push(body.iconId);
        expect(request.headers()['if-match']).toBe(`"icon:${version}"`);
        if (body.iconId !== 'original' && !pro)
          throw new Error('Unexpected paid write from Free UI');
        iconId = body.iconId;
        version += 1;
      }
      await route.fulfill({
        json: { iconId, version },
        headers: { ETag: `"icon:${version}"` },
      });
      return;
    }
    if (request.method() === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await respond({
        account: { id: ACCOUNT_ID, displayName: 'Lea' },
        tokens: {
          accessToken: 'tour-access-token',
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          refreshToken: 'tour-refresh-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
        },
      });
      return;
    }
    if (pathname === '/api/v1/instance/status') {
      await respond({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
        auth: {
          localPassword: true,
          passkey: true,
          magicLink: true,
          oidc: false,
        },
      });
      return;
    }
    if (pathname === '/api/v1/auth/me') {
      await respond({ id: ACCOUNT_ID, displayName: 'Lea' });
      return;
    }
    if (pathname === '/api/v1/auth/capabilities') {
      await respond({ serverAdmin: false });
      return;
    }
    if (pathname === '/api/v1/auth/memberships') {
      await respond([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
      return;
    }
    if (pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await respond({
        id: SPACE_ID,
        createdAt: '2025-01-01T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Lea' },
          { id: PARTNER_ID, displayName: 'Alex' },
        ],
      });
      return;
    }
    if (pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/profiles/`)) {
      const partner = pathname.endsWith(PARTNER_ID);
      await respond({
        id: partner ? PARTNER_ID : ACCOUNT_ID,
        accountId: partner ? PARTNER_ID : ACCOUNT_ID,
        displayName: partner ? 'Alex' : 'Lea',
        birthday: null,
        profileAttachmentId: null,
        preferences: [],
        version: 1,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });
      return;
    }
    if (pathname.endsWith('/notifications/unread-count')) {
      await respond({ unreadCount: 0 });
      return;
    }
    if (pathname.endsWith('/entitlements')) {
      await respond({
        capabilities: pro ? ['theme.bespoke_packs'] : [],
        isInGracePeriod: false,
        tier: 'PREMIUM',
        status: 'ACTIVE',
      });
      return;
    }
    if (pathname.endsWith('/daily-quote')) {
      await respond({ checkedOn: '2026-09-26', enabled: false, quote: null });
      return;
    }
    if (pathname.endsWith('/dashboard')) {
      await respond({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Alex' },
        },
        relationshipDuration: null,
        retrospective: null,
        upcoming: [],
        recentShared: [],
        sharedStorySummary: { memories: 0, heartMoments: 0, milestones: 0 },
      });
      return;
    }
    throw new Error(
      `Unexpected icon-journey request: ${request.method()} ${pathname}`,
    );
  });
  return writes;
}

test('Free previews the complete catalog without saving a paid choice', async ({
  page,
}, info) => {
  const writes = await installMocks(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await capture(page, info, 'app-icons-free-390-light.png');
  const opener = page.getByRole('button', { name: copy.all });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: copy.choices });
  await expect(dialog.getByRole('radio')).toHaveCount(11);
  await expect(dialog.getByText(copy.pro, { exact: true })).toHaveCount(10);
  await dialog.getByRole('radio', { name: 'Salbei Pro' }).check();
  await expect(
    dialog.getByRole('button', { name: copy.discover }),
  ).toBeVisible();
  expect(writes).toEqual([]);
  await expect(page.locator('#app-favicon')).toHaveAttribute(
    'href',
    /app-icon-light\.png$/,
  );
  await capture(page, info, 'app-icons-free-preview-390-light.png');
  const accessibility = await new AxeBuilder({ page })
    .include('.app-icon-sheet')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('Pro explicitly saves, survives reload and resets to adaptive Original', async ({
  page,
}, info) => {
  const writes = await installMocks(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page);
  await page.getByRole('button', { name: copy.all }).click();
  const dialog = page.getByRole('dialog', { name: copy.choices });
  await dialog.getByRole('radio', { name: 'Salbei Pro' }).check();
  expect(writes).toEqual([]);
  await dialog.getByRole('button', { name: 'Salbei auswählen' }).click();
  await expect(dialog.getByText(copy.saved, { exact: true })).toBeVisible();
  expect(writes).toEqual(['sage']);
  await expect(page.locator('#app-favicon')).toHaveAttribute(
    'href',
    /app-icons\/v1\/sage\.png$/,
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/apple-touch-icon.png',
  );
  await capture(page, info, 'app-icons-pro-saved-390-dark.png');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('.app-icon-summary strong')).toHaveText('Salbei');
  await page.getByLabel('Darstellung', { exact: true }).selectOption('light');
  await expect(page.locator('#app-favicon')).toHaveAttribute(
    'href',
    /app-icons\/v1\/sage\.png$/,
  );
  await page.getByRole('button', { name: copy.all }).click();
  await dialog.getByRole('radio', { name: 'Original Standard' }).check();
  await dialog.getByRole('button', { name: 'Original auswählen' }).click();
  await expect(page.locator('#app-favicon')).toHaveAttribute(
    'href',
    /app-icon-light\.png$/,
  );
  await page.keyboard.press('Escape');
  await page.getByLabel('Darstellung', { exact: true }).selectOption('dark');
  await expect(page.locator('#app-favicon')).toHaveAttribute(
    'href',
    /app-icon-dark\.png$/,
  );
});

test('catalog reflows at 320, 430 and Expanded with reduced motion and large text', async ({
  page,
}, info) => {
  await installMocks(page, true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);
  await page.getByRole('button', { name: copy.all }).click();
  const dialog = page.getByRole('dialog', { name: copy.choices });
  for (const size of [
    { width: 320, height: 568 },
    { width: 430, height: 932 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await dialog.getByRole('radio', { name: 'Minimal Pro' }).check();
    await expect(
      dialog.getByRole('button', { name: 'Minimal auswählen' }),
    ).toBeVisible();
    const geometry = await dialog.evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    await capture(page, info, `app-icons-pro-${size.width}-light.png`);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(
    dialog.getByRole('button', { name: 'Minimal auswählen' }),
  ).toBeVisible();
  await capture(page, info, 'app-icons-pro-360-large-text.png');
  const accessibility = await new AxeBuilder({ page })
    .include('.app-icon-sheet')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('pending save blocks duplicate submission and Escape until authoritative completion', async ({
  page,
}) => {
  await installMocks(page, true);
  await signIn(page);
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let writes = 0;
  await page.route('**/appearance/app-icon', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    writes += 1;
    await pending;
    await route.fulfill({
      json: { iconId: 'sage', version: 1 },
      headers: { ETag: '"icon:1"' },
    });
  });
  await page.getByRole('button', { name: copy.all }).click();
  const dialog = page.getByRole('dialog', { name: copy.choices });
  await dialog.getByRole('radio', { name: 'Salbei Pro' }).check();
  await dialog.getByRole('button', { name: 'Salbei auswählen' }).click();
  await expect(
    dialog.getByRole('button', { name: copy.saving }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole('radio', { name: 'Sand Pro', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(copy.saved, { exact: true })).toHaveCount(0);
  expect(writes).toBe(1);
  complete();
  await expect(dialog.getByText(copy.saved, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('conflict reload preserves preview and a revoked grant keeps the prior choice', async ({
  page,
}) => {
  await installMocks(page, true);
  await signIn(page);
  let latest = false;
  let writes = 0;
  await page.route('**/appearance/app-icon', async (route) => {
    if (route.request().method() === 'GET') {
      if (!latest) return route.fallback();
      return route.fulfill({
        json: { iconId: 'sand', version: 1 },
        headers: { ETag: '"icon:1"' },
      });
    }
    writes += 1;
    const conflict = writes === 1;
    latest = true;
    await route.fulfill({
      status: conflict ? 409 : 403,
      json: {
        type: 'request_error',
        title: 'Request failed',
        detail: 'Fixture response',
        status: conflict ? 409 : 403,
        code: conflict
          ? 'RESOURCE_VERSION_CONFLICT'
          : 'PREMIUM_ENTITLEMENT_REQUIRED',
      },
    });
  });
  await page.getByRole('button', { name: copy.all }).click();
  const dialog = page.getByRole('dialog', { name: copy.choices });
  await dialog.getByRole('radio', { name: 'Salbei Pro' }).check();
  await dialog.getByRole('button', { name: 'Salbei auswählen' }).click();
  await expect(dialog.getByText(copy.conflict)).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Salbei Pro' })).toBeChecked();
  await expect(
    dialog.getByRole('button', { name: 'Salbei auswählen' }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: copy.reload }).click();
  await expect(
    dialog.getByRole('button', { name: 'Salbei auswählen' }),
  ).toBeEnabled();
  await expect(page.locator('#app-favicon')).toHaveAttribute(
    'href',
    /app-icons\/v1\/sand\.png$/,
  );
  await dialog.getByRole('button', { name: 'Salbei auswählen' }).click();
  await expect(dialog.getByText(copy.denied)).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: copy.discover }),
  ).toBeVisible();
  await expect(page.locator('#app-favicon')).toHaveAttribute(
    'href',
    /app-icons\/v1\/sand\.png$/,
  );
  await dialog.getByRole('radio', { name: 'Original Standard' }).check();
  await expect(dialog.getByText(copy.denied)).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Original auswählen' }),
  ).toBeEnabled();
  expect(writes).toBe(2);
});

test('expired Pro keeps its saved choice without an upgrade prompt and permits free reset', async ({
  page,
}) => {
  const writes = await installMocks(page, false, 'sage');
  await signIn(page);
  await expect(page.locator('#app-favicon')).toHaveAttribute(
    'href',
    /app-icons\/v1\/sage\.png$/,
  );
  await page.getByRole('button', { name: copy.all }).click();
  const dialog = page.getByRole('dialog', { name: copy.choices });
  await expect(dialog.getByRole('radio', { name: 'Salbei Pro' })).toBeChecked();
  await expect(
    dialog.getByRole('button', { name: copy.selected }),
  ).toBeDisabled();
  await expect(dialog.getByRole('button', { name: copy.discover })).toHaveCount(
    0,
  );
  await dialog.getByRole('radio', { name: 'Sand Pro', exact: true }).check();
  await expect(
    dialog.getByRole('button', { name: copy.discover }),
  ).toBeVisible();
  await dialog.getByRole('radio', { name: 'Original Standard' }).check();
  await dialog.getByRole('button', { name: 'Original auswählen' }).click();
  await expect(dialog.getByText(copy.saved, { exact: true })).toBeVisible();
  expect(writes).toEqual(['original']);
  await expect(page.locator('#app-favicon')).toHaveAttribute(
    'href',
    /app-icon-light\.png$/,
  );
});

test('Android applies only the saved choice and retries a native failure without another write', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const nativeWindow = window as unknown as {
      CapacitorCustomPlatform: { name: string };
      Capacitor: unknown;
      iconApplications: string[];
    };
    nativeWindow.CapacitorCustomPlatform = { name: 'android' };
    nativeWindow.iconApplications = [];
    let failSand = true;
    nativeWindow.Capacitor = {
      PluginHeaders: [
        { name: 'AppIcon', methods: [{ name: 'apply', rtype: 'promise' }] },
        {
          name: 'NativeSessionStorage',
          methods: ['read', 'write', 'clear'].map((name) => ({
            name,
            rtype: 'promise',
          })),
        },
      ],
      nativePromise: async (
        plugin: string,
        method: string,
        options: { iconId?: string; value?: string },
      ) => {
        if (plugin === 'NativeSessionStorage') {
          if (method === 'write')
            sessionStorage.setItem('native-test-session', options.value ?? '');
          if (method === 'clear')
            sessionStorage.removeItem('native-test-session');
          return {
            value: sessionStorage.getItem('native-test-session') ?? undefined,
          };
        }
        if (plugin !== 'AppIcon' || method !== 'apply' || !options.iconId)
          throw new Error('Unexpected native call');
        nativeWindow.iconApplications.push(options.iconId);
        if (options.iconId === 'sand' && failSand) {
          failSand = false;
          throw new Error('Launcher unavailable');
        }
        return { iconId: options.iconId };
      },
    };
  });
  const writes = await installMocks(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(
    page.getByText(copy.nativeApplied, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: copy.all }).click();
  const dialog = page.getByRole('dialog', { name: copy.choices });
  await dialog.getByRole('radio', { name: 'Sand Pro', exact: true }).check();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { iconApplications: string[] }).iconApplications,
    ),
  ).toEqual(['original']);
  await dialog.getByRole('button', { name: 'Sand auswählen' }).click();
  await expect(
    dialog.getByText(copy.nativeError, { exact: true }),
  ).toBeVisible();
  await capture(page, info, 'app-icons-android-native-error-390-light.png');
  expect(writes).toEqual(['sand']);
  await dialog.getByRole('button', { name: copy.nativeRetry }).click();
  await expect(
    dialog.getByText(copy.nativeApplied, { exact: true }),
  ).toBeVisible();
  expect(writes).toEqual(['sand']);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { iconApplications: string[] }).iconApplications,
    ),
  ).toEqual(['original', 'sand', 'sand']);
  await capture(page, info, 'app-icons-android-native-applied-390-light.png');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  for (const width of [360, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      dialog.getByText(copy.nativeApplied, { exact: true }),
    ).toBeVisible();
    await capture(
      page,
      info,
      `app-icons-android-native-applied-${width}-dark.png`,
    );
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(
    dialog.getByText(copy.nativeApplied, { exact: true }),
  ).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .include('.app-icon-sheet')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await capture(
    page,
    info,
    'app-icons-android-native-applied-320-large-text.png',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: copy.all })).toBeFocused();
});
