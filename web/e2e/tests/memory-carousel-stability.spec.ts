import { expect, test, type Locator, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import storyProducts from '../../src/i18n/locales/storyProducts';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const MEMORY_ID = '44444444-4444-4444-8444-444444444444';
const SINGLE_MEMORY_ID = '55555555-5555-4555-8555-555555555555';
const TEST_NOW = '2026-09-18T12:00:00Z';
const GALLERY = storyProducts.gallery;

const ATTACHMENTS = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    width: 1600,
    height: 900,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#b9856d"/></svg>',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    width: 700,
    height: 1400,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1400"><rect width="700" height="1400" fill="#6d8790"/></svg>',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    width: 900,
    height: 900,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900" fill="#9c786f"/></svg>',
  },
] as const;

function attachment(value: (typeof ATTACHMENTS)[number], position: number) {
  return {
    id: value.id,
    position,
    status: 'READY',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    hasThumbnail: true,
    width: value.width,
    height: value.height,
    size: value.svg.length,
  };
}

function memory(id: string, attachments: ReturnType<typeof attachment>[]) {
  return {
    id,
    spaceId: SPACE_ID,
    title:
      id === MEMORY_ID
        ? 'A long evening by the water'
        : 'One photograph from the morning',
    body: 'We kept talking long after the sun went down. '.repeat(40),
    happenedOn: '2026-09-12',
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    version: 1,
    authorId: ACCOUNT_ID,
    author: {
      id: ACCOUNT_ID,
      accountId: ACCOUNT_ID,
      displayName: 'Lea Sommer',
    },
    capabilities: { canEdit: true, canDelete: true, canComment: true },
    attachments,
  };
}

const MULTI_MEMORY = memory(
  MEMORY_ID,
  ATTACHMENTS.map((value, index) => attachment(value, index)),
);
const SINGLE_MEMORY = memory(SINGLE_MEMORY_ID, [attachment(ATTACHMENTS[0], 0)]);

function openItemLabel(index: number, count: number): string {
  return GALLERY.openItem
    .replace('{{index}}', String(index))
    .replace('{{count}}', String(count));
}

function counterLabel(index: number, count: number): string {
  return GALLERY.counter
    .replace('{{index}}', String(index))
    .replace('{{count}}', String(count));
}

async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function pointerClickWithoutScroll(
  page: Page,
  control: Locator,
): Promise<void> {
  const box = await control.boundingBox();
  if (!box) throw new Error('Carousel control did not render.');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function swipeCarousel(
  page: Page,
  direction: 'previous' | 'next',
): Promise<{
  startScrollLeft: number;
  midScrollLeft: number;
  viewportWidth: number;
  visibleSlides: number;
}> {
  const track = page.locator('.media-gallery-carousel-track');
  const box = await track.boundingBox();
  if (!box) throw new Error('Carousel track did not render.');

  const startX =
    direction === 'next' ? box.x + box.width * 0.82 : box.x + box.width * 0.18;
  const endX =
    direction === 'next' ? box.x + box.width * 0.12 : box.x + box.width * 0.88;
  const midX = startX + (endX - startX) * 0.58;
  const clientY = box.y + box.height / 2;
  const startScrollLeft = await track.evaluate((element) => element.scrollLeft);
  const client = await page.context().newCDPSession(page);

  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y: clientY }],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: midX, y: clientY }],
    });
    await nextFrame(page);

    const midState = await track.evaluate((element) => {
      const viewport = element.getBoundingClientRect();
      const visibleSlides = Array.from(
        element.querySelectorAll<HTMLElement>('.media-gallery-carousel-slide'),
      ).filter((slide) => {
        const rect = slide.getBoundingClientRect();
        return rect.right > viewport.left + 1 && rect.left < viewport.right - 1;
      }).length;
      return {
        scrollLeft: element.scrollLeft,
        viewportWidth: element.clientWidth,
        visibleSlides,
      };
    });

    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: endX, y: clientY }],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });

    return {
      startScrollLeft,
      midScrollLeft: midState.scrollLeft,
      viewportWidth: midState.viewportWidth,
      visibleSlides: midState.visibleSlides,
    };
  } finally {
    await client.detach();
  }
}

async function expectCarouselSettled(page: Page, index: number): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator('.media-gallery-carousel-track')
        .evaluate((track, expectedIndex) => {
          const slide = track.querySelector<HTMLElement>(
            `.media-gallery-carousel-slide:not(.is-clone)[data-carousel-index="${expectedIndex}"]`,
          );
          if (!slide) return Number.POSITIVE_INFINITY;
          return Math.abs(track.scrollLeft - slide.offsetLeft);
        }, index),
    )
    .toBeLessThanOrEqual(1);
}

