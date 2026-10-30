import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import sharedPhotos from '../../src/i18n/locales/sharedPhotos';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import { fulfillDefaultAppIcon } from '../support/appIcon';

const SPACE = '22222222-2222-4222-8222-222222222222';
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const author = { id: ACCOUNT, displayName: 'Lea Sommer' };
const assets = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../backend/demo_assets/images',
);
const pictures = [
  'lake-sunrise.jpg',
  'breakfast-coffee-croissants.jpg',
  'forest-path.jpg',
  'concert-lights.jpg',
];
const photos = Array.from({ length: 44 }, (_, index) => ({
  parentType: 'MEMORY',
  parentId: `memory-${index}`,
  effectiveDate: index < 20 ? '2026-09-12' : '2026-08-14',
  attachment: {
    id: `photo-${index}`,
    status: 'READY',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    size: 2048,
    width: 800,
    height: 600,
    hasThumbnail: true,
    isSensitive: false,
  },
}));

async function mocks(
  page: Page,
  mode: 'normal' | 'empty' | 'error' = 'normal',
) {
  const reads: Array<{ id: string; variant: string }> = [];
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    const request = route.request();
    const url = new URL(request.url());
    const p = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (p.endsWith('/instance/status'))
      return json({
        maintenanceMode: false,
        registrationAvailable: true,
        auth: { localPassword: true },
      });
    if (p.endsWith('/auth/sign-in'))
      return json({
        account: author,
        tokens: {
          accessToken: 'photos-test',
          refreshToken: 'photos-refresh',
          accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
          refreshExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
    if (p.endsWith('/auth/me')) return json(author);
    if (p.endsWith('/auth/capabilities')) return json({ serverAdmin: false });
    if (p.endsWith('/auth/memberships'))
      return json([{ role: 'MEMBER', spaceId: SPACE, status: 'ACTIVE' }]);
    if (p === `/api/v1/spaces/${SPACE}`)
      return json({
        id: SPACE,
        partners: [author, { id: 'partner', displayName: 'Alex' }],
        createdAt: '2023-01-01T00:00:00Z',
      });
    if (p.endsWith('/profile'))
      return json({
        spaceId: SPACE,
        version: 1,
        showRelationshipDuration: false,
      });
    if (p.includes('/profiles/'))
      return json({
        id: 'profile',
        accountId: ACCOUNT,
        displayName: author.displayName,
        version: 1,
        preferences: [],
        profileAttachmentId: null,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      });
    if (p.endsWith('/unread-count')) return json({ unreadCount: 0 });
    if (p.endsWith('/photos')) {
      if (mode === 'error')
        return json(
          {
            type: 'about:blank',
            title: 'Unavailable',
            status: 503,
            code: 'INTERNAL_ERROR',
            detail: 'Unavailable',
          },
          503,
        );
      const items =
        mode === 'empty'
          ? []
          : url.searchParams.has('cursor')
            ? photos.slice(40)
            : photos.slice(0, 40);
      return json({
        items,
        totalCount: mode === 'empty' ? 0 : 44,
        hasMore: mode === 'normal' && !url.searchParams.has('cursor'),
        nextCursor:
          mode === 'normal' && !url.searchParams.has('cursor')
            ? 'second-page'
            : null,
      });
    }
    if (p.endsWith('/read-access')) {
      const id = p.split('/').at(-2)!;
      const body = request.postDataJSON();
      reads.push({ id, variant: body.variant ?? 'original' });
      expect(body.parentType).toBe('MEMORY');
      expect(body.parentId).toBe(`memory-${id.split('-')[1]}`);
      return json({
        method: 'STREAM',
        url: `/api/v1/spaces/${SPACE}/attachments/${id}/content`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    }
    if (p.includes('/attachments/') && p.endsWith('/content')) {
      const index = Number(p.split('/').at(-2)!.split('-')[1]);
      return route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: fs.readFileSync(
          path.join(assets, pictures[index % pictures.length]),
        ),
      });
    }
    if (/\/memories\/memory-\d+$/.test(p))
      return json({
        id: p.split('/').at(-1),
        spaceId: SPACE,
        title: 'Our day by the lake',
        body: 'A lovely day together.',
        happenedOn: '2026-08-14',
        author,
        authorId: ACCOUNT,
        attachments: [
          {
            ...photos[Number(p.split('/').at(-1)!.split('-')[1])]!.attachment,
            position: 0,
          },
        ],
        capabilities: { canEdit: true, canDelete: true, canComment: true },
        version: 1,
        createdAt: '2026-08-14T12:00:00Z',
        updatedAt: '2026-08-14T12:00:00Z',
      });
    if (p.endsWith('/discover'))
      return json({
        selectionDate: '2026-09-12',
        lead: null,
        items: [],
        leadContext: null,
      });
    if (
      p.endsWith('/catalog') ||
      p.endsWith('/tags') ||
      p.endsWith('/profile-preferences')
    )
      return json({ items: [] });
    return json({
      items: [],
      hasMore: false,
      nextCursor: null,
      availableYears: [],
    });
  });
  return reads;
}

async function signIn(page: Page) {
  await page.goto('/story/photos');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  // Keep the authenticated document: a reload can download thumbnails twice
  // before the session-memory byte-reuse assertions begin.
  await expect(
    page.getByRole('heading', { name: sharedPhotos.title, level: 1 }),
  ).toBeVisible();
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const output = testInfo.outputPath(name);
  await page.screenshot({ path: output, animations: 'disabled' });
  if (process.env.SCREENSHOT_EXPORT_DIR) {
    fs.mkdirSync(process.env.SCREENSHOT_EXPORT_DIR, { recursive: true });
    fs.copyFileSync(output, path.join(process.env.SCREENSHOT_EXPORT_DIR, name));
  }
}

test('shared photos: lazy variants, viewer Back, bounded originals and canonical return after pagination', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reads = await mocks(page);
  await signIn(page);
  await expect(page.locator('.shared-photos-tile img').first()).toBeVisible();
  expect(reads.filter((read) => read.variant === 'original')).toHaveLength(0);
  expect(reads.length).toBeLessThan(40);
  await page.locator('.shared-photos-tile').nth(1).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect
    .poll(() => reads.filter((read) => read.variant === 'original').length)
    .toBe(3);
  await screenshot(page, testInfo, 'story-photos-viewer-390.png');
  await page
    .getByRole('dialog')
    .locator('.media-lightbox-footer-nav')
    .getByRole('button', { name: storyProducts.gallery.next })
    .click();
  await expect(page.locator('.media-lightbox-counter')).toHaveText(
    storyProducts.gallery.counter
      .replace('{{index}}', '3')
      .replace('{{count}}', '40'),
  );
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.shared-photos-tile').nth(1)).toBeFocused();
  await expect(page).toHaveURL(/\/story\/photos$/);

  await page
    .getByRole('button', { name: sharedPhotos.more, exact: true })
    .click();
  await expect(page.locator('.shared-photos-tile')).toHaveCount(44);
  const selected = page.locator('[data-photo-id="photo-42"]');
  await selected.scrollIntoViewIfNeeded();
  const top = await selected.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  await selected.click();
  await page
    .getByRole('button', { name: sharedPhotos.source, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\/memories\/memory-42$/);
  await expect(
    page.getByRole('heading', { name: 'Our day by the lake', level: 1 }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/story\/photos$/);
  await expect(page.locator('.shared-photos-tile')).toHaveCount(44);
  await expect(selected).toBeFocused();
  await expect
    .poll(() =>
      selected.evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeCloseTo(top, 0);
});

test('shared photos: viewer reopen and detail return reuse image bytes while checking access again', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reads = await mocks(page);
  const binaries: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\/attachments\/photo-1\/content$/.test(url.pathname)) {
      binaries.push(url.searchParams.get('variant') ?? 'original');
    }
  });
  await signIn(page);
  const selected = page.locator('[data-photo-id="photo-1"]');
  await expect(selected.locator('img')).toBeVisible();
  await selected.click();
  await expect(page.getByRole('dialog').locator('img').first()).toBeVisible();
  await expect
    .poll(() => binaries.filter((variant) => variant === 'original').length)
    .toBe(1);
  await page.getByRole('button', { name: storyProducts.gallery.close }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await selected.click();
  await expect(page.getByRole('dialog').locator('img').first()).toBeVisible();
  expect(binaries).toEqual(['thumbnail', 'original']);
  await page
    .getByRole('button', { name: sharedPhotos.source, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\/memories\/memory-1$/);
  await expect(
    page.locator('.media-gallery-carousel-content').first(),
  ).toBeVisible();
  expect(binaries).toEqual(['thumbnail', 'original']);
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/story\/photos$/);
  await expect(selected.locator('img')).toBeVisible();
  await selected.click();
  await expect(page.getByRole('dialog').locator('img').first()).toBeVisible();
  expect(binaries).toEqual(['thumbnail', 'original']);
  expect(
    reads.filter((read) => read.id === 'photo-1' && read.variant === 'original')
      .length,
  ).toBeGreaterThanOrEqual(4);
  await screenshot(page, testInfo, 'media-cache-viewer-return-390.png');
});

