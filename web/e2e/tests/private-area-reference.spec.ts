import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import m5s5 from '../../src/i18n/locales/m5s5';
import privateArea from '../../src/i18n/locales/privateArea';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const PRIVATE_NOTE_ID = '44444444-4444-4444-8444-444444444444';
const PRIVATE_COLLECTION_ID = '55555555-5555-4555-8555-555555555555';
const PRIVATE_ITEM_ID = '66666666-6666-4666-8666-666666666666';
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
  let collectionTitle = 'Packing list';
  let collectionVersion = 1;
  let itemTitle = 'Book train tickets';
  let itemCompleted = false;
  let itemVersion = 1;

  const privateNote = {
    body: 'Check the quiet cabin by the lake.',
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    createdAt: TEST_NOW,
    id: PRIVATE_NOTE_ID,
    ownerId: ACCOUNT_ID,
    pinned: false,
    spaceId: SPACE_ID,
    title: 'Hidden cabin idea',
    updatedAt: TEST_NOW,
    version: 1,
  };
  const privateItem = () => ({
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    collectionId: PRIVATE_COLLECTION_ID,
    completed: itemCompleted,
    createdAt: TEST_NOW,
    id: PRIVATE_ITEM_ID,
    position: 0,
    title: itemTitle,
    updatedAt: TEST_NOW,
    version: itemVersion,
  });
  const privateCollection = () => ({
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    createdAt: TEST_NOW,
    id: PRIVATE_COLLECTION_ID,
    items: [privateItem()],
    ownerId: ACCOUNT_ID,
    spaceId: SPACE_ID,
    title: collectionTitle,
    updatedAt: TEST_NOW,
    version: collectionVersion,
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const requestUrl = new URL(request.url());
    const pathname = requestUrl.pathname;

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
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'browser-e2e-refresh-token',
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
        accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        accessToken: 'browser-e2e-access-token-refreshed',
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        refreshToken: 'browser-e2e-refresh-token-refreshed',
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
      await fulfillJson({ items: [{ moduleKey: 'upcoming', itemLimit: 2 }] });
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
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/search`) {
      const query = requestUrl.searchParams.get('q')?.trim() ?? '';
      await fulfillJson({
        hasMore: false,
        items: query
          ? [
              {
                excerpt: privateNote.body,
                id: PRIVATE_NOTE_ID,
                occurredOn: null,
                parentId: null,
                scope: 'PRIVATE',
                title: privateNote.title,
                type: 'PRIVATE_NOTE',
              },
            ]
          : [],
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/private/notes/${PRIVATE_NOTE_ID}`
    ) {
      await fulfillJson(privateNote);
      return;
    }

    if (
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/private/collections/${PRIVATE_COLLECTION_ID}`
    ) {
      await fulfillJson(privateCollection());
      return;
    }

    if (
      method === 'PATCH' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/private/collections/${PRIVATE_COLLECTION_ID}/items/${PRIVATE_ITEM_ID}`
    ) {
      const body = request.postDataJSON() as {
        completed?: boolean;
        title?: string;
      };
      if (typeof body.completed === 'boolean') itemCompleted = body.completed;
      if (typeof body.title === 'string') itemTitle = body.title;
      itemVersion += 1;
      await fulfillJson(privateItem());
      return;
    }

    if (
      method === 'PATCH' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/private/collections/${PRIVATE_COLLECTION_ID}`
    ) {
      const body = request.postDataJSON() as { title?: string };
      if (typeof body.title === 'string') collectionTitle = body.title;
      collectionVersion += 1;
      await fulfillJson(privateCollection());
      return;
    }

    if (
      method === 'GET' &&
      [
        `/api/v1/spaces/${SPACE_ID}/notifications`,
        `/api/v1/spaces/${SPACE_ID}/story`,
        `/api/v1/spaces/${SPACE_ID}/collections`,
        `/api/v1/spaces/${SPACE_ID}/plans`,
        `/api/v1/spaces/${SPACE_ID}/places`,
        `/api/v1/spaces/${SPACE_ID}/wishes`,
      ].includes(pathname)
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/entitlements`
    ) {
      await fulfillJson({
        spaceId: SPACE_ID,
        status: 'FREE',
        tier: 'FREE',
        capabilities: [],
        isInGracePeriod: false,
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

async function signInAndOpenPrivateArea(page: Page): Promise<string[]> {
  const unexpectedRequests = await installAuthorizedApiMocks(page);
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);

  await page.goto('/more/private');
  await expect(page).toHaveURL(/\/more\/private$/);
  await expect(
    page.getByRole('heading', { name: privateArea.eyebrow, level: 1 }),
  ).toBeVisible();

  return unexpectedRequests;
}

async function expectPrivateReferenceStructure(page: Page): Promise<void> {
  const banner = page.getByRole('note');
  await expect(banner).toContainText(privateArea.privacyLabel);
  await expect(banner).toContainText(privateArea.entry.privacy);

  const cards = page.locator('.private-area-destination-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toHaveAttribute('href', '/more/private/notes');
  await expect(cards.nth(1)).toHaveAttribute(
    'href',
    '/more/private/gift-ideas',
  );
  await expect(cards.nth(2)).toHaveAttribute(
    'href',
    '/more/private/collections',
  );
  await expect(cards.nth(0)).toContainText(privateArea.notes.title);
  await expect(cards.nth(1)).toContainText(privateArea.gifts.title);
  await expect(cards.nth(2)).toContainText(privateArea.collections.title);

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`private area matches the 390 product-reference composition in ${colorScheme} mode`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() => {
      window.localStorage.setItem('eimir.theme', 'system');
    });
    await page.setViewportSize({ width: 390, height: 844 });

    const unexpectedRequests = await signInAndOpenPrivateArea(page);
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      colorScheme,
    );
    await expectPrivateReferenceStructure(page);

    await page.screenshot({
      path: testInfo.outputPath(`private-area-390-${colorScheme}.png`),
      fullPage: true,
    });
    expect(unexpectedRequests).toEqual([]);
  });
}

