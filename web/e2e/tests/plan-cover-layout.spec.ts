import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import de from '../../src/i18n/locales/de';
import copy from '../../src/i18n/locales/m5s3';
import photoCopy from '../../src/i18n/locales/photoReactions';
import storyCopy from '../../src/i18n/locales/storyProducts';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  ME,
  SPACE_ID,
  captureScreenshot,
  installMocks,
  signIn,
} from '../support/storyTimelineFixture';

const PLAN = '44444444-4444-4444-8444-444444444444';
const BASE = `/api/v1/spaces/${SPACE_ID}`;
const TITLE = 'A complete view of our next adventure';
const galleryCounter = (index: number, count: number) =>
  storyCopy.gallery.counter
    .replace('{{index}}', String(index))
    .replace('{{count}}', String(count));
const dimensions = {
  portrait: [800, 1200],
  landscape: [1600, 900],
  square: [900, 900],
} as const;

function imageFile(shape: keyof typeof dimensions, thumbnail = false) {
  return fileURLToPath(
    new URL(
      `../fixtures/plan-cover-fit/${shape}${thumbnail ? '-thumbnail' : ''}.png`,
      import.meta.url,
    ),
  );
}

async function fixture(
  page: Page,
  shape: keyof typeof dimensions,
  sensitive: boolean,
) {
  const unexpected = await installMocks(page);
  const reads: string[] = [];
  let writes = 0;
  const [width, height] = dimensions[shape];
  const plan = {
    id: PLAN,
    spaceId: SPACE_ID,
    createdBy: ACCOUNT_ID,
    creator: ME,
    title: TITLE,
    description: 'Bring our camera. Every edge of the selected image matters.',
    plannedOn: '2099-11-21',
    plannedStart: null,
    plannedEnd: null,
    experiencedOn: null,
    placeId: null,
    sourceWishId: null,
    anticipationEnabled: false,
    status: 'PLANNED',
    version: 1,
    createdAt: '2026-10-29T12:00:00Z',
    updatedAt: '2026-10-29T12:00:00Z',
    capabilities: CAPABILITIES,
    coverAttachment: {
      id: 'cover-fit',
      status: 'READY',
      mediaType: 'IMAGE',
      mimeType: 'image/png',
      size: 12000,
      width,
      height,
      hasThumbnail: true,
      isSensitive: sensitive,
    },
  };
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (path === `${BASE}/plans`)
      return route.fulfill({
        json: {
          items: url.searchParams.get('status') === 'PLANNED' ? [plan] : [],
          nextCursor: null,
        },
      });
    if (path === `${BASE}/plans/${PLAN}`) {
      if (req.method() !== 'GET') writes++;
      return route.fulfill({ json: plan });
    }
    if ([`${BASE}/places`, `${BASE}/wishes`, `${BASE}/chapters`].includes(path))
      return route.fulfill({ json: { items: [], nextCursor: null } });
    if (path === `${BASE}/attachments/cover-fit/read-access`) {
      const body = req.postDataJSON();
      expect(body.parentType).toBe('PLAN');
      expect(body.parentId).toBe(PLAN);
      reads.push(body.variant ?? 'original');
      return route.fulfill({
        json: {
          method: 'STREAM',
          url: `${BASE}/attachments/cover-fit/content`,
          expiresAt: null,
        },
      });
    }
    if (path === `${BASE}/attachments/cover-fit/content`)
      return route.fulfill({
        contentType: 'image/png',
        body: readFileSync(
          imageFile(shape, url.searchParams.get('variant') === 'thumbnail'),
        ),
      });
    return route.fallback();
  });
  return { reads, unexpected, writes: () => writes, plan };
}

async function expectCompleteImage(image: Locator, maxHeight: number) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const value = await image.evaluate((img: HTMLImageElement) => {
    const rect = img.getBoundingClientRect();
    const parent = img.closest('.plan-cover');
    if (!parent) throw new Error('Missing Plan image frame');
    const frame = parent.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      ratio: img.naturalWidth / img.naturalHeight,
      contained:
        rect.left >= frame.left - 1 &&
        rect.right <= frame.right + 1 &&
        rect.top >= frame.top - 1 &&
        rect.bottom <= frame.bottom + 1,
    };
  });
  expect(value.width / value.height).toBeCloseTo(value.ratio, 2);
  expect(value.height).toBeLessThanOrEqual(maxHeight + 1);
  expect(value.contained).toBe(true);
}

