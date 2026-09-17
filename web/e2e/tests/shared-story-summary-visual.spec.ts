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
        modules: [
          { module: 'UPCOMING', visible: true },
          { module: 'KEEPSAKE', visible: true },
          { module: 'RELATIONSHIP_SIGNAL', visible: true },
          { module: 'MONTHLY_HIGHLIGHTS', visible: true },
          { module: 'RECENT_SHARED', visible: true },
          { module: 'SHARED_STORY_SUMMARY', visible: true },
        ],
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

test('three-metric state renders circular story badges on 390x844 light mode matching PO mockup', async ({
  page,
}, testInfo) => {
  await installMocks(page, {
    memories: 10,
    heartMoments: 1,
    milestones: 3,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await signIn(page);

  const section = page.locator('.shared-story-summary');
  await expect(section).toBeVisible();

  await expect(
    section.getByRole('heading', {
      level: 2,
      name: m5s5.dashboard.storySummaryTitle,
    }),
  ).toBeVisible();

  const links = section.locator('.shared-story-summary-badge');
  await expect(links).toHaveCount(3);

  await expect(links.nth(0)).toHaveAttribute(
    'href',
    '/story?tab=timeline&type=MEMORY',
  );
  await expect(links.nth(1)).toHaveAttribute(
    'href',
    '/story?tab=timeline&type=HEART_MOMENT',
  );
  await expect(links.nth(2)).toHaveAttribute(
    'href',
    '/story?tab=timeline&type=MILESTONE',
  );

  await expect(links.nth(0)).toHaveAttribute('aria-label', '10 Momente');
  await expect(links.nth(1)).toHaveAttribute('aria-label', '1 Herzmoment');
  await expect(links.nth(2)).toHaveAttribute('aria-label', '3 Meilensteine');

  for (let i = 0; i < 3; i++) {
    const box = await links.nth(i).boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  const boxLeft = await links.nth(0).boundingBox();
  const boxCenter = await links.nth(1).boundingBox();
  const boxRight = await links.nth(2).boundingBox();
  expect(boxLeft).not.toBeNull();
  expect(boxCenter).not.toBeNull();
  expect(boxRight).not.toBeNull();
  if (boxLeft && boxCenter && boxRight) {
    expect(boxCenter.width).toBeGreaterThan(boxLeft.width);
    expect(boxCenter.height).toBeGreaterThan(boxLeft.height);
    expect(boxCenter.width).toBeGreaterThan(boxRight.width);
    expect(boxCenter.height).toBeGreaterThan(boxRight.height);
  }

  const isOverflowing = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth;
  });
  expect(isOverflowing).toBe(false);

  await section.scrollIntoViewIfNeeded();
  await captureScreenshot(
    page,
    testInfo,
    'story-summary-390-3metrics-light.png',
  );
});

test('three-metric state renders on 390x844 dark mode', async ({
  page,
}, testInfo) => {
  await installMocks(page, {
    memories: 10,
    heartMoments: 1,
    milestones: 3,
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('eimir.theme', 'dark'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await signIn(page);

  const section = page.locator('.shared-story-summary');
  await expect(section).toBeVisible();
  await section.scrollIntoViewIfNeeded();
  await captureScreenshot(
    page,
    testInfo,
    'story-summary-390-3metrics-dark.png',
  );
});

test('two-metric state is deliberately centered and balanced with no placeholder', async ({
  page,
}, testInfo) => {
  await installMocks(page, {
    memories: 10,
    heartMoments: 1,
    milestones: 0,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await signIn(page);

  const section = page.locator('.shared-story-summary');
  await expect(section).toBeVisible();

  const metrics = section.locator('.shared-story-summary-metric');
  await expect(metrics).toHaveCount(2);

  const links = section.locator('.shared-story-summary-badge');
  await expect(links).toHaveCount(2);

  const containerBox = await section
    .locator('.shared-story-summary-values')
    .boundingBox();
  const firstBox = await metrics.first().boundingBox();
  const lastBox = await metrics.last().boundingBox();
  expect(containerBox).not.toBeNull();
  expect(firstBox).not.toBeNull();
  expect(lastBox).not.toBeNull();

  if (containerBox && firstBox && lastBox) {
    const leftMargin = firstBox.x - containerBox.x;
    const rightMargin =
      containerBox.x + containerBox.width - (lastBox.x + lastBox.width);
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(4);
  }

  await section.scrollIntoViewIfNeeded();
  await captureScreenshot(
    page,
    testInfo,
    'story-summary-390-2metrics-light.png',
  );
});

test('320 CSS px reflow keeps 3 metrics readable without horizontal scroll', async ({
  page,
}, testInfo) => {
  await installMocks(page, {
    memories: 10,
    heartMoments: 1,
    milestones: 3,
  });
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto('/today');
  await signIn(page);

  const section = page.locator('.shared-story-summary');
  await expect(section).toBeVisible();

  const isOverflowing = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth;
  });
  expect(isOverflowing).toBe(false);

  const links = section.locator('.shared-story-summary-badge');
  await expect(links).toHaveCount(3);

  await section.scrollIntoViewIfNeeded();
  await captureScreenshot(
    page,
    testInfo,
    'story-summary-320-3metrics-light.png',
  );
});

test('320 CSS px reflow keeps 2 metrics readable without horizontal scroll', async ({
  page,
}, testInfo) => {
  await installMocks(page, {
    memories: 10,
    heartMoments: 1,
    milestones: 0,
  });
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto('/today');
  await signIn(page);

  const section = page.locator('.shared-story-summary');
  await expect(section).toBeVisible();

  const metrics = section.locator('.shared-story-summary-metric');
  await expect(metrics).toHaveCount(2);

  const isOverflowing = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth;
  });
  expect(isOverflowing).toBe(false);

  await section.scrollIntoViewIfNeeded();
  await captureScreenshot(
    page,
    testInfo,
    'story-summary-320-2metrics-light.png',
  );
});
