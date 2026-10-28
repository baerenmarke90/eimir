import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import m5s5 from '../../src/i18n/locales/m5s5';
import navigation from '../../src/i18n/locales/navigation';
import privateArea from '../../src/i18n/locales/privateArea';
import { writeFile } from 'node:fs/promises';

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
  const overflow =
    dimensions.scrollWidth > dimensions.clientWidth
      ? await page.evaluate(() =>
          [...document.querySelectorAll('body *')]
            .filter(
              (element) =>
                element.getBoundingClientRect().right >
                document.documentElement.clientWidth + 1,
            )
            .map((element) => ({
              element: element.tagName,
              class: element.className,
              text: element.textContent?.slice(0, 80),
            }))
            .slice(-10),
        )
      : [];
  expect(dimensions.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(
    dimensions.clientWidth,
  );
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
    if (await fulfillDefaultAppIcon(route)) return;
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

    if (method === 'GET' && pathname.endsWith('/partner-nickname')) {
      await fulfillJson({ partnerId: null, nickname: null, version: 0 });
      return;
    }

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

    if (method === 'POST' && pathname === '/api/v1/auth/sign-out') {
      await route.fulfill({ status: 204 });
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
        `/api/v1/spaces/${SPACE_ID}/private/notes`,
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

async function signOutToPublicEntry(page: Page): Promise<void> {
  // AppShell intentionally leaves the document on sign-out. Accept a pending
  // editor's beforeunload prompt rather than relying on Playwright's dismissal.
  page.on('dialog', async (dialog) => {
    expect(dialog.type()).toBe('beforeunload');
    await dialog.accept();
  });
  await page
    .getByRole('button', { name: navigation.profileMenu, exact: true })
    .click();
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/', { waitUntil: 'load' }),
    page.getByRole('button', { name: de.header.logout, exact: true }).click(),
  ]);
  await expect(page.getByLabel(de.login.email)).toBeVisible();
}

async function signInAgain(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
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

for (const theme of ['light', 'dark'] as const) {
  test(`private overview preserves section spacing through resize and return in ${theme}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      window.localStorage.setItem('eimir.theme', 'system');
    });
    await page.setViewportSize({ width: 481, height: 900 });
    const unexpectedRequests = await signInAndOpenPrivateArea(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    for (const viewport of [
      { width: 481, largeText: false },
      { width: 480, largeText: false },
      { width: 481, largeText: false },
      { width: 480, largeText: false },
      { width: 360, largeText: false },
      { width: 390, largeText: false },
      { width: 430, largeText: false },
      { width: 1440, largeText: false },
      { width: 360, largeText: true },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: 900 });
      await page.locator('html').evaluate((element, largeText) => {
        element.style.fontSize = largeText ? '200%' : '';
      }, viewport.largeText);
      const name = `private-spacing-${viewport.width}-${theme}${viewport.largeText ? '-large' : ''}`;
      const geometry = await page
        .locator('.private-area-reference-overview')
        .evaluate((element) => {
          const fontSize = Number.parseFloat(
            getComputedStyle(document.documentElement).fontSize,
          );
          const children = Array.from(element.children);
          const rects = children.map((child) => child.getBoundingClientRect());
          return {
            width: window.innerWidth,
            fontSize,
            expectedGap:
              window.innerWidth <= 480
                ? 1.25 * fontSize
                : Math.min(
                    2 * fontSize,
                    Math.max(1.25 * fontSize, window.innerWidth * 0.05),
                  ),
            computedGap: getComputedStyle(element).rowGap,
            visibleGaps: rects.slice(1).map((rect, index) => ({
              distance: rect.top - rects[index].bottom,
              adjacentMargins:
                Number.parseFloat(
                  getComputedStyle(children[index]).marginBottom,
                ) +
                Number.parseFloat(
                  getComputedStyle(children[index + 1]).marginTop,
                ),
            })),
          };
        });
      await writeFile(
        testInfo.outputPath(`${name}.json`),
        JSON.stringify(geometry, null, 2),
      );
      await page.screenshot({
        path: testInfo.outputPath(`${name}.png`),
        fullPage: true,
      });
      expect
        .soft(Number.parseFloat(geometry.computedGap))
        .toBeCloseTo(geometry.expectedGap, 1);
      for (const gap of geometry.visibleGaps)
        expect
          .soft(gap.distance)
          .toBeCloseTo(geometry.expectedGap + gap.adjacentMargins, 1);
      await expectPrivateReferenceStructure(page);
      await expect(page).toHaveURL(/\/more\/private$/);
    }

    await page.locator('.private-area-destination-card').first().click();
    await expect(page).toHaveURL(/\/more\/private\/notes$/);
    await expect(
      page.getByText(privateArea.notes.emptyTitle, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: privateArea.backToHub, exact: true })
      .click();
    await expectPrivateReferenceStructure(page);
    await page
      .getByRole('link', { name: privateArea.backToMore, exact: true })
      .click();
    await expect(page).toHaveURL(/\/more$/);
    expect(unexpectedRequests).toEqual([]);
  });
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
      colorScheme === 'dark'
        ? '/identity/app-icon-dark.png'
        : '/identity/app-icon-light.png',
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

async function installHeldPrivateList(page: Page, itemCount = 3) {
  const items = Array.from({ length: itemCount }, (_, position) => ({
    id:
      position === 0
        ? PRIVATE_ITEM_ID
        : `66666666-6666-4666-8666-${String(position).padStart(12, '0')}`,
    collectionId: PRIVATE_COLLECTION_ID,
    title: [
      'Book train tickets',
      'Pack the photo album',
      'Bring favourite snacks',
    ][position % 3],
    position,
    completed: false,
    version: 1,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    capabilities: { canComment: false, canDelete: true, canEdit: true },
  }));
  let version = 1;
  let detailReads = 0;
  let deniedReads = false;
  let nextDetailRead: { started: () => void; response: Promise<void> } | null =
    null;
  const collection = () => ({
    id: PRIVATE_COLLECTION_ID,
    ownerId: ACCOUNT_ID,
    spaceId: SPACE_ID,
    title: 'Travel preparations',
    version,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    items,
  });
  const writes: { ifMatch: string | undefined; completed: boolean }[] = [];
  let waiting: {
    route: Route;
    release: () => void;
    completed: boolean;
    item: (typeof items)[number];
  } | null = null;
  let failReads = false;
  const root = `/api/v1/spaces/${SPACE_ID}/private/collections`;
  await page.route(`**${root}**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      if (path === `${root}/${PRIVATE_COLLECTION_ID}`) {
        detailReads += 1;
        if (nextDetailRead) {
          const read = nextDetailRead;
          nextDetailRead = null;
          read.started();
          await read.response;
        }
      }
      await route.fulfill({
        status: failReads ? (deniedReads ? 403 : 503) : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          failReads
            ? {
                status: deniedReads ? 403 : 503,
                code: 'E2E_READ_UNAVAILABLE',
                title: 'Read unavailable',
                detail: 'Retry the authorized read.',
                type: 'about:blank',
              }
            : path === root
              ? { items: [collection()], hasMore: false, nextCursor: null }
              : collection(),
        ),
      });
      return;
    }
    if (
      request.method() === 'PATCH' &&
      path === `${root}/${PRIVATE_COLLECTION_ID}/items/${PRIVATE_ITEM_ID}`
    ) {
      const body = request.postDataJSON() as { completed: boolean };
      writes.push({
        ifMatch: request.headers()['if-match'],
        completed: body.completed,
      });
      await new Promise<void>((release) => {
        waiting = {
          route,
          release,
          completed: body.completed,
          item: { ...items[0] },
        };
      });
      return;
    }
    await route.fallback();
  });
  return {
    writes,
    items,
    detailReads: () => detailReads,
    denyReads: () => {
      failReads = true;
      deniedReads = true;
    },
    reorder: () => {
      version += 1;
      for (const item of items)
        item.position = items.length - 1 - item.position;
    },
    holdNextDetailRead: () => {
      let started!: () => void;
      let release!: () => void;
      const received = new Promise<void>((resolve) => {
        started = resolve;
      });
      const response = new Promise<void>((resolve) => {
        release = resolve;
      });
      nextDetailRead = { started, response };
      return { received, release };
    },
    failReads: (fail: boolean) => {
      failReads = fail;
    },
    respond: async (status = 200) => {
      const pending = waiting;
      if (!pending) throw new Error('No private item write is waiting.');
      waiting = null;
      const saved = {
        ...pending.item,
        completed: pending.completed,
        version: pending.item.version + 1,
      };
      if (status === 200 && items[0].version < saved.version) {
        items[0].completed = saved.completed;
        items[0].version = saved.version;
      }
      await pending.route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          status === 200
            ? saved
            : {
                status,
                code:
                  status === 409 ? 'VERSION_CONFLICT' : 'E2E_WRITE_UNAVAILABLE',
                title: 'Write unavailable',
                detail: 'Recover the current item.',
                type: 'about:blank',
              },
        ),
      });
      pending.release();
    },
  };
}

