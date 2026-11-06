import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import photoSources from '../../src/i18n/locales/photoSources';
import sensitiveMedia from '../../src/i18n/locales/sensitiveMedia';
import storyCopy from '../../src/i18n/locales/storyProducts';
import taskSheets from '../../src/i18n/locales/taskSheets';
import videoCopy from '../../src/i18n/locales/video';
import fixtureCopy from '../fixtures/locales/de';
import { swipeCarousel } from '../support/mediaCarouselGesture';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  installMocks,
  ME,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const MEMORY = '44444444-4444-4444-8444-444444444444';
const PHOTO = '55555555-5555-4555-8555-555555555555';
const VIDEO = '66666666-6666-4666-8666-666666666666';
const image = readFileSync(
  new URL(
    '../../../backend/demo_assets/images/lake-sunrise.jpg',
    import.meta.url,
  ),
);
const movie = readFileSync(
  new URL(
    '../../../backend/tests/fixtures/media/video-with-metadata.mp4',
    import.meta.url,
  ),
);
const momentBody = fixtureCopy.videoAttachment.body;

function attachment(id: string, mediaType: 'IMAGE' | 'VIDEO') {
  return {
    id,
    mediaType,
    status: 'READY',
    version: 1,
    mimeType: mediaType === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
    size: mediaType === 'VIDEO' ? movie.length : image.length,
    width: 96,
    height: 64,
    hasThumbnail: true,
    durationSeconds: mediaType === 'VIDEO' ? 1 : null,
    isSensitive: false,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  };
}
function memory(
  attachments: ReturnType<typeof attachment>[],
  body = momentBody,
) {
  return {
    id: MEMORY,
    spaceId: SPACE_ID,
    authorId: ACCOUNT_ID,
    author: ME,
    title: fixtureCopy.videoAttachment.title,
    body,
    happenedOn: '2026-11-01',
    tags: [],
    attachments: attachments.map((a, position) => ({ ...a, position })),
    capabilities: CAPABILITIES,
    version: 2,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  };
}
async function setup(
  page: Page,
  options: {
    allowed?: boolean;
    enabled?: boolean;
    retained?: boolean;
    sensitive?: boolean;
    processing?: boolean;
  } = {},
) {
  const unknown = await installMocks(page, { strict: true });
  const state = {
    videoStatus:
      options.processing || !options.retained ? 'PROCESSING' : 'READY',
    bound: [] as string[],
    grants: 0,
    ranges: 0,
    originalVideoReads: 0,
    uploads: 0,
    saved: options.retained
      ? memory([
          {
            ...attachment(VIDEO, 'VIDEO'),
            isSensitive: options.sensitive ?? false,
          },
        ])
      : (null as ReturnType<typeof memory> | null),
  };
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
    const request = route.request(),
      url = new URL(request.url()),
      p = url.pathname,
      method = request.method();
    const json = (value: unknown, status = 200) =>
      route.fulfill({ json: value, status });
    if (p.endsWith('/auth/capabilities'))
      return json({
        serverAdmin: false,
        videoProcessingEnabled: options.enabled !== false,
      });
    if (p.endsWith('/attachment-upload-policy'))
      return json({
        supportedMimeTypes: ['image/jpeg', 'video/mp4', 'video/quicktime'],
        videoProcessingEnabled: options.enabled !== false,
        videoUploadAllowed: options.allowed !== false,
        videoMaxBytes: 262144000,
        videoMaxDurationSeconds: 180,
      });
    if (p.endsWith('/attachments') && method === 'POST') {
      const body = request.postDataJSON(),
        a = attachment(
          body.mediaType === 'VIDEO' ? VIDEO : PHOTO,
          body.mediaType,
        );
      return json(
        {
          attachment: { ...a, status: 'PENDING' },
          method: 'STREAM',
          uploadUrl: `/api/v1/spaces/${SPACE_ID}/attachments/${a.id}/content`,
          headers: {},
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        },
        201,
      );
    }
    if (p.includes('/attachments/')) {
      const id = p.split('/attachments/')[1].split('/')[0],
        a = attachment(id, id === VIDEO ? 'VIDEO' : 'IMAGE');
      if (p.endsWith('/content') && method === 'PUT') {
        state.uploads++;
        return route.fulfill({ status: 204 });
      }
      if (p.endsWith('/finalize')) return json({ status: 'PROCESSING' }, 202);
      if (p.endsWith('/read-access'))
        return json({
          method: 'STREAM',
          mediaType: a.mediaType,
          url: p.replace('/read-access', '/content'),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        });
      if (p.endsWith('/playback-access')) {
        state.grants++;
        return json({
          url:
            p.replace('/playback-access', '/playback') +
            '?token=synthetic-scoped-grant',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        });
      }
      if (p.endsWith('/playback')) {
        state.ranges++;
        const range = request.headers().range;
        const match = range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = match ? Number(match[1]) : 0,
          end =
            match && match[2]
              ? Math.min(Number(match[2]), movie.length - 1)
              : movie.length - 1;
        return route.fulfill({
          status: range ? 206 : 200,
          body: movie.subarray(start, end + 1),
          contentType: 'video/mp4',
          headers: {
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, no-store',
            ...(range
              ? { 'Content-Range': `bytes ${start}-${end}/${movie.length}` }
              : {}),
          },
        });
      }
      if (p.endsWith('/content') && method === 'GET') {
        if (id === VIDEO && url.searchParams.get('variant') !== 'thumbnail')
          state.originalVideoReads++;
        expect(
          id !== VIDEO || url.searchParams.get('variant') === 'thumbnail',
        ).toBe(true);
        return route.fulfill({ body: image, contentType: 'image/jpeg' });
      }
      if (method === 'GET') return json(a);
    }
    if (p === `/api/v1/spaces/${SPACE_ID}/memories` && method === 'POST') {
      const body = request.postDataJSON();
      state.saved = memory([], body.body);
      state.saved.title = body.title ?? '';
      return json(state.saved, 201);
    }
    if (
      p === `/api/v1/spaces/${SPACE_ID}/memories/${MEMORY}/attachments` &&
      method === 'PUT'
    ) {
      const body = request.postDataJSON();
      state.bound = body.attachments.map(
        (a: { attachmentId: string }) => a.attachmentId,
      );
      state.saved = memory(
        state.bound.map((id) => ({
          ...attachment(id, id === VIDEO ? 'VIDEO' : 'IMAGE'),
          status: id === VIDEO ? state.videoStatus : 'READY',
        })),
        state.saved?.body,
      );
      return json(state.saved);
    }
    if (
      p === `/api/v1/spaces/${SPACE_ID}/memories/${MEMORY}/comments` &&
      method === 'GET'
    )
      return json({ items: [], nextCursor: null, hasMore: false });
    if (
      p === `/api/v1/spaces/${SPACE_ID}/memories/${MEMORY}` &&
      method === 'GET' &&
      state.saved
    )
      return json({
        ...state.saved,
        attachments: state.saved.attachments.map((item) => ({
          ...item,
          status: item.id === VIDEO ? state.videoStatus : item.status,
        })),
      });
    return route.fallback();
  });
  return { state, unknown };
}

