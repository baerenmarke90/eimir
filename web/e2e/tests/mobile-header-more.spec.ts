import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s5 from '../../src/i18n/locales/m5s5';
import navigation from '../../src/i18n/locales/navigation';
import AxeBuilder from '../support/axe';
import { storyDetailBack } from '../support/memoryDiary';
import { installNativeAppLifecycle } from '../support/nativeAppLifecycle';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  ACCOUNT_ID,
  captureScreenshot,
  installMocks,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

async function setup(page: Page, serverAdmin = false) {
  await page.addInitScript(
    ({ accountId, spaceId }) => {
      localStorage.setItem(
        `eimir:product-tour:v1:${accountId}:${spaceId}`,
        'seen',
      );
    },
    { accountId: ACCOUNT_ID, spaceId: SPACE_ID },
  );
  await installMocks(page);
  let unread = 3;
  let rejectRead = true;
  let signOuts = 0;
  let reads = 0;
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/v1/auth/capabilities')
      return route.fulfill({ json: { serverAdmin } });
    if (pathname.endsWith('/notifications/unread-count'))
      return route.fulfill({ json: { unreadCount: unread } });
    if (pathname.endsWith('/notifications/read-all')) {
      reads++;
      if (rejectRead)
        return route.fulfill({
          status: 503,
          json: { title: 'Unavailable', status: 503 },
        });
      unread = 0;
      return route.fulfill({
        json: { readThrough: '2026-10-29T14:00:00Z', updated: 3 },
      });
    }
    if (pathname.endsWith('/notifications'))
      return route.fulfill({
        json: {
          items: [0, 1, 2].map((id) => ({
            id: `notice-${id}`,
            sourceEventId: `event-${id}`,
            kind: 'THINKING_OF_YOU',
            actorId: null,
            targetId: null,
            targetType: null,
            target: null,
            createdAt: '2026-10-29T12:00:00Z',
            readAt: unread ? null : '2026-10-29T14:00:00Z',
          })),
          nextCursor: null,
        },
      });
    if (pathname === '/api/v1/auth/sign-out') {
      expect(request.headers().authorization).toBe(
        'Bearer timeline-ref-access-token',
      );
      signOuts++;
      return route.fulfill({ status: 204 });
    }
    return route.fallback();
  });
  await signIn(page);
  await page
    .locator('.mobile-bottom-nav a[href="/more"], .shell-nav a[href="/more"]')
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/more$/);
  return {
    allowRead: () => {
      rejectRead = false;
    },
    signOuts: () => signOuts,
    reads: () => reads,
  };
}

test('More keeps search, identity and inbox discoverable; unread dot follows confirmed reads', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page);
  const more = page.locator('.mobile-bottom-nav a[href="/more"]');
  await expect(page.locator('.product-topbar')).toBeHidden();
  await expect(more).toHaveAccessibleName(
    'Mehr, 3 ungelesene Benachrichtigungen',
  );
  await expect(more.locator('.notification-dot')).toBeVisible();
  await expect(page.locator('.more-profile-label')).toHaveText(
    navigation.profile,
  );
  await expect(page.locator('.more-unread-count')).toHaveText('3');
  await expect(page.locator('.more-page input')).toHaveCount(0);
  expect(state.reads()).toBe(0);
  await captureScreenshot(page, info, 'more-390-light-unread.png');
  await page.getByRole('link', { name: navigation.searchAll }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(
    page.getByRole('searchbox', { name: m5s5.search.label }),
  ).toBeVisible();
  await expect(more).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await page
    .getByRole('link', { name: 'Benachrichtigungen, 3 ungelesen' })
    .click();
  await page
    .getByRole('button', { name: m5s5.notifications.markAllRead, exact: true })
    .click();
  await expect.poll(state.reads).toBe(1);
  await expect(more.locator('.notification-dot')).toBeVisible();
  state.allowRead();
  await page
    .getByRole('button', { name: m5s5.notifications.markAllRead, exact: true })
    .click();
  await expect.poll(state.reads).toBe(2);
  await expect(more.locator('.notification-dot')).toHaveCount(0);
  await expect(more).toHaveAccessibleName(navigation.more);
  await more.click();
  await expect(page.locator('.more-unread-count')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: navigation.notifications, exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, 'more-390-light-read.png');
});

test('More reflows in Light, Dark, large text and Expanded navigation', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  for (const variant of [
    { width: 360, theme: 'light', large: false },
    { width: 390, theme: 'dark', large: false },
    { width: 430, theme: 'light', large: false },
    { width: 320, theme: 'dark', large: true },
    { width: 1280, theme: 'light', large: false },
    { width: 1280, theme: 'dark', large: false },
  ]) {
    await page.setViewportSize({ width: variant.width, height: 844 });
    await page.evaluate(({ theme, large }) => {
      localStorage.setItem('eimir.theme', theme);
      document.documentElement.style.fontSize = large ? '200%' : '';
    }, variant);
    await page.emulateMedia({
      colorScheme: variant.theme as 'light' | 'dark',
      reducedMotion: 'reduce',
    });
    // ThemeControl responds to storage through its existing theme event.
    await page.evaluate(() => window.dispatchEvent(new Event('storage')));
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('.product-topbar')).toBeVisible({
      visible: variant.width >= 840,
    });
    await expect(page.locator('.mobile-bottom-shell')).toBeVisible({
      visible: variant.width < 840,
    });
    await expect(
      page.getByRole('link', { name: navigation.searchAll }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const violations = (
      await new AxeBuilder({ page })
        .include('.more-page')
        .include(
          variant.width >= 840 ? '.product-topbar' : '.mobile-bottom-shell',
        )
        .analyze()
    ).violations;
    expect(violations).toEqual([]);
    await captureScreenshot(
      page,
      info,
      `more-${variant.width}-${variant.theme}${variant.large ? '-large-text' : ''}.png`,
    );
    await page.locator('.more-footer').scrollIntoViewIfNeeded();
    await expect(page.locator('.more-footer .brand-mark')).toBeInViewport();
    await expect(page.locator('.more-logout')).toBeInViewport();
    await captureScreenshot(
      page,
      info,
      `more-footer-${variant.width}-${variant.theme}.png`,
    );
  }
});

