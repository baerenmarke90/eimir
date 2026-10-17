import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import copy from '../../src/i18n/locales/appUpdates';

async function open(page: Page, options = '') {
  await page.route(
    'https://api.eimir-fixture.test/api/v1/**',
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/notifications/unread-count'))
        return route.fulfill({ json: { unreadCount: 0 } });
      if (pathname.endsWith('/appearance/app-icon'))
        return route.fulfill({ json: { iconId: 'original', version: 0 } });
      if (pathname.endsWith('/partner-nickname'))
        return route.fulfill({
          json: { nickname: null, partnerId: null, version: 0 },
        });
      if (pathname.includes('/profiles/'))
        return route.fulfill({
          json: {
            displayName: 'Lea',
            profileAttachmentId: null,
            preferences: [],
            version: 1,
          },
        });
      throw new Error(`Unexpected update UI fixture request: ${pathname}`);
    },
  );
  await page.goto(`/e2e/fixtures/app-updates.html?${options}`);
  await page.getByRole('link', { name: /App-Updates/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: copy.title }),
  ).toBeVisible();
  await expect(page.getByText('Installiert: 0.2.0-test.1')).toBeVisible();
}
async function capture(page: Page, info: TestInfo, name: string) {
  if (!process.env.VISUAL_EVIDENCE_DIR) return;
  const target = info.outputPath(name);
  // Full-page captures start at the document top, including fixed shell UI.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: target, fullPage: true });
  fs.mkdirSync(process.env.VISUAL_EVIDENCE_DIR, { recursive: true });
  fs.copyFileSync(target, path.join(process.env.VISUAL_EVIDENCE_DIR, name));
}
async function calls(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { updatesFixture: { calls: string[] } })
        .updatesFixture.calls,
  );
}

test('keeps check, cancel, ready and installation as separate deliberate actions', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole('button', { name: copy.check }).click();
  await capture(page, info, 'available-390-light.png');
  await page.getByRole('button', { name: copy.download }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '42');
  await page.getByRole('button', { name: copy.cancel }).click();
  await expect(page.getByText(copy.phases.cancelled)).toBeVisible();
  await page.getByRole('button', { name: copy.download }).click();
  await page.evaluate(() =>
    (
      window as unknown as { updatesFixture: { finish(): void } }
    ).updatesFixture.finish(),
  );
  await expect(page.getByText(copy.phases.ready)).toBeVisible();
  expect((await calls(page)).filter((call) => call === 'install')).toHaveLength(
    0,
  );
  await page.getByRole('button', { name: copy.install }).click();
  await expect(page.getByText(copy.permission)).toBeVisible();
  await capture(page, info, 'permission-390-light.png');
  expect((await calls(page)).filter((call) => call === 'install')).toHaveLength(
    1,
  );
  await page.getByRole('button', { name: copy.installAgain }).click();
  await expect(page.getByText(copy.phases.installerOpened)).toBeVisible();
  await page.getByRole('link', { name: /Zurück zu Einstellungen/ }).click();
  await expect(page.getByRole('link', { name: /App-Updates/ })).toBeVisible();
});

for (const [width, theme, enlarged] of [
  [320, 'light', true],
  [360, 'dark', false],
  [430, 'light', false],
  [1280, 'dark', false],
] as const) {
  test(`is readable at ${width}px ${theme}${enlarged ? ' with enlarged text' : ''}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, `theme=${theme}&long=1`);
    if (enlarged)
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: copy.check }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const dimensions = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    await capture(
      page,
      info,
      `available-${width}-${theme}${enlarged ? '-large' : ''}.png`,
    );
    const accessibility = await new AxeBuilder({ page })
      .include('.settings-page')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

test('a service error stays actionable and does not claim the app is current', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'error=1');
  await expect(page.getByRole('alert')).toContainText(copy.connectionError);
  await expect(page.getByText(copy.phases.current)).toHaveCount(0);
  await capture(page, info, 'error-390-light.png');
  await page.getByRole('button', { name: copy.retry }).click();
  await expect(page.getByRole('button', { name: copy.download })).toBeVisible();
});
