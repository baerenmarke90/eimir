import AxeBuilder from '../support/axe';
import { expect, type Page, test } from '@playwright/test';
import en from '../../src/i18n/locales/en.json' with { type: 'json' };
import de from '../../src/i18n/locales/webViewNotice';

// Capacitor loads this static page (server.errorPath) below the WebView floor
// (android.minWebViewVersion) and after a failed main-frame load (#1931).
const NOTICE = '/webview-unsupported.html';
const LEGACY_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 9; Android SDK built for x86 Build/PSR1.180720.075; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/69.0.3497.100 Mobile Safari/537.36';
const CURRENT_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 16; Pixel; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/142.0.0.0 Mobile Safari/537.36';

async function openNotice(page: Page, state: 'outdated' | 'load-failed') {
  await page.goto(NOTICE);
  await expect(page.locator('html')).toHaveAttribute(
    'data-webview-notice',
    state,
  );
}

async function expectReflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test.describe('below the WebView floor', () => {
  test.use({ userAgent: LEGACY_WEBVIEW, locale: 'de-DE' });

  for (const theme of ['light', 'dark'] as const) {
    test(`asks for the WebView update with one Play Store action at 390 ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: theme });
      await openNotice(page, 'outdated');
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(
        page.getByRole('heading', { level: 1, name: de.outdatedTitle }),
      ).toBeVisible();
      await expect(page.getByText(de.outdatedBody)).toBeVisible();
      const store = page.getByRole('link', { name: de.outdatedAction });
      await expect(store).toHaveAttribute(
        'href',
        'https://play.google.com/store/apps/details?id=com.google.android.webview',
      );
      const box = await store.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      // Updating the WebView restarts the app, so retrying in place is not offered.
      await expect(page.getByRole('link', { name: de.retry })).toHaveCount(0);
      await store.focus();
      await expect(store).toBeFocused();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectReflow(page);
      await page.screenshot({
        path: info.outputPath(`webview-notice-outdated-390-${theme}.png`),
        fullPage: true,
      });
    });
  }

  test('reflows at 360 px with 200 percent text and keeps the action reachable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openNotice(page, 'outdated');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expectReflow(page);
    const store = page.getByRole('link', { name: de.outdatedAction });
    await store.scrollIntoViewIfNeeded();
    await expect(store).toBeInViewport();
  });
});

test.describe('in English below the WebView floor', () => {
  test.use({ userAgent: LEGACY_WEBVIEW, locale: 'en-US' });

  test('follows the device language', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openNotice(page, 'outdated');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: en.webViewNotice.outdatedTitle,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: en.webViewNotice.outdatedAction }),
    ).toBeVisible();
  });
});

test.describe('after a failed load on a supported WebView', () => {
  test.use({ userAgent: CURRENT_WEBVIEW, locale: 'de-DE' });

  test('offers a retry of the app instead of an update request', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openNotice(page, 'load-failed');
    await expect(
      page.getByRole('heading', { level: 1, name: de.loadTitle }),
    ).toBeVisible();
    await expect(page.getByText(de.loadBody)).toBeVisible();
    await expect(
      page.getByRole('link', { name: de.outdatedAction }),
    ).toHaveCount(0);
    const retry = page.getByRole('link', { name: de.retry });
    await expect(retry).toHaveAttribute('href', '/');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