async function carouselInteractionContract(page: Page) {
  return page.locator('.media-gallery-carousel-track').evaluate((track) => {
    const style = getComputedStyle(track);
    return {
      scrollSnapType: style.scrollSnapType,
      overscrollBehaviorX: style.overscrollBehaviorX,
      touchAction: style.touchAction,
      cloneCount: track.querySelectorAll(
        '.media-gallery-carousel-slide.is-clone',
      ).length,
    };
  });
}

async function installApiMocks(page: Page) {
  const unexpectedRequests: string[] = [];
  const readAccessBodies: unknown[] = [];

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
        account: { id: ACCOUNT_ID, displayName: 'Lea Sommer' },
        tokens: {
          accessToken: 'carousel-e2e-access',
          refreshToken: 'carousel-e2e-refresh',
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ id: ACCOUNT_ID, displayName: 'Lea Sommer' });
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
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    ) {
      await fulfillJson({
        id: PROFILE_ID,
        accountId: ACCOUNT_ID,
        displayName: 'Lea Sommer',
        preferences: [],
        profileAttachmentId: null,
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
        version: 1,
      });
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
        upcoming: [],
        retrospective: null,
        relationshipDuration: null,
        space: { spaceId: SPACE_ID, partner: null },
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson({ items: [], hasMore: false, nextCursor: null });
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
      pathname === `/api/v1/spaces/${SPACE_ID}/story-views`
    ) {
      await route.fulfill({ status: 204 });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories/${MEMORY_ID}`
    ) {
      await fulfillJson(MULTI_MEMORY);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories/${SINGLE_MEMORY_ID}`
    ) {
      await fulfillJson(SINGLE_MEMORY);
      return;
    }

    if (
      method === 'GET' &&
      pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/memories/`) &&
      pathname.endsWith('/comments')
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    const readAccessMatch = pathname.match(
      new RegExp(
        `^/api/v1/spaces/${SPACE_ID}/attachments/([^/]+)/read-access$`,
      ),
    );
    if (method === 'POST' && readAccessMatch) {
      readAccessBodies.push(request.postDataJSON());
      await fulfillJson({
        method: 'STREAM',
        url: `/api/v1/spaces/${SPACE_ID}/attachments/${readAccessMatch[1]}/content`,
      });
      return;
    }

    const contentMatch = pathname.match(
      new RegExp(`^/api/v1/spaces/${SPACE_ID}/attachments/([^/]+)/content$`),
    );
    if (method === 'GET' && contentMatch) {
      const media = ATTACHMENTS.find((entry) => entry.id === contentMatch[1]);
      if (!media) {
        await route.fulfill({ status: 404 });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: Buffer.from(media.svg),
      });
      return;
    }

    unexpectedRequests.push(`${method} ${pathname}`);
    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The carousel stability test did not define ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return { unexpectedRequests, readAccessBodies };
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function openMemory(
  page: Page,
  memoryId = MEMORY_ID,
  title = MULTI_MEMORY.title,
): Promise<void> {
  await page.goto(`/story/memories/${memoryId}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(
    page.locator(
      '.media-gallery-carousel-slide:not(.is-clone) .media-gallery-carousel-content',
    ),
  ).toHaveCount(memoryId === MEMORY_ID ? 3 : 1);
}

async function positionGalleryForReading(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const galleryTop = await page
    .locator('.media-gallery-carousel-viewport')
    .evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
  await page.evaluate(
    (top) => window.scrollTo(0, Math.max(0, top - 96)),
    galleryTop,
  );
  await nextFrame(page);
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>(
      '.media-gallery-carousel-viewport',
    );
    const provenance = document.querySelector<HTMLElement>(
      '.memory-provenance-footer',
    );
    if (!frame || !provenance) {
      throw new Error('Memory carousel geometry did not render.');
    }
    const frameRect = frame.getBoundingClientRect();
    const provenanceRect = provenance.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      frameHeight: frameRect.height,
      provenanceDocumentY: provenanceRect.top + window.scrollY,
    };
  });
}

function expectStableGeometry(
  before: Awaited<ReturnType<typeof geometry>>,
  after: Awaited<ReturnType<typeof geometry>>,
): void {
  expect(Math.abs(after.scrollY - before.scrollY)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.frameHeight - before.frameHeight)).toBeLessThanOrEqual(
    1,
  );
  expect(
    Math.abs(after.provenanceDocumentY - before.provenanceDocumentY),
  ).toBeLessThanOrEqual(1);
}

