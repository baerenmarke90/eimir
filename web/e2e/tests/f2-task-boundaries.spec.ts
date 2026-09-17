import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import memoryProduct from '../../src/i18n/locales/memoryProduct';
import navigation from '../../src/i18n/locales/navigation';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import taskSheets from '../../src/i18n/locales/taskSheets';

// Exercise the production App and its actual router, queries, uploads and modal
// adapter. Only HTTP transport is replaced; no alternative proof UI is mounted.
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const SPACE = '22222222-2222-4222-8222-222222222222';
const MEMORY = '44444444-4444-4444-8444-444444444444';
const ATTACHMENT = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-09-16T09:00:00Z';
const TITLE = 'A walk together';
const BODY = 'We followed the river and stayed until the evening light faded.';
const ORIGIN = '/story?tab=timeline&type=MEMORY&year=2025';
const PHOTO = new URL(
  '../../../backend/demo_assets/images/cabin-lake.jpg',
  import.meta.url,
);

type Scenario = {
  create?: 'success' | 'hold' | 'validation' | 'unknown';
  bindFailureOnce?: boolean;
  bindLostResponseOnce?: boolean;
  uploadFailureOnce?: boolean;
  refreshFailure?: boolean;
};

function memory(id: string, title: string, date = '2025-09-16') {
  return {
    id,
    spaceId: SPACE,
    title,
    body: BODY,
    happenedOn: date,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    authorId: ACCOUNT,
    author: { id: ACCOUNT, accountId: ACCOUNT, displayName: 'Lea' },
    capabilities: { canEdit: true, canDelete: true, canComment: true },
    attachments: [] as Record<string, unknown>[],
  };
}

const older = memory(
  '66666666-6666-4666-8666-666666666666',
  'An older day by the river',
);
const firstPage = Array.from({ length: 14 }, (_, index) =>
  memory(
    `77777777-7777-4777-8777-${String(index + 1).padStart(12, '0')}`,
    `A shared afternoon ${index + 1}`,
    `2025-09-${String(28 - index).padStart(2, '0')}`,
  ),
);