async function expectGalleryImage(image: Locator, maxHeight: number) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const size = await image.evaluate((img: HTMLImageElement) => {
    const rect = img.getBoundingClientRect();
    const frame = img
      .closest('.media-gallery-carousel-viewport')!
      .getBoundingClientRect();
    return {
      fit: getComputedStyle(img).objectFit,
      height: rect.height,
      contained:
        rect.left >= frame.left - 1 &&
        rect.right <= frame.right + 1 &&
        rect.top >= frame.top - 1 &&
        rect.bottom <= frame.bottom + 1,
    };
  });
  expect(size.fit).toBe('contain');
  expect(size.height).toBeLessThanOrEqual(maxHeight + 1);
  expect(size.contained).toBe(true);
}

for (const scenario of [
  {
    width: 390,
    height: 844,
    shape: 'portrait',
    theme: 'light',
    largeText: false,
    sensitive: false,
  },
  {
    width: 430,
    height: 900,
    shape: 'landscape',
    theme: 'dark',
    largeText: false,
    sensitive: false,
  },
  {
    width: 1280,
    height: 900,
    shape: 'portrait',
    theme: 'dark',
    largeText: false,
    sensitive: false,
  },
  {
    width: 1280,
    height: 900,
    shape: 'square',
    theme: 'light',
    largeText: false,
    sensitive: false,
  },
  {
    width: 320,
    height: 740,
    shape: 'portrait',
    theme: 'light',
    largeText: true,
    sensitive: false,
  },
  {
    width: 390,
    height: 844,
    shape: 'portrait',
    theme: 'dark',
    largeText: false,
    sensitive: true,
  },
] as const) {
  test(`complete Plan image: ${scenario.width}px ${scenario.shape} ${scenario.theme}, large text ${scenario.largeText}, sensitive ${scenario.sensitive}`, async ({
    page,
  }, info) => {
    const state = await fixture(page, scenario.shape, scenario.sensitive);
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    await page.emulateMedia({
      colorScheme: scenario.theme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(
      (theme) => localStorage.setItem('eimir.theme', theme),
      scenario.theme,
    );
    await signIn(page);
    await page.goto('/plan');
    if (scenario.largeText)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    const preview = page.locator('.planen-next-link');
    await expect(preview).toContainText(TITLE);
    if (!scenario.sensitive)
      await expectCompleteImage(
        preview.locator('img'),
        scenario.largeText ? 320 : 160,
      );
    else await expect(preview.locator('.sensitive-media-cover')).toBeVisible();
    await expect.poll(() => state.reads).toContain('thumbnail');
    await expect
      .poll(() =>
        preview
          .locator('img')
          .evaluate((img: HTMLImageElement) =>
            Math.max(img.naturalWidth, img.naturalHeight),
          ),
      )
      .toBe(512);
    await expect(preview.locator('button')).toHaveCount(0);
    await captureScreenshot(
      page,
      info,
      `plan-cover-overview-${scenario.width}-${scenario.shape}-${scenario.theme}-${scenario.largeText}-${scenario.sensitive}.png`,
      { fullPage: true },
    );
    await preview.click();
    await expect(page).toHaveURL(new RegExp(`/plan/plans/${PLAN}$`));
    if (scenario.sensitive) {
      await expect(
        page.locator(
          '.plan-photo-gallery .media-gallery-carousel-slide .sensitive-media-cover',
        ),
      ).toBeVisible();
      await page
        .locator(
          '.plan-photo-gallery .media-gallery-carousel-slide:not(.is-clone)',
        )
        .click();
      await expect(
        page.locator(
          '.plan-photo-gallery .media-gallery-carousel-slide .sensitive-media-cover',
        ),
      ).toHaveCount(0);
    }
    await expectGalleryImage(
      page.locator('.plan-photo-gallery .media-gallery-carousel-content'),
      Math.min(scenario.height * 0.6, scenario.largeText ? 896 : 448),
    );
    expect(state.reads).toContain('original');
    expect(
      await page
        .locator('.plan-photo-gallery .media-gallery-carousel-content')
        .evaluate((img: HTMLImageElement) =>
          Math.max(img.naturalWidth, img.naturalHeight),
        ),
    ).toBeGreaterThan(512);
    await captureScreenshot(
      page,
      info,
      `plan-cover-detail-${scenario.width}-${scenario.shape}-${scenario.theme}-${scenario.largeText}-${scenario.sensitive}.png`,
      { fullPage: true },
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByRole('button', { name: de.common.edit, exact: true })
      .click();
    await page
      .locator('.plan-photo-draft input[type=checkbox]')
      .setChecked(!scenario.sensitive);
    await page
      .getByRole('button', { name: de.common.cancel, exact: true })
      .click();
    await page
      .getByRole('button', { name: copy.common.discardConfirm, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: de.common.edit, exact: true }),
    ).toBeFocused();
    expect(state.writes()).toBe(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.locator('.planen-next-link')).toContainText(TITLE);
    if (scenario.sensitive)
      await expect(
        page.locator('.planen-next-link .sensitive-media-cover'),
      ).toBeVisible();
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      offenders: [...document.querySelectorAll('main *')]
        .filter((node) => node.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 8)
        .map((node) => ({
          tag: node.tagName,
          class: node.className,
          width: node.getBoundingClientRect().width,
          right: node.getBoundingClientRect().right,
          min: getComputedStyle(node).minWidth,
        })),
    }));
    expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(
      overflow.viewport + 1,
    );
    expect(state.unexpected).toEqual([]);
  });
}