test('retained sensitive video controls stay readable and separate at 320px with large text', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const { state, unknown } = await setup(page, {
    retained: true,
    sensitive: true,
    allowed: false,
    enabled: false,
  });
  await signIn(page);
  await page.goto(`/story/memories/${MEMORY}`);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(
    page.getByRole('button', { name: sensitiveMedia.show, exact: true }),
  ).toBeVisible();
  expect(state.grants).toBe(0);
  await page
    .getByRole('button', { name: sensitiveMedia.show, exact: true })
    .click();
  await page.getByRole('button', { name: videoCopy.play, exact: true }).click();
  const dialog = page.getByRole('dialog');
  const privacy = dialog.getByRole('button', {
    name: videoCopy.hide,
    exact: true,
  });
  const close = dialog.getByRole('button', {
    name: storyCopy.gallery.close,
    exact: true,
  });
  await expect(privacy).toBeVisible();
  const box = await privacy.boundingBox(),
    closeBox = await close.boundingBox(),
    stage = await dialog.locator('.media-lightbox-stage').boundingBox();
  if (!box || !closeBox || !stage)
    throw new Error('Missing scaled video controls.');
  expect(box.x).toBeGreaterThanOrEqual(stage.x);
  expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width);
  expect(
    box.x + box.width <= closeBox.x || box.y >= closeBox.y + closeBox.height,
  ).toBe(true);
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  // The localized action must not collapse into a column of single letters.
  expect(box.width).toBeGreaterThan(box.height);
  await expect(privacy.locator('svg')).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('sensitive-video-320-large.png'),
  });
  await privacy.click();
  await expect(dialog.locator('video')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: videoCopy.show, exact: true }),
  ).toBeVisible();
  await close.click();
  await expect(dialog).toHaveCount(0);
  expect(unknown).toEqual([]);
});

