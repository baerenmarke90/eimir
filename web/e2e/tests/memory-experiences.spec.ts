import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import experiences from '../../src/i18n/locales/experiences';
import photoSources from '../../src/i18n/locales/photoSources';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import deFixtures from '../fixtures/locales/de';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { fulfillFreeEntitlements } from '../support/freeEntitlements';
import {
  dragDraftMedia,
  expectInlineDraftActions,
} from '../support/mediaDraft';
import { closeComposerDate, showComposerDate } from '../support/memoryDiary';
import { fulfillUnconfiguredPhotoSources } from '../support/photoSources';

/** #1618: strict mocked API journeys and actual browser/visual evidence.
 * Real provider, database migration and installed-device acceptance are separate.
 */

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const MEMORY_ID = '44444444-4444-4444-8444-444444444444';
const TEST_NOW = '2026-09-16T10:00:00Z';
const EVIDENCE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docs/product/design/references/moment-media-controls/evidence',
);
const CABIN_FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'backend',
  'demo_assets',
  'images',
  'cabin-lake.jpg',
);

interface MemoryCreateRequestBody {
  attachments?: {
    attachmentId: string;
    position: number;
    isSensitive?: boolean;
  }[];
  selectedCoverAttachmentId?: string | null;
  body?: string;
  happenedOn?: string | null;
  title?: string;
}

async function installApiMocks(page: Page): Promise<void> {
  let uploadNumber = 0;
  const media = new Map<string, Record<string, unknown>>();
  let savedMemory: Record<string, unknown> | null = null;
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillFreeEntitlements(route, SPACE_ID)) return;
    if (await fulfillUnconfiguredPhotoSources(route)) return;
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
          accessToken: 'r1-evidence-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'r1-evidence-refresh-token',
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
    if (method === 'POST' && pathname.endsWith('/attachments')) {
      const body = request.postDataJSON();
      const id = `55555555-5555-4555-8555-${String(++uploadNumber).padStart(12, '0')}`;
      const attachment = {
        id,
        spaceId: SPACE_ID,
        ownerId: ACCOUNT_ID,
        version: 1,
        status: 'READY',
        mediaType: 'IMAGE',
        mimeType: 'image/jpeg',
        size: 12345,
        originalName: body.originalName,
        width: 1200,
        height: 800,
        hasThumbnail: true,
        isSensitive: false,
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
      };
      media.set(id, attachment);
      await fulfillJson(
        {
          attachment,
          method: 'STREAM',
          requiredHeaders: {},
          uploadUrl: `/api/v1/spaces/${SPACE_ID}/attachments/${id}/bytes`,
        },
        201,
      );
      return;
    }
    const mediaId = pathname.match(/\/attachments\/([^/]+)/)?.[1];
    if (mediaId && media.has(mediaId)) {
      if (pathname.endsWith('/bytes')) {
        await route.fulfill({ status: 204 });
        return;
      }
      if (pathname.endsWith('/content') || pathname.endsWith('/thumbnail')) {
        await route.fulfill({
          contentType: 'image/jpeg',
          body: readFileSync(CABIN_FIXTURE),
        });
        return;
      }
      await fulfillJson(media.get(mediaId));
      return;
    }
    if (
      method === 'PUT' &&
      pathname.endsWith(`/memories/${MEMORY_ID}/attachments`) &&
      savedMemory
    ) {
      const body = request.postDataJSON();
      savedMemory = {
        ...savedMemory,
        selectedCoverAttachmentId: body.selectedCoverAttachmentId ?? null,
        version: Number(savedMemory.version) + 1,
        attachments: body.attachments.map(
          (entry: { attachmentId: string; position: number }) => ({
            ...media.get(entry.attachmentId),
            ...entry,
            id: entry.attachmentId,
          }),
        ),
      };
      await fulfillJson(savedMemory);
      return;
    }
    if (
      method === 'PATCH' &&
      pathname.endsWith(`/memories/${MEMORY_ID}`) &&
      savedMemory
    ) {
      savedMemory = {
        ...savedMemory,
        ...request.postDataJSON(),
        version: Number(savedMemory.version) + 1,
      };
      await fulfillJson(savedMemory);
      return;
    }
    if (pathname.endsWith('/story-views') || pathname.endsWith('/comments')) {
      await fulfillJson({ items: [], nextCursor: null, hasMore: false });
      return;
    }
    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories`
    ) {
      const body = request.postDataJSON() as MemoryCreateRequestBody;
      savedMemory = {
        attachments: (body.attachments ?? []).map((entry) => ({
          ...media.get(entry.attachmentId),
          ...entry,
          id: entry.attachmentId,
        })),
        tags: [],
        happenedUntil: (body as Record<string, unknown>).happenedUntil ?? null,
        placeIds: [],
        selectedCoverAttachmentId: body.selectedCoverAttachmentId ?? null,
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
        detail: `The evidence run did not define this API request: ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected evidence request',
      },
      500,
    );
  });
}