test('Memory carousel keeps document and layout position stable across pointer and keyboard navigation', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { unexpectedRequests, readAccessBodies } = await installApiMocks(page);
  await page.goto('/today');
  await signIn(page);
  await openMemory(page);
  await positionGalleryForReading(page);

  const next = page.getByRole('button', { name: GALLERY.next });
  const previous = page.getByRole('button', { name: GALLERY.previous });
  const counter = page.locator('.media-gallery-carousel-counter');

  await expect(page.locator('.media-gallery-carousel-footer')).toHaveCount(0);
  await expect(page.locator('.media-gallery-carousel-dots')).toHaveCount(0);
  expect(
    await page
      .locator('.media-gallery-carousel-content')
      .first()
      .evaluate((element) => getComputedStyle(element).objectFit),
  ).toBe('contain');

  const ambientBackdrop = page
    .locator('.media-gallery-carousel-backdrop')
    .first();
  await expect(ambientBackdrop).toBeVisible();
  expect(
    await ambientBackdrop.evaluate(
      (element) => getComputedStyle(element).objectFit,
    ),
  ).toBe('cover');
  expect(
    await ambientBackdrop.evaluate(
      (element) => getComputedStyle(element).filter,
    ),
  ).toContain('blur');

  const interaction = await carouselInteractionContract(page);
  expect(interaction.scrollSnapType).toContain('x');
  expect(interaction.scrollSnapType).toContain('mandatory');
  expect(interaction.overscrollBehaviorX).toBe('contain');
  expect(interaction.touchAction).toContain('pan-x');
  expect(interaction.touchAction).toContain('pan-y');
  expect(interaction.cloneCount).toBe(2);
  await expectCarouselSettled(page, 0);

  const pointerSteps = [
    { control: next, expected: 2 },
    { control: next, expected: 3 },
    { control: next, expected: 1 },
    { control: previous, expected: 3 },
    { control: previous, expected: 2 },
  ] as const;

  for (const step of pointerSteps) {
    const before = await geometry(page);
    await pointerClickWithoutScroll(page, step.control);
    await expect(counter).toHaveText(counterLabel(step.expected, 3));
    await expectCarouselSettled(page, step.expected - 1);
    await expect(
      page.locator('.media-gallery-carousel-slide.is-active'),
    ).toHaveCount(1);
    await expect(
      page.locator('.media-gallery-carousel-slide.is-outgoing'),
    ).toHaveCount(0);
    expectStableGeometry(before, await geometry(page));
  }

  await next.focus();
  await expect(next).toBeFocused();
  const beforeKeyboard = await geometry(page);
  await page.keyboard.press('Enter');
  await expect(counter).toHaveText(counterLabel(3, 3));
  await expectCarouselSettled(page, 2);
  await expect(next).toBeFocused();
  expectStableGeometry(beforeKeyboard, await geometry(page));

  const activeItem = page.getByRole('button', {
    name: openItemLabel(3, 3),
  });
  const beforeOpen = await geometry(page);
  await pointerClickWithoutScroll(page, activeItem);
  const lightbox = page.locator('.media-lightbox');
  const close = lightbox.getByRole('button', { name: GALLERY.close });
  await expect(close).toBeFocused();
  await nextFrame(page);
  expectStableGeometry(beforeOpen, await geometry(page));
  expect(
    await page.evaluate(() => {
      const topElement = document.elementFromPoint(window.innerWidth / 2, 20);
      return Boolean(topElement?.closest('.media-lightbox-backdrop'));
    }),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('story-memory-lightbox-expanded.png'),
    fullPage: false,
  });

  const lightboxNext = lightbox.getByRole('button', {
    name: GALLERY.next,
  });
  await lightboxNext.focus();
  const beforeLightboxNext = await geometry(page);
  await page.keyboard.press('Enter');
  await expect(lightboxNext).toBeFocused();
  await nextFrame(page);
  expectStableGeometry(beforeLightboxNext, await geometry(page));

  await page.keyboard.press('ArrowLeft');
  await expect(lightboxNext).toBeFocused();
  await nextFrame(page);
  expectStableGeometry(beforeLightboxNext, await geometry(page));
  await page.keyboard.press('Escape');

  const readParents = readAccessBodies.map(
    (body) =>
      body as {
        parentType?: unknown;
        parentId?: unknown;
      },
  );
  // StrictMode may start the read effect twice in development. Every issued
  // descriptor request still has to keep the Memory parent binding intact.
  expect(readParents.length).toBeGreaterThanOrEqual(3);
  expect(
    readParents.every(
      (body) => body.parentType === 'MEMORY' && body.parentId === MEMORY_ID,
    ),
  ).toBe(true);
  expect(unexpectedRequests).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('story-memory-carousel-expanded.png'),
    fullPage: true,
  });
});

