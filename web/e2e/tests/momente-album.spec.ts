import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import storyProducts from '../../src/i18n/locales/storyProducts';
import AxeBuilder from '../support/axe';
import { pinDiaryLayout } from '../support/diaryLayout';
import {
  captureScreenshot,
  installMocks,
  signIn,
} from '../support/storyTimelineFixture';

/**
 * #1960: the scrapbook Album is the default Moments design. These checks cover
 * what the compact-composition specs no longer assert: the Album default,
 * reflow and contrast across Compact and Expanded, Light and Dark, enlarged
 * text and reduced motion, and the one setting that restores the compact list.
 * Fixture data is synthetic; screenshots go to SCREENSHOT_EXPORT_DIR when set.
 */

type Scheme = 'light' | 'dark';

const CHAPTER_MARKERS = [
  {
    id: 'chapter-start',
    title: 'Festival summer',
    startOn: '2026-05-12',
    endOn: null,
    position: 1,
  },
];

const CHAPTERS = [
  {
    id: 'chapter-weekend',
    title: 'Weekends away',
    startOn: '2026-04-19',
    endOn: '2026-11-06',
  },
  {
    id: 'chapter-cooking',
    title: 'Cooking evenings',
    startOn: '2026-04-20',
    endOn: null,
  },
];

const WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

async function openDiary(
  page: Page,
  viewport: { width: number; height: number },
  scheme: Scheme,
  chapterPeriods?: Parameters<typeof installMocks>[1] extends infer O
    ? O extends { chapterPeriods?: infer C }
      ? C
      : never
    : never,
): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  await page.setViewportSize(viewport);
  await page.addInitScript(() =>
    window.localStorage.setItem('eimir.theme', 'system'),
  );
  await installMocks(page, {
    chapterPeriods,
    chapterMarkers: chapterPeriods ? CHAPTER_MARKERS : undefined,
  });
  await signIn(page);
  await page.goto('/story?tab=timeline');
  await page.waitForSelector('.story-timeline .story-card');
  await page.evaluate(() => document.fonts.ready);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

const CASES: ReadonlyArray<{
  name: string;
  width: number;
  height: number;
  scheme: Scheme;
}> = [
  { name: '320-light', width: 320, height: 640, scheme: 'light' },
  { name: '390-light', width: 390, height: 844, scheme: 'light' },
  { name: '390-dark', width: 390, height: 844, scheme: 'dark' },
  { name: '430-light', width: 430, height: 932, scheme: 'light' },
  { name: '1280-light', width: 1280, height: 900, scheme: 'light' },
  { name: '1280-dark', width: 1280, height: 900, scheme: 'dark' },
];