test('headerless Compact content consumes the safe area once and retains Story return', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-inset-top', '32px');
    document.documentElement.style.setProperty(
      '--safe-area-inset-bottom',
      '24px',
    );
  });
  expect(
    await page
      .locator('.product-shell')
      .evaluate((node) => getComputedStyle(node).paddingTop),
  ).toBe('32px');
  await page.evaluate(() => {
    const banner = document.createElement('div');
    banner.className = 'demo-instance-banner';
    banner.textContent = 'Demo';
    const root = document.querySelector('#root')!;
    root.insertBefore(banner, root.firstChild);
  });
  expect(
    await page
      .locator('.product-shell')
      .evaluate((node) => getComputedStyle(node).paddingTop),
  ).toBe('0px');
  await page.evaluate(() =>
    document.querySelector('.demo-instance-banner')?.remove(),
  );
  await page.goto('/story/memories/mem-canal');
  const back = storyDetailBack(page);
  await expect(back).toBeVisible();
  await captureScreenshot(page, info, 'memory-390-headerless-return.png');
  await back.click();
  await expect(page).toHaveURL(/\/story/);
});

test('the account ID is copied from a quiet line below sign-out and never displayed', async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const action = page.locator('.more-account-id-action');
  const logout = page.locator('.more-logout');
  const brand = page.locator('.more-footer .brand-mark');

  await action.scrollIntoViewIfNeeded();
  await expect(action).toHaveText(de.more.accountId.copy);
  // A support aid, not a destination: the long ID itself is never on the page.
  await expect(page.locator('.more-page')).not.toContainText(ACCOUNT_ID);
  const [logoutBox, actionBox, brandBox] = await Promise.all([
    logout.boundingBox(),
    action.boundingBox(),
    brand.boundingBox(),
  ]);
  if (!logoutBox || !actionBox || !brandBox)
    throw new Error('More footer is not laid out');
  expect(actionBox.y).toBeGreaterThanOrEqual(logoutBox.y + logoutBox.height);
  expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(brandBox.y);
  expect(actionBox.height).toBeGreaterThanOrEqual(44);

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.evaluate((value) => {
      localStorage.setItem('eimir.theme', value);
      window.dispatchEvent(new StorageEvent('storage', { key: 'eimir.theme' }));
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await action.scrollIntoViewIfNeeded();
    await captureScreenshot(page, info, `more-account-id-390-${theme}.png`);
  }

  await action.click();
  await expect(action).toHaveText(de.more.accountId.copied);
  await expect(page.locator('.more-account-id [role="status"]')).toHaveText(
    de.more.accountId.copied,
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    ACCOUNT_ID,
  );
  await expect(page.locator('.more-page')).not.toContainText(ACCOUNT_ID);
  await captureScreenshot(page, info, 'more-account-id-390-dark-copied.png');

  // The confirmation is brief; the line returns to rest on its own.
  await expect(action).toHaveText(de.more.accountId.copy);
  expect(
    (await new AxeBuilder({ page }).include('.more-footer').analyze())
      .violations,
  ).toEqual([]);
});

for (const admin of [false, true]) {
  test(`More preserves sign-out and capability-gated administration (admin=${admin})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await setup(page, admin);
    await expect(page.locator('a[href="/server-admin"]')).toHaveCount(
      admin ? 1 : 0,
    );
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/', { waitUntil: 'load' }),
      page.getByRole('button', { name: de.header.logout, exact: true }).click(),
    ]);
    await expect.poll(state.signOuts).toBe(1);
    await expect(page.getByLabel(de.login.email)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(de.login.email)).toBeVisible();
    await expect(page.locator('.product-shell')).toHaveCount(0);
  });
}

test('the Android app names what signing out deletes from the phone', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installNativeAppLifecycle(page);
  const state = await setup(page);
  const mediaKey = () =>
    page.evaluate(() =>
      sessionStorage.getItem('native-continuity-test-media-key'),
    );
  await page.evaluate(() =>
    sessionStorage.setItem('native-continuity-test-media-key', 'sealed'),
  );
  const logout = page.locator('.more-logout');
  const sheet = page.getByRole('alertdialog', {
    name: de.header.logoutDeviceTitle,
  });
  const cancel = sheet.getByRole('button', {
    name: de.common.cancel,
  });

  await logout.click();
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(de.header.logoutDeviceBody);
  await expect(sheet).toContainText(de.header.logoutDeviceKept);
  await expect(cancel).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .include('.logout-device-data-sheet')
        .analyze()
    ).violations,
  ).toEqual([]);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.evaluate((value) => {
      localStorage.setItem('eimir.theme', value);
      window.dispatchEvent(new StorageEvent('storage', { key: 'eimir.theme' }));
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await captureScreenshot(
      page,
      info,
      `more-logout-device-data-390-${theme}.png`,
    );
  }

  await cancel.click();
  await expect(sheet).toBeHidden();
  expect(state.signOuts()).toBe(0);
  expect(await mediaKey()).toBe('sealed');

  await logout.click();
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/', { waitUntil: 'load' }),
    sheet.getByRole('button', { name: de.header.logout, exact: true }).click(),
  ]);
  await expect.poll(state.signOuts).toBe(1);
  await expect(page.getByLabel(de.login.email)).toBeVisible();
  expect(await mediaKey()).toBeNull();
});