test('Memory carousel touch controls stay stable at 320px and 390px', async ({
  browser,
}, testInfo) => {
  for (const width of [320, 390] as const) {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width, height: 844 },
    });
    const page = await context.newPage();
    try {
      await page.emulateMedia({
        colorScheme: width === 390 ? 'dark' : 'light',
      });
      const { unexpectedRequests } = await installApiMocks(page);
      await page.goto('/today');
      await signIn(page);
      await openMemory(page);
      await positionGalleryForReading(page);

      const next = page.locator('.media-gallery-carousel-next');
      await expect(next).toBeHidden();

      const interaction = await carouselInteractionContract(page);
      expect(interaction.scrollSnapType).toContain('x');
      expect(interaction.scrollSnapType).toContain('mandatory');
      expect(interaction.overscrollBehaviorX).toBe('contain');
      expect(interaction.touchAction).toContain('pan-x');
      expect(interaction.touchAction).toContain('pan-y');
      expect(interaction.cloneCount).toBe(2);
      await expectCarouselSettled(page, 0);

      const touchSteps = [
        { direction: 'next', expected: 2 },
        { direction: 'previous', expected: 1 },
        { direction: 'previous', expected: 3 },
        { direction: 'next', expected: 1 },
      ] as const;

      for (const step of touchSteps) {
        const before = await geometry(page);
        const drag = await swipeCarousel(page, step.direction);
        expect(
          Math.abs(drag.midScrollLeft - drag.startScrollLeft),
        ).toBeGreaterThan(drag.viewportWidth * 0.2);
        expect(drag.visibleSlides).toBeGreaterThanOrEqual(2);
        await expect(
          page.locator('.media-gallery-carousel-counter'),
        ).toHaveText(counterLabel(step.expected, 3));
        await expectCarouselSettled(page, step.expected - 1);
        await expect(
          page.locator('.media-gallery-carousel-slide.is-outgoing'),
        ).toHaveCount(0);
        expectStableGeometry(before, await geometry(page));
      }
      expect(unexpectedRequests).toEqual([]);

      await page.screenshot({
        path: testInfo.outputPath(`story-memory-carousel-touch-${width}.png`),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  }
});

test('Memory carousel is effectively static with reduced motion and reflows at 200 percent', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const { unexpectedRequests } = await installApiMocks(page);
  await page.goto('/today');
  await signIn(page);
  await openMemory(page);
  await positionGalleryForReading(page);

  const before = await geometry(page);
  await page.getByRole('button', { name: GALLERY.next }).click();
  await expect(page.locator('.media-gallery-carousel-counter')).toHaveText(
    counterLabel(2, 3),
  );
  await nextFrame(page);
  expectStableGeometry(before, await geometry(page));

  await expectCarouselSettled(page, 1);
  await expect(
    page.locator('.media-gallery-carousel-slide.is-outgoing'),
  ).toHaveCount(0);
  const reducedMotion = await page
    .locator('.media-gallery-carousel-slide.is-active')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(reducedMotion).toBe('none');

  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });
  await nextFrame(page);
  const reflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(reflow.scrollWidth).toBeLessThanOrEqual(reflow.clientWidth);

  expect(unexpectedRequests).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath(
      'story-memory-carousel-reduced-dark-200-percent.png',
    ),
    fullPage: true,
  });
});

test('Single-image Memory keeps the stable frame without carousel navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { unexpectedRequests } = await installApiMocks(page);
  await page.goto('/today');
  await signIn(page);
  await openMemory(page, SINGLE_MEMORY_ID, SINGLE_MEMORY.title);

  await expect(
    page.getByRole('button', { name: GALLERY.previous }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: GALLERY.next })).toHaveCount(0);
  await expect(page.locator('.media-gallery-carousel-counter')).toHaveCount(0);
  await expect(page.locator('.media-gallery-carousel-footer')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: openItemLabel(1, 1) }),
  ).toBeVisible();
  await expect(
    page.locator('.media-gallery-carousel-slide.is-active'),
  ).toHaveCount(1);
  await expect(
    page.locator('.media-gallery-carousel-slide.is-outgoing'),
  ).toHaveCount(0);
  await expect(
    page.locator('.media-gallery-carousel-slide.is-clone'),
  ).toHaveCount(0);

  const frameHeight = await page
    .locator('.media-gallery-carousel-viewport')
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(frameHeight).toBeGreaterThan(0);
  expect(unexpectedRequests).toEqual([]);
});