async function installProductApi(page: Page, scenario: Scenario = {}) {
  const state = {
    createRequests: 0,
    bindRequests: 0,
    uploadRequests: 0,
    timelineRequests: [] as string[],
    unexpected: [] as string[],
    saved: null as ReturnType<typeof memory> | null,
    releaseCreate: () => {},
  };
  const createGate = new Promise<void>((resolve) => {
    state.releaseCreate = resolve;
  });
  const photo = await readFile(PHOTO);
  const attachment = {
    id: ATTACHMENT,
    spaceId: SPACE,
    ownerId: ACCOUNT,
    version: 1,
    status: 'READY',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    size: photo.length,
    originalName: 'river.jpg',
    width: 1200,
    height: 800,
    hasThumbnail: true,
    createdAt: NOW,
    updatedAt: NOW,
    position: 0,
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    const problem = (status: number, code: string) =>
      json(
        {
          status,
          code,
          title: 'Synthetic request failure',
          detail: 'The fixture refused this request.',
        },
        status,
      );
    if (path === '/api/v1/instance/status')
      return json({
        maintenanceMode: false,
        registrationAvailable: true,
        auth: {
          localPassword: true,
          passkey: true,
          magicLink: true,
          oidc: false,
        },
      });
    if (path === '/api/v1/auth/sign-in')
      return json({
        account: { id: ACCOUNT, displayName: 'Lea' },
        tokens: {
          accessToken: 'f2-synthetic-access',
          refreshToken: 'f2-synthetic-refresh',
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      });
    if (path === '/api/v1/auth/me')
      return json({ id: ACCOUNT, displayName: 'Lea' });
    if (path === '/api/v1/auth/capabilities')
      return json({ serverAdmin: false });
    if (path === '/api/v1/auth/memberships')
      return json([{ role: 'MEMBER', spaceId: SPACE, status: 'ACTIVE' }]);
    if (path === `/api/v1/spaces/${SPACE}`)
      return json({ id: SPACE, createdAt: NOW, partners: [] });
    if (path.endsWith('/notifications/unread-count'))
      return json({ unreadCount: 0 });
    if (path.endsWith('/profile'))
      return json({
        spaceId: SPACE,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
      });
    if (path.endsWith(`/profiles/${ACCOUNT}`))
      return json({
        id: ACCOUNT,
        accountId: ACCOUNT,
        displayName: 'Lea',
        preferences: [],
        profileAttachmentId: null,
        createdAt: NOW,
        updatedAt: NOW,
        version: 1,
      });
    if (path.endsWith('/dashboard'))
      return json({
        recentShared: [],
        upcoming: [],
        retrospective: null,
        relationshipDuration: null,
        space: { spaceId: SPACE, partner: null },
      });
    if (path === `/api/v1/spaces/${SPACE}/memories` && method === 'POST') {
      state.createRequests += 1;
      if (scenario.create === 'hold') await createGate;
      if (scenario.create === 'validation')
        return problem(422, 'VALIDATION_ERROR');
      const payload = request.postDataJSON();
      state.saved = {
        ...memory(MEMORY, payload.title, payload.happenedOn),
        body: payload.body,
      };
      // Model a committed write followed by a lost response. The browser must
      // not assume that another POST is safe merely because fetch rejected.
      if (scenario.create === 'unknown') return route.abort('failed');
      return json(state.saved, 201);
    }
    if (
      path === `/api/v1/spaces/${SPACE}/memories/${MEMORY}/attachments` &&
      method === 'PUT'
    ) {
      state.bindRequests += 1;
      if (scenario.bindFailureOnce && state.bindRequests === 1)
        return problem(503, 'TEMPORARILY_UNAVAILABLE');
      if (!state.saved) return problem(404, 'NOT_FOUND');
      state.saved = { ...state.saved, version: 2, attachments: [attachment] };
      if (scenario.bindLostResponseOnce && state.bindRequests === 1)
        return route.abort('failed');
      return json(state.saved);
    }
    if (path === `/api/v1/spaces/${SPACE}/attachments` && method === 'POST') {
      state.uploadRequests += 1;
      if (scenario.uploadFailureOnce && state.uploadRequests === 1)
        return problem(503, 'TEMPORARILY_UNAVAILABLE');
      return json(
        {
          attachment,
          method: 'STREAM',
          requiredHeaders: {},
          uploadUrl: `/api/v1/spaces/${SPACE}/attachments/${ATTACHMENT}/bytes`,
        },
        201,
      );
    }
    if (path.endsWith(`/attachments/${ATTACHMENT}/bytes`)) {
      return method === 'PUT'
        ? route.fulfill({ status: 204 })
        : route.fulfill({ contentType: 'image/jpeg', body: photo });
    }
    if (path.endsWith(`/attachments/${ATTACHMENT}/read-access`))
      return json({
        method: 'STREAM',
        url: `/api/v1/spaces/${SPACE}/attachments/${ATTACHMENT}/bytes`,
      });
    if (
      path.endsWith(`/attachments/${ATTACHMENT}/finalize`) ||
      path.endsWith(`/attachments/${ATTACHMENT}`)
    )
      return json(attachment);
    if (path.endsWith('/timeline')) {
      state.timelineRequests.push(url.search);
      if (state.saved && scenario.refreshFailure)
        return problem(503, 'TEMPORARILY_UNAVAILABLE');
      const noMatch = url.searchParams.get('year') === '2024';
      const hasCursor = url.searchParams.has('cursor');
      const entries = noMatch ? [] : hasCursor ? [older] : firstPage;
      return json({
        items: entries.map((entry) => ({
          kind: 'MEMORY',
          effectiveDate: entry.happenedOn,
          memory: entry,
        })),
        availableYears: [2026, 2025, 2024],
        hasMore: !noMatch && !hasCursor,
        nextCursor: !noMatch && !hasCursor ? 'older-page' : null,
      });
    }
    if (
      method === 'GET' &&
      path.includes('/memories/') &&
      !path.endsWith('/comments')
    ) {
      const id = path.split('/').at(-1);
      const value = [state.saved, older, ...firstPage].find(
        (entry) => entry?.id === id,
      );
      return value ? json(value) : problem(404, 'NOT_FOUND');
    }
    if (
      method === 'GET' &&
      [
        '/profile-preferences',
        '/comments',
        '/activity',
        '/notifications',
        '/chapters',
        '/milestones',
      ].some((suffix) => path.endsWith(suffix))
    ) {
      return json({ items: [], hasMore: false, nextCursor: null });
    }
    state.unexpected.push(`${method} ${path}`);
    return problem(500, 'E2E_UNEXPECTED_REQUEST');
  });
  return state;
}

