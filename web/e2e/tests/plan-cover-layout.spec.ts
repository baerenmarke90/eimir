import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import de from '../../src/i18n/locales/de';
import copy from '../../src/i18n/locales/m5s3';
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
      reads.push(body.variant);
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
  return { reads, unexpected, writes: () => writes };
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
        page.locator('.plan-cover > .sensitive-media-cover'),
      ).toBeVisible();
      await page.locator('.plan-cover .sensitive-media-control').click();
      await expect(
        page.locator('.plan-cover > .sensitive-media-cover'),
      ).toHaveCount(0);
    }
    await expectCompleteImage(
      page.locator('.plan-cover img'),
      Math.min(scenario.height * 0.6, scenario.largeText ? 896 : 448),
    );
    expect(state.reads).toContain('original');
    expect(
      await page
        .locator('.plan-cover img')
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
      .locator('.plan-cover-pick input')
      .setInputFiles(imageFile('landscape'));
    await expectCompleteImage(
      page.locator('.plan-cover-field img'),
      Math.min(scenario.height * 0.6, scenario.largeText ? 896 : 448),
    );
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
