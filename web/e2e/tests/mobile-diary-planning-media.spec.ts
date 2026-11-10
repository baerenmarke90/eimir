import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import tagCopy from '../../src/i18n/locales/contextTags';
import de from '../../src/i18n/locales/de';
import copy from '../../src/i18n/locales/m5s3';
import placeCopy from '../../src/i18n/locales/photoPlaces';
import photoCopy from '../../src/i18n/locales/photoSources';
import storyCopy from '../../src/i18n/locales/storyProducts';
import fixtures from '../fixtures/locales/de';
import { nextFrame, swipeCarousel } from '../support/mediaCarouselGesture';
import { showContextTags } from '../support/memoryDiary';
import { installNativeAppLifecycle } from '../support/nativeAppLifecycle';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  getTimelineItems,
  installMocks,
  ME,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const base = `/api/v1/spaces/${SPACE_ID}`;
const picture = readFileSync(
  fileURLToPath(
    new URL(
      '../../../backend/demo_assets/images/lake-sunrise.jpg',
      import.meta.url,
    ),
  ),
);
const attachment = (id = 'photo-one') => ({
  id,
  status: 'READY',
  mediaType: 'IMAGE',
  mimeType: 'image/jpeg',
  size: picture.length,
  width: 1200,
  height: 800,
  hasThumbnail: true,
  isSensitive: false,
  durationSeconds: null,
  position: 0,
});
const fields = {
  spaceId: SPACE_ID,
  createdBy: ACCOUNT_ID,
  creator: ME,
  createdAt: '2026-05-12T08:30:00Z',
  updatedAt: '2026-05-12T08:30:00Z',
  version: 1,
  capabilities: CAPABILITIES,
};
const place = {
  ...fields,
  id: 'garden',
  name: fixtures.planningFollowup.place,
  address: fixtures.planningFollowup.address,
  latitude: 52.5,
  longitude: 13.4,
};
const chapter = {
  id: 'long-chapter',
  title: fixtures.planningFollowup.chapter,
  startOn: '2024-02-02',
  endOn: '2026-10-31',
};

async function fixture(page: Page, photoCount = 2) {
  await page.addInitScript(
    ({ accountId, spaceId }) =>
      localStorage.setItem(
        `eimir:product-tour:v1:${accountId}:${spaceId}`,
        'seen',
      ),
    { accountId: ACCOUNT_ID, spaceId: SPACE_ID },
  );
  const unknown = await installMocks(page, { strict: true });
  const wishes: Array<Record<string, unknown>> = [];
  const plans: Array<Record<string, unknown>> = [];
  let placeCreates = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (path === `${base}/context-tag-suggestions`)
      return json({
        learned: [
          ...new Set(
            [...wishes, ...plans].flatMap(
              (item) => (item.tags as string[]) ?? [],
            ),
          ),
        ],
        proposed: [],
      });
    if (await fulfillDefaultProductContext(route)) return;
    if (path === `${base}/places`) {
      if (request.method() === 'POST') placeCreates++;
      return json({ items: [place], nextCursor: null, hasMore: false });
    }
    if (path === `${base}/places/garden`) return json(place);
    for (const [kind, values] of [
      ['wishes', wishes],
      ['plans', plans],
    ] as const) {
      if (path === `${base}/${kind}`) {
        if (request.method() === 'POST') {
          const body = request.postDataJSON();
          const item = {
            ...fields,
            id: `${kind}-new`,
            status: kind === 'plans' ? 'IDEA' : 'OPEN',
            description: null,
            plannedOn: null,
            plannedStart: null,
            plannedEnd: null,
            experiencedOn: null,
            sourceWishId: null,
            placeId: null,
            anticipationEnabled: false,
            ...body,
            attachments:
              body.attachments?.map(
                (entry: { attachmentId: string; position: number }) => ({
                  ...attachment(entry.attachmentId),
                  position: entry.position,
                }),
              ) ?? [],
          };
          values.push(item);
          return json(item, 201);
        }
        return json({ items: values, nextCursor: null, hasMore: false });
      }
      const item = values.find((item) => path === `${base}/${kind}/${item.id}`);
      if (item) return json(item);
    }
    if (path === `${base}/timeline`) {
      const items =
        url.searchParams.get('year') === '2025'
          ? []
          : getTimelineItems().map((item) =>
              item.kind === 'MEMORY' && item.memory?.id === 'mem-canal'
                ? {
                    ...item,
                    memory: {
                      ...item.memory,
                      places: [{ id: place.id, name: place.name }],
                    },
                  }
                : item,
            );
      return json({
        items,
        nextCursor: null,
        hasMore: false,
        availableYears: [2026, 2025, 2024],
        chapterMarkers: [],
        chapterPeriods: [chapter],
      });
    }
    if (path === `${base}/memories/mem-canal`)
      return json({
        ...fields,
        id: 'mem-canal',
        authorId: ACCOUNT_ID,
        author: ME,
        title: fixtures.planningFollowup.memory,
        body: fixtures.planningFollowup.body,
        tags: [],
        happenedOn: '2026-05-12',
        happenedUntil: null,
        placeIds: [],
        attachments: [
          attachment(),
          { ...attachment('photo-two'), position: 1 },
        ].slice(0, photoCount),
      });
    if (path === `${base}/attachments` && request.method() === 'POST')
      return json(
        {
          attachment: { ...attachment(), version: 1 },
          method: 'STREAM',
          requiredHeaders: {},
          uploadUrl: `${base}/attachments/photo-one/content`,
        },
        201,
      );
    if (path.includes('/attachments/')) {
      if (path.endsWith('/content') && request.method() === 'PUT')
        return route.fulfill({ status: 204 });
      if (path.endsWith('/read-access'))
        return json({
          method: 'STREAM',
          url: `${base}/attachments/photo-one/content`,
          mediaType: 'IMAGE',
        });
      if (path.endsWith('/content'))
        return route.fulfill({ contentType: 'image/jpeg', body: picture });
      return json({ ...attachment(), version: 1 });
    }
    return route.fallback();
  });
  return { unknown, placeCreates: () => placeCreates };
}

