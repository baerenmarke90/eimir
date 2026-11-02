import { test, expect } from '@playwright/test';
import {
  installMocks,
  signIn,
  SPACE_ID,
  captureScreenshot,
} from '../support/storyTimelineFixture';
import { readFileSync } from 'node:fs';

for (const [width, theme] of [
  [390, 'light'],
  [1280, 'dark'],
] as const) {
  test(`authorized thumbnail survives detail return at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const unexpected = await installMocks(page, { strict: true });
    let reads = 0;
    let downloads = 0;
    const attachment = `/api/v1/spaces/${SPACE_ID}/attachments/att-canal-1`;
    await page.route('**/api/v1/**', async (route) => {
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
    await page.locator('.shell-detail-back').click();
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', src ?? '');
    await expect.poll(() => reads).toBeGreaterThan(firstReads);
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