test('private area reflows at 320 CSS px and removes decorative motion', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.localStorage.setItem('eimir.theme', 'system');
  });
  await page.setViewportSize({ width: 320, height: 844 });

  const unexpectedRequests = await signInAndOpenPrivateArea(page);
  await expectPrivateReferenceStructure(page);

  const firstCard = page.locator('.private-area-destination-card').first();
  const transitionDuration = await firstCard.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(transitionDuration).toBe('0s');

  const box = await firstCard.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);

  await page.screenshot({
    path: testInfo.outputPath('private-area-320-light.png'),
    fullPage: true,
  });
  expect(unexpectedRequests).toEqual([]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`private area keeps the accepted hierarchy in expanded Web in ${colorScheme} mode`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() => {
      window.localStorage.setItem('eimir.theme', 'system');
    });
    await page.setViewportSize({ width: 1440, height: 900 });

    const unexpectedRequests = await signInAndOpenPrivateArea(page);
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      colorScheme,
    );
    await expect(page.locator('#app-favicon')).toHaveAttribute(
      'href',
      colorScheme === 'dark' ? '/favicon-dark.svg' : '/favicon.svg',
    );
    await expectPrivateReferenceStructure(page);

    await page.screenshot({
      path: testInfo.outputPath(`private-area-1440-${colorScheme}.png`),
      fullPage: true,
    });
    expect(unexpectedRequests).toEqual([]);
  });
}

test('private area remains usable at 200 percent layout zoom', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 780, height: 900 });

  const unexpectedRequests = await signInAndOpenPrivateArea(page);
  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
});

