import { expect, test } from '@playwright/test';
import {
  SPACE_ID,
  ME,
  CAPABILITIES,
  getTimelineItems,
  installMocks,
  signIn,
} from '../support/storyTimelineFixture';

test.use({ hasTouch: true });

for (const surface of ['story', 'plan'] as const) {
  test(`a real downward touch on a ${surface} content link refreshes once without navigating`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await installMocks(page, { strict: true });
    let reads = 0;
    const base = `/api/v1/spaces/${SPACE_ID}`;
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === `${base}/timeline`) {
        reads++;
        return route.fulfill({
          json: {
            items: getTimelineItems(),
            nextCursor: null,
            hasMore: false,
            availableYears: [2026],
            chapterMarkers: [],
            chapterPeriods: [],
          },
        });
      }
      if (path === `${base}/plans`) {
        reads++;
        return route.fulfill({
          json: {
            items: [
              {
                id: 'plan-refresh',
                spaceId: SPACE_ID,
                title: 'A weekend together',
                status: 'IDEA',
                createdBy: ME.id,
                creator: ME,
                createdAt: '2026-11-05T10:00:00Z',
                updatedAt: '2026-11-05T10:00:00Z',
                version: 1,
                capabilities: CAPABILITIES,
                tags: [],
                attachments: [],
              },
            ],
            nextCursor: null,
            hasMore: false,
          },
        });
      }
      if (path === `${base}/wishes`)
        return route.fulfill({
          json: { items: [], nextCursor: null, hasMore: false },
        });
      return route.fallback();
    });
    await signIn(page);
    const url = surface === 'story' ? '/story?tab=timeline' : '/plan';
    await page.goto(url);
    const content = page
      .locator(
        surface === 'story'
          ? 'a[href="/story/memories/mem-canal"]'
          : 'a[href="/plan/plans/plan-refresh"]',
      )
      .first();
    await expect(content).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/app-pull-refresh-enabled/);
    const box = await content.boundingBox();
    if (!box) throw new Error('Content link has no touch bounds');
    const x = box.x + box.width / 2;
    const y = Math.max(100, box.y + 20);
    expect(y + 120).toBeLessThan(900);
    const before = reads;
    const touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + 30 }],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + 110 }],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect.poll(() => reads).toBe(before + 1);
    await expect(page).toHaveURL(new RegExp(`${url.replace('?', '\\?')}$`));
    await expect(content).toBeVisible();
    await touch.detach();
  });
}
