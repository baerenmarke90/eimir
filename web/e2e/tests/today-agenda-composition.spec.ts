import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { settingsCategoryPath } from '../../src/client/routes';
import de from '../../src/i18n/locales/de';
import m5s5 from '../../src/i18n/locales/m5s5';
import profileIdentity from '../../src/i18n/locales/profileIdentity';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';
const PROFILE_ID = '00000000-0000-0000-0000-000000000020';
const MODULE_KEYS = [
  'relationship_presence',
  'keepsake',
  'upcoming',
  'pinned_collection',
  'relationship_signal',
  'monthly_highlights',
  'recent_shared',
  'shared_story_summary',
];

/**
 * Reproduces the real-demo composition complaint (#790/#791 second
 * follow-up): several short upcoming items, each previously stretched into
 * a nearly full-width row (title far left, date far right) that read as a
 * scheduling table rather than shared planning. Four items with varied
 * title lengths and no Relationship Signal card (single-column planning
 * area, the widest/worst case for a stretched row) is enough to reproduce
 * it on a real desktop viewport.
 */
const UPCOMING_ITEMS = [
  {
    id: 'p1',
    type: 'PLAN',
    titleOrText: 'Wanderung',
    scheduledAt: '2026-09-10T10:00:00Z',
  },
  {
    id: 'p2',
    type: 'PLAN',
    titleOrText: 'Kino-Abend mit Popcorn',
    scheduledAt: '2026-09-12T18:00:00Z',
  },
  {
    id: 'p3',
    type: 'PLAN',
    titleOrText: 'Brunch',
    scheduledAt: '2026-09-15T09:00:00Z',
  },
  {
    id: 'p4',
    type: 'PLAN',
    titleOrText: 'Wochenendtrip an die Ostsee',
    scheduledAt: '2026-09-20T09:00:00Z',
  },
];