const feedbackViews = [
  { name: '390-light', width: 390, height: 844, theme: 'light', count: 3 },
  { name: '390-dark-sparse', width: 390, height: 844, theme: 'dark', count: 1 },
  {
    name: '360-light-dense',
    width: 360,
    height: 844,
    theme: 'light',
    count: 6,
  },
  { name: '430-light', width: 430, height: 932, theme: 'light', count: 3 },
  {
    name: '320-dark-200pct',
    width: 320,
    height: 844,
    theme: 'dark',
    count: 3,
    largeText: true,
  },
  { name: '1280-light', width: 1280, height: 900, theme: 'light', count: 3 },
] as const;

for (const view of feedbackViews) {
  test(`private checklist responds before confirmation in ${view.name}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({
      colorScheme: view.theme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() => {
      window.localStorage.setItem('eimir.theme', 'system');
    });
    await page.setViewportSize({ width: view.width, height: view.height });
    const unexpectedRequests = await signInAndOpenPrivateArea(page);
    const fixture = await installHeldPrivateList(page, view.count);
    await page.goto(`/more/private/collections/${PRIVATE_COLLECTION_ID}`);
    await expect(
      page.getByRole('heading', { name: 'Travel preparations' }),
    ).toBeVisible();
    if ('largeText' in view)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    const row = page.locator(`[data-sortable-item-id="${PRIVATE_ITEM_ID}"]`);
    const toggle = row.getByRole('button');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toBeDisabled();
    await expect(row.getByRole('status')).toHaveText(de.common.saving);
    await expect(
      page.getByRole('button', { name: de.common.edit, exact: true }),
    ).toBeDisabled();
    await expect.poll(() => fixture.writes.length).toBe(1);
    expect(fixture.writes[0]).toEqual({ ifMatch: '1', completed: true });
    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: testInfo.outputPath(`private-list-pending-${view.name}.png`),
      fullPage: true,
    });
    await expectNoWcagViolations(page);
    await fixture.respond();
    await expect(row.getByRole('status')).toHaveCount(0);
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect.poll(() => fixture.writes.length).toBe(2);
    expect(fixture.writes[1]).toEqual({ ifMatch: '2', completed: false });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await fixture.respond();
    await expect(toggle).toBeEnabled();
    await page
      .getByRole('link', {
        name: privateArea.collections.detailBack,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/more\/private\/collections$/);
    await expect(
      page.getByRole('link', { name: 'Travel preparations' }),
    ).toBeVisible();
    expect(unexpectedRequests).toEqual([]);
  });
}

test('private checklist rolls back, refreshes a conflict and recovers a failed read without replay', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpectedRequests = await signInAndOpenPrivateArea(page);
  const fixture = await installHeldPrivateList(page);
  await page.goto(`/more/private/collections/${PRIVATE_COLLECTION_ID}`);
  const row = page.locator(`[data-sortable-item-id="${PRIVATE_ITEM_ID}"]`);
  const toggle = row.getByRole('button');
  await toggle.click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  await fixture.respond(500);
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(
    page.getByRole('button', { name: de.common.retry }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('private-list-rollback-390-light.png'),
    fullPage: true,
  });
  await expectNoWcagViolations(page);
  await page.getByRole('button', { name: de.common.retry }).click();
  expect(fixture.writes).toHaveLength(1);
  await toggle.click();
  await expect.poll(() => fixture.writes.length).toBe(2);
  fixture.items[0].completed = true;
  fixture.items[0].version = 7;
  await fixture.respond(409);
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByText(de.states.conflict.title, { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('private-list-conflict-390-light.png'),
    fullPage: true,
  });
  await toggle.click();
  await expect.poll(() => fixture.writes.length).toBe(3);
  expect(fixture.writes[2]).toEqual({ ifMatch: '7', completed: false });
  fixture.failReads(true);
  await fixture.respond(500);
  await expect(toggle).toBeDisabled();
  await expect(row).toContainText('Book train tickets');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: de.common.retry }).first(),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('private-list-read-recovery-390-light.png'),
    fullPage: true,
  });
  fixture.failReads(false);
  await page.getByRole('button', { name: de.common.retry }).first().click();
  await expect(toggle).toBeEnabled();
  expect(fixture.writes).toHaveLength(3);
  expect(unexpectedRequests).toEqual([]);
});

for (const view of [
  { name: '390-light', width: 390, theme: 'light' },
  { name: '1280-dark', width: 1280, theme: 'dark' },
] as const) {
  for (const change of ['order', 'item'] as const) {
    test(`private completion preserves a newer ${change} in ${view.name}`, async ({
      page,
      context,
    }, testInfo) => {
      await page.setViewportSize({ width: view.width, height: 900 });
      await page.emulateMedia({
        colorScheme: view.theme,
        reducedMotion: 'reduce',
      });
      await page.addInitScript(() =>
        window.localStorage.setItem('eimir.theme', 'system'),
      );
      await page.clock.install();
      const unexpected = await signInAndOpenPrivateArea(page);
      const fixture = await installHeldPrivateList(page);
      await page.goto(`/more/private/collections/${PRIVATE_COLLECTION_ID}`);
      const row = page.locator(`[data-sortable-item-id="${PRIVATE_ITEM_ID}"]`);
      const toggle = row.getByRole('button');
      await toggle.click();
      await expect.poll(() => fixture.writes.length).toBe(1);
      if (change === 'order') fixture.reorder();
      else
        Object.assign(fixture.items[0], {
          title: 'Tickets updated elsewhere',
          version: 5,
          completed: false,
        });
      await context.setOffline(true);
      await page.clock.fastForward(61_000);
      await context.setOffline(false);
      await expect.poll(() => fixture.detailReads()).toBe(2);
      if (change === 'item') {
        await expect(row).toContainText('Tickets updated elsewhere');
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await expect(row.getByRole('status')).toHaveCount(0);
      }
      const recovery = fixture.holdNextDetailRead();
      await fixture.respond();
      await recovery.received;
      await expect(row.getByRole('status')).toHaveCount(0);
      await expect(toggle).toHaveAttribute(
        'aria-pressed',
        change === 'order' ? 'true' : 'false',
      );
      if (change === 'order')
        await expect(
          page.locator('[data-sortable-item-id]').first(),
        ).toHaveAttribute('data-sortable-item-id', fixture.items[2].id);
      else await expect(row).toContainText('Tickets updated elsewhere');
      await expectNoHorizontalOverflow(page);
      await expectNoWcagViolations(page);
      await page.screenshot({
        path: testInfo.outputPath(
          `private-completion-newer-${change}-${view.name}.png`,
        ),
        fullPage: true,
        animations: 'disabled',
      });
      recovery.release();
      await expect(toggle).toBeEnabled();
      await toggle.click();
      await expect.poll(() => fixture.writes.length).toBe(2);
      expect(fixture.writes[1].ifMatch).toBe(change === 'order' ? '2' : '5');
      await fixture.respond();
      await expect(toggle).toBeEnabled();
      await page
        .getByRole('link', {
          name: privateArea.collections.detailBack,
          exact: true,
        })
        .click();
      await page
        .getByRole('link', { name: 'Travel preparations', exact: true })
        .click();
      await expect(row).toBeVisible();
      expect(fixture.writes).toHaveLength(2);
      expect(unexpected).toEqual([]);
    });
  }
}

for (const outcome of ['success', 'failure'] as const) {
  test(`private completion respects a newer denied read after late ${outcome}`, async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize({
      width: outcome === 'success' ? 390 : 1280,
      height: 900,
    });
    await page.emulateMedia({
      colorScheme: outcome === 'success' ? 'light' : 'dark',
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await page.clock.install();
    const unexpected = await signInAndOpenPrivateArea(page);
    const fixture = await installHeldPrivateList(page);
    await page.goto(`/more/private/collections/${PRIVATE_COLLECTION_ID}`);
    await page
      .getByRole('button', { name: privateArea.collections.markComplete })
      .first()
      .click();
    await expect.poll(() => fixture.writes.length).toBe(1);
    fixture.denyReads();
    await context.setOffline(true);
    await page.clock.fastForward(61_000);
    await context.setOffline(false);
    await expect(
      page.getByText(de.states.permission.title, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Book train tickets', { exact: true }),
    ).toHaveCount(0);
    const before = fixture.detailReads();
    const recovery = fixture.holdNextDetailRead();
    await fixture.respond(outcome === 'success' ? 200 : 503);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await expect(
      page.getByText('Book train tickets', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(de.states.permission.title, { exact: true }),
    ).toBeVisible();
    expect(fixture.detailReads()).toBe(before);
    expect(fixture.writes).toHaveLength(1);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`private-completion-denied-${outcome}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    recovery.release();
    expect(unexpected).toEqual([]);
  });
}

