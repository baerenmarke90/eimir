import { fulfillDefaultAppIcon } from '../support/appIcon';
import fs from 'node:fs';
import path from 'node:path';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s5 from '../../src/i18n/locales/m5s5';
import { DASHBOARD_MODULE_KEYS } from '../../src/client/dashboardModules';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';
const PROFILE_ID = '00000000-0000-0000-0000-000000000020';

async function captureScreenshot(
  target: Page | Locator,
  testInfo: TestInfo,
  fileName: string,
  options?: { fullPage?: boolean },
): Promise<void> {
  const outputPath = testInfo.outputPath(fileName);
  await target.screenshot({ path: outputPath, ...options });
  const exportDir =
    process.env.SCREENSHOT_EXPORT_DIR || process.env.VISUAL_EVIDENCE_DIR;
  if (exportDir) {
    fs.mkdirSync(exportDir, { recursive: true });
    fs.copyFileSync(outputPath, path.join(exportDir, fileName));
  }
}

const RECENT_SHARED_ITEMS = [
  {
    id: 'r1',
    type: 'MEMORY',
    titleOrText: 'Unser Sommer',
    occurredOn: '2026-02-16T12:00:00Z',
  },
  {
    id: 'r2',
    type: 'MEMORY',
    titleOrText: 'Kleine Alltagsmomente',
    occurredOn: '2026-02-26T12:00:00Z',
  },
  {
    id: 'r3',
    type: 'MEMORY',
    titleOrText: 'Ein Wochenende am Wasser',
    occurredOn: '2026-04-17T12:00:00Z',
  },
  {
    id: 'r4',
    type: 'MEMORY',
    titleOrText: 'Kochabende',
    occurredOn: '2026-03-18T12:00:00Z',
  },
];

async function installMocks(
  page: Page,
  summary: { memories: number; heartMoments: number; milestones: number },
): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
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
        account: { displayName: 'Lea', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'test-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'test-refresh-token',
        },
      });
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
        createdAt: '2026-01-01T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Lea' },
          { id: PARTNER_ID, displayName: 'Alex' },
        ],
      });
      return;
    }
    if (
      method === 'GET' &&
      (pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}` ||
        pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}`)
    ) {
      const isPartner = pathname.endsWith(PARTNER_ID);
      await fulfillJson({
        accountId: isPartner ? PARTNER_ID : ACCOUNT_ID,
        createdAt: '2026-01-01T00:00:00Z',
        displayName: isPartner ? 'Alex' : 'Lea',
        id: isPartner ? '00000000-0000-0000-0000-000000000022' : PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
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
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({
        items: DASHBOARD_MODULE_KEYS.map((moduleKey) => ({
          moduleKey,
          visible: true,
        })),
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Alex' },
        },
        relationshipDuration: { daysTogether: 250, startedOn: '2026-01-01' },
        retrospective: null,
        upcoming: [],
        recentShared: RECENT_SHARED_ITEMS,
        sharedStorySummary: summary,
      });
      return;
    }
    await fulfillJson({}, 200);
  });
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

// The PO retired the Today presentation; its retained component still has
// direct eligibility/count/link coverage in SharedStorySummary.test.tsx.
for (const scenario of [
  { width: 390, height: 844, colorScheme: 'light', milestones: 3 },
  { width: 390, height: 844, colorScheme: 'dark', milestones: 3 },
  { width: 390, height: 844, colorScheme: 'light', milestones: 0 },
  { width: 320, height: 600, colorScheme: 'light', milestones: 3 },
  { width: 320, height: 600, colorScheme: 'light', milestones: 0 },
] as const) {
  test(`retired Today statistics stay hidden with a visible preference at ${scenario.width}px (${scenario.colorScheme}, ${scenario.milestones} milestones)`, async ({
    page,
  }, testInfo) => {
    await installMocks(page, {
      memories: 10,
      heartMoments: 1,
      milestones: scenario.milestones,
    });
    await page.emulateMedia({
      colorScheme: scenario.colorScheme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(
      (theme) => localStorage.setItem('eimir.theme', theme),
      scenario.colorScheme,
    );
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    await page.goto('/today');
    await signIn(page);
    await expect(page.locator('.today-section-recent')).toBeVisible();
    await expect(page.locator('.shared-story-summary')).toHaveCount(0);
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: m5s5.dashboard.storySummaryTitle,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: m5s5.dashboard.allActivityAction }),
    ).toHaveAttribute('href', '/today/activity');
    await expect(
      page.locator('.today-section-recent').getByRole('link').first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await captureScreenshot(
      page,
      testInfo,
      `retired-story-summary-${scenario.width}-${scenario.colorScheme}-${scenario.milestones}.png`,
      { fullPage: true },
    );
  });
}
