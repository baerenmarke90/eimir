import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import productTour from '../../src/i18n/locales/productTour';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const PARTNER_ID = '00000000-0000-4000-8000-000000000002';
const SPACE_ID = '00000000-0000-4000-8000-000000000010';

async function capture(
  page: Page,
  info: TestInfo,
  fileName: string,
): Promise<void> {
  const output = info.outputPath(fileName);
  await page.screenshot({ path: output });
  const exportDir = process.env.VISUAL_EVIDENCE_DIR;
  if (exportDir) {
    fs.mkdirSync(exportDir, { recursive: true });
    fs.copyFileSync(output, path.join(exportDir, fileName));
  }
}

async function installMocks(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
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

test('optional tour visits the real shell and can be replayed on Compact and Expanded', async ({
  page,
}, info) => {
  await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/more');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/more$/);
  await expect(
    page.getByRole('heading', { name: productTour.invite.title }),
  ).toBeVisible();
  await capture(page, info, 'tour-more-compact-light.png');

  await page.getByRole('button', { name: productTour.start }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole('heading', { name: productTour.today.title }),
  ).toBeVisible();
  await capture(page, info, 'tour-wir-compact-light.png');
  await page.getByRole('button', { name: productTour.next }).click();
  await expect(page).toHaveURL(/\/story$/);
  await page.getByRole('button', { name: productTour.next }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await page.getByRole('button', { name: productTour.next }).click();
  await page.getByRole('button', { name: productTour.openCreate }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/more');
  await expect(
    page.getByRole('heading', { name: productTour.invite.title }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: productTour.replay }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.getByRole('button', { name: productTour.later }).click();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => window.localStorage.setItem('eimir.theme', 'dark'));
  await page.reload();
  await page.goto('/more');
  await page.getByRole('button', { name: productTour.replay }).click();
  await expect(
    page.getByRole('heading', { name: productTour.today.title }),
  ).toBeVisible();
  await capture(page, info, 'tour-wir-expanded-dark.png');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(
    page.getByRole('button', { name: productTour.later }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: productTour.next }),
  ).toBeVisible();
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  await capture(page, info, 'tour-wir-360-dark-large-text-reduced-motion.png');

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
    window.localStorage.setItem('eimir.theme', 'light');
  });
  await page.setViewportSize({ width: 430, height: 932 });
  await page.reload();
  await page.goto('/more');
  await page.getByRole('button', { name: productTour.replay }).click();
  await expect(
    page.getByRole('heading', { name: productTour.today.title }),
  ).toBeVisible();
  await capture(page, info, 'tour-wir-430-light.png');
});

test('ordinary More destinations remain usable while the first invitation is visible', async ({
  page,
}) => {
  await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/more');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(
    page.getByRole('heading', { name: productTour.invite.title }),
  ).toBeVisible();

  const settings = page.getByRole('link', { name: de.more.settings.title });
  await settings.scrollIntoViewIfNeeded();
  await settings.click();
  await expect(page).toHaveURL(/\/more\/settings$/);
  await page.goto('/more');
  await expect(
    page.getByRole('heading', { name: productTour.invite.title }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: productTour.replay }),
  ).toBeVisible();
});