async function installMocks(
  page: Page,
  initialPreference: 1 | 2 | 3 = 2,
): Promise<{ currentPreference: () => number; currentOrder: () => string[] }> {
  let preference = initialPreference;
  let moduleOrder = [...MODULE_KEYS];
  let upcomingVisible = true;
  const modulePreferences = () => ({
    items: moduleOrder.map((moduleKey) => ({
      moduleKey,
      visible: moduleKey === 'upcoming' ? upcomingVisible : true,
      ...(moduleKey === 'upcoming' ? { itemLimit: preference } : {}),
    })),
  });

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
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'today-agenda-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'today-agenda-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: 'Anna', id: ACCOUNT_ID });
      return;
    }
    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      await fulfillJson({
        accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        accessToken: 'today-agenda-refreshed-token',
        refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
        refreshToken: 'today-agenda-refresh-token-2',
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
          { id: ACCOUNT_ID, displayName: 'Anna' },
          { id: PARTNER_ID, displayName: 'Ben' },
        ],
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        durationDisplayMode: 'YEARS_MONTHS',
        relationshipStartedOn: '2026-01-01',
        showRelationshipDuration: true,
        spaceId: SPACE_ID,
        version: 1,
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
        displayName: isPartner ? 'Ben' : 'Anna',
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
      await fulfillJson(modulePreferences());
      return;
    }
    if (
      method === 'PUT' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences/order`
    ) {
      const body = request.postDataJSON() as { moduleKeys: string[] };
      if (
        body.moduleKeys.length !== MODULE_KEYS.length ||
        new Set(body.moduleKeys).size !== MODULE_KEYS.length ||
        body.moduleKeys.some((key) => !MODULE_KEYS.includes(key))
      ) {
        await fulfillJson({ code: 'DASHBOARD_MODULE_INVALID_ORDER' }, 422);
        return;
      }
      moduleOrder = body.moduleKeys;
      await fulfillJson(modulePreferences());
      return;
    }
    if (
      method === 'PATCH' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences/upcoming`
    ) {
      const body = request.postDataJSON() as {
        itemLimit?: 1 | 2 | 3;
        visible?: boolean;
      };
      if (body.itemLimit !== undefined) preference = body.itemLimit;
      if (body.visible !== undefined) upcomingVisible = body.visible;
      await fulfillJson({
        moduleKey: 'upcoming',
        itemLimit: preference,
        visible: upcomingVisible,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/rules/relationship_anniversary_reminder/preference`
    ) {
      await fulfillJson({
        enabled: true,
        parameters: { daysBefore: [30, 7, 1], localTime: '09:00:00' },
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
          partner: { id: PARTNER_ID, displayName: 'Ben' },
        },
        relationshipDuration: { daysTogether: 250, startedOn: '2026-01-01' },
        retrospective: null,
        recentShared: [],
        upcoming: UPCOMING_ITEMS,
      });
      return;
    }
    await fulfillJson({}, 200);
  });

  return {
    currentPreference: () => preference,
    currentOrder: () => moduleOrder,
  };
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

test('Today "Demnächst" renders compact, bounded-width planning tiles instead of full-width table rows on desktop', async ({
  page,
}) => {
  await installMocks(page, 3);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await signIn(page);
  await page.waitForSelector('.today-agenda-row');

  const rowWidths = await page
    .locator('.today-agenda-row')
    .evaluateAll((rows) =>
      rows.map((row) => row.getBoundingClientRect().width),
    );

  expect(rowWidths).toHaveLength(3);
  await expect(page.getByText(UPCOMING_ITEMS[3].titleOrText)).toHaveCount(0);
  // None of these tiles carries more than a short title, date, and icon -
  // a row spanning most of a 1920px viewport is the "administrative table
  // row" regression this fix removes.
  for (const width of rowWidths) {
    expect(width).toBeLessThan(320);
  }

  // Wrapping into multiple tiles per line is how the available width gets
  // used intentionally instead of stretching a single item across it.
  const rowTops = await page
    .locator('.today-agenda-row')
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().top));
  expect(new Set(rowTops).size).toBeLessThan(rowTops.length);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
});

test('Today "Demnächst" renders a horizontal swipe carousel with two items on mobile, contained inside the component (#858)', async ({
  page,
}) => {
  await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await signIn(page);
  await page.waitForSelector('.today-agenda-row');

  const rects = await page
    .locator('.today-agenda-row')
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect()));
  expect(rects).toHaveLength(2);
  await expect(page.getByText(UPCOMING_ITEMS[2].titleOrText)).toHaveCount(0);

  // Side by side on one row, not stacked - and the first card leaves a
  // deliberate peek of the second at the edge instead of filling the
  // viewport on its own.
  expect(Math.round(rects[0].top)).toBe(Math.round(rects[1].top));
  expect(rects[1].left).toBeGreaterThan(rects[0].left);
  expect(rects[0].width).toBeLessThan(390);
  expect(rects[1].left).toBeLessThan(390);

  // The overflow that makes swiping possible is contained inside the
  // carousel itself, never leaking out to the page.
  const listOverflow = await page
    .locator('.today-agenda-list')
    .evaluate((node) => node.scrollWidth > node.clientWidth + 1);
  expect(listOverflow).toBe(true);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
});

test('Today "Demnächst" keeps a single item as one plain compact card on mobile, no carousel behavior (#858)', async ({
  page,
}) => {
  await installMocks(page, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await signIn(page);
  await page.waitForSelector('.today-agenda-row');

  await expect(page.locator('.today-agenda-row')).toHaveCount(1);

  const row = await page
    .locator('.today-agenda-row')
    .evaluate((node) => node.getBoundingClientRect());
  // A lone item still reads as one normal full-width card, not a
  // peek-sized carousel tile.
  expect(row.width).toBeGreaterThan(300);

  const listOverflow = await page
    .locator('.today-agenda-list')
    .evaluate((node) => node.scrollWidth > node.clientWidth + 1);
  expect(listOverflow).toBe(false);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
});

for (const width of [320, 390]) {
  test(`Today "Demnächst" renders a three-item swipe carousel with no vertical stacking or page overflow at ${width}px (#858)`, async ({
    page,
  }) => {
    await installMocks(page, 3);
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/today');
    await signIn(page);
    await page.waitForSelector('.today-agenda-row');

    const rects = await page
      .locator('.today-agenda-row')
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect()));
    expect(rects).toHaveLength(3);

    const tops = new Set(rects.map((rect) => Math.round(rect.top)));
    expect(tops.size).toBe(1);
    const lefts = new Set(rects.map((rect) => Math.round(rect.left)));
    expect(lefts.size).toBe(3);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
}

