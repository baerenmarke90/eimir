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

const TEXT =
  'We walked by the water until the evening light softened.\nYou made an ordinary day feel special, and I want to remember that quiet moment together. ❤️';
const PHOTO = readFileSync(
  new URL(
    '../../../backend/demo_assets/images/lake-sunrise.jpg',
    import.meta.url,
  ),
);

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