for (const viewport of [
  { name: 'compact', width: 390, height: 844 },
  { name: 'expanded', width: 1440, height: 900 },
] as const) {
  test(`private note title errors remain associated and focused in ${viewport.name} Web`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    const unexpectedRequests = await signInAndOpenPrivateArea(page);
    await page.goto('/more/private/notes/new');

    const title = page.getByLabel(privateArea.notes.titleLabel);
    await title.fill('   ');
    await page
      .getByRole('button', { name: privateArea.save, exact: true })
      .click();

    await expect(title).toHaveValue('   ');
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expect(title).toHaveAttribute(
      'aria-describedby',
      'private-note-title-error',
    );
    await expect(title).toBeFocused();
    await expect(page.getByText(privateArea.titleRequired)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `private-area-note-error-${viewport.name}-light.png`,
      ),
      fullPage: true,
    });
    expect(unexpectedRequests).toEqual([]);
  });
}

test('private Search restores query and type after detail edit/cancel/return', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpectedRequests = await signInAndOpenPrivateArea(page);

  await page.goto('/search');
  await page.getByLabel(m5s5.search.label).fill('cabin');
  await page.getByLabel(m5s5.search.typeLabel).selectOption('PRIVATE_NOTE');
  await page.getByRole('button', { name: m5s5.search.submit }).click();

  const result = page.locator('.search-result-link').filter({
    hasText: 'Hidden cabin idea',
  });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page).toHaveURL(
    new RegExp(`/more/private/notes/${PRIVATE_NOTE_ID}$`),
  );
  await expect(
    page.getByRole('heading', { name: 'Hidden cabin idea' }),
  ).toBeVisible();

  await page.getByRole('link', { name: privateArea.edit }).click();
  await expect(
    page.getByRole('heading', { name: privateArea.notes.editTitle }),
  ).toBeVisible();
  await page.getByRole('button', { name: de.common.cancel }).click();

  await expect(
    page.getByRole('heading', { name: 'Hidden cabin idea' }),
  ).toBeVisible();
  await page.getByRole('button', { name: privateArea.backToSearch }).click();

  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByLabel(m5s5.search.label)).toHaveValue('cabin');
  await expect(page.getByLabel(m5s5.search.typeLabel)).toHaveValue(
    'PRIVATE_NOTE',
  );
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('private-search-return-390-light.png'),
    fullPage: true,
  });
  expect(unexpectedRequests).toEqual([]);
});

test('private collection is read/check-first and discloses management in Edit', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.localStorage.setItem('eimir.theme', 'system');
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpectedRequests = await signInAndOpenPrivateArea(page);

  await page.goto(`/more/private/collections/${PRIVATE_COLLECTION_ID}`);
  await expect(
    page.getByRole('heading', { name: 'Packing list' }),
  ).toBeVisible();
  await expect(page.locator('.private-collection-item-title')).toHaveText(
    'Book train tickets',
  );
  await expect(
    page.getByPlaceholder(privateArea.collections.itemTitleLabel),
  ).toHaveCount(0);
  await expect(page.getByLabel(privateArea.collections.rename)).toHaveCount(0);

  await page
    .getByRole('button', { name: privateArea.collections.markComplete })
    .click();
  await expect(
    page.getByRole('button', { name: privateArea.collections.markOpen }),
  ).toBeVisible();

  await page.getByRole('button', { name: de.common.edit }).click();
  await expect(
    page.getByPlaceholder(privateArea.collections.itemTitleLabel),
  ).toBeVisible();
  await expect(page.getByLabel(privateArea.collections.rename)).toBeVisible();

  const titleInput = page.getByLabel(privateArea.collections.titleLabel);
  await titleInput.fill('Packing for Lisbon');
  await page.getByRole('button', { name: m5s3.common.saveChanges }).click();

  await expect(
    page.getByRole('heading', { name: 'Packing for Lisbon' }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder(privateArea.collections.itemTitleLabel),
  ).toHaveCount(0);
  await expect(page.locator('.private-collection-item-title')).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('private-collection-read-first-390-dark.png'),
    fullPage: true,
  });
  expect(unexpectedRequests).toEqual([]);
});
