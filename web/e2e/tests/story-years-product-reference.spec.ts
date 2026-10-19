import { fulfillDefaultAppIcon } from '../support/appIcon';
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import de from '../../src/i18n/locales/de';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '99999999-9999-4999-8999-999999999999';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';

const ME = { id: ACCOUNT_ID, displayName: 'Lea Sommer' };
const PARTNER = { id: PARTNER_ID, displayName: 'Alex Winter' };
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };
const AVAILABLE_YEARS = [2026, 2025, 2024];

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function captureScreenshot(
  target: Page | Locator,
  testInfo: TestInfo,
  fileName: string,
  options?: { fullPage?: boolean },
): Promise<void> {
  const outputPath = testInfo.outputPath(fileName);
  await target.screenshot({ path: outputPath, ...options });
  const exportDir = process.env.SCREENSHOT_EXPORT_DIR;
  if (exportDir) {
    fs.mkdirSync(exportDir, { recursive: true });
    fs.copyFileSync(outputPath, path.join(exportDir, fileName));
  }
}

function annualItems2025() {
  return [
    {
      kind: 'MEMORY',
      effectiveDate: '2025-01-12T00:00:00Z',
      memory: {
        id: 'memory-winter-walk',
        title: 'Winter walk by the lake',
        happenedOn: '2025-01-12',
        createdAt: '2025-01-12T12:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        attachments: [
          {
            id: 'attachment-winter-walk',
            position: 0,
            status: 'READY',
            mediaType: 'IMAGE',
            mimeType: 'image/png',
            hasThumbnail: true,
            width: 1200,
            height: 750,
            size: 1024,
          },
        ],
      },
    },
    {
      kind: 'HEART_MOMENT',
      effectiveDate: '2025-03-08T00:00:00Z',
      heartMoment: {
        id: 'heart-spring-note',
        text: 'A note worth keeping',
        emotion: 'GRATEFUL',
        happenedOn: '2025-03-08',
        createdAt: '2025-03-08T18:00:00Z',
        author: PARTNER,
        capabilities: CAPABILITIES,
        attachment: null,
      },
    },
    {
      kind: 'MILESTONE',
      effectiveDate: '2025-06-17T00:00:00Z',
      milestone: {
        id: 'milestone-anniversary',
        title: 'Our anniversary',
        happenedOn: '2025-06-17',
        createdAt: '2025-06-17T09:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
      },
    },
    {
      kind: 'MEMORY',
      effectiveDate: '2025-12-14T00:00:00Z',
      memory: {
        id: 'memory-winter-market',
        title: 'Evening at the winter market',
        happenedOn: '2025-12-14',
        createdAt: '2025-12-14T20:00:00Z',
        author: PARTNER,
        capabilities: CAPABILITIES,
        attachments: [],
      },
    },
  ];
}