test('shared photos: Compact/Expanded themes, 320px, 200% text and accessible gallery', async ({
  page,
}, testInfo) => {
  await mocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  for (const [width, dark, scale, name] of [
    [390, false, 1, '390-light'],
    [390, true, 1, '390-dark'],
    [1280, false, 1, '1280-light'],
    [1280, true, 1, '1280-dark'],
    [320, false, 1, '320-light'],
    [390, false, 2, '390-text-200'],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(
      ({ dark, scale }) => {
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        document.documentElement.style.fontSize = `${scale * 100}%`;
      },
      { dark, scale },
    );
    await expect(page.locator('.shared-photos-tile img').first()).toBeVisible();
    await expect(
      page.locator('.shared-photos-tile').nth(3).locator('img'),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await screenshot(page, testInfo, `story-photos-${name}.png`);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    if (scale === 2) {
      await page
        .locator('.shared-photos-tile')
        .first()
        .scrollIntoViewIfNeeded();
      await screenshot(page, testInfo, 'story-photos-390-text-200-grid.png');
      await page.locator('.shared-photos-tile').first().click();
      await expect(
        page.getByRole('button', { name: sharedPhotos.source, exact: true }),
      ).toBeVisible();
      await screenshot(page, testInfo, 'story-photos-390-text-200-viewer.png');
      await page
        .getByRole('button', { name: storyProducts.gallery.close })
        .click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.goto('/story');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByRole('link', { name: sharedPhotos.browse, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\/photos$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/story$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: de.story.tabTimeline, exact: true }),
  ).toBeVisible();
});

test('shared photos: empty and failed first page disclose no count, offline state remains explicit', async ({
  page,
}, testInfo) => {
  await mocks(page, 'empty');
  await signIn(page);
  await expect(page.getByText(sharedPhotos.empty)).toBeVisible();
  await screenshot(page, testInfo, 'story-photos-empty.png');
  await page.unroute('**/api/v1/**');
  await mocks(page, 'error');
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.shared-photos-count')).toHaveCount(0);
  await screenshot(page, testInfo, 'story-photos-error.png');
  await page.context().setOffline(true);
  await expect(page.getByText('Du bist gerade offline')).toBeVisible();
  await page.context().setOffline(false);
});

test('shared photos: a failed next page retains loaded photos and retries the same cursor once', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const reads = await mocks(page);
  await signIn(page);
  const cursors: string[] = [];
  await page.route(`**/api/v1/spaces/${SPACE}/photos?**`, async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    if (!cursor) return route.fallback();
    cursors.push(cursor);
    if (cursors.length === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Unavailable',
          status: 503,
          code: 'INTERNAL_ERROR',
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: photos.slice(40),
        totalCount: 44,
        hasMore: false,
        nextCursor: null,
      }),
    });
  });

  await page
    .getByRole('button', { name: sharedPhotos.more, exact: true })
    .click();
  await expect(page.getByText(sharedPhotos.pageError)).toBeVisible();
  await expect(page.locator('.shared-photos-tile')).toHaveCount(40);
  expect(cursors).toEqual(['second-page']);
  await screenshot(page, testInfo, 'story-photos-next-page-error.png');
  await page
    .getByRole('button', { name: sharedPhotos.retry, exact: true })
    .click();
  await expect(page.locator('.shared-photos-tile')).toHaveCount(44);
  await expect(page.getByText(sharedPhotos.pageError)).toHaveCount(0);
  expect(cursors).toEqual(['second-page', 'second-page']);
  const ids = await page
    .locator('.shared-photos-tile')
    .evaluateAll((tiles) =>
      tiles.map((tile) => tile.getAttribute('data-photo-id')),
    );
  expect(new Set(ids).size).toBe(44);
  expect(reads.filter((read) => read.variant === 'original')).toHaveLength(0);
});

