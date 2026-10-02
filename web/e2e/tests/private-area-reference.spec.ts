import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
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
  const collection = () => ({
    id: PRIVATE_COLLECTION_ID,
    ownerId: ACCOUNT_ID,
    spaceId: SPACE_ID,
    title: 'Travel preparations',
    version: 1,
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
  } | null = null;
  let failReads = false;
  const root = `/api/v1/spaces/${SPACE_ID}/private/collections`;
  await page.route(`**${root}**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      await route.fulfill({
        status: failReads ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          failReads
            ? {
                status: 503,
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
        waiting = { route, release, completed: body.completed };
      });
      return;
    }
    await route.fallback();
  });
  return {
    writes,
    items,
    failReads: (fail: boolean) => {
      failReads = fail;
    },
    respond: async (status = 200) => {
      const pending = waiting;
      if (!pending) throw new Error('No private item write is waiting.');
      waiting = null;
      if (status === 200) {
        items[0].completed = pending.completed;
        items[0].version += 1;
      }
      await pending.route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          status === 200
            ? items[0]
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

async function installHeldPrivateReorder(page: Page, count = 3) {
  const list = await installHeldPrivateList(page, count);
  let version = 1;
  let failReads = false;
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
      await route.fulfill({
        status: failReads ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          failReads
            ? {
                status: 503,
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

test('private reorder rolls back and recovers conflicts and read failures without replay', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpectedRequests = await signInAndOpenPrivateArea(page);
  const fixture = await installHeldPrivateReorder(page);
  await page.goto(`/more/private/collections/${PRIVATE_COLLECTION_ID}`);
  await page.getByRole('button', { name: de.common.edit, exact: true }).click();
  const before = await privateEditTitles(page);
  const move = async () => {
    const handle = page
      .getByRole('button', { name: privateArea.collections.reorderItem })
      .nth(1);
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
  await expect(
    page.getByRole('button', { name: de.common.retry }),
  ).toBeVisible();
  await capturePrivateReorder(
    page,
    testInfo.outputPath('private-reorder-rollback-390-light.png'),
  );
  await expectNoWcagViolations(page);
  await page.getByRole('button', { name: de.common.retry }).click();
  expect(fixture.writes).toHaveLength(1);
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
  expect(fixture.writes).toHaveLength(2);
  await move();
  await expect.poll(() => fixture.writes.length).toBe(3);
  expect(fixture.writes[2].ifMatch).toBe('7');
  fixture.failReads(true);
  await fixture.respond(500);
  await expect(page.getByRole('button', { name: de.common.retry })).toHaveCount(
    2,
  );
  await expect(
    page
      .getByRole('button', { name: privateArea.collections.reorderItem })
      .first(),
  ).toBeDisabled();
  await expect.poll(() => privateEditTitles(page)).toEqual(before);
  await expectNoHorizontalOverflow(page);
  await capturePrivateReorder(
    page,
    testInfo.outputPath('private-reorder-read-recovery-390-light.png'),
  );
  fixture.failReads(false);
  await page.getByRole('button', { name: de.common.retry }).first().click();
  await expect(
    page
      .getByRole('button', { name: privateArea.collections.reorderItem })
      .first(),
  ).toBeEnabled();
  expect(fixture.writes).toHaveLength(3);
  expect(unexpectedRequests).toEqual([]);
});