async function signIn(page: Page, destination = ORIGIN) {
  await page.goto(destination);
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page
    .getByLabel(de.login.password)
    .fill('a-long-enough-fixture-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  if (
    new URL(page.url()).pathname !== new URL(destination, page.url()).pathname
  )
    await page.goto(destination);
}

async function openMemory(page: Page) {
  await page
    .getByRole('button', { name: navigation.newContent, exact: true })
    .click();
  await page
    .getByRole('link', { name: navigation.quickCreateMemory, exact: true })
    .or(
      page.getByRole('menuitem', {
        name: navigation.quickCreateMemory,
        exact: true,
      }),
    )
    .click();
  await expect(
    page.getByRole('heading', { name: de.memory.heading, exact: true }),
  ).toBeVisible();
  await expect(page.locator('input:focus, textarea:focus')).toHaveCount(0);
}

async function fillMemory(page: Page, withPhoto = false) {
  await page
    .getByLabel(de.memory.titleLabelOptional, { exact: true })
    .fill(TITLE);
  await page.getByLabel(de.memory.bodyLabel, { exact: true }).fill(BODY);
  if (withPhoto) {
    await page.locator('#memory-create-images').setInputFiles({
      name: 'river.jpg',
      mimeType: 'image/jpeg',
      buffer: await readFile(PHOTO),
    });
    await expect(
      page.getByText(de.memory.photoReady, { exact: true }),
    ).toBeVisible();
  }
}

async function openDateEditor(page: Page) {
  await page
    .getByRole('button', { name: new RegExp(de.memory.dateLabel) })
    .click();
}

async function expectNoOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll('body *')]
      .filter(
        (element) =>
          element.getBoundingClientRect().right > innerWidth + 1 &&
          element.clientWidth > 0,
      )
      .map(
        (element) =>
          `${element.parentElement?.tagName}.${element.parentElement?.className} > ${element.tagName}.${element.className}: ${element.textContent?.slice(0, 100)}`,
      )
      .slice(0, 12),
  }));
  expect(sizes.scroll, JSON.stringify(sizes.overflowing)).toBeLessThanOrEqual(
    sizes.width + 1,
  );
}

test.use({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });

test('Quick Create cancellation and Browser Back return to its trigger', async ({
  page,
}, testInfo) => {
  const historySteps: unknown[] = [];
  const recordHistory = async (step: string) => {
    historySteps.push(
      await page.evaluate(
        (label) => ({
          step: label,
          state: history.state,
          length: history.length,
          url: location.href,
        }),
        step,
      ),
    );
  };
  const api = await installProductApi(page);
  await signIn(page);
  const trigger = page.getByRole('button', {
    name: navigation.newContent,
    exact: true,
  });
  await recordHistory('before open');
  const originHistory = await page.evaluate(() => history.state);
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await recordHistory('first open');
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await recordHistory('after Escape');
  await trigger.click();
  await expect(dialog).toBeVisible();
  await recordHistory('reopened');
  await page.goBack();
  await recordHistory('after Browser Back');
  await testInfo.attach('modal-history-checkpoints', {
    body: JSON.stringify(historySteps, null, 2),
    contentType: 'application/json',
  });
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/story\?/);
  expect(await page.evaluate(() => history.state)).toEqual(originHistory);
  expect(api.unexpected).toEqual([]);
});

test('Quick Create native modality prevents background focus and activation', async ({
  page,
}, testInfo) => {
  await installProductApi(page);
  await signIn(page);
  await page
    .getByRole('button', { name: navigation.newContent, exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const checkpoints: unknown[] = [];
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    const focus = await dialog.evaluate((element) => ({
      inside: element.contains(document.activeElement),
      documentFocused: document.hasFocus(),
      activeTag: document.activeElement?.tagName,
      activeText: document.activeElement?.textContent?.slice(0, 100),
    }));
    checkpoints.push(focus);
    // Native modal traversal may move to browser chrome. The document must not
    // receive focus behind the modal when traversal returns to the page.
    expect(focus.inside || !focus.documentFocused).toBe(true);
  }
  await page
    .locator('.story-task-filter-trigger')
    .evaluate((element) => (element as HTMLElement).focus());
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await testInfo.attach('modal-focus-checkpoints', {
    body: JSON.stringify(checkpoints, null, 2),
    contentType: 'application/json',
  });
  const brand = await page.locator('.brand').boundingBox();
  expect(brand).not.toBeNull();
  if (!brand) throw new Error('The existing background brand link is missing.');
  await page.mouse.click(brand.x + brand.width / 2, brand.y + brand.height / 2);
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/story\?/);
});

