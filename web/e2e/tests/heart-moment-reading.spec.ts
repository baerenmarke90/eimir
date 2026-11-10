import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import copy from '../../src/i18n/locales/storyProducts';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  signIn,
  SPACE_ID,
} from '../support/storyTimelineFixture';

const EMOTIONS = [
  'LOVED',
  'SEEN',
  'APPRECIATED',
  'SUPPORTED',
  'GRATEFUL',
  'HAPPY',
] as const;
type Emotion = (typeof EMOTIONS)[number];

function rgb(hex: string): string {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Unsupported semantic color: ${hex}`);
  return `rgb(${match
    .slice(1)
    .map((part) => Number.parseInt(part, 16))
    .join(', ')})`;
}

function luminance(color: string): number {
  const values = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (values?.length !== 3)
    throw new Error(`Unsupported rendered color: ${color}`);
  const linear = values.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

async function expectFeelingSurface(
  page: Page,
  emotion: Emotion,
  reading = false,
) {
  const card = page.locator(
    reading
      ? '.heart-moment-detail-container .product-detail-card'
      : '.quiet-composer .composer-content',
  );
  const semanticColor = await card.evaluate(
    (element, token) =>
      getComputedStyle(element).getPropertyValue(token).trim(),
    `--emotion-${emotion.toLowerCase()}-surface`,
  );
  const expectedBackground = rgb(semanticColor);
  await expect(card).toHaveCSS('background-color', expectedBackground);
  await expect(card).toHaveCSS('background-image', 'none');
  const text = card.locator(reading ? '.heart-moment-detail-text' : 'textarea');
  const colors = await text.evaluate((element) => ({
    text: getComputedStyle(element).color,
    placeholder: getComputedStyle(element, '::placeholder').color,
  }));
  for (const foreground of reading
    ? [colors.text]
    : [colors.text, colors.placeholder]) {
    const pair = [luminance(foreground), luminance(expectedBackground)];
    expect(
      (Math.max(...pair) + 0.05) / (Math.min(...pair) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
  }
  if (!reading)
    await expect(text).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  return expectedBackground;
}

async function chooseFeeling(page: Page, emotion: Emotion) {
  const picker = page.locator('.heart-emotion-disclosure');
  if (
    !(await picker.evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await picker.locator('summary').click();
  const radio = picker.getByRole('radio', {
    name: copy.heartEmotion[emotion],
    exact: true,
  });
  await picker.locator(`label[data-emotion="${emotion}"]`).click();
  await expect(radio).toBeChecked();
  await picker.locator('summary').click();
  await expect(picker.locator('summary')).toContainText(
    copy.heartEmotion[emotion],
  );
  return expectFeelingSurface(page, emotion);
}

const TEXT =
  'We walked by the water until the evening light softened.\nYou made an ordinary day feel special, and I want to remember that quiet moment together. ❤️';
const PHOTO = readFileSync(
  new URL(
    '../../../backend/demo_assets/images/lake-sunrise.jpg',
    import.meta.url,
  ),
);

async function expectOriginalPhoto(page: Page) {
  // Compare the photo at rest, outside the existing native button hover feedback.
  await page.mouse.move(0, 0);
  const image = page
    .locator('.heart-moment-detail-container .media-gallery-carousel-content')
    .first();
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (element) =>
          (element as HTMLImageElement).complete &&
          (element as HTMLImageElement).naturalWidth > 0,
      ),
    )
    .toBe(true);
  const original = await image.evaluate(async (element) => {
    const response = await fetch((element as HTMLImageElement).currentSrc);
    return [...new Uint8Array(await response.arrayBuffer())];
  });
  expect(Buffer.from(original)).toEqual(PHOTO);
  const treatment = await image.evaluate((element) => {
    const values = [];
    let current: Element | null = element;
    while (current) {
      const style = getComputedStyle(current);
      values.push({
        filter: style.filter,
        opacity: style.opacity,
        blend: style.mixBlendMode,
      });
      if (current.classList.contains('product-detail-card')) break;
      current = current.parentElement;
    }
    return values;
  });
  for (const value of treatment)
    expect(value).toEqual({ filter: 'none', opacity: '1', blend: 'normal' });
}

async function openHeart(
  page: Page,
  options: { photo?: boolean; private?: boolean; text?: string } = {},
) {
  const unknown = await installMocks(page, { strict: true });
  let writes = 0;
  let heart = {
    id: 'hm-love',
    spaceId: SPACE_ID,
    text: options.text ?? TEXT,
    emotion: 'GRATEFUL',
    tags: ['everyday'],
    visibility: options.private ? 'PRIVATE' : 'SHARED',
    happenedOn: '2026-09-16',
    createdAt: '2026-09-16T10:00:00Z',
    updatedAt: '2026-09-16T10:00:00Z',
    version: 1,
    authorId: ACCOUNT_ID,
    author: ME,
    capabilities: { ...CAPABILITIES, canComment: !options.private },
    attachment: options.photo
      ? {
          id: 'heart-reading-photo',
          status: 'READY',
          mediaType: 'IMAGE',
          mimeType: 'image/jpeg',
          size: PHOTO.length,
          width: 800,
          height: 600,
          hasThumbnail: false,
          isSensitive: false,
        }
      : null,
  };
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/heart-moments/hm-love`,
    async (route) => {
      if (route.request().method() === 'PATCH') {
        writes += 1;
        expect(route.request().headers()['if-match']).toBe('1');
        const body = route.request().postDataJSON();
        heart = {
          ...heart,
          text: body.text,
          emotion: body.emotion,
          tags: body.tags,
          version: 2,
          updatedAt: '2026-09-16T11:00:00Z',
        };
      }
      return route.fulfill({ json: heart });
    },
  );
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/attachments/heart-reading-photo/read-access`,
    (route) =>
      route.fulfill({
        json: {
          method: 'STREAM',
          url: `/api/v1/spaces/${SPACE_ID}/attachments/heart-reading-photo/content`,
        },
      }),
  );
  await page.route('**/attachments/heart-reading-photo/content', (route) =>
    route.fulfill({ contentType: 'image/jpeg', body: PHOTO }),
  );
  await signIn(page);
  await page
    .locator('#momente-diary')
    .getByRole('link', { name: /Thinking of you/ })
    .click();
  if (heart.text)
    await expect(page.getByText(heart.text, { exact: true })).toBeVisible();
  return { unknown, writes: () => writes };
}

const scenarios = [
  { width: 360, theme: 'light', photo: true },
  { width: 390, theme: 'dark', photo: true },
  { width: 430, theme: 'light', private: true },
  { width: 1440, theme: 'dark', photo: true },
  { width: 320, theme: 'light', large: true },
] as const;

for (const scenario of scenarios) {
  test(`HeartMoment prose reads and edits in its content area at ${scenario.width} ${scenario.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.emulateMedia({
      colorScheme: scenario.theme,
      reducedMotion: 'reduce',
    });
    const state = await openHeart(page, scenario);
    if ('photo' in scenario) await expectOriginalPhoto(page);
    if ('large' in scenario)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const title = page.getByRole('heading', {
      name: copy.heartMomentProduct.detailEyebrow,
      level: 1,
    });
    await expect(title).toBeVisible();
    await expect(title).not.toContainText(TEXT);
    const prose = page.locator('.heart-moment-detail-text');
    await expect(prose).toHaveText(TEXT);
    expect(
      await prose.evaluate(
        (node) => node.tagName === 'P' && Boolean(node.closest('article')),
      ),
    ).toBe(true);
    await expect(page.getByText(TEXT, { exact: true })).toHaveCount(1);
    await expect(page.locator('.heart-moment-detail-emotion')).toBeVisible();
    await expect(page.locator('.memory-tag-summary')).toContainText(
      copy.heartMomentProduct.tagLabels.everyday,
    );
    await captureScreenshot(
      page,
      info,
      `heart-reading-${scenario.width}-${scenario.theme}.png`,
      { fullPage: true },
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    if ('private' in scenario) {
      await expect(page.locator('.comments-panel')).toHaveCount(0);
      await expect(
        page.getByText(copy.heartMomentProduct.commentsPrivate),
      ).toBeVisible();
    }
    await page
      .getByRole('link', { name: copy.heartMomentProduct.edit, exact: true })
      .click();
    const field = page.getByRole('textbox', {
      name: copy.heartMomentProduct.textLabel,
      exact: true,
    });
    await expect(field).toHaveValue(TEXT);
    const updated = `${TEXT}\nWe can keep adding to this story.`;
    await field.fill(updated);
    await page
      .getByRole('button', { name: copy.heartMomentProduct.save, exact: true })
      .click();
    await expect(page.locator('.heart-moment-detail-text')).toHaveText(updated);
    await expect(
      page.getByRole('heading', {
        name: copy.heartMomentProduct.detailEyebrow,
        level: 1,
      }),
    ).toBeVisible();
    expect(state.writes()).toBe(1);
    if ('photo' in scenario) await expectOriginalPhoto(page);
    await page.locator('.heart-moment-detail-text').scrollIntoViewIfNeeded();
    await captureScreenshot(
      page,
      info,
      `heart-reading-saved-${scenario.width}-${scenario.theme}.png`,
    );
    await page.locator('.shell-detail-back').click();
    await expect(page).toHaveURL(/\/story(?:\?.*)?$/);
    await expect(page.locator('#momente-diary')).toBeVisible();
    expect(state.unknown).toEqual([]);
  });
}

