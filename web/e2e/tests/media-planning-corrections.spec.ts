import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import composerCopy from '../../src/i18n/locales/composer';
import de from '../../src/i18n/locales/de';
import experiences from '../../src/i18n/locales/experiences';
import m5s3 from '../../src/i18n/locales/m5s3';
import memoryProduct from '../../src/i18n/locales/memoryProduct';
import sources from '../../src/i18n/locales/photoSources';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskSheets from '../../src/i18n/locales/taskSheets';
import fixtureCopy from '../fixtures/locales/de';
import { expectLabeledComposerTool } from '../support/addAction';
import { swipeCarousel } from '../support/mediaCarouselGesture';
import { expectQuietComposerMedia } from '../support/mediaDraft';
import { expectMediaIntakeAction } from '../support/mediaIntake';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const copy = fixtureCopy.mediaPlanning;
const stamp = '2026-11-04T09:00:00Z';
const jpeg = readFileSync(
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
const id = (index: number) =>
  `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`;

function plan(index: number) {
  return {
    id: id(index),
    spaceId: SPACE_ID,
    createdBy: ACCOUNT_ID,
    creator: ME,
    title: `${copy.plan} ${index}`,
    description: copy.description,
    status: 'PLANNED',
    plannedOn: new Date(Date.UTC(2099, 10, index)).toISOString().slice(0, 10),
    plannedStart: null,
    plannedEnd: null,
    experiencedOn: null,
    sourceWishId: null as string | null,
    attachments: [],
    coverAttachment: null,
    selectedCoverAttachmentId: null,
    anticipationEnabled: false,
    version: 1,
    capabilities: CAPABILITIES,
    createdAt: stamp,
    updatedAt: stamp,
  };
}
function wish(index: number) {
  return {
    id: id(100 + index),
    spaceId: SPACE_ID,
    createdBy: ACCOUNT_ID,
    creator: ME,
    title: `${copy.wish} ${index}`,
    status: 'OPEN',
    version: 1,
    capabilities: CAPABILITIES,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

async function setup(page: Page, failNextWish = false) {
  const unknown = await installMocks(page, { strict: true });
  const plans = Array.from({ length: 32 }, (_, i) => plan(i + 1));
  const wishes = Array.from({ length: 32 }, (_, i) => wish(i + 1));
  const state = {
    planReads: [] as string[],
    wishReads: [] as string[],
    linkWrites: 0,
    planSaveMatch: '',
    mediaWrites: 0,
    bound: [] as string[],
    allocatedByName: {} as Record<string, string>,
    cover: null as string | null,
    failNextWish,
  };
  let memory = {
    id: 'mem-canal',
    spaceId: SPACE_ID,
    authorId: ACCOUNT_ID,
    author: ME,
    title: copy.plan,
    body: copy.description,
    happenedOn: '2026-11-04',
    attachments: [] as Record<string, unknown>[],
    tags: [],
    capabilities: CAPABILITIES,
    createdAt: stamp,
    updatedAt: stamp,
    version: 1,
  };
  const media = new Map<string, Record<string, unknown>>();
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      p = url.pathname,
      method = request.method();
    const root = `/api/v1/spaces/${SPACE_ID}`;
    const json = (value: unknown, status = 200) =>
      route.fulfill({ json: value, status });
    if (method === 'GET' && p === `${root}/places`)
      return json({ items: [], nextCursor: null, hasMore: false });
    if (method === 'GET' && /\/plans\/[^/]+\/comments$/.test(p))
      return json({ items: [], nextCursor: null, hasMore: false });
    if (p === `${root}/plans` && method === 'GET') {
      const cursor = url.searchParams.get('cursor') ?? '';
      state.planReads.push(cursor);
      expect(url.searchParams.get('limit')).toBe('20');
      expect(url.searchParams.get('overviewScope')).toBe('OPEN');
      const offset = cursor ? Number(cursor) : 0;
      return json({
        items: plans.slice(offset, offset + 20),
        nextCursor: offset + 20 < plans.length ? String(offset + 20) : null,
        hasMore: offset + 20 < plans.length,
      });
    }
    if (p === `${root}/wishes` && method === 'GET') {
      const cursor = url.searchParams.get('cursor') ?? '';
      state.wishReads.push(cursor);
      if (cursor && state.failNextWish) {
        state.failNextWish = false;
        return json(
          {
            type: 'about:blank',
            status: 503,
            title: 'Temporarily unavailable',
          },
          503,
        );
      }
      const offset = cursor ? Number(cursor) : 0;
      return json({
        items: wishes.slice(offset, offset + 20),
        nextCursor: offset + 20 < wishes.length ? String(offset + 20) : null,
        hasMore: offset + 20 < wishes.length,
      });
    }
    const selectedWish = wishes.find(
      (item) => p === `${root}/wishes/${item.id}`,
    );
    if (selectedWish && method === 'GET') return json(selectedWish);
    const selectedPlan = plans.find(
      (item) =>
        p === `${root}/plans/${item.id}` ||
        p === `${root}/plans/${item.id}/wish`,
    );
    if (selectedPlan && p.endsWith('/wish') && method === 'POST') {
      state.linkWrites++;
      selectedPlan.sourceWishId = request.postDataJSON().wishId;
      selectedPlan.version++;
      return json({
        plan: selectedPlan,
        wish: { ...wishes[0], status: 'PLANNED' },
      });
    }
    if (selectedPlan && method === 'GET') return json(selectedPlan);
    if (selectedPlan && method === 'PATCH') {
      state.planSaveMatch = request.headers()['if-match'] ?? '';
      Object.assign(selectedPlan, request.postDataJSON(), {
        version: selectedPlan.version + 1,
      });
      return json(selectedPlan);
    }
    if (p === `${root}/memories/mem-canal` && method === 'GET')
      return json(memory);
    if (p === `${root}/memories/mem-canal` && method === 'PATCH') {
      memory = {
        ...memory,
        ...request.postDataJSON(),
        version: memory.version + 1,
      };
      return json(memory);
    }
    if (p === `${root}/attachments` && method === 'POST') {
      const attachmentId = id(200 + ++state.mediaWrites);
      const originalName = request.postDataJSON().originalName;
      if (typeof originalName !== 'string')
        throw new Error(
          'Canonical media admission requires its original filename.',
        );
      state.allocatedByName[originalName] = attachmentId;
      const a = {
        id: attachmentId,
        mediaType: 'IMAGE',
        status: 'READY',
        mimeType: 'image/jpeg',
        size: jpeg.length,
        width: 1200,
        height: 800,
        hasThumbnail: true,
        isSensitive: false,
        durationSeconds: null,
        version: 1,
        createdAt: stamp,
        updatedAt: stamp,
      };
      media.set(attachmentId, a);
      return json(
        {
          attachment: { ...a, status: 'PENDING' },
          method: 'STREAM',
          uploadUrl: `${root}/attachments/${attachmentId}/content`,
          headers: {},
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        },
        201,
      );
    }
    if (p.startsWith(`${root}/attachments/`)) {
      const attachmentId = p.split('/attachments/')[1].split('/')[0];
      const a = media.get(attachmentId);
      if (a) {
        if (p.endsWith('/content'))
          return method === 'PUT'
            ? route.fulfill({ status: 204 })
            : route.fulfill({ body: jpeg, contentType: 'image/jpeg' });
        if (p.endsWith('/finalize')) return json({ status: 'PROCESSING' }, 202);
        if (p.endsWith('/read-access'))
          return json({
            method: 'STREAM',
            mediaType: 'IMAGE',
            url: `${root}/attachments/${attachmentId}/content`,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          });
        if (method === 'GET') return json(a);
      }
    }
    if (p === `${root}/memories/mem-canal/attachments` && method === 'PUT') {
      const entries = request.postDataJSON().attachments;
      state.cover = request.postDataJSON().selectedCoverAttachmentId;
      state.bound = entries.map(
        (entry: { attachmentId: string }) => entry.attachmentId,
      );
      memory.attachments = entries.map(
        (entry: { attachmentId: string; position: number }) => ({
          ...media.get(entry.attachmentId),
          position: entry.position,
        }),
      );
      memory.version++;
      return json(memory);
    }
    return route.fallback();
  });
  return { state, plans, wishes, unknown };
}

for (const scenario of [
  { width: 360, theme: 'light' as const },
  { width: 390, theme: 'dark' as const },
  { width: 430, theme: 'light' as const },
  { width: 1280, theme: 'dark' as const },
  { width: 320, theme: 'light' as const, large: true },
]) {
  test(`alphabetical Wishes stay readable and preserve return at ${scenario.width} ${scenario.theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 760 });
    await page.emulateMedia({
      colorScheme: scenario.theme,
      reducedMotion: 'reduce',
    });
    const { state, wishes } = await setup(page);
    await signIn(page);
    await page.goto('/plan#wishes');
    if (scenario.large)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const rows = page.locator('.planen-wish-list > li');
    await expect(rows).toHaveCount(32);
    expect(state.wishReads).toEqual(['', '20']);
    expect(state.planReads).toEqual([]);
    const first = await rows.first().boundingBox(),
      second = await rows.nth(1).boundingBox();
    if (!first || !second) throw new Error('Missing rendered Wish rows.');
    expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
    await expect(
      page.getByRole('button', { name: m5s3.common.loadMore }),
    ).toHaveCount(0);
    await rows.last().scrollIntoViewIfNeeded();
    await expect(rows).toHaveCount(32);
    expect(state.wishReads).toEqual(['', '20']);
    await rows.last().getByRole('link').click();
    await expect(
      page.getByRole('heading', { name: wishes[31].title }),
    ).toBeVisible();
    await page.goBack();
    await expect(rows).toHaveCount(32);
    await expect(rows.last()).toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await captureScreenshot(
      page,
      testInfo,
      `wishes-${scenario.width}-${scenario.theme}${scenario.large ? '-large' : ''}.png`,
      { fullPage: false },
    );
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
  });
}

test('Plans load on scroll and an Edit-only Wish link preserves the unsaved title and version', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const { state, plans, wishes } = await setup(page);
  await signIn(page);
  await page.goto('/plan');
  await expect(page.locator('.planen-next-link')).toContainText(plans[0].title);
  expect(state.planReads).toEqual(['']);
  // #1790 F2: the Plan overview reads Wishes to derive the planned-wish
  // journey, so only the known Wish page cursors may appear here.
  expect(
    state.wishReads.every((cursor: string) => ['', '20'].includes(cursor)),
  ).toBe(true);
  const planPreviews = page.locator('.planen-next-link, .planen-agenda-link');
  await page.locator('.planen-agenda-link').last().scrollIntoViewIfNeeded();
  await expect(planPreviews).toHaveCount(plans.length);
  expect(state.planReads).toEqual(['', '20']);
  await page.goto(`/plan/plans/${plans[0].id}`);
  const linkWish = page.getByRole('button', {
    name: m5s3.plan.linkWish,
    exact: true,
  });
  await expect(linkWish).toHaveCount(0);
  await page
    .getByRole('button', { name: m5s3.common.edit, exact: true })
    .click();
  await page
    .getByRole('textbox', { name: m5s3.common.title, exact: true })
    .fill(copy.edit);
  await linkWish.click();
  await page.getByRole('radio', { name: wishes[0].title, exact: true }).check();
  await captureScreenshot(
    page,
    testInfo,
    'plan-edit-link-choice-390-light.png',
    { fullPage: false },
  );
  await page.getByRole('button', { name: m5s3.plan.confirmWishLink }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: m5s3.common.title, exact: true }),
  ).toHaveValue(copy.edit);
  await page
    .getByRole('button', { name: m5s3.common.saveChanges, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: copy.edit, exact: true }),
  ).toBeVisible();
  expect(state.linkWrites).toBe(1);
  expect(state.planSaveMatch.replaceAll('"', '')).toBe('2');
});

test('a failed next Wish page keeps content and a deliberate retry continues browsing', async ({
  page,
}) => {
  const { state } = await setup(page, true);
  await signIn(page);
  await page.goto('/plan#wishes');
  const rows = page.locator('.planen-wish-list > li');
  await expect(rows).toHaveCount(20);
  await rows.last().scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('button', { name: m5s3.common.loadMore, exact: true }),
  ).toBeVisible();
  await expect(rows).toHaveCount(20);
  await page
    .getByRole('button', { name: m5s3.common.loadMore, exact: true })
    .click();
  await expect(rows).toHaveCount(32);
  expect(state.wishReads).toEqual(['', '20', '20']);
});

test('Memory linking stays behind Edit and dropped photos join the existing save flow', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const { state } = await setup(page);
  await signIn(page);
  await page.goto('/story/memories/mem-canal');
  await expect(
    page.getByRole('heading', { name: copy.plan, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: memoryProduct.planning.add }),
  ).toHaveCount(0);
  await page
    .getByRole('link', { name: memoryProduct.edit, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: memoryProduct.planning.add }),
  ).toBeVisible();
  const transfer = await page.evaluateHandle(
    (bytes) => {
      const value = new DataTransfer();
      value.items.add(
        new File([new Uint8Array(bytes)], 'our-photo.jpg', {
          type: 'image/jpeg',
        }),
      );
      return value;
    },
    [...jpeg],
  );
  await page
    .locator('[data-file-dropzone]')
    .dispatchEvent('drop', { dataTransfer: transfer });
  await expect.poll(() => state.mediaWrites).toBe(1);
  await expect(
    page.getByRole('button', { name: memoryProduct.save, exact: true }),
  ).toBeEnabled();
  await captureScreenshot(
    page,
    testInfo,
    'memory-edit-drop-ready-390-light.png',
    { fullPage: true },
  );
  await page
    .getByRole('button', { name: memoryProduct.save, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
  expect(state.bound).toHaveLength(1);
  await expect(
    page.getByRole('button', { name: memoryProduct.planning.add }),
  ).toHaveCount(0);
  await captureScreenshot(page, testInfo, 'memory-drop-saved-390-light.png', {
    fullPage: true,
  });
});

test('real local codec worker reduces transfer bytes without dropping the audio track', async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  // Preload the bundled fixture before opening the application.
  await page.request.get('/e2e/modules/mediaCompression.js');
  await setup(page);
  await page.route('**/synthetic-compression-recording.mp4', (route) =>
    route.fulfill({ body: movie, contentType: 'video/mp4' }),
  );
  await signIn(page);
  const result = await page.evaluate(async () => {
    const moduleUrl = '/e2e/modules/mediaCompression.js';
    const fixture = await import(moduleUrl);
    return fixture.verifyLocalCompression();
  });
  const evidencePath = testInfo.outputPath('local-codec-result.json');
  await writeFile(evidencePath, JSON.stringify(result, null, 2));
  await testInfo.attach('local-codec-result', {
    path: evidencePath,
    contentType: 'application/json',
  });
  expect(result.type).toBe('video/mp4');
  expect(result.videoTracks).toBe(1);
  expect(result.audioTracks).toBe(1);
  expect(result.duration).toBeGreaterThan(0.9);
  expect(result.duration).toBeLessThan(1.2);
  if (result.supported) {
    expect(result.size).toBeLessThan(result.originalSize * 0.9);
    expect(result.progress.length).toBeGreaterThan(0);
  } else expect(result.size).toBe(result.originalSize);
});

test.describe('free composer media preservation', () => {
  test.use({ hasTouch: true });
  for (const scenario of [
    { width: 390, theme: 'dark' },
    { width: 1280, theme: 'light' },
  ] as const) {
    test(`draft gallery keeps zoom, selection, privacy and cover through save at ${scenario.width}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: scenario.width, height: 900 });
      await page.emulateMedia({
        colorScheme: scenario.theme,
        reducedMotion: 'reduce',
      });
      const { state } = await setup(page);
      await signIn(page);
      await page.goto('/story/memories/mem-canal/edit');
      const prose = page.getByLabel(de.memory.bodyLabel);
      await expect(prose).toBeVisible();
      await prose.fill(copy.description);
      await page.locator('#memory-edit-images').setInputFiles([
        { name: 'first-photo.jpg', mimeType: 'image/jpeg', buffer: jpeg },
        { name: 'second-photo.jpg', mimeType: 'image/jpeg', buffer: jpeg },
      ]);
      await expect.poll(() => state.mediaWrites).toBe(2);
      const tiles = page.locator('.photo-draft-grid .photo-draft-tile');
      await expect(tiles).toHaveCount(2);
      const inputKeys = await tiles.evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute('data-media-key')),
      );
      expect(inputKeys.every(Boolean)).toBe(true);
      await expectQuietComposerMedia(page);
      await expect(tiles.first()).toHaveAccessibleName(
        new RegExp(de.memory.photoReady),
      );
      await tiles.nth(1).click();
      const selected = page.locator('.photo-draft-stage');
      const chosenKey = await tiles.nth(1).getAttribute('data-media-key');
      if (!chosenKey)
        throw new Error('The selected draft identity is unavailable.');
      await selected
        .getByRole('button', { name: experiences.chooseCover })
        .click();
      const privacy = page.locator('.photo-draft-stage-sensitive');
      const privacyGeometry = () =>
        privacy.evaluate((element) => {
          const container = element.closest('.media-gallery-carousel-viewport');
          if (!container)
            throw new Error('The preview container is unavailable.');
          const frame = container.getBoundingClientRect();
          const rect = element.getBoundingClientRect();
          return {
            x: rect.x - frame.x,
            y: rect.y - frame.y,
            width: rect.width,
            height: rect.height,
          };
        });
      const before = await privacyGeometry();
      await privacy.locator('input').check();
      await expect(selected.getByRole('checkbox')).toBeChecked();
      expect(await privacyGeometry()).toEqual(before);
      await privacy.locator('input').uncheck();
      await page.locator('.photo-draft-stage').evaluate((stage) => {
        stage.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      await page
        .locator('.photo-draft-stage .media-gallery-carousel-slide.is-active')
        .click();
      const dialog = page.getByRole('dialog', {
        name: storyProducts.gallery.dialogAria,
      });
      const photo = dialog.locator('.media-lightbox-photo img');
      await expect(photo).toBeVisible();
      const frame = await dialog.locator('.media-lightbox-photo').boundingBox();
      if (!frame) throw new Error('The draft photo frame is unavailable.');
      const x = frame.x + frame.width / 2,
        y = frame.y + frame.height / 2;
      await page.touchscreen.tap(x, y);
      await page.touchscreen.tap(x, y);
      const scale = () =>
        photo.evaluate(
          (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).a,
        );
      await expect.poll(scale).toBeGreaterThan(2);
      await page.touchscreen.tap(x, y);
      await page.touchscreen.tap(x, y);
      await expect.poll(scale).toBe(1);
      await swipeCarousel(page, 'next', 'lightbox');
      await expect(dialog.locator('.media-lightbox-counter')).toHaveText(
        storyProducts.gallery.counter
          .replace('{{index}}', '1')
          .replace('{{count}}', '2'),
      );
      await dialog
        .getByRole('button', { name: storyProducts.gallery.close })
        .click();
      await expect(dialog).toHaveCount(0);
      // Latest PO correction removes composer arrangement/reset rows. The native
      // thumbnail selects the preview without changing cover identity or import order.
      await expectQuietComposerMedia(page);
      expect(
        await tiles.evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('data-media-key')),
        ),
      ).toEqual(inputKeys);
      await tiles.first().click();
      await expect(tiles.first()).toHaveAttribute('aria-pressed', 'true');
      await expect(tiles.nth(1)).toHaveAttribute('data-media-key', chosenKey);
      await expect(
        tiles.nth(1).locator('.photo-draft-cover-star'),
      ).toBeVisible();
      await expect(
        tiles.first().locator('.photo-draft-cover-star'),
      ).toHaveCount(0);
      await expect(prose).toHaveValue(copy.description);
      await expect
        .poll(() =>
          page.locator('.media-gallery-carousel-track').evaluate((track) => {
            const active = track.querySelector<HTMLElement>('.is-active');
            if (!active) throw new Error('The active preview is unavailable.');
            return Math.abs(active.offsetLeft - track.scrollLeft);
          }),
        )
        .toBeLessThan(1);
      const privacyCopy = await privacy.locator('span').evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          height: element.getBoundingClientRect().height,
          lineHeight: parseFloat(style.lineHeight),
        };
      });
      expect(privacyCopy.height).toBeLessThanOrEqual(
        privacyCopy.lineHeight + 1,
      );
      const axe = await new AxeBuilder({ page })
        .include('.free-composer')
        .analyze();
      expect(axe.violations).toEqual([]);
      await captureScreenshot(
        page.locator('.photo-draft-gallery'),
        info,
        `shell-composer-media-${scenario.width}-${scenario.theme}.png`,
      );
      await page
        .getByRole('button', { name: memoryProduct.save, exact: true })
        .click();
      await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
      expect(state.bound).toEqual(
        ['first-photo.jpg', 'second-photo.jpg'].map(
          (name) => state.allocatedByName[name],
        ),
      );
      expect(state.cover).toBe(state.bound[1]);
    });
  }
});