test('content and photo save opens the confirmed canonical Memory and returns to its scope', async ({
  page,
}, testInfo) => {
  const api = await installProductApi(page);
  await signIn(page);
  await openMemory(page);
  await fillMemory(page, true);
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY}$`));
  await expect(
    page.getByRole('heading', { name: TITLE, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: taskBoundary.saved }),
  ).toBeVisible();
  expect(api.createRequests).toBe(1);
  expect(api.bindRequests).toBe(1);
  const savedPhoto = page.locator('.media-gallery-thumb-content');
  await expect(savedPhoto).toBeVisible();
  await expect
    .poll(() =>
      savedPhoto.evaluate(
        (element) => (element as HTMLImageElement).naturalWidth,
      ),
    )
    .toBeGreaterThan(0);
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('f2-confirmed-memory-390-light.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\?.*year=2025/);
  expect(new URL(page.url()).searchParams.get('tab')).toBe('timeline');
  expect(new URL(page.url()).searchParams.get('type')).toBe('MEMORY');
  expect(api.unexpected).toEqual([]);
});

test('a pending submission retains its draft and cannot create twice or exit', async ({
  page,
}) => {
  const api = await installProductApi(page, { create: 'hold' });
  await signIn(page);
  await openMemory(page);
  await fillMemory(page);
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  try {
    await expect.poll(() => api.createRequests).toBe(1);
    await expect(
      page.getByRole('button', { name: de.memory.saving, exact: true }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: taskBoundary.close, exact: true })
      .click({ force: true });
    await page
      .getByRole('button', { name: de.common.cancel, exact: true })
      .click({ force: true });
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/story\/memories\/new/);
    await expect(
      page.getByLabel(de.memory.titleLabelOptional, { exact: true }),
    ).toHaveValue(TITLE);
    await expect(
      page.getByLabel(de.memory.bodyLabel, { exact: true }),
    ).toHaveValue(BODY);
    expect(api.createRequests).toBe(1);
  } finally {
    api.releaseCreate();
  }
  await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY}$`));
  expect(api.createRequests).toBe(1);
});