test('all six native feelings color the complete HeartMoment card through create, edit and reload in both themes', async ({
  browser,
}, info) => {
  for (const theme of ['light', 'dark'] as const) {
    const context = await browser.newContext({
      baseURL: info.project.use.baseURL,
      locale: 'de-DE',
      viewport: { width: 390, height: 900 },
      colorScheme: theme,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const unknown = await installMocks(page, { strict: true });
    const id = 'heart-feeling-color';
    const path = `/api/v1/spaces/${SPACE_ID}/heart-moments/${id}`;
    let creates = 0;
    let updates = 0;
    let saved: Record<string, unknown> | null = null;
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/heart-moments`,
      async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        creates += 1;
        saved = {
          ...route.request().postDataJSON(),
          id,
          spaceId: SPACE_ID,
          authorId: ACCOUNT_ID,
          author: ME,
          capabilities: CAPABILITIES,
          attachment: null,
          attachments: [],
          version: 1,
          createdAt: '2026-11-09T12:00:00Z',
          updatedAt: '2026-11-09T12:00:00Z',
        };
        return route.fulfill({ json: saved });
      },
    );
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        expect(route.request().headers()['if-match']).toBe('1');
        updates += 1;
        saved = { ...saved, ...route.request().postDataJSON(), version: 2 };
      }
      expect(saved).not.toBeNull();
      return route.fulfill({ json: saved });
    });
    await page.route(`**${path}/comments*`, (route) =>
      route.fulfill({ json: { hasMore: false, items: [], nextCursor: null } }),
    );
    await signIn(page);
    await page.goto('/story/heart-moments/new');
    await expect(
      page.locator('.heart-emotion-disclosure summary'),
    ).toContainText(copy.heartEmotion.LOVED);
    await expectFeelingSurface(page, 'LOVED');
    await page
      .getByRole('textbox', {
        name: copy.heartMomentProduct.textLabel,
        exact: true,
      })
      .fill(TEXT);
    const createColors = new Set<string>();
    for (const emotion of EMOTIONS)
      createColors.add(await chooseFeeling(page, emotion));
    expect(createColors.size).toBe(6);
    await chooseFeeling(page, 'GRATEFUL');
    await page.screenshot({
      path: info.outputPath(`heart-feeling-create-390-${theme}.png`),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: copy.heartMomentProduct.save, exact: true })
      .click();
    await expect(page.locator('.heart-moment-detail-text')).toHaveText(TEXT);
    await expectFeelingSurface(page, 'GRATEFUL', true);
    expect(creates).toBe(1);
    await page
      .getByRole('link', { name: copy.heartMomentProduct.edit, exact: true })
      .click();
    const editColors = new Set<string>();
    await expectFeelingSurface(page, 'GRATEFUL');
    for (const emotion of EMOTIONS)
      editColors.add(await chooseFeeling(page, emotion));
    expect(editColors.size).toBe(6);
    await expect(
      page.getByRole('textbox', {
        name: copy.heartMomentProduct.textLabel,
        exact: true,
      }),
    ).toHaveValue(TEXT);
    await page.screenshot({
      path: info.outputPath(`heart-feeling-edit-390-${theme}.png`),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: copy.heartMomentProduct.save, exact: true })
      .click();
    await expectFeelingSurface(page, 'HAPPY', true);
    expect(updates).toBe(1);
    await page.reload();
    await expectFeelingSurface(page, 'HAPPY', true);
    await expect(page.locator('.heart-moment-detail-emotion')).toContainText(
      copy.heartEmotion.HAPPY,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: info.outputPath(`heart-feeling-reading-1440-${theme}.png`),
      fullPage: true,
    });
    expect(unknown).toEqual([]);
    await context.close();
  }
});

test('tag-only HeartMoments keep one compact title and no fabricated body', async ({
  page,
}) => {
  await openHeart(page, { text: '' });
  await expect(
    page.getByRole('heading', {
      name: copy.heartMomentProduct.detailEyebrow,
      level: 1,
    }),
  ).toBeVisible();
  await expect(page.locator('.heart-moment-detail-text')).toHaveCount(0);
  await expect(page.locator('.memory-tag-summary')).toBeVisible();
});