test.use({ hasTouch: true });
for (const view of [
  { width: 360, theme: 'light', scale: 1 },
  { width: 390, theme: 'dark', scale: 1 },
  { width: 430, theme: 'light', scale: 1 },
  { width: 1280, theme: 'dark', scale: 1 },
  { width: 320, theme: 'dark', scale: 2 },
] as const) {
  test(`shared tags, native picker and saved Plan place at ${view.width} ${view.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    await page.emulateMedia({
      colorScheme: view.theme,
      reducedMotion: 'reduce',
    });
    const state = await fixture(page);
    await signIn(page);
    await page.goto('/plan/wishes/new');
    await page
      .getByLabel(copy.wish.intentionLabel)
      .fill(fixtures.planningFollowup.wishNew);
    await showContextTags(page);
    await page.getByLabel(tagCopy.newLabel).fill(fixtures.planningFollowup.tag);
    await page
      .getByRole('button', { name: copy.common.save, exact: true })
      .click();
    await expect(page.locator('.memory-tag-summary')).toContainText(
      fixtures.planningFollowup.tag,
    );
    await page.goto('/plan/plans/new');
    if (view.scale === 2)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await page
      .getByLabel(copy.plan.intentionLabel)
      .fill(fixtures.planningFollowup.planNew);
    await showContextTags(page);
    await page.getByText(tagCopy.suggestions, { exact: true }).click();
    await page
      .getByRole('checkbox', {
        name: fixtures.planningFollowup.tag,
        exact: true,
      })
      .check();
    await page
      .getByRole('button', { name: placeCopy.add, exact: true })
      .click();
    const picker = page.getByRole('dialog');
    await picker.getByLabel(placeCopy.savedSearch).fill('Garten');
    await picker
      .getByRole('button', {
        name: new RegExp(fixtures.planningFollowup.place),
      })
      .click();
    await expect(picker).not.toBeVisible();
    const chooserPromise = page.waitForEvent('filechooser');
    await page
      .getByRole('button', { name: photoCopy.addMedia, exact: true })
      .click();
    const chooser = await chooserPromise;
    await expect(page.locator('.photo-source-sheet')).toHaveCount(0);
    await chooser.setFiles({
      name: 'lake.jpg',
      mimeType: 'image/jpeg',
      buffer: picture,
    });
    const tile = page.locator('.photo-draft-tile');
    await expect(tile).toHaveAttribute(
      'aria-label',
      new RegExp(de.memory.photoReady),
    );
    await tile.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('group', { name: de.memory.photoSelected, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: de.memory.photoRemove, exact: true }),
    ).toBeVisible();
    await captureScreenshot(
      page,
      info,
      `followup-media-inline-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    await page
      .getByRole('button', { name: copy.common.save, exact: true })
      .click();
    await expect(page).toHaveURL(/\/plan\/plans\/plans-new$/);
    await expect(page.locator('.planen-detail-when-where')).toContainText(
      place.name,
    );
    await expect(page.locator('.memory-tag-summary')).toContainText(
      fixtures.planningFollowup.tag,
    );
    expect(state.placeCreates()).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await captureScreenshot(
      page,
      info,
      `followup-plan-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    expect(state.unknown).toEqual([]);
  });

  test(`Diary period, floating month, grouped More and touch gallery at ${view.width} ${view.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    await page.emulateMedia({
      colorScheme: view.theme,
      reducedMotion: 'reduce',
    });
    const state = await fixture(page);
    await signIn(page);
    await page.goto('/story');
    if (view.scale === 2)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await page
      .getByRole('tab', { name: de.story.tabTimeline, exact: true })
      .click();
    await expect(page.locator('.story-card-place').first()).toContainText(
      place.name,
    );
    const header = page.locator('.story-year-month-header').first();
    await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(header).toHaveCSS('position', 'sticky');
    await expect(page.locator('.diary-chapter-periods').first()).toContainText(
      chapter.title,
    );
    await captureScreenshot(
      page,
      info,
      `followup-diary-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    await page.goto('/story/years/2025');
    await expect(page.locator('.diary-chapter-periods')).toContainText(
      chapter.title,
    );
    await expect(page.locator('.story-timeline-item')).toHaveCount(0);
    await page.goto('/more');
    for (const label of [
      de.more.groups.moments,
      de.more.groups.shared,
      de.more.groups.utility,
    ])
      await expect(
        page.getByRole('heading', { name: label, exact: true }),
      ).toBeVisible();
    const momentGroup = page.locator('.more-group').filter({
      has: page.getByRole('heading', {
        name: de.more.groups.moments,
        exact: true,
      }),
    });
    expect(
      await momentGroup
        .locator('.more-destination-title-row strong')
        .allTextContents(),
    ).toEqual([
      de.more.destinations.photos,
      de.more.destinations.chapters,
      de.more.destinations.years,
      de.more.destinations.recaps,
      de.more.destinations.insights,
    ]);
    await captureScreenshot(
      page,
      info,
      `followup-more-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    await page.goto('/story/memories/mem-canal');
    await page
      .locator('.media-gallery-carousel-slide:not(.is-clone)')
      .first()
      .click();
    const gallery = page.getByRole('dialog', {
      name: storyCopy.gallery.dialogAria,
    });
    const closePhoto = gallery.getByRole('button', {
      name: storyCopy.gallery.close,
    });
    await expect(closePhoto).toHaveText('');
    await expect(closePhoto.locator('svg')).toBeVisible();
    await expect(closePhoto).toHaveAttribute('title', storyCopy.gallery.close);
    const closeBounds = await closePhoto.boundingBox();
    expect(closeBounds?.width).toBeGreaterThanOrEqual(44);
    expect(closeBounds?.height).toBeGreaterThanOrEqual(44);
    expect(
      await gallery
        .locator('.media-lightbox-nav')
        .first()
        .evaluate((node) => node.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(1);
    await gallery
      .locator('.media-lightbox-track')
      .evaluate((node) =>
        node.scrollBy({ left: node.clientWidth, behavior: 'instant' }),
      );
    await expect(gallery.locator('.media-lightbox-counter')).toContainText(
      fixtures.planningFollowup.twoOfTwo,
    );
    await captureScreenshot(
      page,
      info,
      `followup-gallery-${view.width}-${view.theme}.png`,
    );
    await gallery
      .getByRole('button', { name: storyCopy.gallery.close })
      .click();
    await expect(gallery).toHaveCount(0);
    expect(state.unknown).toEqual([]);
  });
}

test.describe('photo-local touch gestures', () => {
  test.use({ hasTouch: true });
  for (const view of [
    { width: 360, theme: 'light' },
    { width: 390, theme: 'dark' },
    { width: 430, theme: 'light' },
    { width: 1280, theme: 'dark' },
    { width: 320, theme: 'light' },
    { width: 390, theme: 'light', native: true },
    { width: 430, theme: 'dark', native: true },
  ] as const) {
    const native = 'native' in view && view.native;
    test(`pinch, pan, double tap, fit and browse at ${view.width} ${view.theme}${native ? ' native app' : ''}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: view.width, height: 900 });
      await page.emulateMedia({
        colorScheme: view.theme,
        reducedMotion: 'reduce',
      });
      if (native) await installNativeAppLifecycle(page);
      const state = await fixture(page);
      await signIn(page);
      await page.goto('/story/memories/mem-canal');
      const opener = page
        .locator('.media-gallery-carousel-slide:not(.is-clone)')
        .first();
      await opener.click();
      const dialog = page.getByRole('dialog', {
        name: storyCopy.gallery.dialogAria,
      });
      const photo = dialog.locator('.media-lightbox-photo img');
      const frame = dialog.locator('.media-lightbox-photo');
      await expect(photo).toBeVisible();
      await expect(dialog.locator('.media-photo-zoom-controls')).toHaveCount(
        native ? 0 : 1,
      );
      const close = dialog.getByRole('button', {
        name: storyCopy.gallery.close,
        exact: true,
      });
      await expect(close.locator('.eimir-icon')).toHaveCSS('width', '24px');
      await expect(close.locator('.eimir-icon')).toHaveCSS('height', '24px');
      const closeBox = await close.boundingBox();
      expect(closeBox?.width).toBeGreaterThanOrEqual(44);
      expect(closeBox?.height).toBeGreaterThanOrEqual(44);
      await captureScreenshot(
        page,
        info,
        `story-photo-viewer-${view.width}-${view.theme}${native ? '-native-app' : ''}.png`,
      );
      const geometry = await frame.boundingBox();
      if (!geometry) throw new Error('The photo viewport is unavailable.');
      const x = geometry.x + geometry.width / 2;
      const y = geometry.y + geometry.height / 2;
      const distance = Math.min(100, geometry.width * 0.3);
      const track = dialog.locator('.media-lightbox-track');
      const scroll = await track.evaluate((node) => node.scrollLeft);
      const route = page.url();
      const documentState = () =>
        page.evaluate(() => ({ scale: visualViewport?.scale, y: scrollY }));
      const originalDocument = await documentState();
      const scale = () =>
        photo.evaluate(
          (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).a,
        );
      const client = await page.context().newCDPSession(page);
      try {
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [
            { id: 1, x: x - 25, y },
            { id: 2, x: x + 25, y },
          ],
        });
        for (const spread of [40, 60, distance]) {
          await client.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
              { id: 1, x: x - spread, y },
              { id: 2, x: x + spread, y },
            ],
          });
          await nextFrame(page);
        }
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        await expect.poll(scale).toBeGreaterThan(1.2);
        const beforePan = await photo.evaluate(
          (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).e,
        );
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ id: 1, x, y }],
        });
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ id: 1, x: x + 55, y: y + 45 }],
        });
        await nextFrame(page);
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        await expect
          .poll(() =>
            photo.evaluate(
              (node) =>
                new DOMMatrixReadOnly(getComputedStyle(node).transform).e,
            ),
          )
          .not.toBe(beforePan);
      } finally {
        await client.detach();
      }
      expect(await documentState()).toEqual(originalDocument);
      expect(page.url()).toBe(route);
      expect(await track.evaluate((node) => node.scrollLeft)).toBe(scroll);
      await captureScreenshot(
        page,
        info,
        `story-photo-zoom-${view.width}-${view.theme}${native ? '-native-app' : ''}.png`,
      );
      if (native) {
        await page.touchscreen.tap(x, y);
        await page.touchscreen.tap(x, y);
      } else {
        await dialog
          .getByRole('button', { name: storyCopy.gallery.fit, exact: true })
          .click();
      }
      await expect.poll(scale).toBe(1);
      await page.touchscreen.tap(x, y);
      await page.touchscreen.tap(x, y);
      await expect.poll(scale).toBeGreaterThan(2);
      // Zoomed Panzoom admission suppresses native compatibility clicks. The
      // reverse double tap must still fit the photo, without a control click.
      await page.touchscreen.tap(x, y);
      await page.touchscreen.tap(x, y);
      await expect.poll(scale).toBe(1);
      if (!native) {
        await dialog
          .getByRole('button', { name: storyCopy.gallery.fit, exact: true })
          .click();
      }
      await expect.poll(scale).toBe(1);
      await swipeCarousel(page, 'next', 'lightbox');
      await expect(dialog.locator('.media-lightbox-counter')).toContainText(
        fixtures.planningFollowup.twoOfTwo,
      );
      await expect.poll(scale).toBe(1);
      if (native) {
        await page.touchscreen.tap(x, y);
        await page.touchscreen.tap(x, y);
      } else {
        await dialog
          .getByRole('button', { name: storyCopy.gallery.zoomIn, exact: true })
          .click();
      }
      await expect.poll(scale).toBeGreaterThan(1);
      await frame.focus();
      const index = await dialog
        .locator('.media-lightbox-counter')
        .textContent();
      await page.keyboard.press('ArrowLeft');
      expect(
        await dialog.locator('.media-lightbox-counter').textContent(),
      ).toBe(index);
      await page.keyboard.press('0');
      await expect.poll(scale).toBe(1);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(page.url()).toBe(route);
      expect(state.unknown).toEqual([]);
    });
  }
});

test('single photo keeps mouse zoom, drag, keyboard controls and Back local to the viewer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const state = await fixture(page, 1);
  await signIn(page);
  await page.goto('/story/memories/mem-canal');
  const opener = page
    .locator('.media-gallery-carousel-slide:not(.is-clone)')
    .first();
  await opener.click();
  const dialog = page.getByRole('dialog', {
    name: storyCopy.gallery.dialogAria,
  });
  const image = dialog.locator('.media-lightbox-photo img');
  await expect(image).toBeVisible();
  await expect(dialog.locator('.media-lightbox-track')).toHaveCount(0);
  const scale = () =>
    image.evaluate(
      (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).a,
    );
  const frame = dialog.locator('.media-lightbox-photo');
  const box = await frame.boundingBox();
  if (!box) throw new Error('The single photo viewport is unavailable.');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -120);
  await expect.poll(scale).toBeGreaterThan(1);
  const before = await image.evaluate(
    (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).e,
  );
  await page.mouse.down();
  await page.mouse.move(x + 35, y + 30, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(() =>
      image.evaluate(
        (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).e,
      ),
    )
    .not.toBe(before);
  const enlarged = await scale();
  await dialog
    .getByRole('button', { name: storyCopy.gallery.zoomOut, exact: true })
    .click();
  await expect.poll(scale).toBeLessThan(enlarged);
  await frame.focus();
  await page.keyboard.press('+');
  await expect.poll(scale).toBeGreaterThan(1);
  await page.keyboard.press('0');
  await expect.poll(scale).toBe(1);
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await expect.poll(scale).toBe(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(state.unknown).toEqual([]);
});

test('late account metadata preserves the selected Space and a recoverable Memory draft', async ({
  page,
}) => {
  const state = await fixture(page);
  await signIn(page);
  await expect(
    page.getByRole('heading', { name: de.story.timelineTitle, exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const raw = sessionStorage.getItem('eimir-session-v1');
    if (!raw) throw new Error('Authenticated session is unavailable');
    const session = JSON.parse(raw);
    session.spaceId = null;
    sessionStorage.setItem('eimir-session-v1', JSON.stringify(session));
  });
  let release!: () => void;
  const metadata = new Promise<void>((resolve) => {
    release = resolve;
  });
  const verifiedName = `${ME.displayName} verified`;
  await page.route('**/api/v1/auth/me', async (route) => {
    await metadata;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ...ME, displayName: verifiedName }),
    });
  });
  await page.goto('/story/memories/new');
  await page
    .getByLabel(de.memory.bodyLabel, { exact: true })
    .fill(fixtures.planningFollowup.wishNew);
  await expect(page.locator('.memory-draft-status')).toHaveText(
    de.memory.diary.draft.saved,
  );
  const epoch = await page.evaluate(() =>
    localStorage.getItem('eimir-memory-drafts-epoch-v1'),
  );
  release();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = sessionStorage.getItem('eimir-session-v1');
        if (!raw) throw new Error('Authenticated session is unavailable');
        return JSON.parse(raw).account.displayName;
      }),
    )
    .toBe(verifiedName);
  expect(
    await page.evaluate(() =>
      localStorage.getItem('eimir-memory-drafts-epoch-v1'),
    ),
  ).toBe(epoch);
  expect(
    await page.evaluate(() => {
      const raw = sessionStorage.getItem('eimir-session-v1');
      if (!raw) throw new Error('Authenticated session is unavailable');
      return JSON.parse(raw).spaceId;
    }),
  ).toBe(SPACE_ID);
  await page.reload();
  await page
    .getByRole('button', { name: de.memory.diary.resume, exact: true })
    .click();
  await expect(
    page.getByLabel(de.memory.bodyLabel, { exact: true }),
  ).toHaveValue(fixtures.planningFollowup.wishNew);
  expect(state.unknown).toEqual([]);
});