test('dirty Browser Back asks before discarding and nested Escape keeps the task', async ({
  page,
}) => {
  await installProductApi(page);
  await signIn(page);
  await openMemory(page);
  await fillMemory(page);
  await page.goBack();
  const confirmation = page
    .getByRole('dialog')
    .or(page.getByRole('alertdialog'));
  await expect(
    confirmation.getByRole('heading', { name: taskBoundary.discardTitle }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(
    page.getByLabel(de.memory.titleLabelOptional, { exact: true }),
  ).toHaveValue(TITLE);
  await page.goBack();
  await confirmation
    .getByRole('button', { name: taskBoundary.discard })
    .click();
  await expect(page).toHaveURL(/\/story\?.*year=2025/);
});

test('an older Memory returns to the same loaded Timeline range and position', async ({
  page,
}, testInfo) => {
  const api = await installProductApi(page);
  await signIn(page);
  await page.locator('.story-pagination-sentinel').scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        api.timelineRequests.filter((query) => query.includes('cursor=older-page'))
          .length,
    )
    .toBe(1);
  await expect(page.getByText(older.title, { exact: true })).toBeAttached();
  const source = page
    .getByRole('link')
    .filter({ has: page.getByText(older.title, { exact: true }) });
  await source.scrollIntoViewIfNeeded();
  const before = await source.boundingBox();
  expect(before).not.toBeNull();
  await source.click();
  await expect(
    page.getByRole('heading', { name: older.title, exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/story\?.*year=2025/);
  await expect(source).toBeVisible();
  await expect(source).toBeFocused();
  await expect
    .poll(async () => {
      const current = await source.boundingBox();
      return current && before
        ? Math.abs(current.y - before.y)
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(8);
  await expect(
    page.getByText(firstPage[0].title, { exact: true }),
  ).toBeAttached();
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('f2-restored-older-timeline-390-light.png'),
    fullPage: false,
  });
  expect(
    api.timelineRequests.some((query) => query.includes('cursor=older-page')),
  ).toBe(true);
  expect(api.unexpected).toEqual([]);
});

test('direct entry has a safe canonical return and no fabricated browsing origin', async ({
  page,
}) => {
  await installProductApi(page);
  await signIn(page, `/story/memories/${older.id}`);
  await expect(
    page.getByRole('heading', { name: older.title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: memoryProduct.backToStory, exact: true })
    .or(
      page.getByRole('link', { name: memoryProduct.backToStory, exact: true }),
    )
    .click();
  await expect(page).toHaveURL(/\/story(?:\?tab=timeline)?$/);
});

test('failed photo binding retries only binding and never creates a second Memory', async ({
  page,
}, testInfo) => {
  const api = await installProductApi(page, { bindFailureOnce: true });
  await signIn(page);
  await openMemory(page);
  await fillMemory(page, true);
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: taskBoundary.partialTitle }),
  ).toBeVisible();
  await expect(
    page.getByLabel(de.memory.titleLabelOptional, { exact: true }),
  ).toHaveValue(TITLE);
  await expect(
    page.getByLabel(de.memory.bodyLabel, { exact: true }),
  ).toHaveValue(BODY);
  expect(api.createRequests).toBe(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('f2-partial-photo-binding.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: taskBoundary.retryPhotos, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY}$`));
  await expect(
    page.getByRole('heading', { name: TITLE, exact: true }),
  ).toBeVisible();
  expect(api.createRequests).toBe(1);
  expect(api.bindRequests).toBe(2);
  expect(api.unexpected).toEqual([]);
});

test('unknown create outcome retains content and blocks blind resubmission', async ({
  page,
}, testInfo) => {
  const api = await installProductApi(page, { create: 'unknown' });
  await signIn(page, '/today');
  await openMemory(page);
  await fillMemory(page);
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: taskBoundary.uncertainTitle }),
  ).toBeVisible();
  await expect(
    page.getByLabel(de.memory.titleLabelOptional, { exact: true }),
  ).toHaveValue(TITLE);
  await expect(
    page.getByLabel(de.memory.bodyLabel, { exact: true }),
  ).toHaveValue(BODY);
  await expect(
    page.getByRole('button', { name: de.memory.save, exact: true }),
  ).toBeDisabled();
  expect(api.createRequests).toBe(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('f2-unknown-create-outcome.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: taskBoundary.checkMoments }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(
    confirmation.getByRole('heading', {
      name: taskBoundary.uncertainDiscardTitle,
    }),
  ).toBeVisible();
  await confirmation
    .getByRole('button', { name: taskBoundary.keepEditing })
    .click();
  await expect(
    page.getByLabel(de.memory.titleLabelOptional, { exact: true }),
  ).toHaveValue(TITLE);
  await page.getByRole('button', { name: taskBoundary.checkMoments }).click();
  await confirmation
    .getByRole('button', { name: taskBoundary.discard, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\?tab=timeline$/);
  expect(api.createRequests).toBe(1);
});

test('confirmed create is still a success when a subsequent Timeline refresh fails', async ({
  page,
}) => {
  const api = await installProductApi(page, { refreshFailure: true });
  await signIn(page);
  await openMemory(page);
  await fillMemory(page);
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY}$`));
  await expect(
    page.getByRole('status').filter({ hasText: taskBoundary.saved }),
  ).toBeVisible();
  expect(api.createRequests).toBe(1);
});

test('a refused create keeps editable input for a deliberate retry', async ({
  page,
}) => {
  const scenario: Scenario = { create: 'validation' };
  const api = await installProductApi(page, scenario);
  await signIn(page);
  await openMemory(page);
  await fillMemory(page);
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByLabel(de.memory.bodyLabel, { exact: true }),
  ).toHaveValue(BODY);
  await expect(
    page.getByLabel(de.memory.titleLabelOptional, { exact: true }),
  ).toBeEditable();
  scenario.create = 'success';
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY}$`));
  expect(api.createRequests).toBe(2);
});