async function installMocks(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;

    const fulfillJson = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await fulfillJson({
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

    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await fulfillJson({
        account: ME,
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'story-years-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'story-years-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson(ME);
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await fulfillJson({ serverAdmin: false });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await fulfillJson([
        { role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' },
      ]);
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await fulfillJson({
        id: SPACE_ID,
        createdAt: '2023-06-17T00:00:00Z',
        partners: [ME, PARTNER],
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: '2023-06-17',
        showRelationshipDuration: true,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profile-preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    ) {
      await fulfillJson({
        accountId: ACCOUNT_ID,
        createdAt: '2023-06-17T00:00:00Z',
        displayName: ME.displayName,
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2023-06-17T00:00:00Z',
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}`
    ) {
      await fulfillJson({
        accountId: PARTNER_ID,
        createdAt: '2023-06-17T00:00:00Z',
        displayName: PARTNER.displayName,
        id: '44444444-4444-4444-8444-444444444444',
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2023-06-17T00:00:00Z',
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }

    if (
      method === 'POST' &&
      pathname.includes('/attachments/') &&
      pathname.endsWith('/read-access')
    ) {
      const match = pathname.match(/\/attachments\/([^/]+)\/read-access/);
      const attachmentId = match ? match[1] : 'attachment';
      await fulfillJson({
        method: 'STREAM',
        url: `/api/v1/spaces/${SPACE_ID}/attachments/${attachmentId}/content`,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname.includes('/attachments/') &&
      pathname.endsWith('/content')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: TINY_PNG,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
      const year = url.searchParams.get('year');
      const items = year === '2025' ? annualItems2025() : [];
      await fulfillJson({
        items,
        availableYears: AVAILABLE_YEARS,
        hasMore: false,
        nextCursor: null,
      });
      return;
    }

    await fulfillJson({}, 200);
  });
}

async function signIn(page: Page, target = '/story/years'): Promise<void> {
  await page.goto(target);
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function openAnnualDetail(page: Page): Promise<void> {
  await signIn(page, '/story/years/2025');
  await page.goto('/story/years/2025');
  await page.waitForSelector('.story-year-months');
}

function expectNoHorizontalOverflow(page: Page): Promise<void> {
  return expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

test.describe('Our Years Product Reference (#868)', () => {
  test('390-class index uses authoritative available years and captures Compact evidence', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story/years');

    await expect(
      page.getByRole('heading', { name: de.storyYears.title, level: 1 }),
    ).toBeVisible();
    await expect(page.locator('.story-year-link')).toHaveCount(3);
    await expect(
      page.getByRole('link', {
        name: de.storyYears.openYear.replace('{{year}}', '2025'),
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await captureScreenshot(
      page,
      testInfo,
      '01-story-years-index-390-light.png',
      { fullPage: true },
    );
  });

  test('390-class annual detail is chronological, differentiated, and captures Light evidence', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await openAnnualDetail(page);

    await expect(
      page.getByRole('heading', {
        name: de.storyYears.detailTitle.replace('{{year}}', '2025'),
        level: 1,
      }),
    ).toBeVisible();
    const months = page.locator('.story-year-month-header h2');
    await expect(months).toHaveCount(4);
    await expect(page.locator('.story-card-memory')).toHaveCount(2);
    await expect(page.locator('.story-card-heart-moment')).toHaveCount(1);
    await expect(page.locator('.story-card-milestone')).toHaveCount(1);
    await expect(page.locator('.story-card-memory.has-image')).toHaveCount(1);

    const cards = page.locator('.story-card');
    await expect(cards.first()).toContainText('Winter walk by the lake');
    await expect(cards.last()).toContainText('Evening at the winter market');
    await expectNoHorizontalOverflow(page);

    await captureScreenshot(
      page,
      testInfo,
      '02-story-year-2025-390-light.png',
      { fullPage: true },
    );
  });

  test('390-class annual detail captures Dark evidence', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await openAnnualDetail(page);

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await captureScreenshot(page, testInfo, '03-story-year-2025-390-dark.png', {
      fullPage: true,
    });
  });

  test('320 CSS px reflows without horizontal overflow', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await installMocks(page);
    await openAnnualDetail(page);
    await expectNoHorizontalOverflow(page);

    await captureScreenshot(
      page,
      testInfo,
      '04-story-year-2025-320-reflow.png',
      { fullPage: true },
    );
  });

  test('1440 Expanded preserves the same annual story hierarchy', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installMocks(page);
    await openAnnualDetail(page);

    await expect(page.locator('.story-year-months')).toBeVisible();
    await expect(page.locator('.story-card')).toHaveCount(4);
    await captureScreenshot(
      page,
      testInfo,
      '05-story-year-2025-1440-expanded.png',
      { fullPage: true },
    );
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`annual archive is axe-clean at 390x844 in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.addInitScript(() =>
        window.localStorage.setItem('eimir.theme', 'system'),
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await installMocks(page);
      await openAnnualDetail(page);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