async function galleryFixture(page: Page) {
  const state = await fixture(page, 'portrait', false);
  const photos = new Map<string, typeof state.plan.coverAttachment>();
  const saved = {
    ...state.plan,
    attachments: [] as (typeof state.plan.coverAttachment & {
      position: number;
    })[],
  };
  const payloads: {
    attachmentId: string;
    position: number;
    isSensitive: boolean;
  }[][] = [];
  let uploads = 0,
    creates = 0,
    patches = 0;
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (path === `${BASE}/attachments` && req.method() === 'POST') {
      uploads++;
      if (uploads === 1)
        return route.fulfill({
          status: 503,
          json: { code: 'TEMPORARILY_UNAVAILABLE' },
        });
      const id = `uploaded-${uploads}`;
      const photo = { ...state.plan.coverAttachment, id };
      photos.set(id, photo);
      return route.fulfill({
        status: 201,
        json: {
          attachment: {
            ...photo,
            version: 1,
            createdAt: '2026-10-30T12:00:00Z',
            updatedAt: '2026-10-30T12:00:00Z',
          },
          method: 'STREAM',
          requiredHeaders: {},
          uploadUrl: `${BASE}/attachments/${id}/bytes`,
        },
      });
    }
    const match = path.match(/\/attachments\/(uploaded-\d+)(?:\/(.+))?$/);
    if (match) {
      const [, id, action] = match;
      if (action === 'bytes') return route.fulfill({ status: 204 });
      if (action === 'content')
        return route.fulfill({
          contentType: 'image/png',
          body: readFileSync(
            imageFile(
              'portrait',
              url.searchParams.get('variant') === 'thumbnail',
            ),
          ),
        });
      if (action === 'read-access') {
        expect(req.postDataJSON().parentType).toBe('PLAN');
        expect(req.postDataJSON().parentId).toBe(PLAN);
        return route.fulfill({
          json: { method: 'STREAM', url: `${BASE}/attachments/${id}/content` },
        });
      }
      return route.fulfill({
        json: {
          ...photos.get(id),
          version: 1,
          createdAt: '2026-10-30T12:00:00Z',
          updatedAt: '2026-10-30T12:00:00Z',
        },
      });
    }
    if (
      (path === `${BASE}/plans` && req.method() === 'POST') ||
      (path === `${BASE}/plans/${PLAN}` && req.method() === 'PATCH')
    ) {
      const body = req.postDataJSON();
      if (req.method() === 'POST') creates++;
      else {
        patches++;
        expect(req.headers()['if-match']).toBe(String(saved.version));
      }
      if (body.attachments) {
        payloads.push(body.attachments);
        saved.attachments = body.attachments.map(
          (entry: {
            attachmentId: string;
            position: number;
            isSensitive: boolean;
          }) => ({
            ...photos.get(entry.attachmentId)!,
            position: entry.position,
            isSensitive: entry.isSensitive,
          }),
        );
        saved.coverAttachment = saved.attachments[0]!;
      }
      saved.title = body.title ?? saved.title;
      saved.version++;
      return route.fulfill({
        status: req.method() === 'POST' ? 201 : 200,
        json: saved,
      });
    }
    if (path === `${BASE}/plans/${PLAN}`) return route.fulfill({ json: saved });
    return route.fallback();
  });
  return {
    ...state,
    saved,
    payloads,
    counts: () => ({ uploads, creates, patches }),
  };
}