test('dirty reload uses beforeunload and cancellation keeps authored content', async ({
  page,
}) => {
  await installProductApi(page);
  await signIn(page);
  await openMemory(page);
  await fillMemory(page);
  const prompt = page.waitForEvent('dialog');
  const reload = page
    .evaluate(() => window.location.reload())
    .catch(() => null);
  const dialog = await prompt;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await reload;
  await expect(
    page.getByLabel(de.memory.titleLabelOptional, { exact: true }),
  ).toHaveValue(TITLE);
  await expect(
    page.getByLabel(de.memory.bodyLabel, { exact: true }),
  ).toHaveValue(BODY);
});

test('filter choices apply deliberately, cancel preserves scope, and no-match recovery stays visible', async ({
  page,
}, testInfo) => {
  const api = await installProductApi(page);
  await signIn(page);
  const trigger = page.locator('.story-task-filter-trigger');
  await trigger.click();
  const dialog = page.getByRole('dialog', {
    name: storyProducts.storyFilters.aria,
  });
  await expect(dialog).toBeVisible();
  await dialog.locator('#story-filter-year').selectOption('2024');
  await dialog.locator('#story-filter-order').selectOption('ASC');
  expect(new URL(page.url()).searchParams.get('year')).toBe('2025');
  await dialog
    .getByRole('button', { name: taskSheets.filterCancel, exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(new URL(page.url()).searchParams.get('year')).toBe('2025');
  await trigger.click();
  await expect(dialog.locator('#story-filter-year')).toHaveValue('2025');
  await expect(dialog.locator('#story-filter-order')).toHaveValue('DESC');
  await dialog.locator('#story-filter-year').selectOption('2024');
  await dialog
    .getByRole('button', {
      name: storyProducts.storyFilters.apply,
      exact: true,
    })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText(storyProducts.storyFilters.noMatches, { exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get('year')).toBe('2024');
  await expect(page.locator('.story-active-chips')).toContainText('2024');
  await page.screenshot({
    path: testInfo.outputPath('f2-filter-no-matches.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', {
      name: storyProducts.storyFilters.noMatchesAction,
      exact: true,
    })
    .click();
  await expect(
    page.getByText(firstPage[0].title, { exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.has('year')).toBe(false);
  expect(api.unexpected).toEqual([]);
});

test('a committed photo bind with a lost response reconciles without another write', async ({
  page,
}) => {
  const api = await installProductApi(page, { bindLostResponseOnce: true });
  await signIn(page);
  await openMemory(page);
  await fillMemory(page, true);
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: taskBoundary.partialTitle }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: taskBoundary.retryPhotos, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY}$`));
  expect(api.createRequests).toBe(1);
  expect(api.bindRequests).toBe(1);
  expect(api.unexpected).toEqual([]);
});

test('a partial result can open the known Memory with its photo warning', async ({
  page,
}) => {
  const api = await installProductApi(page, { bindFailureOnce: true });
  await signIn(page);
  await openMemory(page);
  await fillMemory(page, true);
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: taskBoundary.partialTitle }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: taskBoundary.openSaved, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY}$`));
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: taskBoundary.photosUnconfirmed }),
  ).toBeVisible();
  expect(api.createRequests).toBe(1);
  expect(api.bindRequests).toBe(1);
});

test('failed uploads retain authored content and can retry before the first create', async ({
  page,
}) => {
  const api = await installProductApi(page, { uploadFailureOnce: true });
  await signIn(page);
  await openMemory(page);
  await fillMemory(page);
  await page.locator('#memory-create-images').setInputFiles({
    name: 'river.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(PHOTO),
  });
  await expect(
    page.getByText(de.memory.photoFailed, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: de.memory.save, exact: true }),
  ).toBeDisabled();
  expect(api.createRequests).toBe(0);
  await expect(
    page.getByLabel(de.memory.bodyLabel, { exact: true }),
  ).toHaveValue(BODY);
  await page
    .locator('.attachment-draft-item')
    .getByRole('button', { name: de.common.retry, exact: true })
    .click();
  await expect(
    page.getByText(de.memory.photoReady, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY}$`));
  expect(api.uploadRequests).toBe(2);
  expect(api.createRequests).toBe(1);
});

test('offline before submit keeps an editable draft without a network create', async ({
  page,
  context,
}) => {
  const api = await installProductApi(page);
  await signIn(page);
  await openMemory(page);
  await fillMemory(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(
    page.getByText(taskBoundary.offline, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel(de.memory.titleLabelOptional, { exact: true }),
  ).toBeEditable();
  await expect(
    page.getByLabel(de.memory.bodyLabel, { exact: true }),
  ).toHaveValue(BODY);
  expect(api.createRequests).toBe(0);
  await context.setOffline(false);
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY}$`));
  expect(api.createRequests).toBe(1);
});

