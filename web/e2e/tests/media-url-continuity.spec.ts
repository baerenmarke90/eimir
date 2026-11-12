import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import navigation from '../../src/i18n/locales/navigation';
import { storyDetailBack } from '../support/memoryDiary';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  ACCOUNT_ID,
  captureScreenshot,
  getTimelineItems,
  installMocks,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

for (const [width, theme] of [
  [390, 'light'],
  [1280, 'dark'],
] as const) {
  test(`kept authorized thumbnail survives detail return without a new delivery at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const unexpected = await installMocks(page, { strict: true });
    let reads = 0;
    let downloads = 0;
    const attachment = `/api/v1/spaces/${SPACE_ID}/attachments/att-canal-1`;
    await page.route('**/api/v1/**', async (route) => {
      if (await fulfillDefaultProductContext(route)) return;
      const url = new URL(route.request().url());
      if (
        url.pathname.endsWith('/content') &&
        url.pathname.includes('/attachments/')
      ) {
        if (url.pathname === `${attachment}/content`) {
          expect(url.searchParams.get('variant')).toBe('thumbnail');
          downloads++;
        }
        return route.fulfill({
          contentType: 'image/jpeg',
          body: readFileSync(
            new URL(
              '../../../backend/demo_assets/images/cabin-lake.jpg',
              import.meta.url,
            ),
          ),
        });
      }
      if (url.pathname === `${attachment}/read-access`) {
        expect(route.request().postDataJSON()).toMatchObject({
          parentType: 'MEMORY',
          parentId: 'mem-canal',
          variant: 'thumbnail',
        });
        reads++;
      }
      return route.fallback();
    });
    await signIn(page);
    const card = page.locator(
      'a.story-card-link[href="/story/memories/mem-canal"]',
    );
    const image = card.locator('img').first();
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
    const src = await image.getAttribute('src');
    expect(src).toMatch(/^blob:/);
    expect(downloads).toBe(1);
    const firstReads = reads;
    expect(firstReads).toBeGreaterThan(0);
    await captureScreenshot(
      page,
      info,
      `story-media-before-${width}-${theme}.png`,
    );
    await card.click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
    await expect(
      page.getByRole('heading', {
        name: 'Breakfast by the canal',
        exact: true,
      }),
    ).toBeVisible();
    await storyDetailBack(page).click();
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', src ?? '');
    // Returning to a kept tab neither remounts the preview nor delivers new
    // cached media. Fresh deliveries, including the gallery opened below,
    // still require parent read-access before using retained image bytes.
    expect(reads).toBe(firstReads);
    expect(downloads).toBe(1);
    const reflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(reflow.scroll).toBeLessThanOrEqual(reflow.width);
    await captureScreenshot(
      page,
      info,
      `story-media-return-${width}-${theme}.png`,
    );
    expect(unexpected).toEqual([]);
  });
}

test('Diary thumbnail survives a normal ninety-second detail visit without decoding a new URL', async ({
  page,
}) => {
  await installMocks(page, { strict: true });
  let downloads = 0;
  await page.route(
    '**/attachments/att-canal-1/content?variant=thumbnail',
    async (route) => {
      downloads++;
      return route.fulfill({
        contentType: 'image/jpeg',
        body: readFileSync(
          new URL(
            '../../../backend/demo_assets/images/cabin-lake.jpg',
            import.meta.url,
          ),
        ),
      });
    },
  );
  await signIn(page);
  const card = page.locator(
    'a.story-card-link[href="/story/memories/mem-canal"]',
  );
  const image = card.locator('img').first();
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBeGreaterThan(0);
  const source = await image.getAttribute('src');
  await page.clock.install();
  await card.click();
  await expect(
    page.getByRole('heading', { name: 'Breakfast by the canal', exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(90_000);
  await storyDetailBack(page).click();
  await expect(image).toHaveAttribute('src', source ?? '');
  expect(downloads).toBe(1);
});

test('Memory gallery originals survive Wir and Moments tab navigation with fresh parent authorization', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await installMocks(page, { strict: true });
  const attachment = getTimelineItems()[0].memory!.attachments[0];
  let originalDownloads = 0;
  let originalReads = 0;
  await page.route(`**/api/v1/spaces/${SPACE_ID}/memories/mem-canal`, (route) =>
    route.fulfill({
      json: {
        id: 'mem-canal',
        spaceId: SPACE_ID,
        authorId: ACCOUNT_ID,
        author: { id: ACCOUNT_ID, displayName: 'Lea' },
        title: 'Breakfast by the canal',
        body: 'A wonderful morning by the water.',
        happenedOn: '2026-05-12',
        createdAt: '2026-05-12T08:30:00Z',
        updatedAt: '2026-05-12T08:30:00Z',
        version: 1,
        tags: [],
        attachments: [attachment],
        capabilities: { canEdit: true, canDelete: true, canComment: true },
      },
    }),
  );
  await page.route('**/attachments/att-canal-1/**', async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname.endsWith('/read-access') &&
      route.request().postDataJSON().variant !== 'thumbnail'
    )
      originalReads++;
    if (
      url.pathname.endsWith('/content') &&
      url.searchParams.get('variant') !== 'thumbnail'
    ) {
      originalDownloads++;
      return route.fulfill({
        contentType: 'image/jpeg',
        body: readFileSync(
          new URL(
            '../../../backend/demo_assets/images/cabin-lake.jpg',
            import.meta.url,
          ),
        ),
      });
    }
    return route.fallback();
  });
  await signIn(page);
  const card = page
    .locator('a.story-card-link[href="/story/memories/mem-canal"]')
    .first();
  await card.click();
  const galleryImage = page
    .locator('img.media-gallery-carousel-content')
    .first();
  await expect(galleryImage).toBeVisible();
  await expect
    .poll(() =>
      galleryImage.evaluate((node: HTMLImageElement) => node.naturalWidth),
    )
    .toBeGreaterThan(0);
  const source = await galleryImage.getAttribute('src');
  expect(originalDownloads).toBe(1);
  const readsBefore = originalReads;
  await page
    .locator('.mobile-bottom-nav')
    .getByRole('link', { name: navigation.today, exact: true })
    .click();
  await expect(page).toHaveURL(/\/today$/);
  await page
    .locator('.mobile-bottom-nav')
    .getByRole('link', { name: navigation.story, exact: true })
    .click();
  await expect(
    page.getByRole('tab', { name: de.story.tabDiscover }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: de.story.tabTimeline }).click();
  await card.click();
  await expect(galleryImage).toHaveAttribute('src', source ?? '');
  await expect.poll(() => originalReads).toBeGreaterThan(readsBefore);
  expect(originalDownloads).toBe(1);
});

test('revisiting kept tabs and Pro detail routes does not repeat session membership or Pro checks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page);
  let membershipReads = 0;
  let tierReads = 0;
  await page.route('**/api/v1/**', async (route) => {
    if (route.request().method() === 'GET') {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/auth/memberships') membershipReads++;
      if (path === `/api/v1/spaces/${SPACE_ID}/entitlements`) tierReads++;
    }
    return route.fallback();
  });
  await signIn(page);
  await expect.poll(() => membershipReads).toBeGreaterThan(0);
  // Pro tier and capabilities are read once at session start, before any
  // view with a Pro mark or Pro feature is visited, and every Pro surface
  // reuses that single read.
  await expect.poll(() => tierReads).toBe(1);

  const visitTab = async (path: string) => {
    await page
      .locator(
        `.mobile-bottom-nav a[href="${path}"], .shell-nav a[href="${path}"]`,
      )
      .filter({ visible: true })
      .first()
      .click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(path);
  };
  for (const path of ['/today', '/plan', '/more', '/story']) {
    await visitTab(path);
  }
  const membershipAfterFirstVisits = membershipReads;
  const tierAfterFirstVisits = tierReads;
  for (const path of ['/today', '/plan', '/more', '/story']) {
    await visitTab(path);
  }
  expect(membershipReads).toBe(membershipAfterFirstVisits);
  expect(tierReads).toBe(tierAfterFirstVisits);

  // Pro detail routes remount on every visit; they still reuse the read.
  const openInApp = async (path: string) => {
    await page.evaluate((target) => {
      window.history.pushState({}, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await expect.poll(() => new URL(page.url()).pathname).toBe(path);
  };
  for (const path of ['/more/insights', '/more/passport', '/more']) {
    await openInApp(path);
  }
  for (const path of ['/more/insights', '/more/passport', '/more']) {
    await openInApp(path);
  }
  await expect(page.locator('.primary-tab-panel:not([hidden])')).toHaveCount(1);
  expect(tierReads).toBe(1);
});
