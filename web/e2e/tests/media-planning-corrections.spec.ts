import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import m5s3 from '../../src/i18n/locales/m5s3';
import memoryProduct from '../../src/i18n/locales/memoryProduct';
import fixtureCopy from '../fixtures/locales/de';
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
  expect(state.wishReads).toEqual([]);
  await page.locator('.planen-agenda-link').last().scrollIntoViewIfNeeded();
  await expect(page.locator('[data-planning-key]')).toHaveCount(32);
  expect(state.planReads).toEqual(['', '20']);
  await page.goto(`/plan/plans/${plans[0].id}`);
  await expect(
    page.getByRole('button', { name: m5s3.plan.linkWish }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: m5s3.common.edit, exact: true })
    .click();
  await page
    .getByRole('textbox', { name: m5s3.common.title, exact: true })
    .fill(copy.edit);
  await page.getByRole('button', { name: m5s3.plan.linkWish }).click();
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
