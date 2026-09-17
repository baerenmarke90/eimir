import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import m5s5 from '../../src/i18n/locales/m5s5';
import navigation from '../../src/i18n/locales/navigation';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-01T10:00:00Z';

async function expectNoWcagViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'wcag22a',
      'wcag22aa',
    ])
    .analyze();

  const summary = result.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes.length} node(s)`,
    )
    .join('\n');

  expect(result.violations, summary || 'No axe violations').toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function installAuthorizedApiMocks(page: Page): Promise<string[]> {
  const unexpectedRequests: string[] = [];

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
        account: {
          displayName: 'Anna',
          id: ACCOUNT_ID,
        },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'browser-e2e-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({
        displayName: 'Anna',
        id: ACCOUNT_ID,
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      await fulfillJson({
        accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        accessToken: 'browser-e2e-access-token-refreshed',
        refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
        refreshToken: 'browser-e2e-refresh-token-refreshed',
      });
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

    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await fulfillJson({ serverAdmin: false });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await fulfillJson([
        {
          role: 'MEMBER',
          spaceId: SPACE_ID,
          status: 'ACTIVE',
        },
      ]);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({
        items: [{ moduleKey: 'upcoming', itemLimit: 2 }],
      });
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
        space: {
          partner: null,
          spaceId: SPACE_ID,
        },
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
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson({
        hasMore: false,
        items: [],
        nextCursor: null,
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

    const planningCapabilities = {
      canComment: false,
      canDelete: true,
      canEdit: true,
    };
    const planningCreator = { id: ACCOUNT_ID, displayName: 'Anna' };
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/places/place-1`
    ) {
      await fulfillJson({
        address: 'Parkweg 1',
        capabilities: planningCapabilities,
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: planningCreator,
        description: 'Unser Picknickplatz',
        id: 'place-1',
        latitude: null,
        longitude: null,
        name: 'Volkspark',
        spaceId: SPACE_ID,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/places/place-1/`)
    ) {
      await fulfillJson({ items: [] });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/collections/collection-1`
    ) {
      await fulfillJson({
        capabilities: planningCapabilities,
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: planningCreator,
        id: 'collection-1',
        items: [],
        spaceId: SPACE_ID,
        title: 'Packliste',
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters/chapter-1`
    ) {
      await fulfillJson({
        capabilities: planningCapabilities,
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: planningCreator,
        description: 'Sommergeschichten',
        endOn: null,
        id: 'chapter-1',
        placeId: null,
        spaceId: SPACE_ID,
        startOn: '2026-06-01',
        title: 'Sommer',
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters/chapter-1/content`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'GET' &&
      [
        `/api/v1/spaces/${SPACE_ID}/search`,
        `/api/v1/spaces/${SPACE_ID}/notifications`,
        `/api/v1/spaces/${SPACE_ID}/story`,
        `/api/v1/spaces/${SPACE_ID}/timeline`,
        `/api/v1/spaces/${SPACE_ID}/collections`,
        `/api/v1/spaces/${SPACE_ID}/plans`,
        `/api/v1/spaces/${SPACE_ID}/places`,
        `/api/v1/spaces/${SPACE_ID}/wishes`,
      ].includes(pathname)
    ) {
      await fulfillJson({
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      return;
    }

    unexpectedRequests.push(`${method} ${pathname}`);
    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: 'The browser test did not define this API request.',
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return unexpectedRequests;
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
}

async function navigateWithinApp(page: Page, path: string): Promise<void> {
  if (path === '/plan') {
    await page
      .getByRole('link', { name: navigation.plan, exact: true })
      .click();
    await expect(page).toHaveURL(/\/plan$/);
    return;
  }

  await page.getByRole('link', { name: navigation.more, exact: true }).click();
  await expect(page).toHaveURL(/\/more$/);
  await page.locator(`a[href="${path}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

test('compact sign-in is keyboard operable, wraps German copy, and is axe-clean', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(
    page.getByRole('heading', {
      name: de.login.introHeading,
      level: 1,
    }),
  ).toBeVisible();

  await page.getByLabel(de.login.email).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel(de.login.password)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: de.login.submit }),
  ).toBeFocused();

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
});

test('compact authenticated shell keeps global quick create reachable and accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  await page.goto('/today');
  await signIn(page);

  await expect(page).toHaveURL(/\/today$/);
  // Couple Presence stays the permanent H1 entry point, even for a sparse space.
  await expect(
    page.getByRole('heading', {
      name: m5s5.dashboard.durationTitle,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: m5s5.dashboard.newSpaceEmpty,
      level: 2,
    }),
  ).toBeVisible();

  const quickCreate = page.getByRole('button', {
    name: navigation.newContent,
  });
  await expect(quickCreate).toBeVisible();
  await quickCreate.focus();
  await page.keyboard.press('ArrowDown');

  const sheetDialog = page.getByRole('dialog', {
    name: navigation.quickCreateTitle,
  });
  await expect(sheetDialog).toBeVisible();

  const closeButton = page.getByRole('button', {
    name: navigation.closeMenu,
  });
  await expect(closeButton).toBeFocused();

  const memoryTarget = page.getByRole('link', {
    name: navigation.quickCreateMemory,
  });
  await expect(memoryTarget).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(memoryTarget).toBeFocused();
  await expect(
    page.getByRole('link', { name: navigation.quickCreateWish }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: navigation.quickCreatePrivateNote }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);

  await page.keyboard.press('Escape');
  await expect(quickCreate).toBeFocused();
  await expect(sheetDialog).toHaveCount(0);
  expect(unexpectedRequests).toEqual([]);
});

test('authenticated shell removes decorative motion when reduced motion is preferred', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 800 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  await page.goto('/today');
  await signIn(page);

  const mainAnimation = await page
    .locator('#main-content')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(mainAnimation).toBe('none');

  const quickCreate = page.getByRole('button', {
    name: navigation.newContent,
  });
  const quickCreateTransition = await quickCreate.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(quickCreateTransition).toBe('0s');

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
});

test('expanded authenticated shell keeps deep links, back, focus, and accessibility intact', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  // Exercise the deployed SPA/direct-entry contract through an existing legacy
  // deep link. After authentication, the route model must canonicalize it.
  await page.goto('/dashboard');
  await signIn(page);

  await expect(page).toHaveURL(/\/today$/);
  // Couple Presence stays the permanent H1 entry point, even for a sparse space.
  await expect(
    page.getByRole('heading', {
      name: m5s5.dashboard.durationTitle,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: m5s5.dashboard.newSpaceEmpty,
      level: 2,
    }),
  ).toBeVisible();
  await expect(page.getByText(m5s5.dashboard.newSpaceIntro)).toBeVisible();

  const skipLink = page.getByRole('link', {
    name: de.navigation.skipToContent,
  });
  await skipLink.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  await page.getByRole('link', { name: navigation.more, exact: true }).click();
  await expect(page).toHaveURL(/\/more$/);
  await expect(
    page.getByRole('heading', { name: de.more.title, level: 1 }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/today(?:#main-content)?$/);
  await expect(
    page.getByRole('heading', {
      name: m5s5.dashboard.newSpaceEmpty,
      level: 2,
    }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
});

test('planning sanctuary is compact, dark, reduced-motion, keyboard operable, and axe-clean', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.localStorage.setItem('eimir.theme', 'system');
  });
  await page.setViewportSize({ width: 320, height: 800 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  await page.goto('/today');
  await signIn(page);
  await page.getByRole('link', { name: navigation.plan, exact: true }).click();

  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('heading', { name: m5s3.overview.title, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(m5s3.overview.plansEmpty)).toBeVisible();

  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await expect(page.getByText(m5s3.overview.wishesEmpty)).toBeVisible();
  await page.getByRole('tab', { name: m5s3.overview.segmentPlans }).click();

  const revealAnimation = await page
    .locator('.planen-panel')
    .first()
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(revealAnimation).toBe('none');

  const createPlan = page.getByRole('link', { name: m5s3.overview.addPlan });
  await createPlan.focus();
  await expect(createPlan).toBeFocused();
  const createPlanBox = await createPlan.boundingBox();
  expect(createPlanBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Enter');
  await expect(page.locator('#planning-create-title')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/plan$/);

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-overview-compact-dark.png'),
    fullPage: true,
  });

  await navigateWithinApp(page, '/more/collections');
  await expect(
    page.getByRole('heading', { name: m5s3.collection.heading, level: 1 }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-collections-compact-dark.png'),
    fullPage: true,
  });

  await navigateWithinApp(page, '/more/places');
  await expect(
    page.getByRole('heading', { name: m5s3.place.heading, level: 1 }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-places-compact-dark.png'),
    fullPage: true,
  });

  expect(unexpectedRequests).toEqual([]);
});

test('planning sanctuary stays accessible in expanded light mode at 200 percent layout zoom', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    window.localStorage.setItem('eimir.theme', 'system');
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  await page.goto('/today');
  await signIn(page);
  await page.getByRole('link', { name: navigation.plan, exact: true }).click();

  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(
    page.getByRole('heading', { name: m5s3.overview.title, level: 1 }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('planning-overview-expanded-light.png'),
    fullPage: true,
  });

  await navigateWithinApp(page, '/more/collections');
  await expect(
    page.getByRole('heading', { name: m5s3.collection.heading, level: 1 }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-collections-expanded-light.png'),
    fullPage: true,
  });

  await navigateWithinApp(page, '/more/places');
  await expect(
    page.getByRole('heading', { name: m5s3.place.heading, level: 1 }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-places-expanded-light.png'),
    fullPage: true,
  });

  await navigateWithinApp(page, '/plan');
  await expect(
    page.getByRole('heading', { name: m5s3.overview.title, level: 1 }),
  ).toBeVisible();
  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
});

test('Place, Collection, and Chapter editors honor browser focus and history', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const unexpectedRequests = await installAuthorizedApiMocks(page);
  await page.goto('/');
  await signIn(page);

  await page.goto('/plan/places/place-1');
  const placeEdit = page.getByRole('button', { name: de.common.edit });
  await placeEdit.click();
  const placeName = page.getByLabel(m5s3.place.name);
  await expect(placeName).toBeFocused();
  await placeName.fill('Lakeside park');
  await page.goBack();
  const placeDiscard = page.getByRole('alertdialog');
  await expect(placeDiscard).toBeVisible();
  await placeDiscard
    .getByRole('button', { name: m5s3.common.keepEditing })
    .click();
  await expect(placeName).toHaveValue('Lakeside park');
  await page.keyboard.press('Escape');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: m5s3.common.discardConfirm })
    .click();
  await expect(placeEdit).toBeFocused();

  await page.goto('/plan/collections/collection-1');
  const collectionEdit = page.getByRole('button', { name: de.common.edit });
  await collectionEdit.click();
  await expect(page.getByLabel(m5s3.common.title)).toBeFocused();
  await page.goBack();
  await expect(collectionEdit).toBeFocused();

  await page.goto('/plan/chapters/chapter-1');
  const chapterEdit = page.getByRole('button', { name: de.common.edit });
  await chapterEdit.click();
  await expect(page.getByLabel(m5s3.common.title)).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-wave5-editor-history-compact.png'),
    fullPage: false,
  });
  await page.keyboard.press('Escape');
  await expect(chapterEdit).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await chapterEdit.click();
  await expect(page.getByLabel(m5s3.common.title)).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('planning-wave5-editor-history-expanded.png'),
    fullPage: false,
  });
  expect(unexpectedRequests).toEqual([]);
});

test('Place coordinate guidance meets AA contrast in compact light and dark editors', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('eimir.theme', 'system');
  });
  const unexpectedRequests = await installAuthorizedApiMocks(page);
  await page.goto('/');
  await signIn(page);

  const scenarios = [
    { colorScheme: 'light' as const, width: 390, height: 844 },
    { colorScheme: 'light' as const, width: 390, height: 520 },
    { colorScheme: 'dark' as const, width: 390, height: 844 },
    { colorScheme: 'light' as const, width: 1440, height: 900 },
  ];

  for (const { colorScheme, width, height } of scenarios) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });

    await page.goto('/more/places');
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      colorScheme,
    );
    await page.locator('summary', { hasText: m5s3.place.create }).click();
    const createHelp = page.locator('#create-place-coordinate-help');
    await expect(createHelp).toHaveClass(
      /(?:^|\s)planning-coordinate-help(?:\s|$)/,
    );
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `planning-place-coordinate-create-${colorScheme}-${width}x${height}.png`,
      ),
      fullPage: true,
    });

    await page.goto('/plan/places/place-1');
    await page.getByRole('button', { name: de.common.edit }).click();
    const editHelp = page.locator('#place-edit-coordinate-help');
    await expect(editHelp).toHaveClass(
      /(?:^|\s)planning-coordinate-help(?:\s|$)/,
    );
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `planning-place-coordinate-edit-${colorScheme}-${width}x${height}.png`,
      ),
      fullPage: true,
    });
  }

  expect(unexpectedRequests).toEqual([]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`shell navigation and utilities reflow in ${colorScheme} mode`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const unexpectedRequests = await installAuthorizedApiMocks(page);
    await page.goto('/today');
    await signIn(page);
    await expect(page).toHaveURL(/\/today$/);

    // Covers both sides of the existing breakpoint and #784's proposed transition.
    for (const width of [320, 390, 599, 600, 839, 840, 959, 960, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const navigationRegion = page.getByRole('navigation', {
        name: de.navigation.primary,
      });
      await expect(navigationRegion).toHaveCount(1);
      for (const [name, path] of [
        [navigation.today, '/today'],
        [navigation.story, '/story'],
        [navigation.plan, '/plan'],
        [navigation.more, '/more'],
      ]) {
        const link = navigationRegion.getByRole('link', { name, exact: true });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', path);
        const box = await link.boundingBox();
        if (!box)
          throw new Error(`Navigation target ${path} has no visible bounds.`);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await expect(
        page.getByRole('button', { name: navigation.newContent }),
      ).toHaveCount(1);
      await expect(
        page.getByRole('button', { name: navigation.newContent }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      const inHeader = await navigationRegion.evaluate((element) =>
        Boolean(element.closest('header')),
      );
      expect(inHeader).toBe(width >= 840);
    }

    await page
      .getByRole('link', { name: navigation.plan, exact: true })
      .click();
    await expect(page).toHaveURL(/\/plan$/);
    await expect(
      page.getByRole('link', { name: navigation.plan, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page
      .getByRole('link', { name: navigation.today, exact: true })
      .click();
    const header = page.getByRole('banner');
    const create = page.getByRole('button', { name: navigation.newContent });
    await create.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.getByRole('menu', { name: navigation.quickCreateTitle });
    await expect(menu).toBeVisible();
    const memory = menu.getByRole('menuitem', {
      name: navigation.quickCreateMemory,
    });
    await expect(memory).toBeFocused();
    await expect(memory).toHaveAttribute('href', '/story/memories/new');
    await page.keyboard.press('End');
    await expect(
      menu.getByRole('menuitem', { name: navigation.quickCreateGiftIdea }),
    ).toBeFocused();
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`shell-create-expanded-${colorScheme}.png`),
    });
    await page.keyboard.press('Escape');
    await expect(create).toBeFocused();
    await expect(menu).toHaveCount(0);

    const search = header.getByRole('link', {
      name: navigation.search,
      exact: true,
    });
    await search.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/search$/);
    const searchInput = page.getByRole('searchbox', {
      name: m5s5.search.label,
    });
    await searchInput.focus();
    await searchInput.fill('Shared memory');
    await page.keyboard.press('Enter');
    await expect(searchInput).toBeFocused();
    await expect(
      page.getByRole('button', { name: m5s5.search.submit, exact: true }),
    ).toBeEnabled();
    await page.goBack();
    const notifications = header.getByRole('button', {
      name: navigation.notifications,
      exact: true,
    });
    await notifications.focus();
    await page.keyboard.press('Enter');
    await expect(header.locator('a[href="/more/notifications"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(notifications).toBeFocused();
    const profile = header.getByRole('button', {
      name: navigation.profileMenu,
    });
    await profile.focus();
    await page.keyboard.press('Enter');
    await header.locator('a[href="/more/profile"]').click();
    await expect(page).toHaveURL(/\/more\/profile$/);
    await expect(
      page.getByRole('link', { name: navigation.more, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page
      .getByRole('link', { name: navigation.today, exact: true })
      .click();

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoWcagViolations(page);
      await page.screenshot({
        path: testInfo.outputPath(
          `shell-${width >= 840 ? 'expanded' : 'compact'}-${colorScheme}.png`,
        ),
      });
    }
    // Browser zoom halves the CSS viewport; unlike CSS zoom it changes media queries.
    await page.setViewportSize({ width: 720, height: 450 });
    await expect(
      page.getByRole('navigation', { name: de.navigation.primary }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    expect(unexpectedRequests).toEqual([]);
  });
}

// CSS layout zoom keeps the 390px CSS viewport but halves the usable layout
// width. A 320px root minimum used to survive that halving as 640 rendered
// pixels, which is exactly how #798 reproduced.
test('sign-in reflows below a 320px layout width at 200 percent zoom', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });

  const dimensions = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.clientWidth).toBe(390);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.bodyScrollWidth).toBeLessThan(320);
});

test('authenticated shell reflows below a 320px layout width at 200 percent zoom', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpectedRequests = await installAuthorizedApiMocks(page);

  await page.goto('/today');
  await signIn(page);
  await expect(page).toHaveURL(/\/today$/);
  await expectNoHorizontalOverflow(page);

  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });

  const dimensions = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(dimensions.clientWidth).toBe(390);
  expect(dimensions.bodyScrollWidth).toBeLessThan(320);
  expect(unexpectedRequests).toEqual([]);
});