for (const view of [
  { width: 360, theme: 'light', large: false },
  { width: 390, theme: 'dark', large: false },
  { width: 430, theme: 'light', large: false },
  { width: 1280, theme: 'dark', large: false },
  { width: 320, theme: 'light', large: true },
] as const) {
  test(`Plan gallery create, retry, read, staged edit and return at ${view.width}px ${view.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    await page.emulateMedia({
      colorScheme: view.theme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(
      (theme) => localStorage.setItem('eimir.theme', theme),
      view.theme,
    );
    const state = await galleryFixture(page);
    await signIn(page);
    await page.goto('/plan/plans/new');
    if (view.large)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    await page.locator('#planning-create-title').fill(TITLE);
    await page
      .locator('#plan-photos')
      .setInputFiles([
        imageFile('portrait'),
        imageFile('landscape'),
        imageFile('square'),
      ]);
    const drafts = page.locator('.plan-photo-draft');
    await expect(drafts).toHaveCount(3);
    const save = page.locator('form button[type=submit]');
    await expect(save).toBeDisabled();
    expect(state.counts().creates).toBe(0);
    await drafts
      .filter({ hasText: 'portrait.png' })
      .getByRole('button', { name: de.common.retry, exact: true })
      .click();
    await expect(
      page.getByText(de.memory.photoReady, { exact: true }),
    ).toHaveCount(3);
    await expect(save).toBeEnabled();
    await captureScreenshot(
      page,
      info,
      `plan-gallery-editor-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await save.click();
    await expect(page).toHaveURL(new RegExp(`/plan/plans/${PLAN}$`));
    expect(state.counts()).toEqual({ creates: 1, uploads: 4, patches: 0 });
    expect(state.payloads[0].map((photo) => photo.position)).toEqual([0, 1, 2]);
    await page.reload();
    if (view.large)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    const gallery = page.locator('.plan-photo-gallery');
    await expect(gallery.locator('.media-gallery-carousel-counter')).toHaveText(
      galleryCounter(1, 3),
    );
    await expectGalleryImage(
      gallery
        .locator('.media-gallery-carousel-slide:not(.is-clone)')
        .first()
        .locator('.media-gallery-carousel-content'),
      540,
    );
    if (view.width < 600) {
      const track = gallery.locator('.media-gallery-carousel-track');
      await track.evaluate((element) =>
        element.scrollIntoView({ block: 'center' }),
      );
      const box = await track.boundingBox();
      if (!box) throw new Error('Missing gallery track');
      const touch = await page.context().newCDPSession(page);
      try {
        const y = box.y + box.height / 2;
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: box.x + box.width * 0.82, y }],
        });
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: box.x + box.width * 0.45, y }],
        });
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: box.x + box.width * 0.12, y }],
        });
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
      } finally {
        await touch.detach();
      }
      await expect(
        gallery.locator('.media-gallery-carousel-counter'),
      ).toHaveText(galleryCounter(2, 3));
    }
    await gallery.getByRole('button', { name: photoCopy.fullscreen }).click();
    const viewer = page.getByRole('dialog', {
      name: storyCopy.gallery.dialogAria,
    });
    await expect(viewer).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(viewer.locator('.media-lightbox-counter')).toHaveText(
      view.width < 600 ? galleryCounter(3, 3) : galleryCounter(2, 3),
    );
    await captureScreenshot(
      page,
      info,
      `plan-gallery-viewer-${view.width}-${view.theme}.png`,
    );
    await page.goBack();
    await expect(viewer).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/plan/plans/${PLAN}$`));
    await captureScreenshot(
      page,
      info,
      `plan-gallery-reading-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    await page
      .getByRole('button', { name: de.common.edit, exact: true })
      .click();
    const original = state.payloads[0].map((photo) => photo.attachmentId);
    async function changeDraft() {
      await drafts
        .first()
        .getByRole('button', {
          name: new RegExp(de.memory.photoMoveLater.replace('{{name}}', '.+')),
        })
        .click();
      await drafts.first().locator('input[type=checkbox]').check();
      await drafts
        .last()
        .getByRole('button', {
          name: new RegExp(
            copy.planImage.removePhoto.replace('{{name}}', '.+'),
          ),
        })
        .click();
    }
    await changeDraft();
    await page
      .getByRole('button', { name: de.common.cancel, exact: true })
      .click();
    await page
      .getByRole('button', { name: copy.common.discardConfirm, exact: true })
      .click();
    expect(state.counts().patches).toBe(0);
    expect(state.saved.attachments.map((photo) => photo.id)).toEqual(original);
    await page
      .getByRole('button', { name: de.common.edit, exact: true })
      .click();
    await expect(drafts).toHaveCount(3);
    await changeDraft();
    await page
      .getByRole('button', { name: copy.common.saveChanges, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: de.common.edit, exact: true }),
    ).toBeVisible();
    expect(state.counts().patches).toBe(1);
    expect(state.payloads[1]).toEqual([
      { attachmentId: original[1], position: 0, isSensitive: true },
      { attachmentId: original[0], position: 1, isSensitive: false },
    ]);
    await page.reload();
    await expect(
      gallery
        .locator('.media-gallery-carousel-slide:not(.is-clone)')
        .first()
        .locator('.sensitive-media-cover'),
    ).toBeVisible();
    await expect(gallery.locator('.media-gallery-carousel-counter')).toHaveText(
      galleryCounter(1, 2),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(state.unexpected).toEqual([]);
  });
}
