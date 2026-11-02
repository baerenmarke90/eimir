import copy from '../../src/i18n/locales/notificationSettings';
import { expect, test } from '@playwright/test';
import {
  captureScreenshot,
  installMocks,
  signIn,
} from '../support/storyTimelineFixture';
import { installNativeAppLifecycle } from '../support/nativeAppLifecycle';

for (const [width, theme, large, reduced] of [
  [360, 'light', false, false],
  [390, 'dark', false, false],
  [430, 'light', true, true],
  [1280, 'dark', false, false],
] as const) {
  test(`post-login Push consent and confirmed endpoint at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({
      colorScheme: theme,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    const unexpected = await installMocks(page, { strict: true });
    await installNativeAppLifecycle(page, true);
    let writes = 0;
    let releaseRegistration: (() => void) | undefined;
    const registration = new Promise<void>((resolve) => {
      releaseRegistration = resolve;
    });
    await page.route('**/api/v1/push-endpoints**', async (route) => {
      if (route.request().method() === 'GET')
        return route.fulfill({
          json: {
            fcm: {
              projectId: 'fixture-project',
              androidPackage: 'de.eimir.app',
              encryptedPreviewVersion: null,
            },
            unifiedPush: null,
          },
        });
      expect(route.request().postDataJSON().providerKey).toBe('fcm');
      writes++;
      await registration;
      return route.fulfill({ json: { id: 'registered-endpoint' } });
    });
    await signIn(page);
    if (large) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const sheet = page.getByRole('dialog', {
      name: copy.introductionTitle,
    });
    await expect(sheet).toBeVisible();
    expect(writes).toBe(0);
    await expect(
      sheet.getByRole('button', { name: copy.introductionAllow }),
    ).toBeFocused();
    await captureScreenshot(
      page,
      info,
      `push-introduction-${width}-${theme}.png`,
    );
    expect(
      await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await sheet.getByRole('button', { name: copy.introductionAllow }).click();
    await expect.poll(() => writes).toBe(1);
    await expect(sheet.getByRole('status')).toHaveText(copy.deviceConnecting);
    await expect(sheet).toBeVisible();
    releaseRegistration?.();
    await expect(sheet).not.toBeVisible();
    await expect(page.getByText(copy.deviceOn)).toBeVisible();
    await expect(page).toHaveURL(/\/story\?tab=timeline$/);
    expect(unexpected).toEqual([]);
  });
}

test('Not now preserves sign-in and the current route across reload without registering', async ({
  page,
}) => {
  await installMocks(page, { strict: true });
  await installNativeAppLifecycle(page, true);
  let registrations = 0;
  await page.route('**/api/v1/push-endpoints**', (route) => {
    if (route.request().method() !== 'GET') registrations++;
    return route.fulfill({
      json: {
        fcm: { projectId: 'fixture-project', androidPackage: 'de.eimir.app' },
        unifiedPush: null,
      },
    });
  });
  await signIn(page);
  const sheet = page.getByRole('dialog', { name: copy.introductionTitle });
  await sheet.getByRole('button', { name: copy.introductionSkip }).click();
  await expect(sheet).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Momente', exact: true }),
  ).toBeVisible();
  await expect(sheet).not.toBeVisible();
  expect(registrations).toBe(0);
});