test('authored draft text never enters task history or browser key-value storage', async ({
  page,
}) => {
  await installProductApi(page);
  await signIn(page);
  await openMemory(page);
  const privateDraft = 'Ephemeral private draft 958 for storage exclusion';
  await page
    .getByLabel(de.memory.titleLabelOptional, { exact: true })
    .fill(privateDraft);
  const state = await page.evaluate(() => ({
    url: location.href,
    history: JSON.stringify(history.state),
    local: JSON.stringify(Object.entries(localStorage)),
    session: JSON.stringify(Object.entries(sessionStorage)),
  }));
  expect(JSON.stringify(state)).not.toContain(privateDraft);
  expect(JSON.parse(state.history).usr.taskOriginKey).toMatch(/^task-/);
  expect(state.url).not.toContain('task-');
});

test('unrecognized or external origin keys fall back to canonical Story', async ({
  page,
}) => {
  await installProductApi(page);
  await signIn(page, `/story/memories/${older.id}`);
  for (const invalidKey of [
    'https://outside.invalid/return',
    'task-expired-or-foreign-scope',
  ]) {
    await page.goto(`/story/memories/${older.id}`);
    await page.evaluate(
      (taskOriginKey) =>
        history.replaceState(
          { ...history.state, usr: { taskOriginKey } },
          '',
          location.href,
        ),
      invalidKey,
    );
    await page.reload();
    await page
      .getByRole('link', { name: memoryProduct.backToStory, exact: true })
      .or(
        page.getByRole('button', {
          name: memoryProduct.backToStory,
          exact: true,
        }),
      )
      .click();
    await expect(page).toHaveURL(/\/story(?:\?tab=timeline)?$/);
  }
});

test('an unsupported date stays editable and never starts a network save', async ({
  page,
}) => {
  const api = await installProductApi(page);
  await signIn(page);
  await openMemory(page);
  await fillMemory(page);
  await openDateEditor(page);
  await page
    .getByLabel(de.memory.dateLabel, { exact: true })
    .fill('10000-01-01');
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: taskBoundary.invalidDate }),
  ).toBeVisible();
  await expect(
    page.getByLabel(de.memory.dateLabel, { exact: true }),
  ).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByLabel(de.memory.dateLabel, { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByLabel(de.memory.titleLabelOptional, { exact: true }),
  ).toBeEditable();
  await expect(
    page.getByLabel(de.memory.bodyLabel, { exact: true }),
  ).toHaveValue(BODY);
  expect(api.createRequests).toBe(0);
  await page
    .getByLabel(de.memory.dateLabel, { exact: true })
    .fill('2025-09-16');
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY}$`));
  expect(api.createRequests).toBe(1);
});

test('edit Cancel and explicit Back keep the selected Memory origin', async ({
  page,
}) => {
  const api = await installProductApi(page);
  await signIn(page);
  const source = page.locator('.story-card-link').filter({
    has: page.getByRole('heading', { name: firstPage[0].title, exact: true }),
  });
  await source.click();
  await expect(
    page.getByRole('heading', { name: firstPage[0].title, exact: true }),
  ).toBeVisible();
  for (const exitLabel of [de.common.cancel, memoryProduct.backToMemory]) {
    await page
      .getByRole('link', { name: memoryProduct.edit, exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: memoryProduct.editHeading,
        exact: true,
        level: 1,
      }),
    ).toBeVisible();
    await page.getByRole('link', { name: exitLabel, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: firstPage[0].title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: taskBoundary.back, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\?.*year=2025/);
  expect(new URL(page.url()).searchParams.get('type')).toBe('MEMORY');
  await expect(source).toBeFocused();
  expect(api.unexpected).toEqual([]);
});

test('large text and a short Compact viewport keep task actions reachable', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await installProductApi(page);
  await signIn(page);
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  await page.evaluate(() => document.fonts.ready);
  await expectNoOverflow(page);
  await page
    .getByRole('button', { name: navigation.newContent, exact: true })
    .click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expectNoOverflow(page);
  const sheetSizes = await sheet.evaluate((element) => ({
    width: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(sheetSizes.scroll).toBeLessThanOrEqual(sheetSizes.width + 1);
  const bounds = await sheet.boundingBox();
  expect(bounds?.height).toBeLessThanOrEqual(480);
  expect(bounds?.width).toBeLessThanOrEqual(320);
  await sheet
    .getByRole('link', { name: navigation.quickCreateMemory, exact: true })
    .click();
  await fillMemory(page);
  await expectNoOverflow(page);
  const readableLabels = await page
    .locator(
      '.immersive-create-narrative label, .immersive-create-title-field label, .immersive-create-date-field > span:first-child, .immersive-create-date-change, .file-picker strong, .file-picker small',
    )
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const text = element.firstChild;
        if (!(text instanceof Text))
          throw new Error('Expected a plain-text product label.');
        return [...(text.textContent ?? '').matchAll(/\S+/g)].map((match) => {
          const range = document.createRange();
          range.setStart(text, match.index);
          range.setEnd(text, match.index + match[0].length);
          return { word: match[0], lines: range.getClientRects().length };
        });
      }),
    );
  expect(readableLabels.filter((label) => label.lines > 1)).toEqual([]);
  await openDateEditor(page);
  const dateSpace = await page
    .getByLabel(de.memory.dateLabel, { exact: true })
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Cannot measure native date text.');
      context.font = style.font;
      const date = new Date(`${(element as HTMLInputElement).value}T00:00:00Z`);
      const visibleDate = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'UTC',
      }).format(date);
      return {
        available:
          element.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight),
        text: context.measureText(visibleDate).width,
        picker: Number.parseFloat(style.fontSize),
      };
    });
  expect(dateSpace.available).toBeGreaterThanOrEqual(
    dateSpace.text + dateSpace.picker,
  );
  // Return to the closed date-summary state before the readability
  // screenshot, so it reflects what the page renders by default.
  await page.getByLabel(de.memory.titleLabelOptional, { exact: true }).click();
  await testInfo.attach('large-text-readability', {
    body: JSON.stringify({ labels: readableLabels, dateSpace }, null, 2),
    contentType: 'application/json',
  });
  const save = page.getByRole('button', { name: de.memory.save, exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('f2-large-text-short-compact.png'),
    fullPage: true,
  });
  await save.click();
  await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY}$`));
});