test.describe('integrated soft media choices', () => {
  for (const scenario of [
    { width: 360, theme: 'light', large: false },
    { width: 390, theme: 'dark', large: false },
    { width: 430, theme: 'light', large: false },
    { width: 1280, theme: 'dark', large: false },
    { width: 320, theme: 'light', large: true },
  ] as const) {
    test(`writing and media share one accessible composer at ${scenario.width} ${scenario.theme}`, async ({
      page,
    }, info) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: scenario.width, height: 900 });
      await page.emulateMedia({
        colorScheme: scenario.theme,
        reducedMotion: 'reduce',
      });
      const { plans } = await setup(page);
      await page.route(`**/api/v1/spaces/${SPACE_ID}/photo-sources`, (route) =>
        route.fulfill({
          json: {
            enabled: true,
            canImport: true,
            googleAvailable: true,
            immichConnected: true,
          },
        }),
      );
      await signIn(page);
      for (const [index, route] of [
        '/story/memories/new',
        '/story/memories/mem-canal/edit',
        '/plan/plans/new',
        `/plan/plans/${plans[0].id}`,
      ].entries()) {
        await page.goto(route);
        if (index === 3)
          await page
            .getByRole('button', { name: m5s3.common.edit, exact: true })
            .click();
        if (scenario.large)
          await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
          });
        const composer = page.locator('.page-composer');
        await expect(composer).toHaveCount(1);
        const diary = index < 2;
        // #1790 D1: the diary has one photo entry, the intake; it opens the
        // shared source sheet because an external source is connected here.
        const entry = diary
          ? composer.locator('.composer-diary-intake .media-intake-device')
          : composer
              .locator('.composer-tool-row')
              .getByRole('button', { name: composerCopy.photo, exact: true });
        const external = composer.getByRole('button', {
          name: sources.more,
          exact: true,
        });
        if (diary) {
          await expect(
            composer
              .locator('.composer-tool-row')
              .getByRole('button', { name: composerCopy.photo, exact: true }),
          ).toHaveCount(0);
          await expectMediaIntakeAction(entry, 'foto');
          await expect(entry).toHaveAttribute('aria-haspopup', 'dialog');
        } else {
          await expectLabeledComposerTool(entry, 'foto');
        }
        await expect(composer.locator('.media-action-group')).toHaveCount(1);
        await expect(composer.locator('.media-action-group-label')).toHaveCount(
          0,
        );
        await expect(
          composer.getByText(de.memory.photoFormats, { exact: true }),
        ).toHaveCount(0);
        await expect(composer.locator('.media-action-group')).toHaveCSS(
          'background-color',
          'rgba(0, 0, 0, 0)',
        );
        await expect(external).toHaveCount(0);
        for (const surface of [
          composer,
          composer.locator('.composer-writing-surface, .page-composer-writing'),
          ...(diary ? [] : [entry]),
        ])
          await expect(surface).toHaveCSS('border-top-width', '0px');
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        const prose = composer.getByRole('textbox', {
          name: de.memory.bodyLabel,
          exact: true,
        });
        if (index === 0) {
          await prose.fill(copy.description);
          await expect(prose).toHaveCSS('outline-style', 'solid');
          await expect(prose).toHaveCSS('outline-width', '2px');
        }
        const sheet = page.getByRole('dialog', {
          name: sources.title,
          exact: true,
        });
        const device = sheet.getByRole('button', {
          name: sources.device,
          exact: true,
        });
        const google = sheet.getByRole('button', {
          name: sources.google,
          exact: true,
        });
        const immich = sheet.getByRole('button', {
          name: sources.immich,
          exact: true,
        });
        await entry.press('Enter');
        await expect(sheet).toBeVisible();
        for (const [action, icon] of [
          [device, 'foto'],
          [google, 'photo-library'],
          [immich, 'photo-library'],
        ] as const)
          await expectMediaIntakeAction(action, icon);
        await expect(device.locator('.media-intake-pro')).toHaveCount(0);
        await expect(google.locator('.media-intake-pro')).toHaveCount(1);
        await expect(immich.locator('.media-intake-pro')).toHaveCount(1);
        expect(
          await sheet.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
        ).toBe(true);
        if (index === 0) {
          await page.keyboard.press('Tab');
          await expect(sheet.locator('.short-task-sheet-body')).toBeFocused();
          await page.keyboard.press('Tab');
          await expect(device).toBeFocused();
          await expect(device).toHaveCSS('outline-style', 'solid');
          const chooser = page.waitForEvent('filechooser');
          await device.press('Enter');
          await (await chooser).setFiles([]);
          await expect(sheet).toBeVisible();
          await expect(device).toBeFocused();
          const axe = await new AxeBuilder({ page })
            .include('.photo-source-sheet')
            .analyze();
          expect(axe.violations).toEqual([]);
          await captureScreenshot(
            page,
            info,
            `shell-unified-source-choice-${scenario.width}-${scenario.theme}.png`,
            { fullPage: true },
          );
          await page.emulateMedia({ forcedColors: 'active' });
          for (const action of [device, google, immich])
            await expect(action).toHaveCSS('border-top-width', '1px');
          await page.emulateMedia({ forcedColors: 'none' });
        }
        await sheet
          .getByRole('button', { name: taskSheets.close, exact: true })
          .last()
          .click();
        await expect(sheet).toHaveCount(0);
        await expect(entry).toBeFocused();
        if (index === 0) {
          await expect(prose).toHaveValue(copy.description);
          await page.emulateMedia({ forcedColors: 'active' });
          await expect(prose).toHaveCSS('border-top-width', '0px');
          await prose.focus();
          await expect(prose).toHaveCSS('outline-style', 'solid');
          await expect(prose).toHaveCSS('outline-width', '2px');
          await expect(entry).toHaveCSS('border-top-width', '1px');
          await page.emulateMedia({ forcedColors: 'none' });
          await page.locator('.composer-header h1').click();
          expect(
            (await new AxeBuilder({ page }).include('.free-composer').analyze())
              .violations,
          ).toEqual([]);
        }
        const surface = ['', '-memory-edit', '-plan-create', '-plan-edit'][
          index
        ];
        await captureScreenshot(
          page,
          info,
          `shell-soft-composer${surface}-${scenario.width}-${scenario.theme}.png`,
          { fullPage: true },
        );
      }
    });
  }
});