test('compact Dashboard settings persist the personal horizon and update Today without a reload', async ({
  page,
}, testInfo) => {
  const preferences = await installMocks(page);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/today');
  await signIn(page);
  await page.goto(settingsCategoryPath('today'));

  const group = page.getByRole('group', {
    name: profileIdentity.dashboardUpcomingTitle,
  });
  await expect(group).toBeVisible();
  await expect(group.getByRole('radio', { name: '2' })).toBeChecked();
  await group.getByRole('radio', { name: '3' }).check();
  await expect(group.getByRole('radio', { name: '3' })).toBeChecked();
  await expect.poll(preferences.currentPreference).toBe(3);
  await expect(
    page.getByText(profileIdentity.dashboardUpcomingSaved),
  ).toBeVisible();

  const settingsDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(settingsDimensions.scrollWidth).toBeLessThanOrEqual(
    settingsDimensions.clientWidth,
  );
  const settingsAxe = await new AxeBuilder({ page })
    .include('#settings-dashboard')
    .analyze();
  expect(settingsAxe.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('planning-dashboard-preference-compact-dark.png'),
    fullPage: true,
  });

  await page.goto('/today');
  await expect(page.locator('.today-agenda-row')).toHaveCount(3);
  await expect(page.getByText(UPCOMING_ITEMS[2].titleOrText)).toBeVisible();
  await expect(page.getByText(UPCOMING_ITEMS[3].titleOrText)).toHaveCount(0);
});

test('personal module reorder persists across reload and separates the visibility choice', async ({
  page,
}, testInfo) => {
  const preferences = await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/today');
  await signIn(page);
  await page.goto(settingsCategoryPath('today'));

  const handle = page.getByRole('button', {
    name: `${m5s5.dashboard.upcomingTitle} verschieben`,
  });
  await expect(handle).toBeVisible();
  const size = await handle.boundingBox();
  expect(size?.width).toBeGreaterThanOrEqual(44);
  expect(size?.height).toBeGreaterThanOrEqual(44);
  await handle.focus();
  await handle.press('ArrowUp');
  await handle.press('ArrowUp');
  await expect.poll(() => preferences.currentOrder()[0]).toBe('upcoming');
  await expect(handle).toBeFocused();
  await page
    .getByRole('checkbox', { name: m5s5.dashboard.upcomingTitle })
    .uncheck();
  await page.reload();
  await expect(page.locator('.dashboard-module-option').first()).toContainText(
    m5s5.dashboard.upcomingTitle,
  );
  await expect(
    page.getByRole('checkbox', { name: m5s5.dashboard.upcomingTitle }),
  ).not.toBeChecked();
  await page
    .getByRole('checkbox', { name: m5s5.dashboard.upcomingTitle })
    .check();
  await page.goto('/today');
  await expect(page.locator('.today-section-upcoming')).toBeVisible();
  const orderedSections = await page
    .locator('.today-content > *')
    .evaluateAll((elements) =>
      elements
        .map((element) => element.className)
        .filter((name) => typeof name === 'string'),
    );
  expect(
    orderedSections.indexOf('today-section today-section-upcoming'),
  ).toBeLessThan(
    orderedSections.findIndex((name) => name.includes('today-hero')),
  );

  await page.goto(settingsCategoryPath('today'));
  await page.screenshot({
    path: testInfo.outputPath('1194-reorder-compact-dark.png'),
    fullPage: true,
  });
  const a11y = await new AxeBuilder({ page })
    .include('#settings-dashboard')
    .analyze();
  expect(a11y.violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
});

test('expanded Dashboard settings remain clear in light mode and at 200 percent layout zoom', async ({
  page,
}, testInfo) => {
  await installMocks(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/today');
  await signIn(page);
  await page.goto(settingsCategoryPath('today'));

  const group = page.getByRole('group', {
    name: profileIdentity.dashboardUpcomingTitle,
  });
  await expect(group).toBeVisible();
  await expect(group.getByRole('radio', { name: '2' })).toBeChecked();
  await page.screenshot({
    path: testInfo.outputPath(
      'planning-dashboard-preference-expanded-light.png',
    ),
    fullPage: true,
  });

  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });
  const zoomedDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(zoomedDimensions.scrollWidth).toBeLessThanOrEqual(
    zoomedDimensions.clientWidth,
  );
  await expect(group.getByRole('radio', { name: '1' })).toBeVisible();
  await expect(group.getByRole('radio', { name: '3' })).toBeVisible();
  const result = await new AxeBuilder({ page })
    .include('#settings-dashboard')
    .analyze();
  expect(result.violations).toEqual([]);
});