test('shared photos: revoked original access refreshes the projection and dismisses the affected viewer', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mocks(page);
  await signIn(page);
  await expect(page.locator('[data-photo-id="photo-1"] img')).toBeVisible();
  let releaseOriginal!: () => void;
  const originalReleased = new Promise<void>((resolve) => {
    releaseOriginal = resolve;
  });
  await page.route(
    `**/api/v1/spaces/${SPACE}/attachments/photo-1/read-access`,
    async (route) => {
      if (route.request().postDataJSON().variant !== 'original')
        return route.fallback();
      await originalReleased;
      return route.fulfill({
        status: 404,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Not found',
          status: 404,
          code: 'NOT_FOUND',
        }),
      });
    },
  );
  await page.route(`**/api/v1/spaces/${SPACE}/photos?**`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: photos
          .filter((photo) => photo.attachment.id !== 'photo-1')
          .slice(0, 40),
        totalCount: 43,
        hasMore: true,
        nextCursor: 'after-revocation',
      }),
    }),
  );

  await page.locator('[data-photo-id="photo-1"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  releaseOriginal();
  await expect(page.locator('[data-photo-id="photo-1"]')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/story\/photos$/);
  await expect(page.locator('.shared-photos-tile')).toHaveCount(40);
  await screenshot(page, testInfo, 'story-photos-revoked-access.png');
});

