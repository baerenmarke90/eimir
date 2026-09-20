import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import memoryProduct from '../../src/i18n/locales/memoryProduct';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const MEMORY_ID = '44444444-4444-4444-8444-444444444444';
const TEST_NOW = '2026-09-01T10:00:00Z';
const AUTHORED_TITLE = 'Authored memory title';
const AUTHORED_BODY = 'A remembered detail';

interface MemoryCreateRequestBody {
  body?: string;
  happenedOn?: string | null;
  title?: string;
}

function localizedFallbackTitle(dateValue: string): string {
  const [year, month, day] = dateValue.split('-');
  return memoryProduct.createFallbackTitle.replace(
    '{{date}}',
    `${day}.${month}.${year}`,
  );
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
}

async function browserLocalToday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
}

async function installApiMocks(page: Page): Promise<void> {
  let savedMemory: Record<string, unknown> | null = null;
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
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories`
    ) {
      const body = request.postDataJSON() as MemoryCreateRequestBody;
      savedMemory = {
        attachments: [],
        author: { accountId: ACCOUNT_ID, displayName: 'Anna' },
        authorId: ACCOUNT_ID,
        body: body.body ?? '',
        capabilities: { canEdit: true, canDelete: true },
        createdAt: TEST_NOW,
        happenedOn: body.happenedOn ?? null,
        id: MEMORY_ID,
        spaceId: SPACE_ID,
        title: body.title ?? '',
        updatedAt: TEST_NOW,
        version: 1,
      };
      await fulfillJson(savedMemory, 201);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories/${MEMORY_ID}` &&
      savedMemory
    ) {
      await fulfillJson(savedMemory);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
      await fulfillJson({
        availableYears: [],
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
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

async function signInAndOpenMemoryCreate(page: Page): Promise<void> {
  await installApiMocks(page);
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);

  await page.goto('/story/memories/new');
  await expect(
    page.getByRole('heading', { name: de.memory.heading }),
  ).toBeVisible();
}

async function openDateEditor(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: new RegExp(de.memory.dateLabel) })
    .click();
}

async function submitAndReadCreateRequest(
  page: Page,
): Promise<MemoryCreateRequestBody> {
  const requestPromise = page.waitForRequest((request) => {
    const pathname = new URL(request.url()).pathname;
    return (
      request.method() === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories`
    );
  });

  await page.getByRole('button', { name: de.memory.save }).click();
  const request = await requestPromise;
  return request.postDataJSON() as MemoryCreateRequestBody;
}

test('Memory Create opens with browser-local today and an optional title', async ({
  page,
}) => {
  await signInAndOpenMemoryCreate(page);
  await openDateEditor(page);

  await expect(page.getByLabel(de.memory.dateLabel)).toHaveValue(
    await browserLocalToday(page),
  );
  await expect(
    page.getByLabel(de.memory.titleLabelOptional),
  ).not.toHaveAttribute('required', '');
});

test('text-only with the default date saves a non-empty localized fallback title', async ({
  page,
}) => {
  await signInAndOpenMemoryCreate(page);
  await page
    .getByRole('textbox', { name: de.memory.bodyLabel, exact: true })
    .fill(AUTHORED_BODY);
  const expectedDate = await browserLocalToday(page);

  const requestBody = await submitAndReadCreateRequest(page);

  expect(requestBody.body).toBe(AUTHORED_BODY);
  expect(requestBody.happenedOn).toBe(expectedDate);
  expect(requestBody.title).toBe(localizedFallbackTitle(expectedDate));
  expect(requestBody.title?.trim()).not.toBe('');
  await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY_ID}$`));
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: localizedFallbackTitle(expectedDate),
      exact: true,
    }),
  ).toBeVisible();
});

test('a selected date wins and is also used by a text-only fallback title', async ({
  page,
}) => {
  await signInAndOpenMemoryCreate(page);
  await page
    .getByRole('textbox', { name: de.memory.bodyLabel, exact: true })
    .fill(AUTHORED_BODY);
  await openDateEditor(page);
  await page.getByLabel(de.memory.dateLabel).fill('2025-12-24');

  const requestBody = await submitAndReadCreateRequest(page);

  expect(requestBody.body).toBe(AUTHORED_BODY);
  expect(requestBody.happenedOn).toBe('2025-12-24');
  expect(requestBody.title).toBe(localizedFallbackTitle('2025-12-24'));
});

test('text-only with a cleared date and whitespace title falls back using local today', async ({
  page,
}) => {
  await signInAndOpenMemoryCreate(page);
  await page
    .getByRole('textbox', { name: de.memory.bodyLabel, exact: true })
    .fill(AUTHORED_BODY);
  await page.getByLabel(de.memory.titleLabelOptional).fill('   ');
  await openDateEditor(page);
  await page.getByLabel(de.memory.dateLabel).fill('');
  const expectedDate = await browserLocalToday(page);

  const requestBody = await submitAndReadCreateRequest(page);

  expect(requestBody.body).toBe(AUTHORED_BODY);
  expect(requestBody.happenedOn).toBe(expectedDate);
  expect(requestBody.title).toBe(localizedFallbackTitle(expectedDate));
  expect(requestBody.title?.trim()).not.toBe('');
});

test('an authored title is kept while the selected happenedOn date is submitted', async ({
  page,
}) => {
  await signInAndOpenMemoryCreate(page);
  await page.getByLabel(de.memory.titleLabelOptional).fill(AUTHORED_TITLE);
  await openDateEditor(page);
  await page.getByLabel(de.memory.dateLabel).fill('2025-12-24');

  const requestBody = await submitAndReadCreateRequest(page);

  expect(requestBody.title).toBe(AUTHORED_TITLE);
  expect(requestBody.happenedOn).toBe('2025-12-24');
});

test('Memory Create defaults render without overflow and capture product visual evidence', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAndOpenMemoryCreate(page);
  await openDateEditor(page);
  await expect(page.getByLabel(de.memory.dateLabel)).toHaveValue(
    await browserLocalToday(page),
  );
  // Return to the closed date-summary state before capturing visual
  // evidence, so the screenshots reflect what the page actually renders
  // by default rather than the transient date-editing state.
  await page.getByLabel(de.memory.titleLabelOptional).click();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('shell-memory-create-defaults-compact.png'),
    fullPage: true,
  });

  await page.emulateMedia({ colorScheme: 'dark' });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('shell-memory-create-defaults-compact-dark.png'),
    fullPage: true,
  });

  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 320, height: 844 });
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('shell-memory-create-defaults-expanded.png'),
    fullPage: true,
  });
});
