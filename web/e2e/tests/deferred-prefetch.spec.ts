import { expect, type Page, test } from '@playwright/test';
import {
  ACCOUNT_ID,
  installMocks,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

// The startup bundle holds only what the first screen needs. Right after the
// shell appeared, the app fetches the deferred chunks in the background, so a
// later navigation renders from memory without a loading state.

async function recordLoadingStates(page: Page): Promise<void> {
  await page.evaluate(() => {
    const record = window as Window & { __loadingStateSeen?: boolean };
    record.__loadingStateSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('.ui-state-loading'))
        record.__loadingStateSeen = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
}

test('the app fetches deferred chunks after startup and opens Settings without a loading state', async ({
  page,
}) => {
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
  const chunks: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/assets/') && path.endsWith('.js')) chunks.push(path);
  });

  await signIn(page);
  const settingsChunk = page.waitForRequest(
    (request) =>
      /\/assets\/SettingsPage-[^/]+\.js$/.test(new URL(request.url()).pathname),
    { timeout: 20_000 },
  );
  // No navigation happens here: the shell fetches the chunk by itself.
  await settingsChunk;
  await expect
    .poll(() => chunks.some((path) => /\/LegalDocumentContent-/.test(path)), {
      timeout: 20_000,
    })
    .toBe(true);
  await page.waitForLoadState('networkidle');

  await recordLoadingStates(page);
  await page
    .locator('.mobile-bottom-nav a[href="/more"], .shell-nav a[href="/more"]')
    .first()
    .click();
  await expect(page).toHaveURL(/\/more$/);
  await page.locator('a[href="/more/settings"]').first().click();
  await expect(page).toHaveURL(/\/more\/settings$/);
  await expect(
    page.locator('a[href^="/more/settings/"]').first(),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () =>
        (window as Window & { __loadingStateSeen?: boolean })
          .__loadingStateSeen,
    ),
  ).toBe(false);
});