async function installHeldPrivateReorder(page: Page, count = 3) {
  const list = await installHeldPrivateList(page, count);
  let version = 1;
  let failReads = false;
  let deniedReads = false;
  let detailReads = 0;
  let nextDetailRead: {
    started: () => void;
    response: Promise<void>;
  } | null = null;
  const collection = () => ({
    id: PRIVATE_COLLECTION_ID,
    ownerId: ACCOUNT_ID,
    spaceId: SPACE_ID,
    title: 'Travel preparations',
    version,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    items: list.items,
  });
  const writes: { ifMatch: string | undefined; itemIds: string[] }[] = [];
  let waiting: { route: Route; release: () => void; itemIds: string[] } | null =
    null;
  const root = `/api/v1/spaces/${SPACE_ID}/private/collections`;
  await page.route(`**${root}**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      if (path === `${root}/${PRIVATE_COLLECTION_ID}`) detailReads += 1;
      if (path === `${root}/${PRIVATE_COLLECTION_ID}` && nextDetailRead) {
        const read = nextDetailRead;
        nextDetailRead = null;
        read.started();
        await read.response;
      }
      await route.fulfill({
        status: failReads ? (deniedReads ? 403 : 503) : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          failReads
            ? {
                status: deniedReads ? 403 : 503,
                title: 'Read unavailable',
                code: 'E2E_READ_UNAVAILABLE',
                type: 'about:blank',
              }
            : path === root
              ? { items: [collection()], hasMore: false, nextCursor: null }
              : collection(),
        ),
      });
      return;
    }
    if (
      request.method() === 'PUT' &&
      path === `${root}/${PRIVATE_COLLECTION_ID}/order`
    ) {
      const { itemIds } = request.postDataJSON() as { itemIds: string[] };
      writes.push({ ifMatch: request.headers()['if-match'], itemIds });
      await new Promise<void>((release) => {
        waiting = { route, release, itemIds };
      });
      return;
    }
    await route.fallback();
  });
  return {
    items: list.items,
    writes,
    detailReads: () => detailReads,
    denyReads: () => {
      failReads = true;
      deniedReads = true;
    },
    holdNextDetailRead: () => {
      let started!: () => void;
      let release!: () => void;
      const received = new Promise<void>((resolve) => {
        started = resolve;
      });
      const response = new Promise<void>((resolve) => {
        release = resolve;
      });
      nextDetailRead = { started, response };
      return { received, release };
    },
    failReads: (fail: boolean) => {
      failReads = fail;
    },
    setVersion: (next: number) => {
      version = next;
    },
    respond: async (status = 200) => {
      const pending = waiting;
      if (!pending) throw new Error('No private reorder is waiting.');
      waiting = null;
      if (status === 200) {
        for (const item of list.items)
          item.position = pending.itemIds.indexOf(item.id);
        version += 1;
      }
      await pending.route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          status === 200
            ? collection()
            : {
                status,
                code:
                  status === 409 ? 'VERSION_CONFLICT' : 'E2E_WRITE_UNAVAILABLE',
                title: 'Write unavailable',
                type: 'about:blank',
              },
        ),
      });
      pending.release();
    },
  };
}

async function privateEditTitles(page: Page) {
  return page
    .getByLabel(privateArea.collections.rename)
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
}

async function capturePrivateReorder(page: Page, path: string) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return window.scrollY;
      }),
    )
    .toBe(0);
  await page.screenshot({ path, fullPage: true });
}

for (const view of feedbackViews) {
  test(`private reorder stays in place before confirmation in ${view.name}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({
      colorScheme: view.theme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await page.setViewportSize({ width: view.width, height: view.height });
    const unexpectedRequests = await signInAndOpenPrivateArea(page);
    const fixture = await installHeldPrivateReorder(
      page,
      Math.max(2, view.count),
    );
    await page.goto(`/more/private/collections/${PRIVATE_COLLECTION_ID}`);
    await page
      .getByRole('button', { name: de.common.edit, exact: true })
      .click();
    if ('largeText' in view)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    const before = await privateEditTitles(page);
    const handle = page
      .getByRole('button', { name: privateArea.collections.reorderItem })
      .nth(1);
    await handle.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    const after = [before[1], before[0], ...before.slice(2)];
    await expect.poll(() => privateEditTitles(page)).toEqual(after);
    await expect.poll(() => fixture.writes.length).toBe(1);
    expect(fixture.writes[0]).toEqual({
      ifMatch: '1',
      itemIds: [
        fixture.items[1].id,
        fixture.items[0].id,
        ...fixture.items.slice(2).map((item) => item.id),
      ],
    });
    await expect(handle).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText(
      privateArea.collections.reordering,
    );
    await expect(
      page.getByPlaceholder(privateArea.collections.itemTitleLabel),
    ).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    await capturePrivateReorder(
      page,
      testInfo.outputPath(`private-reorder-pending-${view.name}.png`),
    );
    await expectNoWcagViolations(page);
    await fixture.respond();
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(handle).toBeEnabled();
    await expect.poll(() => privateEditTitles(page)).toEqual(after);
    const first = page
      .getByRole('button', { name: privateArea.collections.reorderItem })
      .first();
    await first.focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => fixture.writes.length).toBe(2);
    expect(fixture.writes[1].ifMatch).toBe('2');
    await expect.poll(() => privateEditTitles(page)).toEqual(before);
    await fixture.respond();
    await expect(first).toBeEnabled();
    await page
      .getByRole('button', { name: de.common.cancel, exact: true })
      .first()
      .click();
    await expect(page.getByLabel(privateArea.collections.rename)).toHaveCount(
      0,
    );
    await page
      .getByRole('link', {
        name: privateArea.collections.detailBack,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/more\/private\/collections$/);
    expect(unexpectedRequests).toEqual([]);
  });
}

for (const outcome of ['success', 'failure'] as const) {
  test(`private reorder respects a newer denied read after late ${outcome}`, async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize({
      width: outcome === 'success' ? 390 : 1280,
      height: 844,
    });
    await page.emulateMedia({
      colorScheme: outcome === 'success' ? 'light' : 'dark',
      reducedMotion: 'reduce',
    });
    await page.clock.install();
    const unexpected = await signInAndOpenPrivateArea(page);
    const fixture = await installHeldPrivateReorder(page);
    await page.goto(`/more/private/collections/${PRIVATE_COLLECTION_ID}`);
    await page
      .getByRole('button', { name: de.common.edit, exact: true })
      .click();
    await page
      .getByRole('button', { name: privateArea.collections.reorderItem })
      .nth(1)
      .focus();
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => fixture.writes.length).toBe(1);
    fixture.denyReads();
    await context.setOffline(true);
    await page.clock.fastForward(61_000);
    await context.setOffline(false);
    await expect(
      page.getByText(de.states.permission.title, { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(privateArea.collections.rename)).toHaveCount(
      0,
    );
    const before = fixture.detailReads();
    const recovery = fixture.holdNextDetailRead();
    await fixture.respond(outcome === 'success' ? 200 : 503);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await expect(page.getByLabel(privateArea.collections.rename)).toHaveCount(
      0,
    );
    await expect(
      page.getByText(de.states.permission.title, { exact: true }),
    ).toBeVisible();
    expect(fixture.detailReads()).toBe(before);
    expect(fixture.writes).toHaveLength(1);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`private-order-denied-${outcome}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    recovery.release();
    expect(unexpected).toEqual([]);
  });
}

test('private pointer reorder survives release and retains the existing title draft', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpectedRequests = await signInAndOpenPrivateArea(page);
  const fixture = await installHeldPrivateReorder(page);
  await page.goto(`/more/private/collections/${PRIVATE_COLLECTION_ID}`);
  await page.getByRole('button', { name: de.common.edit, exact: true }).click();
  const draft = page.getByLabel(privateArea.collections.titleLabel);
  await draft.fill('My travel draft');
  const rows = page.locator('[data-sortable-item-id]');
  await rows.first().scrollIntoViewIfNeeded();
  const handle = rows
    .nth(1)
    .getByRole('button', { name: privateArea.collections.reorderItem });
  await handle.evaluate((element) =>
    element.scrollIntoView({ block: 'center' }),
  );
  const start = await handle.boundingBox();
  const target = await rows.first().boundingBox();
  if (!start || !target) throw new Error('Private drag rows are not visible.');
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, target.y + 8, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(() => privateEditTitles(page))
    .toEqual([
      'Pack the photo album',
      'Book train tickets',
      'Bring favourite snacks',
    ]);
  await expect.poll(() => fixture.writes.length).toBe(1);
  await expect(page.getByRole('status')).toHaveText(
    privateArea.collections.reordering,
  );
  await expect(draft).toHaveValue('My travel draft');
  await expect(
    page.getByRole('button', { name: m5s3.common.saveChanges }),
  ).toBeDisabled();
  await capturePrivateReorder(
    page,
    testInfo.outputPath('private-reorder-pointer-390-dark.png'),
  );
  await fixture.respond();
  await expect(handle).toBeEnabled();
  await expect(draft).toHaveValue('My travel draft');
  expect(unexpectedRequests).toEqual([]);
});

for (const recoveryMode of ['immediate', 'held'] as const) {
  test(`private reorder rolls back and recovers conflicts and read failures without replay (${recoveryMode} recovery)`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    const unexpectedRequests = await signInAndOpenPrivateArea(page);
    const fixture = await installHeldPrivateReorder(page);
    await page.goto(`/more/private/collections/${PRIVATE_COLLECTION_ID}`);
    await page
      .getByRole('button', { name: de.common.edit, exact: true })
      .click();
    const before = await privateEditTitles(page);
    const draft = page.getByLabel(privateArea.collections.titleLabel);
    await draft.fill('My travel draft');
    const handle = page
      .locator(`[data-sortable-item-id="${fixture.items[1].id}"]`)
      .getByRole('button', { name: privateArea.collections.reorderItem });
    const retry = page.getByRole('button', { name: de.common.retry });
    const move = async () => {
      await expect(handle).toBeEnabled();
      await handle.focus();
      await expect(handle).toBeFocused();
      await page.keyboard.press('ArrowUp');
    };
    await move();
    await expect.poll(() => fixture.writes.length).toBe(1);
    await fixture.respond(500);
    await expect(
      page
        .getByRole('button', { name: privateArea.collections.reorderItem })
        .first(),
    ).toBeEnabled();
    await expect.poll(() => privateEditTitles(page)).toEqual(before);
    await expect(retry).toBeVisible();
    await expect(draft).toHaveValue('My travel draft');
    await capturePrivateReorder(
      page,
      testInfo.outputPath('private-reorder-rollback-390-light.png'),
    );
    await expectNoWcagViolations(page);
    const retryRead =
      recoveryMode === 'held' ? fixture.holdNextDetailRead() : null;
    await retry.click();
    if (retryRead) {
      await retryRead.received;
      await expect(handle).toBeDisabled();
      await expect(retry).toBeVisible();
      await expect(draft).toHaveValue('My travel draft');
      expect(fixture.writes).toHaveLength(1);
      retryRead.release();
    }
    expect(fixture.writes).toHaveLength(1);
    // Enabled can still describe the state before Retry's read is observed.
    // Removing the error action confirms that this recovery has settled.
    await expect(retry).toHaveCount(0);
    await move();
    await expect.poll(() => fixture.writes.length).toBe(2);
    fixture.setVersion(7);
    await fixture.respond(409);
    await expect(
      page
        .getByRole('button', { name: privateArea.collections.reorderItem })
        .first(),
    ).toBeEnabled();
    await expect(
      page.getByText(de.states.conflict.title, { exact: true }),
    ).toBeVisible();
    await expect.poll(() => privateEditTitles(page)).toEqual(before);
    await expect(draft).toHaveValue('My travel draft');
    expect(fixture.writes).toHaveLength(2);
    await move();
    await expect.poll(() => fixture.writes.length).toBe(3);
    expect(fixture.writes[2].ifMatch).toBe('7');
    fixture.failReads(true);
    await fixture.respond(500);
    await expect(retry).toHaveCount(2);
    await expect(
      page
        .getByRole('button', { name: privateArea.collections.reorderItem })
        .first(),
    ).toBeDisabled();
    await expect.poll(() => privateEditTitles(page)).toEqual(before);
    await expect(draft).toHaveValue('My travel draft');
    await expectNoHorizontalOverflow(page);
    await capturePrivateReorder(
      page,
      testInfo.outputPath('private-reorder-read-recovery-390-light.png'),
    );
    fixture.failReads(false);
    const failedReadRecovery =
      recoveryMode === 'held' ? fixture.holdNextDetailRead() : null;
    await retry.first().click();
    if (failedReadRecovery) {
      await failedReadRecovery.received;
      await expect(handle).toBeDisabled();
      expect(fixture.writes).toHaveLength(3);
      failedReadRecovery.release();
    }
    await expect(retry).toHaveCount(1);
    await expect(handle).toBeEnabled();
    await handle.focus();
    await expect(handle).toBeFocused();
    await expect(draft).toHaveValue('My travel draft');
    await expect.poll(() => privateEditTitles(page)).toEqual(before);
    expect(fixture.writes).toHaveLength(3);
    expect(fixture.writes.map((write) => write.ifMatch)).toEqual([
      '1',
      '1',
      '7',
    ]);
    expect(unexpectedRequests).toEqual([]);
  });
}

for (const view of [
  { name: '390-light', width: 390, scheme: 'light' },
  { name: '1280-dark', width: 1280, scheme: 'dark' },
] as const) {
  for (const action of ['checkbox', 'reorder'] as const) {
    test(`offline private ${action} ends without reconnect replay at ${view.name}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: view.width, height: 900 });
      await page.emulateMedia({
        colorScheme: view.scheme,
        reducedMotion: 'reduce',
      });
      await page.addInitScript(() =>
        localStorage.setItem('eimir.theme', 'system'),
      );
      const unexpected = await signInAndOpenPrivateArea(page);
      const fixture =
        action === 'checkbox'
          ? await installHeldPrivateList(page)
          : await installHeldPrivateReorder(page);
      await page.goto(`/more/private/collections/${PRIVATE_COLLECTION_ID}`);
      const row = page.locator(`[data-sortable-item-id="${PRIVATE_ITEM_ID}"]`);
      if (action === 'reorder')
        await page
          .getByRole('button', { name: de.common.edit, exact: true })
          .click();
      const before = action === 'reorder' ? await privateEditTitles(page) : [];
      const activate = async () => {
        if (action === 'checkbox') await row.getByRole('button').click();
        else {
          await page
            .getByRole('button', { name: privateArea.collections.reorderItem })
            .nth(1)
            .focus();
          await page.keyboard.press('ArrowUp');
        }
      };
      await expect(row).toBeVisible();
      await page.context().setOffline(true);
      await activate();
      await expect(
        page.getByText(de.states.offline.title, { exact: true }),
      ).toBeVisible();
      if (action === 'checkbox')
        await expect(row.getByRole('button')).toHaveAttribute(
          'aria-pressed',
          'false',
        );
      else await expect.poll(() => privateEditTitles(page)).toEqual(before);
      expect(fixture.writes).toHaveLength(0);
      await expectNoHorizontalOverflow(page);
      await expectNoWcagViolations(page);
      await page.screenshot({
        path: testInfo.outputPath(`private-${action}-offline-${view.name}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      await page.context().setOffline(false);
      await page.getByRole('button', { name: de.common.retry }).click();
      await expect(
        page.getByText(de.states.offline.title, { exact: true }),
      ).toHaveCount(0);
      expect(fixture.writes).toHaveLength(0);
      await activate();
      await expect.poll(() => fixture.writes.length).toBe(1);
      await fixture.respond();
      if (action === 'checkbox') {
        await expect(row.getByRole('button')).toBeEnabled();
        await expect(row.getByRole('button')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
      } else {
        await expect(
          page.getByText(privateArea.collections.reordering, { exact: true }),
        ).toHaveCount(0);
        await expect
          .poll(() => privateEditTitles(page))
          .toEqual([before[1], before[0], ...before.slice(2)]);
        await page
          .getByRole('button', { name: de.common.cancel, exact: true })
          .first()
          .click();
      }
      await page.screenshot({
        path: testInfo.outputPath(
          `private-${action}-confirmed-${view.name}.png`,
        ),
        fullPage: true,
        animations: 'disabled',
      });
      await page
        .getByRole('link', {
          name: privateArea.collections.detailBack,
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/\/more\/private\/collections$/);
      expect(fixture.writes).toHaveLength(1);
      expect(unexpected).toEqual([]);
    });
  }
}

const privateCreateCases = [
  { kind: 'notes', copy: privateArea.notes },
  { kind: 'gift-ideas', copy: privateArea.gifts },
  { kind: 'collections', copy: privateArea.collections },
] as const;

async function installHeldPrivateCreate(page: Page, kind: string) {
  const endpoint = `/api/v1/spaces/${SPACE_ID}/private/${kind}`;
  const id = '77777777-7777-4777-8777-777777777777';
  let current: Record<string, unknown> | null = null;
  const writes: Record<string, unknown>[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let finish!: () => void;
  const settled = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === endpoint) {
      const submitted = request.postDataJSON() as Record<string, unknown>;
      writes.push(submitted);
      await gate;
      current = {
        id,
        ownerId: ACCOUNT_ID,
        spaceId: SPACE_ID,
        capabilities: { canComment: false, canDelete: true, canEdit: true },
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
        version: 1,
        body: '',
        pinned: false,
        items: [],
        description: null,
        recipient: null,
        occasion: null,
        targetOn: null,
        priceText: null,
        url: null,
        status: 'IDEA',
        ...submitted,
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(current),
      });
      finish();
      return;
    }
    if (request.method() === 'GET' && path === endpoint) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hasMore: false,
          items: current ? [current] : [],
          nextCursor: null,
        }),
      });
      return;
    }
    if (request.method() === 'GET' && path === `${endpoint}/${id}` && current) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(current),
      });
      return;
    }
    await route.fallback();
  });
  return { endpoint, id, writes, release, settled };
}

for (const view of [
  { name: '390-light', width: 390, scheme: 'light' },
  { name: '1280-dark', width: 1280, scheme: 'dark' },
] as const) {
  for (const definition of privateCreateCases) {
    test(`private ${definition.kind} create preserves result and return at ${view.name}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: view.width, height: 900 });
      await page.emulateMedia({
        colorScheme: view.scheme,
        reducedMotion: 'reduce',
      });
      await page.addInitScript(() =>
        localStorage.setItem('eimir.theme', 'system'),
      );
      const unexpected = await signInAndOpenPrivateArea(page);
      const fixture = await installHeldPrivateCreate(page, definition.kind);
      await page
        .getByRole('link', { name: definition.copy.title, exact: false })
        .click();
      await page
        .getByRole('link', { name: definition.copy.add, exact: true })
        .click();
      const title = `Personal ${definition.kind} plan`;
      await page
        .getByLabel(definition.copy.titleLabel, { exact: true })
        .fill(title);
      await page
        .getByRole('button', { name: privateArea.save, exact: true })
        .click();
      await expect.poll(() => fixture.writes.length).toBe(1);
      await expect(
        page.getByRole('button', { name: privateArea.saving, exact: true }),
      ).toBeDisabled();
      fixture.release();
      await expect(page).toHaveURL(
        new RegExp(`/more/private/${definition.kind}/${fixture.id}$`),
      );
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectNoWcagViolations(page);
      await page.screenshot({
        path: testInfo.outputPath(
          `private-create-${definition.kind}-saved-${view.name}.png`,
        ),
        fullPage: true,
        animations: 'disabled',
      });
      await page
        .getByRole('link', { name: definition.copy.detailBack, exact: true })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/more/private/${definition.kind}$`),
      );
      await expect(
        page.getByRole('link', { name: new RegExp(title) }),
      ).toBeVisible();
      expect(fixture.writes).toHaveLength(1);
      expect(fixture.writes[0].title).toBe(title);
      expect(unexpected).toEqual([]);
    });

    test(`private ${definition.kind} create cannot redirect a replacement task at ${view.name}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: view.width, height: 900 });
      await page.emulateMedia({
        colorScheme: view.scheme,
        reducedMotion: 'reduce',
      });
      await page.addInitScript(() =>
        localStorage.setItem('eimir.theme', 'system'),
      );
      const unexpected = await signInAndOpenPrivateArea(page);
      const fixture = await installHeldPrivateCreate(page, definition.kind);
      const destination =
        definition.kind === 'notes'
          ? privateCreateCases[1]
          : privateCreateCases[0];
      await installHeldPrivateCreate(page, destination.kind);
      await page
        .getByRole('link', { name: definition.copy.title, exact: false })
        .click();
      await page
        .getByRole('link', { name: definition.copy.add, exact: true })
        .click();
      await page
        .getByLabel(definition.copy.titleLabel, { exact: true })
        .fill('Previous task private title');
      await page
        .getByRole('button', { name: privateArea.save, exact: true })
        .click();
      await expect.poll(() => fixture.writes.length).toBe(1);
      await page
        .getByRole('navigation', {
          name: privateArea.navigation.aria,
          exact: true,
        })
        .getByRole('link', { name: destination.copy.title, exact: true })
        .click();
      await expect(
        page.getByRole('heading', {
          name: destination.copy.title,
          exact: true,
        }),
      ).toBeVisible();
      const destinationUrl = page.url();
      const response = page.waitForResponse(
        (entry) =>
          entry.request().method() === 'POST' &&
          new URL(entry.url()).pathname === fixture.endpoint,
      );
      fixture.release();
      await (await response).finished();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          ),
      );
      await expect(page).toHaveURL(destinationUrl);
      await expect(
        page.getByRole('heading', {
          name: destination.copy.title,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', {
          name: 'Previous task private title',
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByRole('navigation', {
          name: privateArea.navigation.aria,
          exact: true,
        })
        .getByRole('link', { name: definition.copy.title, exact: true })
        .click();
      await expect(
        page.getByRole('link', { name: /Previous task private title/ }),
      ).toBeVisible();
      await page
        .getByRole('link', { name: definition.copy.add, exact: true })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/more/private/${definition.kind}/new$`),
      );
      await expect(
        page.getByRole('heading', {
          name: definition.copy.createTitle,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByLabel(definition.copy.titleLabel, { exact: true }),
      ).toHaveValue('');
      await expectNoHorizontalOverflow(page);
      await expectNoWcagViolations(page);
      if (definition.kind === 'gift-ideas')
        await page.screenshot({
          path: testInfo.outputPath(
            `private-create-${definition.kind}-fresh-task-${view.name}.png`,
          ),
          fullPage: true,
          animations: 'disabled',
        });
      expect(fixture.writes).toHaveLength(1);
      expect(unexpected).toEqual([]);
    });
  }

  test(`private note create completes real sign-out before returning to a fresh task at ${view.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    await page.emulateMedia({
      colorScheme: view.scheme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const unexpected = await signInAndOpenPrivateArea(page);
    const fixture = await installHeldPrivateCreate(page, 'notes');
    await page
      .getByRole('link', { name: privateArea.notes.title, exact: false })
      .click();
    await page
      .getByRole('link', { name: privateArea.notes.add, exact: true })
      .click();
    await page
      .getByLabel(privateArea.notes.titleLabel, { exact: true })
      .fill('Previous session private title');
    await page
      .getByRole('button', { name: privateArea.save, exact: true })
      .click();
    await expect.poll(() => fixture.writes.length).toBe(1);
    await signOutToPublicEntry(page);
    fixture.release();
    await fixture.settled;
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel(de.login.email)).toBeVisible();
    await signInAgain(page);
    await page.goto('/more/private/notes/new');
    await expect(
      page.getByRole('heading', {
        name: privateArea.notes.createTitle,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel(privateArea.notes.titleLabel, { exact: true }),
    ).toHaveValue('');
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `private-create-session-ended-${view.name}.png`,
      ),
      fullPage: true,
      animations: 'disabled',
    });
    expect(fixture.writes).toHaveLength(1);
    expect(unexpected).toEqual([]);
  });
}

async function installHeldPrivateNoteEdit(page: Page) {
  const endpoint = `/api/v1/spaces/${SPACE_ID}/private/notes/${PRIVATE_NOTE_ID}`;
  let current = {
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
  let denyReads = false;
  let holdReads = false;
  let releaseReads!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  let reads = 0;
  const writes: { ifMatch: string | undefined; title: string }[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let finish!: () => void;
  const settled = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route(`**${endpoint}`, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      reads += 1;
      if (holdReads) await readGate;
      await route.fulfill({
        status: denyReads ? 404 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          denyReads
            ? {
                code: 'PRIVATE_NOTE_NOT_FOUND',
                detail: 'The private note is unavailable.',
                status: 404,
                title: 'Not found',
                type: 'about:blank',
              }
            : current,
        ),
      });
      return;
    }
    if (request.method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    const update = request.postDataJSON() as {
      title: string;
      body: string;
      pinned: boolean;
    };
    writes.push({
      ifMatch: request.headers()['if-match'],
      title: update.title,
    });
    const saved = { ...current, ...update, version: current.version + 1 };
    await gate;
    current = saved;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(saved),
    });
    finish();
  });
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/private/notes?*`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hasMore: false,
          items: [current],
          nextCursor: null,
        }),
      });
    },
  );
  return {
    writes,
    release,
    settled,
    denyReads: () => {
      denyReads = true;
    },
    holdReads: () => {
      holdReads = true;
    },
    releaseReads,
    get reads() {
      return reads;
    },
  };
}

for (const view of [
  { name: '390-light', width: 390, scheme: 'light' },
  { name: '1280-dark', width: 1280, scheme: 'dark' },
] as const) {
  test(`private note save retains authorized result and return at ${view.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    await page.emulateMedia({
      colorScheme: view.scheme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const unexpected = await signInAndOpenPrivateArea(page);
    const fixture = await installHeldPrivateNoteEdit(page);
    await page
      .getByRole('link', { name: privateArea.notes.title, exact: false })
      .click();
    await page.getByRole('link', { name: /Hidden cabin idea/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Hidden cabin idea' }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: privateArea.edit, exact: true })
      .click();
    await page
      .getByLabel(privateArea.notes.titleLabel)
      .fill('Quiet cabin for autumn');
    await page
      .getByRole('button', { name: privateArea.save, exact: true })
      .click();
    await expect.poll(() => fixture.writes.length).toBe(1);
    expect(fixture.writes).toEqual([
      { ifMatch: '1', title: 'Quiet cabin for autumn' },
    ]);
    await expect(
      page.getByRole('button', { name: privateArea.saving, exact: true }),
    ).toBeDisabled();
    fixture.release();
    await expect(
      page.getByRole('heading', { name: 'Quiet cabin for autumn' }),
    ).toBeVisible();
    await expect(
      page.getByText('Check the quiet cabin by the lake.', { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/more/private/notes/${PRIVATE_NOTE_ID}$`),
    );
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`private-area-note-saved-${view.name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page
      .getByRole('link', { name: privateArea.notes.detailBack, exact: true })
      .click();
    await expect(page).toHaveURL(/\/more\/private\/notes$/);
    await expect(
      page.getByRole('link', { name: /Quiet cabin for autumn/ }),
    ).toBeVisible();
    expect(fixture.writes).toHaveLength(1);
    expect(unexpected).toEqual([]);
  });

  test(`late private note save preserves a fresh denied read at ${view.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    await page.emulateMedia({
      colorScheme: view.scheme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const unexpected = await signInAndOpenPrivateArea(page);
    const fixture = await installHeldPrivateNoteEdit(page);
    await page
      .getByRole('link', { name: privateArea.notes.title, exact: false })
      .click();
    await page.getByRole('link', { name: /Hidden cabin idea/ }).click();
    await page
      .getByRole('link', { name: privateArea.edit, exact: true })
      .click();
    await page
      .getByLabel(privateArea.notes.titleLabel)
      .fill('Submitted old private title');
    await page
      .getByRole('button', { name: privateArea.save, exact: true })
      .click();
    await expect.poll(() => fixture.writes.length).toBe(1);
    fixture.denyReads();
    await page
      .locator('.private-area-nav')
      .getByRole('link', {
        name: privateArea.navigation.notes,
        exact: true,
      })
      .click();
    // Reopen after the documented one-minute freshness window to obtain a new read.
    await page.clock.setSystemTime(
      await page.evaluate(() => Date.now() + 60_001),
    );
    await page.getByRole('link', { name: /Hidden cabin idea/ }).click();
    await expect(
      page.getByText(de.states.permission.title, { exact: true }),
    ).toBeVisible();
    // A slow recovery must not conceal a stale save reviving denied content.
    fixture.holdReads();
    const response = page.waitForResponse(
      (entry) =>
        entry.request().method() === 'PATCH' &&
        entry.url().endsWith(`/private/notes/${PRIVATE_NOTE_ID}`),
    );
    fixture.release();
    await (await response).finished();
    // A rendering boundary observes the completed fetch's mutation callbacks.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await expect(
      page.getByText(de.states.permission.title, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Check the quiet cabin by the lake.', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Submitted old private title' }),
    ).toHaveCount(0);
    fixture.releaseReads();
    const reads = fixture.reads;
    await page
      .getByRole('button', { name: de.common.retry, exact: true })
      .click();
    await expect.poll(() => fixture.reads).toBeGreaterThan(reads);
    await expect(
      page.getByText(de.states.permission.title, { exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`private-area-note-denied-${view.name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    expect(fixture.writes).toHaveLength(1);
    expect(unexpected).toEqual([]);
  });

  test(`private note save cannot revive a signed-out session at ${view.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    await page.emulateMedia({
      colorScheme: view.scheme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const unexpected = await signInAndOpenPrivateArea(page);
    const fixture = await installHeldPrivateNoteEdit(page);
    await page
      .getByRole('link', { name: privateArea.notes.title, exact: false })
      .click();
    await page.getByRole('link', { name: /Hidden cabin idea/ }).click();
    await page
      .getByRole('link', { name: privateArea.edit, exact: true })
      .click();
    await page
      .getByLabel(privateArea.notes.titleLabel)
      .fill('Old session private title');
    await page
      .getByRole('button', { name: privateArea.save, exact: true })
      .click();
    await expect.poll(() => fixture.writes.length).toBe(1);

    fixture.denyReads();
    await signOutToPublicEntry(page);
    fixture.release();
    await fixture.settled;
    await expect(page.getByLabel(de.login.email)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await signInAgain(page);
    await page.goto(`/more/private/notes/${PRIVATE_NOTE_ID}`);
    await expect(
      page.getByText(de.states.permission.title, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Check the quiet cabin by the lake.', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Old session private title' }),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`private-area-session-ended-${view.name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    expect(fixture.writes).toEqual([
      { ifMatch: '1', title: 'Old session private title' },
    ]);
    expect(unexpected).toEqual([]);
  });
}

async function installHeldPrivateDelete(
  page: Page,
  kind: 'notes' | 'gift-ideas' | 'collections',
) {
  const id = kind === 'collections' ? PRIVATE_COLLECTION_ID : PRIVATE_NOTE_ID;
  const endpoint = `/api/v1/spaces/${SPACE_ID}/private/${kind}`;
  const title = `Private ${kind} to delete`;
  const resource = {
    id,
    ownerId: ACCOUNT_ID,
    spaceId: SPACE_ID,
    title,
    version: 1,
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    body: 'A personal cabin idea',
    pinned: false,
    description: 'A private surprise',
    status: 'IDEA',
    items: [],
  };
  const writes: string[] = [];
  let release!: () => void;
  let finish!: () => void;
  let deleted = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const settled = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route(`**${endpoint}**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'DELETE' && path === `${endpoint}/${id}`) {
      writes.push(request.headers()['if-match'] ?? 'missing');
      await held;
      deleted = true;
      await route.fulfill({ status: 204 });
      finish();
    } else if (request.method() === 'GET' && path === endpoint) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hasMore: false,
          items: deleted ? [] : [resource],
          nextCursor: null,
        }),
      });
    } else if (request.method() === 'GET' && path === `${endpoint}/${id}`) {
      await route.fulfill({
        status: deleted ? 404 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          deleted
            ? {
                code: 'NOT_FOUND',
                status: 404,
                title: 'Not found',
                detail: 'Private resource unavailable',
                type: 'about:blank',
              }
            : resource,
        ),
      });
    } else await route.fallback();
  });
  return { id, endpoint, title, writes, release, settled };
}

for (const view of [
  { name: '390-light', width: 390, scheme: 'light' },
  { name: '1280-dark', width: 1280, scheme: 'dark' },
] as const) {
  for (const definition of privateCreateCases) {
    for (const leave of [false, true]) {
      test(`private ${definition.kind} delete ${leave ? 'cannot redirect another task' : 'retains confirmed result and return'} at ${view.name}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width: view.width, height: 900 });
        await page.emulateMedia({
          colorScheme: view.scheme,
          reducedMotion: 'reduce',
        });
        await page.addInitScript(() =>
          localStorage.setItem('eimir.theme', 'system'),
        );
        const unexpected = await signInAndOpenPrivateArea(page);
        const fixture = await installHeldPrivateDelete(page, definition.kind);
        await page
          .getByRole('link', { name: definition.copy.title, exact: false })
          .click();
        await page
          .getByRole('link', { name: new RegExp(fixture.title) })
          .click();
        if (definition.kind === 'collections')
          await page
            .getByRole('button', { name: de.common.edit, exact: true })
            .click();
        else
          await page
            .getByRole('link', { name: privateArea.edit, exact: true })
            .click();
        await page
          .getByRole('button', {
            name:
              definition.kind === 'collections'
                ? m5s3.common.delete
                : privateArea.delete,
            exact: true,
          })
          .click();
        await page
          .getByRole('button', {
            name:
              definition.kind === 'collections'
                ? m5s3.common.confirmDelete
                : privateArea.deleteConfirm,
            exact: true,
          })
          .click();
        await expect.poll(() => fixture.writes.length).toBe(1);
        expect(fixture.writes).toEqual(['1']);
        await expect(
          page.getByRole('button', {
            name:
              definition.kind === 'collections'
                ? m5s3.common.deleting
                : privateArea.deleting,
            exact: true,
          }),
        ).toBeDisabled();
        if (definition.kind !== 'collections') {
          await expect(
            page.getByRole('button', { name: privateArea.save, exact: true }),
          ).toBeDisabled();
        }
        if (definition.kind === 'notes' && !leave) {
          await expectNoWcagViolations(page);
          await page.screenshot({
            path: testInfo.outputPath(
              `private-delete-pending-${view.name}.png`,
            ),
            fullPage: true,
            animations: 'disabled',
          });
        }
        let destinationUrl = '';
        const destination =
          definition.kind === 'notes'
            ? privateCreateCases[1]
            : privateCreateCases[0];
        if (leave) {
          await installHeldPrivateDelete(page, destination.kind);
          await page
            .getByRole('navigation', {
              name: privateArea.navigation.aria,
              exact: true,
            })
            .getByRole('link', { name: destination.copy.title, exact: true })
            .click();
          await expect(
            page.getByRole('heading', {
              name: destination.copy.title,
              exact: true,
            }),
          ).toBeVisible();
          destinationUrl = page.url();
        }
        const response = page.waitForResponse(
          (entry) =>
            entry.request().method() === 'DELETE' &&
            new URL(entry.url()).pathname ===
              `${fixture.endpoint}/${fixture.id}`,
        );
        fixture.release();
        expect((await response).status()).toBe(204);
        await fixture.settled;
        if (leave) {
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve()),
              ),
          );
          await expect(page).toHaveURL(destinationUrl);
          await expect(
            page.getByRole('heading', {
              name: destination.copy.title,
              exact: true,
            }),
          ).toBeVisible();
        } else {
          await expect(page).toHaveURL(
            new RegExp(`/more/private/${definition.kind}$`),
          );
          await expect(
            page.getByRole('heading', {
              name: definition.copy.title,
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole('link', { name: new RegExp(fixture.title) }),
          ).toHaveCount(0);
        }
        await expectNoHorizontalOverflow(page);
        await expectNoWcagViolations(page);
        if (definition.kind === 'notes')
          await page.screenshot({
            path: testInfo.outputPath(
              `private-delete-${leave ? 'other-task' : 'confirmed'}-${view.name}.png`,
            ),
            fullPage: true,
            animations: 'disabled',
          });
        if (leave) {
          await page
            .getByRole('navigation', {
              name: privateArea.navigation.aria,
              exact: true,
            })
            .getByRole('link', { name: definition.copy.title, exact: true })
            .click();
          await expect(
            page.getByRole('heading', {
              name: definition.copy.title,
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole('link', { name: new RegExp(fixture.title) }),
          ).toHaveCount(0);
        }
        expect(fixture.writes).toHaveLength(1);
        expect(unexpected).toEqual([]);
      });
    }
  }
}
