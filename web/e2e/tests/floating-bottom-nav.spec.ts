import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import de from '../../src/i18n/locales/de';
import games from '../../src/i18n/locales/games';
import navigation from '../../src/i18n/locales/navigation';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-01T10:00:00Z';

const EVIDENCE_DIR = path.resolve(
  __dirname,
  '../../../docs/design/eimir/screenshots/882-floating-nav',
);

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

async function installApiMocks(page: Page): Promise<void> {
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
          accessToken: 'floating-nav-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'floating-nav-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: 'Anna', id: ACCOUNT_ID });
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
      await fulfillJson({ id: SPACE_ID, createdAt: TEST_NOW, partners: [] });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
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
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
        upcoming: [],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    ) {
      await fulfillJson({
        accountId: ACCOUNT_ID,
        createdAt: TEST_NOW,
        displayName: 'Anna',
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: TEST_NOW,
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
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/entitlements`
    ) {
      await fulfillJson({
        spaceId: SPACE_ID,
        tier: 'PREMIUM',
        status: 'ACTIVE',
        effectiveUntil: null,
        isInGracePeriod: false,
        capabilities: ['games.couple'],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/story/timeline`
    ) {
      await fulfillJson({
        availableYears: [],
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/wishes`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/collections`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/related-people`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/important-dates`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The browser test did not define this API request: ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function waitForGamesHub(page: Page): Promise<void> {
  await page.waitForURL('**/games');
  await expect(
    page.getByRole('heading', { name: games.title, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: games.entries.moments.title,
      level: 2,
    }),
  ).toBeVisible();
  await expect(page.locator('.games-access-panel')).toHaveCount(0);
}

test.describe('Floating Bottom Navigation (#882/#905)', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('shell composition: four destinations + centered Quick Create before Planen in one floating shell', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL('**/today');

    const floatingShell = page.locator('.mobile-bottom-shell');
    await expect(floatingShell).toBeVisible();

    const nav = floatingShell.locator('.mobile-bottom-nav');
    await expect(nav).toBeVisible();
    const links = nav.locator('a.shell-nav-link');
    await expect(links).toHaveCount(4);

    const labels = await links.allInnerTexts();
    expect(labels.map((label) => label.trim())).toEqual([
      navigation.today,
      navigation.story,
      navigation.plan,
      navigation.more,
    ]);

    const trigger = floatingShell.locator(
      '.mobile-quick-create button.quick-create-trigger',
    );
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-label', navigation.newContent);
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger).toHaveAttribute('type', 'button');

    const oldFab = page.locator('body > .mobile-quick-create');
    await expect(oldFab).toHaveCount(0);

    // Keep the accepted product order: Wir · Momente · + · Planen · Mehr.
    const momenteBox = await links.nth(1).boundingBox();
    const triggerBox = await trigger.boundingBox();
    const planenBox = await links.nth(2).boundingBox();
    expect(momenteBox).not.toBeNull();
    expect(triggerBox).not.toBeNull();
    expect(planenBox).not.toBeNull();

    if (momenteBox && triggerBox && planenBox) {
      expect(momenteBox.x + momenteBox.width).toBeLessThanOrEqual(
        triggerBox.x + 5,
      );
      expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(
        planenBox.x + 5,
      );
    }

    const shellBox = await floatingShell.boundingBox();
    expect(shellBox).not.toBeNull();
    if (shellBox) {
      expect(shellBox.x).toBeGreaterThan(0);
      expect(shellBox.x + shellBox.width).toBeLessThan(390);
      expect(844 - (shellBox.y + shellBox.height)).toBeGreaterThanOrEqual(8);
    }

    await expectNoHorizontalOverflow(page);
  });

  test('Quick Create mobile floating panel opens with fully rounded corners, clear nav separation and accessibility', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL('**/today');

    const trigger = page.locator('.mobile-bottom-shell .quick-create-trigger');
    await trigger.click();

    const dialog = page.getByRole('dialog', {
      name: navigation.quickCreateTitle,
    });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(250);

    // F2 uses the native top layer; stacking is independent of CSS z-index.
    expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(
      true,
    );

    const radii = await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        topLeft: Number.parseFloat(style.borderTopLeftRadius),
        topRight: Number.parseFloat(style.borderTopRightRadius),
        bottomLeft: Number.parseFloat(style.borderBottomLeftRadius),
        bottomRight: Number.parseFloat(style.borderBottomRightRadius),
      };
    });
    expect(radii.topLeft).toBeGreaterThanOrEqual(16);
    expect(radii.topRight).toBeGreaterThanOrEqual(16);
    expect(radii.bottomLeft).toBeGreaterThanOrEqual(16);
    expect(radii.bottomRight).toBeGreaterThanOrEqual(16);

    const sheetBox = await dialog.boundingBox();
    const navBox = await page.locator('.mobile-bottom-shell').boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    if (!sheetBox || !navBox) throw new Error('Missing bounding boxes');

    expect(sheetBox.x).toBeGreaterThan(0);
    expect(sheetBox.x + sheetBox.width).toBeLessThan(390);
    expect(navBox.y - (sheetBox.y + sheetBox.height)).toBeGreaterThanOrEqual(8);

    for (const item of [
      navigation.quickCreateMemory,
      navigation.quickCreateHeartMoment,
      navigation.quickCreateMilestone,
      navigation.quickCreateWish,
      navigation.quickCreatePlan,
      navigation.quickCreateForMe,
      navigation.quickCreatePrivateNote,
      navigation.quickCreateGiftIdea,
    ]) {
      await expect(dialog.getByText(item, { exact: true })).toBeVisible();
    }

    const axeResultsLight = await new AxeBuilder({ page })
      .include('.quick-create-mobile-sheet')
      .analyze();
    expect(axeResultsLight.violations).toEqual([]);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '00-quick-create-sheet-open-390.png'),
    });

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    });
    await page.waitForTimeout(250);
    const axeResultsDark = await new AxeBuilder({ page })
      .include('.quick-create-mobile-sheet')
      .analyze();
    expect(axeResultsDark.violations).toEqual([]);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '00-quick-create-sheet-open-390-dark.png'),
    });

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
    });

    const closeButton = dialog.getByRole('button', {
      name: navigation.closeMenu,
    });
    await expect(closeButton).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    const lastItem = dialog.locator('a[href="/more/private/gift-ideas/new"]');
    await expect(lastItem).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('Quick Create floating panel in constrained height and 320px reflow maintains reachability and separation', async ({
    page,
  }) => {
    await installApiMocks(page);

    await page.setViewportSize({ width: 390, height: 500 });
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL('**/today');

    const trigger = page.locator('.mobile-bottom-shell .quick-create-trigger');
    await trigger.click();

    const dialog = page.getByRole('dialog', {
      name: navigation.quickCreateTitle,
    });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(250);

    const smallSheetBox = await dialog.boundingBox();
    const smallNavBox = await page
      .locator('.mobile-bottom-shell')
      .boundingBox();
    expect(smallSheetBox).not.toBeNull();
    expect(smallNavBox).not.toBeNull();
    if (!smallSheetBox || !smallNavBox) {
      throw new Error('Missing bounding boxes');
    }

    expect(smallSheetBox.y).toBeGreaterThanOrEqual(0);
    expect(
      smallNavBox.y - (smallSheetBox.y + smallSheetBox.height),
    ).toBeGreaterThanOrEqual(8);

    const giftIdeaItem = dialog.getByText(navigation.quickCreateGiftIdea, {
      exact: true,
    });
    await giftIdeaItem.scrollIntoViewIfNeeded();
    await expect(giftIdeaItem).toBeVisible();

    const closeButton = dialog.getByRole('button', {
      name: navigation.closeMenu,
    });
    await closeButton.click();
    await expect(dialog).toHaveCount(0);

    await page.setViewportSize({ width: 320, height: 600 });
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(250);

    await expectNoHorizontalOverflow(page);
    const reflowSheetBox = await dialog.boundingBox();
    expect(reflowSheetBox).not.toBeNull();
    if (!reflowSheetBox) throw new Error('Missing bounding boxes');
    expect(reflowSheetBox.x).toBeGreaterThan(0);
    expect(reflowSheetBox.x + reflowSheetBox.width).toBeLessThanOrEqual(320);

    // The browser owns ::backdrop; click the actual area outside the dialog.
    await page.mouse.click(4, 4);
    await expect(dialog).toHaveCount(0);
  });

  test('navigation routing and active-state hierarchy', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL('**/today');

    const links = page.locator('.mobile-bottom-nav a.shell-nav-link');
    await expect(links).toHaveCount(4);

    await expect(links.nth(0)).toHaveClass(/shell-nav-link-active/);
    await expect(links.nth(0)).toHaveAttribute('aria-current', 'page');
    await expect(links.nth(1)).not.toHaveClass(/shell-nav-link-active/);

    await links.nth(1).click();
    await page.waitForURL('**/story');
    await expect(links.nth(1)).toHaveClass(/shell-nav-link-active/);
    await expect(links.nth(1)).toHaveAttribute('aria-current', 'page');
    await expect(links.nth(0)).not.toHaveClass(/shell-nav-link-active/);

    await links.nth(2).click();
    await page.waitForURL('**/plan');
    await expect(links.nth(2)).toHaveClass(/shell-nav-link-active/);
    await expect(links.nth(2)).toHaveAttribute('aria-current', 'page');

    await links.nth(3).click();
    await page.waitForURL('**/more');
    await expect(links.nth(3)).toHaveClass(/shell-nav-link-active/);
    await expect(links.nth(3)).toHaveAttribute('aria-current', 'page');

    await page
      .getByRole('link', { name: new RegExp(navigation.games) })
      .click();
    await waitForGamesHub(page);
    await expect(links.nth(3)).toHaveClass(/shell-nav-link-active/);
    await expect(links.nth(3)).toHaveAttribute('aria-current', 'page');
  });

  test('Our Moments child route stays under More and reflows without exposing sparse counts', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);

    await page.route(`**/api/v1/spaces/${SPACE_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: SPACE_ID,
          createdAt: TEST_NOW,
          partners: [
            { id: ACCOUNT_ID, displayName: 'Anna' },
            {
              id: '44444444-4444-4444-8444-444444444444',
              displayName: 'Alex',
            },
          ],
        }),
      });
    });
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/games/moments/candidates`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                memoryId: '55555555-5555-4555-8555-555555555555',
                title: 'Shared memory A',
                effectiveDate: '2026-05-01',
                imageAttachmentId: '66666666-6666-4666-8666-666666666666',
              },
              {
                memoryId: '77777777-7777-4777-8777-777777777777',
                title: 'Shared memory B',
                effectiveDate: '2026-06-01',
                imageAttachmentId: '88888888-8888-4888-8888-888888888888',
              },
            ],
          }),
        });
      },
    );

    await page.goto('/login');
    await signIn(page);
    await page.waitForURL('**/today');
    await page.goto('/games/our-moments');

    await expect(
      page.getByRole('heading', {
        name: games.entries.moments.title,
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.getByText(games.momentsGame.sparseTitle)).toBeVisible();

    const links = page.locator('.mobile-bottom-nav a.shell-nav-link');
    await expect(links.nth(3)).toHaveClass(/shell-nav-link-active/);
    await expect(links.nth(3)).toHaveAttribute('aria-current', 'page');

    const axe390 = await new AxeBuilder({ page })
      .include('.our-moments-page')
      .analyze();
    expect(axe390.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('our-moments-sparse-390.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 320, height: 640 });
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText(games.momentsGame.sparseTitle)).toBeVisible();
    const axe320 = await new AxeBuilder({ page })
      .include('.our-moments-page')
      .analyze();
    expect(axe320.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('our-moments-sparse-320.png'),
      fullPage: true,
    });
  });

  test('scroll clearance: focused Memory Create actions remain reachable without competing navigation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.goto('/story/memories/new');

    const floatingShell = page.locator('.mobile-bottom-shell');
    await expect(floatingShell).toHaveCount(0);

    const saveButton = page.getByRole('button', { name: de.memory.save });
    const cancelButton = page.getByRole('button', { name: de.common.cancel });
    await expect(saveButton).toBeVisible();
    await expect(cancelButton).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100);

    const saveBox = await saveButton.boundingBox();
    const cancelBox = await cancelButton.boundingBox();
    expect(saveBox).not.toBeNull();
    expect(cancelBox).not.toBeNull();
    if (saveBox && cancelBox) {
      expect(saveBox.y).toBeGreaterThanOrEqual(0);
      expect(cancelBox.y).toBeGreaterThanOrEqual(0);
      expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(844);
      expect(cancelBox.y + cancelBox.height).toBeLessThanOrEqual(844);
    }
  });

  test('accessibility: axe clean on today, Games and memory create', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL('**/today');

    const todayAxe = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();
    expect(todayAxe.violations).toEqual([]);

    await page.goto('/games');
    await waitForGamesHub(page);
    const gamesAxe = await new AxeBuilder({ page }).analyze();
    expect(gamesAxe.violations).toEqual([]);

    await page.goto('/story/memories/new');
    const memoryAxe = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();
    expect(memoryAxe.violations).toEqual([]);
  });

  test('200 percent zoom / large-text: floating navigation remains usable and collision-free', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 780, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL('**/today');

    await page.locator('html').evaluate((element) => {
      element.style.zoom = '2';
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );

    await expectNoHorizontalOverflow(page);

    const floatingShell = page.locator('.mobile-bottom-shell');
    await expect(floatingShell).toBeVisible();

    const links = floatingShell.locator('.mobile-bottom-nav a.shell-nav-link');
    await expect(links).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(links.nth(index)).toBeVisible();
    }
    const labels = await links.allInnerTexts();
    expect(labels.map((label) => label.trim())).toEqual([
      navigation.today,
      navigation.story,
      navigation.plan,
      navigation.more,
    ]);

    const trigger = floatingShell.locator(
      '.mobile-quick-create button.quick-create-trigger',
    );
    await expect(trigger).toBeVisible();

    const momenteBox = await links.nth(1).boundingBox();
    const triggerBox = await trigger.boundingBox();
    const planenBox = await links.nth(2).boundingBox();
    expect(momenteBox).not.toBeNull();
    expect(triggerBox).not.toBeNull();
    expect(planenBox).not.toBeNull();
    if (momenteBox && triggerBox && planenBox) {
      expect(momenteBox.x + momenteBox.width).toBeLessThanOrEqual(
        triggerBox.x + 1,
      );
      expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(
        planenBox.x + 1,
      );
    }

    await page.goto('/story/memories/new');
    await page.locator('html').evaluate((element) => {
      element.style.zoom = '2';
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100);

    const cancelButton = page.getByRole('button', { name: de.common.cancel });
    const zoomShell = page.locator('.mobile-bottom-shell');
    await expect(cancelButton).toBeVisible();
    await expect(zoomShell).toHaveCount(0);

    const cancelBox = await cancelButton.boundingBox();
    if (cancelBox) {
      expect(cancelBox.y).toBeGreaterThanOrEqual(0);
      expect(cancelBox.y + cancelBox.height).toBeLessThanOrEqual(844);
    }

    await page.goto('/today');
    await page.locator('html').evaluate((element) => {
      element.style.zoom = '2';
    });
    const zoomTrigger = page.locator(
      '.mobile-bottom-shell .quick-create-trigger',
    );
    await zoomTrigger.click();
    const zoomDialog = page.getByRole('dialog', {
      name: navigation.quickCreateTitle,
    });
    await expect(zoomDialog).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press('Escape');
    await expect(zoomDialog).toHaveCount(0);
  });

  test('captures required visual evidence matrix', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await installApiMocks(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL('**/today');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '01-today-390-light.png'),
    });

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => {
      localStorage.setItem('eimir.theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    });
    await page.reload();
    await page.waitForURL('**/today');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '02-today-390-dark.png'),
    });

    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => {
      localStorage.setItem('eimir.theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
    });
    await page.goto('/story/memories/new');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '03-memory-create-390-light.png'),
    });

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => {
      localStorage.setItem('eimir.theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    });
    await page.reload();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '04-memory-create-390-dark.png'),
    });

    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => {
      localStorage.setItem('eimir.theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
    });
    await page.goto('/plan');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '05-plan-390-light.png'),
    });

    await page.goto('/story');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '06-momente-390-light.png'),
    });

    await page.setViewportSize({ width: 320, height: 600 });
    await page.goto('/today');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '07-reflow-320px.png'),
    });

    await page.setViewportSize({ width: 390, height: 640 });
    await page.goto('/today');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '08-small-height-390x640.png'),
    });

    await page.setViewportSize({ width: 390, height: 500 });
    await page.goto('/story/memories/new');
    const titleInput = page.getByLabel(de.memory.titleLabel);
    await titleInput.focus();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '09-constrained-height-form-focus.png'),
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/today');
    await expect(page.locator('.mobile-bottom-shell')).toBeHidden();
    await expect(page.locator('.shell-nav')).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '10-expanded-desktop-1280x800.png'),
    });

    await page.setViewportSize({ width: 780, height: 844 });
    await page.goto('/today');
    await page.locator('html').evaluate((element) => {
      element.style.zoom = '2';
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '11-zoom-200-percent.png'),
    });

    // #902 Product Reference evidence: Compact Light/Dark, 320 reflow and Expanded.
    await page.locator('html').evaluate((element) => {
      element.style.zoom = '1';
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => {
      localStorage.setItem('eimir.theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
    });
    await page.goto('/games');
    await waitForGamesHub(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath('shell-games-390-light.png'),
      fullPage: true,
    });

    const gamesAxeLight = await new AxeBuilder({ page }).analyze();
    expect(gamesAxeLight.violations).toEqual([]);

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => {
      localStorage.setItem('eimir.theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    });
    await page.reload();
    await waitForGamesHub(page);
    await page.screenshot({
      path: testInfo.outputPath('shell-games-390-dark.png'),
      fullPage: true,
    });

    const gamesAxeDark = await new AxeBuilder({ page }).analyze();
    expect(gamesAxeDark.violations).toEqual([]);

    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => {
      localStorage.setItem('eimir.theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
    });
    await page.reload();
    await waitForGamesHub(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath('shell-games-320-reflow.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await waitForGamesHub(page);
    await expect(page.locator('.mobile-bottom-shell')).toBeHidden();
    await expect(page.locator('.shell-nav')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('shell-games-expanded-1280.png'),
      fullPage: true,
    });
  });
});