async function openMemoryCreate(page: Page): Promise<void> {
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

for (const [width, colorScheme] of [
  [320, 'light'],
  [360, 'dark'],
  [390, 'light'],
  [430, 'dark'],
  [1280, 'light'],
  [320, 'dark'],
  [390, 'dark'],
] as const) {
  test(`period, independent cover and arrange-save-return at ${width} ${colorScheme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await openMemoryCreate(page);
    if (width === 320 && colorScheme === 'dark') {
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
    }
    await page
      .getByLabel(de.memory.bodyLabel, { exact: true })
      .fill(deFixtures.memoryExperiences.body);
    const date = await showComposerDate(page);
    await page.getByRole('button', { name: experiences.addPeriod }).click();
    await page.getByLabel(experiences.through).fill('2027-01-03');
    // The native date editor keeps calendar dates rather than timezone instants.
    await date.fill('2026-12-31');
    await closeComposerDate(page);
    await page.getByRole('button', { name: photoSources.addMedia }).click();
    const input = page.locator('#memory-create-images');
    await expect(input).toBeAttached();
    await expect(input).toBeEnabled();
    await input.setInputFiles(
      [
        'first.jpg',
        'second.jpg',
        'third.jpg',
        ...(width === 390 && colorScheme === 'dark'
          ? Array.from({ length: 17 }, (_, index) => `extra-${index}.jpg`)
          : []),
      ].map((name) => ({
        name,
        mimeType: 'image/jpeg',
        buffer: readFileSync(CABIN_FIXTURE),
      })),
    );
    const gallery = page.locator('.photo-draft-gallery');
    const visibleCount = width === 390 && colorScheme === 'dark' ? 6 : 3;
    await expect(
      gallery.getByRole('button', { name: new RegExp(de.memory.photoReady) }),
    ).toHaveCount(visibleCount);
    await gallery.locator('.photo-draft-tile').nth(1).click();
    const actions = page.getByRole('group', {
      name: de.memory.photoSelected,
      exact: true,
    });
    await actions
      .getByRole('button', { name: experiences.chooseCover })
      .click();
    await expectInlineDraftActions(page);
    if (width === 390 && colorScheme === 'light') {
      // A quick swipe on the photo scrolls before the hold-to-drag activates.
      await page.setViewportSize({ width, height: 600 });
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setTouchEmulationEnabled', {
        enabled: true,
      });
      await gallery
        .locator('.photo-draft-tile')
        .first()
        .scrollIntoViewIfNeeded();
      const frame = await gallery
        .locator('.photo-draft-tile')
        .first()
        .boundingBox();
      if (!frame) throw new Error('Missing photo scroll geometry');
      const scrollBefore = await page.evaluate(() => window.scrollY);
      const point = {
        x: frame.x + frame.width / 2,
        y: frame.y + frame.height / 2,
      };
      // The native swipe keeps scrolling after touchEnd. Wait for its actual
      // completion before resizing and measuring the next drag's targets.
      const scrollEnded = page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            window.addEventListener('scrollend', () => resolve(), {
              once: true,
            }),
          ),
      );
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [point],
      });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...point, y: point.y + 60 }],
      });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeLessThan(scrollBefore);
      await scrollEnded;
      await session.detach();
      await page.setViewportSize({ width, height: 900 });
      await expect(
        gallery.locator('.photo-draft-tile').first(),
      ).toHaveAttribute('aria-label', /first.jpg/);
      await dragDraftMedia(page, 0, 2);
      await expect(gallery.locator('.photo-draft-tile').last()).toHaveAttribute(
        'aria-label',
        /first.jpg/,
      );
      await dragDraftMedia(page, 2, 1, 'touch');
      await expect(gallery.locator('.photo-draft-tile').nth(1)).toHaveAttribute(
        'aria-label',
        /first.jpg/,
      );
      await dragDraftMedia(page, 1, 0, 'touch', true);
      await expect(gallery.locator('.photo-draft-tile').nth(1)).toHaveAttribute(
        'aria-label',
        /first.jpg/,
      );
      await dragDraftMedia(page, 1, 0, 'touch');
      await expect(
        gallery.locator('.photo-draft-tile').first(),
      ).toHaveAttribute('aria-label', /first.jpg/);
    }
    await dragDraftMedia(page, 2, 0);
    await expectInlineDraftActions(page);
    await expect(gallery.locator('.photo-draft-tile').first()).toHaveAttribute(
      'aria-label',
      /third.jpg/,
    );
    await expect(gallery.locator('.photo-draft-tile').first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const selectedColor = await gallery
      .locator('.photo-draft-tile')
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    const otherColor = await gallery
      .locator('.photo-draft-tile')
      .nth(1)
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(selectedColor).not.toBe(otherColor);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `arrange-${width}-${colorScheme}.png`),
    });
    await expect(gallery.locator('.photo-draft-number').first()).toHaveText(
      '1',
    );
    const binding = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().endsWith(`/spaces/${SPACE_ID}/memories`),
    );
    await page
      .getByRole('button', { name: de.memory.save, exact: true })
      .click();
    const saved = (await binding).postDataJSON();
    expect(saved.selectedCoverAttachmentId).toBe(
      saved.attachments[2].attachmentId,
    );
    await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY_ID}$`));
    await expect(
      page.getByRole('button', { name: taskBoundary.back, exact: true }),
    ).toHaveCount(1);
    await expect(page.getByText(/31.*2026.*3.*2027/).first()).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `saved-${width}-${colorScheme}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
