import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import navigation from '../../src/i18n/locales/navigation';
import privateArea from '../../src/i18n/locales/privateArea';
import productTour from '../../src/i18n/locales/productTour';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '../support/axe';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const PARTNER_ID = '00000000-0000-4000-8000-000000000002';
const SPACE_ID = '00000000-0000-4000-8000-000000000010';

async function capture(
  page: Page,
  info: TestInfo,
  fileName: string,
): Promise<void> {
  const output = info.outputPath(fileName);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: output, animations: 'disabled' });
  const exportDir = process.env.VISUAL_EVIDENCE_DIR;
  if (exportDir) {
    fs.mkdirSync(exportDir, { recursive: true });
    fs.copyFileSync(output, path.join(exportDir, fileName));
  }
}

async function installMocks(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const respond = async (body: unknown) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

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
        capabilities: ['daily.quote'],
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
    await respond({ items: [], nextCursor: null, hasMore: false });
  });
}

const TOUR_PATH = '/more/getting-started';

async function signIn(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
}

test('the four topics open real areas with contextual help and reliable Back', async ({
  page,
}, info) => {
  await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  await signIn(page, '/today');

  const start = page.getByRole('link', {
    name: productTour.start,
    exact: true,
  });
  await expect(start).toBeVisible();
  await expect(
    page.getByRole('button', { name: productTour.dismiss }),
  ).toBeVisible();
  await capture(page, info, 'tour-start-390-light.png');

  await start.click();
  await expect(page).toHaveURL(new RegExp(`${TOUR_PATH}$`));
  const list = page.getByRole('list', { name: productTour.topics });
  await expect(list.getByRole('link')).toHaveCount(4);
  await capture(page, info, 'tour-topics-390-light.png');

  const privateTopic = list.getByRole('link', {
    name: de.more.private.title,
    exact: true,
  });
  await privateTopic.click();
  await expect(page).toHaveURL(/\/more\/private\/notes$/);
  await expect(
    page.getByRole('link', { name: privateArea.navigation.notes, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(privateArea.intro, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(productTour.private.hint)).toBeVisible();
  await capture(page, info, 'tour-notes-390-light.png');
  await page.goBack();
  await expect(privateTopic).toBeFocused();

  const planningTopic = list.getByRole('link', {
    name: navigation.plan,
    exact: true,
  });
  const back = page.getByRole('button', {
    name: productTour.back,
    exact: true,
  });
  await planningTopic.click();
  await expect(page).toHaveURL(/\/plan#wishes$/);
  await expect(page.getByRole('tab', { selected: true })).toHaveText('Wünsche');
  await expect(page.getByText(productTour.plan.hint)).toBeVisible();
  await back.click();
  await expect(planningTopic).toBeFocused();

  const todayTopic = list.getByRole('link', {
    name: navigation.today,
    exact: true,
  });
  await todayTopic.click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole('complementary', { name: productTour.replay }),
  ).toBeVisible();
  await back.click();
  await expect(todayTopic).toBeFocused();

  const storyTopic = list.getByRole('link', {
    name: navigation.story,
    exact: true,
  });
  await storyTopic.click();
  await expect(page).toHaveURL(/\/story\?tab=discover$/);
  await expect(
    page.getByRole('tab', { name: de.story.tabDiscover }),
  ).toHaveAttribute('aria-selected', 'true');
  const hint = page.getByRole('complementary', { name: productTour.replay });
  await expect(hint).toContainText(productTour.story.hint);
  await expect(hint).toHaveCSS('animation-name', 'product-tour-cue-enter');
  await expect(hint).toHaveCSS('animation-duration', '0.18s');

  const plus = page.getByRole('button', {
    name: de.story.addMoment,
    exact: true,
  });
  await plus.click();
  const menu = page.getByRole('dialog', {
    name: de.story.addMoment,
    exact: true,
  });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(plus).toBeFocused();

  await back.click();
  await expect(storyTopic).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  await expect(start).toHaveCount(0);
});

test('startup dismissal persists through reload and manual help reflows with reduced motion', async ({
  page,
}, info) => {
  await installMocks(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, '/more');
  const dismiss = page.getByRole('button', {
    name: productTour.dismiss,
    exact: true,
  });
  await expect(dismiss).toHaveCount(0);

  await page.getByRole('link', { name: navigation.today, exact: true }).click();
  await expect(dismiss).toBeVisible();
  await page
    .getByRole('button', { name: productTour.later, exact: true })
    .click();
  await expect(dismiss).toHaveCount(0);

  await page.reload();
  await expect(dismiss).toBeVisible();
  await dismiss.click();
  await expect(dismiss).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .getByRole('main')
      .getByRole('heading', { name: navigation.today, exact: true }),
  ).toBeVisible();
  await expect(dismiss).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.getByRole('link', { name: navigation.more, exact: true }).click();
  await page
    .getByRole('link', { name: productTour.replay, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${TOUR_PATH}$`));
  await expect(page.locator('.product-tour-page')).toHaveCSS(
    'max-width',
    '720px',
  );
  await capture(page, info, 'tour-topics-1280-dark.png');

  await page.setViewportSize({ width: 320, height: 780 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const list = page.getByRole('list', { name: productTour.topics });
  await expect(list.getByRole('link')).toHaveCount(4);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  const result = await new AxeBuilder({ page })
    .include('.product-tour-page')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  await capture(page, info, 'tour-topics-320-dark-large-text.png');

  await list.getByRole('link', { name: navigation.story, exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: productTour.replay }),
  ).toHaveCSS('animation-name', 'none');
  await page
    .getByRole('button', { name: de.story.addMoment, exact: true })
    .click();
  const menu = page.getByRole('dialog', {
    name: de.story.addMoment,
    exact: true,
  });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});