test.describe('Momente Album design (#1960)', () => {
  for (const item of CASES) {
    test(`Tagebuch Album at ${item.name} is the default, reflows and passes axe`, async ({
      page,
    }, testInfo) => {
      await openDiary(page, item, item.scheme);

      await expect(
        page.locator('.momente-diary-section[data-diary-layout="album"]'),
      ).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute(
        'data-theme',
        item.scheme,
      );
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      const result = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();
      expect(result.violations).toEqual([]);

      await captureScreenshot(
        page,
        testInfo,
        `1960-album-diary-${item.name}.png`,
        { fullPage: true },
      );
    });
  }

  for (const item of CASES.filter((c) =>
    ['320-light', '390-light', '390-dark', '1280-light'].includes(c.name),
  )) {
    test(`Chapters in the Album diary at ${item.name} are bookmarked strips that reflow and pass axe`, async ({
      page,
    }, testInfo) => {
      await openDiary(page, item, item.scheme, CHAPTERS);

      const strips = page.locator(
        '.momente-diary-section[data-diary-layout="album"] .diary-chapter-periods a',
      );
      await expect(strips.first()).toBeVisible();
      // The ribbon replaces the book icon in the Album.
      await expect(strips.first().locator('.eimir-icon')).toBeHidden();
      // A chapter start is a bookmarked divider between entries, not a tinted card.
      const divider = page.locator(
        '.momente-diary-section[data-diary-layout="album"] .chapter-diary-marker',
      );
      await expect(divider).toBeVisible();
      await expect(divider.locator('svg').first()).toBeHidden();
      await expect(
        page.getByRole('link', { name: /Festival summer/ }),
      ).toBeVisible();
      // The link stays a real link with its chapter title as the name.
      await expect(
        page.getByRole('link', { name: new RegExp(CHAPTERS[0].title) }),
      ).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      const result = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();
      expect(result.violations).toEqual([]);

      await strips.first().scrollIntoViewIfNeeded();
      await captureScreenshot(
        page,
        testInfo,
        `1960-album-chapters-${item.name}.png`,
        { fullPage: false },
      );
    });
  }

  test('Chapters keep the book icon in the compact list', async ({ page }) => {
    await pinDiaryLayout(page, 'compact');
    await openDiary(page, { width: 390, height: 844 }, 'light', CHAPTERS);
    await expect(
      page.locator('.diary-chapter-periods a').first().locator('.eimir-icon'),
    ).toBeVisible();
  });

  test('Tagebuch Album keeps reading at 200% text and 320px without overflow', async ({
    page,
  }, testInfo) => {
    await openDiary(page, { width: 320, height: 640 }, 'light', CHAPTERS);
    await page.addStyleTag({ content: ':root { font-size: 200%; }' });
    await page.evaluate(() => document.fonts.ready);

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(result.violations).toEqual([]);

    await captureScreenshot(
      page,
      testInfo,
      '1960-album-diary-320-200pct-text.png',
      { fullPage: true },
    );
  });

  for (const item of CASES.filter((c) => c.name !== '1280-light')) {
    test(`Erinnerungen Album at ${item.name} reflows and passes axe`, async ({
      page,
    }, testInfo) => {
      await openDiary(page, item, item.scheme);
      await page.goto('/story?tab=discover');
      await expect(
        page.locator('.momente-discover-page[data-diary-layout="album"]'),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      const result = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();
      expect(result.violations).toEqual([]);

      await captureScreenshot(
        page,
        testInfo,
        `1960-album-discover-${item.name}.png`,
        { fullPage: true },
      );
    });
  }

  test('Tagebuch Album stays complete with reduced motion', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDiary(page, { width: 390, height: 844 }, 'light');

    const cards = page.locator('.story-timeline .story-card');
    await expect(cards.first()).toBeVisible();
    // No animation may be left running that hides or moves content.
    const running = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === 'running').length,
    );
    expect(running).toBe(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await captureScreenshot(
      page,
      testInfo,
      '1960-album-diary-390-reduced-motion.png',
      { fullPage: true },
    );
  });

  test('the Moments design setting switches between Album and compact list', async ({
    page,
  }) => {
    await openDiary(page, { width: 390, height: 844 }, 'light');
    await expect(
      page.locator('.momente-diary-section[data-diary-layout="album"]'),
    ).toBeVisible();

    await page.goto('/more/settings/appearance');
    const group = page.getByRole('radiogroup', {
      name: storyProducts.momentsLayout.title,
    });
    await expect(group).toBeVisible();
    await expect(
      group.getByRole('radio', {
        name: new RegExp(storyProducts.momentsLayout.album.name),
      }),
    ).toBeChecked();

    await group
      .getByRole('radio', {
        name: new RegExp(storyProducts.momentsLayout.compact.name),
      })
      .check();

    await page.goto('/story?tab=timeline');
    await expect(
      page.locator('.momente-diary-section[data-diary-layout="compact"]'),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.locator('.momente-diary-section[data-diary-layout="compact"]'),
    ).toBeVisible();
  });

  test('a stored compact choice keeps the previous composition', async ({
    page,
  }) => {
    await pinDiaryLayout(page, 'compact');
    await openDiary(page, { width: 390, height: 844 }, 'light');
    await expect(
      page.locator('.momente-diary-section[data-diary-layout="compact"]'),
    ).toBeVisible();
    await expect(
      page.locator('.momente-diary-section[data-diary-layout="album"]'),
    ).toHaveCount(0);
    // The login page is localized; reaching the diary proves the session.
    await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  });
});