for (const width of [320, 360, 390, 430, 1280]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`task remains operable at ${width}px in ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const api = await installProductApi(page);
      await signIn(page);
      await page.locator('.story-task-filter-trigger').click();
      const filters = page.getByRole('dialog', {
        name: storyProducts.storyFilters.aria,
      });
      await expect(filters).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`f2-filter-${width}-${colorScheme}.png`),
      });
      await page.keyboard.press('Escape');
      await page
        .getByRole('button', { name: navigation.newContent, exact: true })
        .click();
      const choices = page.getByRole(width >= 840 ? 'menu' : 'dialog');
      await expect(choices).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(
          `f2-quick-create-${width}-${colorScheme}.png`,
        ),
      });
      await choices
        .getByRole(width >= 840 ? 'menuitem' : 'link', {
          name: navigation.quickCreateMemory,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole('heading', { name: de.memory.heading, exact: true }),
      ).toBeVisible();
      await expect(page.locator('input:focus, textarea:focus')).toHaveCount(0);
      await fillMemory(page, true);
      await expectNoOverflow(page);
      const save = page.getByRole('button', {
        name: de.memory.save,
        exact: true,
      });
      await save.scrollIntoViewIfNeeded();
      const bounds = await save.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath(`f2-create-${width}-${colorScheme}.png`),
        fullPage: true,
      });
      if (width === 390) {
        const accessibility = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(accessibility.violations).toEqual([]);
      }
      await save.click();
      await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY}$`));
      await expectNoOverflow(page);
      await expect(
        page.getByRole('heading', { name: TITLE, exact: true }),
      ).toBeVisible();
      const savedPhoto = page.locator('.media-gallery-thumb-content');
      await expect(savedPhoto).toBeVisible();
      await expect
        .poll(() =>
          savedPhoto.evaluate(
            (element) => (element as HTMLImageElement).naturalWidth,
          ),
        )
        .toBeGreaterThan(0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath(`f2-result-${width}-${colorScheme}.png`),
        fullPage: true,
      });
      expect(api.createRequests).toBe(1);
    });
  }
}