for (const [width, colorScheme] of [
  [320, 'light'],
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`mixed video capture, save, deliberate playback, seek and return ${width} ${colorScheme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    const { state, unknown } = await setup(page);
    await signIn(page);
    await page.goto('/story/memories/new');
    if (width === 320)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await page
      .getByLabel(de.memory.bodyLabel, { exact: true })
      .fill(momentBody);
    await page
      .getByRole('button', { name: photoSources.addMedia, exact: true })
      .click();
    const device = page.locator('input[type=file][accept^="image/"]');
    await expect(device).toHaveAttribute('accept', /image\/jpeg.*video\/mp4/);
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    await device.setInputFiles([
      { name: 'sunrise.jpg', mimeType: 'image/jpeg', buffer: image },
      { name: 'jump.mp4', mimeType: 'video/mp4', buffer: movie },
    ]);
    await expect(page.locator('.photo-draft-tile')).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: new RegExp(de.memory.photoReady) }),
    ).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: new RegExp(videoCopy.processing) }),
    ).toHaveCount(1);
    await expect(page.locator('video')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`video-capture-${width}-${colorScheme}.png`),
      fullPage: true,
      type: 'png',
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
      .getByRole('button', { name: de.memory.save, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp('/memories/' + MEMORY + '$'));
    expect(state.bound).toEqual([PHOTO, VIDEO]);
    await expect(
      page.locator(
        '.media-gallery-carousel-slide:not(.is-clone) .media-processing-state',
      ),
    ).toContainText(videoCopy.processing);
    expect(state.grants).toBe(0);
    await page
      .locator('.media-gallery-carousel-track')
      .scrollIntoViewIfNeeded();
    if (width < 600) await swipeCarousel(page, 'next');
    else
      await page
        .getByRole('button', { name: storyCopy.gallery.next, exact: true })
        .click();
    await expect(
      page.locator(
        '.media-gallery-carousel-slide.is-active .media-processing-state',
      ),
    ).toContainText(videoCopy.processing);
    await expect(
      page.getByRole('button', { name: videoCopy.play, exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page.locator('.media-gallery-carousel-track').evaluate((track) => {
          const selected = track.querySelector<HTMLElement>(
            '[data-carousel-index="1"]:not(.is-clone)',
          );
          return selected
            ? Math.abs(track.scrollLeft - selected.offsetLeft)
            : Infinity;
        }),
      )
      .toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath(`video-processing-${width}-${colorScheme}.png`),
      fullPage: false,
    });
    state.videoStatus = 'READY';
    await expect(page.locator('.media-processing-state')).toHaveCount(0);
    await expect(page.locator('.media-gallery-carousel-counter')).toHaveText(
      storyCopy.gallery.counter
        .replace('{{index}}', '2')
        .replace('{{count}}', '2'),
    );
    await page
      .getByRole('button', { name: videoCopy.play, exact: true })
      .click();
    const dialog = page.getByRole('dialog'),
      player = dialog.locator('video');
    await expect(player).toHaveCount(1);
    await expect(player).toBeVisible();
    await expect(player).toBeInViewport({ ratio: 0.8 });
    expect(await player.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await player.evaluate((v: HTMLVideoElement) => v.play());
    await expect
      .poll(() => player.evaluate((v: HTMLVideoElement) => v.readyState))
      .toBeGreaterThanOrEqual(2);
    await player.evaluate((v: HTMLVideoElement) => {
      v.pause();
      v.currentTime = 0.5;
    });
    await expect
      .poll(() => player.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThanOrEqual(0.4);
    await expect
      .poll(() => player.evaluate((v: HTMLVideoElement) => v.seeking))
      .toBe(false);
    const pixel = await player.evaluate(async (v: HTMLVideoElement) => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Video pixel probe is unavailable.');
      context.drawImage(v, 0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    });
    expect(pixel[2]).toBeGreaterThan(200);
    expect(pixel[0]).toBeLessThan(30);
    expect(
      await player.evaluate((v) => {
        const rect = v.getBoundingClientRect();
        const front = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return front === v || (front !== null && v.contains(front));
      }),
    ).toBe(true);
    expect(state.ranges).toBeGreaterThan(0);
    await page.screenshot({
      path: info.outputPath(`video-playback-${width}-${colorScheme}.png`),
      fullPage: false,
      type: 'png',
    });
    await dialog.locator('.media-lightbox-close').click();
    await expect(page.locator('video')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/memories/${MEMORY}$`));
    await expect(page.getByText(momentBody, { exact: true })).toBeVisible();
    expect(state.originalVideoReads).toBe(0);
    expect(state.grants).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(unknown).toEqual([]);
  });
}