test('shared photos: app restart reuses durable bytes and still authorizes every read', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const reads = await mocks(page);
  let originals = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.endsWith('/attachments/photo-1/content') &&
      (url.searchParams.get('variant') ?? 'original') === 'original'
    )
      originals++;
  });
  await signIn(page);
  await page.locator('[data-photo-id="photo-1"] img').waitFor();
  await page.locator('[data-photo-id="photo-1"]').click();
  await expect(page.getByRole('dialog').locator('img').first()).toBeVisible();
  await expect.poll(() => originals).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open('eimir-authorized-media-v1');
          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('media')) {
              db.close();
              resolve(false);
              return;
            }
            const read = db
              .transaction('media')
              .objectStore('media')
              .getAllKeys();
            read.onsuccess = () => {
              db.close();
              resolve(
                read.result.some(
                  (key) =>
                    String(key).includes('photo-1') &&
                    String(key).includes('original'),
                ),
              );
            };
          };
          request.onerror = () => resolve(false);
        });
      }),
    )
    .toBe(true);
  const before = reads.filter(
    (read) => read.id === 'photo-1' && read.variant === 'original',
  ).length;
  await page.reload();
  await page.locator('[data-photo-id="photo-1"] img').waitFor();
  await page.locator('[data-photo-id="photo-1"]').click();
  await expect(page.getByRole('dialog').locator('img').first()).toBeVisible();
  expect(originals).toBe(1);
  expect(
    reads.filter((read) => read.id === 'photo-1' && read.variant === 'original')
      .length,
  ).toBeGreaterThan(before);
});