test('source selection waits for video eligibility and preserves photo fallback through an explicit retry', async ({
  page,
}) => {
  const { unknown } = await setup(page, {});
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/attachment-upload-policy', async (route) => {
    requests++;
    if (requests === 1) {
      await gate;
      await route.fulfill({
        status: 503,
        json: { status: 503, code: 'UNAVAILABLE' },
      });
    } else
      await route.fulfill({
        json: {
          acceptedMimeTypes: ['image/jpeg', 'video/mp4', 'video/quicktime'],
          videoProcessingEnabled: true,
          videoUploadAllowed: true,
          videoMaxBytes: 262144000,
          videoMaxDurationSeconds: 180,
        },
      });
  });
  await signIn(page);
  await page.goto('/story/memories/new');
  const body = page.getByLabel(de.memory.bodyLabel, { exact: true });
  await body.fill(momentBody);
  const input = page.locator('#memory-create-images');
  await expect(input).toBeDisabled();
  release();
  await expect(
    page.getByText(photoSources.videoAvailabilityUnavailable, { exact: true }),
  ).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(input).not.toHaveAttribute('accept', /video/);
  expect(requests).toBe(1);
  await page
    .getByRole('button', { name: de.common.retry, exact: true })
    .click();
  await expect(input).toHaveAttribute('accept', /image\/jpeg.*video\/mp4/);
  expect(requests).toBe(2);
  await expect(page.locator('.photo-source-sheet')).toHaveCount(0);
  await expect(body).toHaveValue(momentBody);
  expect(unknown).toEqual([]);
});

test('Pro explanation preserves the current Memory draft', async ({ page }) => {
  const { unknown } = await setup(page, { allowed: false });
  await signIn(page);
  await page.goto('/story/memories/new');
  const body = page.getByLabel(de.memory.bodyLabel, { exact: true });
  await body.fill(momentBody);
  await page
    .getByRole('button', { name: photoSources.addMedia, exact: true })
    .click();
  await page.getByRole('button', { name: new RegExp(videoCopy.add) }).click();
  const sheet = page.getByRole('dialog', { name: videoCopy.proTitle });
  await expect(sheet).toContainText(videoCopy.proBody);
  await sheet
    .getByRole('button', { name: taskSheets.close, exact: true })
    .click();
  await expect(body).toHaveValue(momentBody);
  expect(unknown).toEqual([]);
});

test('retained video still plays when operator intake is disabled and Space is Free', async ({
  page,
}) => {
  const { state, unknown } = await setup(page, {
    enabled: false,
    allowed: false,
    retained: true,
  });
  await signIn(page);
  await page.goto('/story/memories/' + MEMORY);
  await page.getByRole('button', { name: videoCopy.play, exact: true }).click();
  await expect(page.getByRole('dialog').locator('video')).toHaveCount(1);
  expect(state.grants).toBe(1);
  expect(unknown).toEqual([]);
});

test('saved processing survives reload and a later failure remains replaceable without playable bytes', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const { state, unknown } = await setup(page, {
    retained: true,
    processing: true,
  });
  await signIn(page);
  await page.goto('/story/memories/' + MEMORY);
  await expect(page.locator('.media-processing-state')).toContainText(
    videoCopy.processing,
  );
  await page.reload();
  await expect(page.locator('.media-processing-state')).toContainText(
    videoCopy.processing,
  );
  expect(state.grants).toBe(0);
  state.videoStatus = 'FAILED';
  await expect(page.locator('.media-processing-state')).toContainText(
    videoCopy.savedFailed,
  );
  await page.goto('/story/memories/' + MEMORY + '/edit');
  await expect(
    page.getByRole('button', { name: new RegExp(videoCopy.savedFailed) }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: new RegExp(videoCopy.savedFailed) })
    .click();
  await expect(
    page.getByRole('group', { name: videoCopy.selectedItem, exact: true }),
  ).toContainText(videoCopy.savedFailed);
  await expect(page.locator('dialog.photo-draft-preview-sheet')).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('followup-video-failed-recovery.png'),
    fullPage: false,
  });
  expect(state.grants).toBe(0);
  expect(state.originalVideoReads).toBe(0);
  expect(unknown).toEqual([]);
});
