import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import storyProducts from '../../src/i18n/locales/storyProducts';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '99999999-9999-4999-8999-999999999999';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const DISTANT_ATTACHMENT = '55555555-5555-4555-8555-555555555555';
const ME = { id: ACCOUNT_ID, displayName: 'Lea Sommer' };
const PARTNER = { id: PARTNER_ID, displayName: 'Alex' };
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520"><rect width="800" height="520" fill="#d7c4b2"/></svg>';

type Tracker = {
  timelineRequests: string[];
  mediaReadAccess: string[];
  failNextPageOnce: boolean;
  nextPageFailures: number;
};

function memory(index: number, withMedia = false) {
  const day = String(30 - index).padStart(2, '0');
  return {
    kind: 'MEMORY',
    effectiveDate: `2026-09-${day}T10:00:00Z`,
    memory: {
      id: `77777777-7777-4777-8777-${String(index + 1).padStart(12, '0')}`,
      title: `Gemeinsamer Septembermoment ${index + 1}`,
      body: 'A calm shared moment that we want to remember.',
      happenedOn: `2026-09-${day}`,
      createdAt: `2026-09-${day}T10:00:00Z`,
      author: ME,
      capabilities: CAPABILITIES,
      visibility: 'SHARED',
      attachments: withMedia
        ? [
            {
              id: DISTANT_ATTACHMENT,
              position: 0,
              status: 'READY',
              mediaType: 'IMAGE',
              mimeType: 'image/svg+xml',
              hasThumbnail: true,
              width: 800,
              height: 520,
              size: SVG.length,
            },
          ]
        : [],
    },
  };
}

const firstPage = Array.from({ length: 22 }, (_, index) =>
  memory(index, index === 18),
);
const olderItem = {
  ...memory(0),
  effectiveDate: '2026-08-18T10:00:00Z',
  memory: {
    ...memory(0).memory,
    id: '88888888-8888-4888-8888-888888888888',
    title: 'Unser älterer Augustmoment',
    body: 'Another shared moment from the previous month.',
    happenedOn: '2026-08-18',
    createdAt: '2026-08-18T10:00:00Z',
    attachments: [],
  },
};

async function installMocks(page: Page, tracker: Tracker) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === '/api/v1/instance/status')
      return json({
        maintenanceMode: false,
        registrationAvailable: true,
        auth: {
          localPassword: true,
          passkey: true,
          magicLink: true,
          oidc: false,
        },
      });
    if (method === 'POST' && pathname === '/api/v1/auth/sign-in')
      return json({
        account: ME,
        tokens: {
          accessToken: 'timeline-975-access',
          refreshToken: 'timeline-975-refresh',
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      });
    if (method === 'GET' && pathname === '/api/v1/auth/me') return json(ME);
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities')
      return json({ serverAdmin: false });
    if (method === 'GET' && pathname === '/api/v1/auth/memberships')
      return json([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`)
      return json({
        id: SPACE_ID,
        createdAt: '2023-06-17T00:00:00Z',
        partners: [ME, PARTNER],
      });
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`)
      return json({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: '2023-06-17',
        showRelationshipDuration: true,
      });
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profile-preferences`
    )
      return json({ items: [] });
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    )
      return json({
        accountId: ACCOUNT_ID,
        createdAt: '2023-06-17T00:00:00Z',
        displayName: ME.displayName,
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2023-06-17T00:00:00Z',
        version: 1,
      });
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    )
      return json({ unreadCount: 0 });

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
      tracker.timelineRequests.push(url.search);
      const cursor = url.searchParams.get('cursor');
      if (
        cursor &&
        tracker.failNextPageOnce &&
        tracker.nextPageFailures === 0
      ) {
        tracker.nextPageFailures += 1;
        return json(
          {
            status: 503,
            code: 'TEMPORARILY_UNAVAILABLE',
            title: 'Synthetic pagination failure',
          },
          503,
        );
      }
      return cursor
        ? json({
            items: [olderItem],
            availableYears: [2026],
            hasMore: false,
            nextCursor: null,
          })
        : json({
            items: firstPage,
            availableYears: [2026],
            hasMore: true,
            nextCursor: 'older-page',
          });
    }

    if (pathname.endsWith('/comments'))
      return json({ items: [], hasMore: false, nextCursor: null });

    if (pathname.endsWith(`/${DISTANT_ATTACHMENT}/read-access`)) {
      tracker.mediaReadAccess.push(pathname);
      return json({ method: 'STREAM', url: 'unused' });
    }
    if (pathname.endsWith(`/${DISTANT_ATTACHMENT}/content`))
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: SVG,
      });

    return json({});
  });
}

async function signIn(page: Page) {
  await page.goto('/story?tab=timeline');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await page.goto('/story?tab=timeline');
  await page.waitForSelector('.story-timeline');
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: false });
}

async function expectNoOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);
}

function nextPageRequestCount(tracker: Tracker) {
  return tracker.timelineRequests.filter((query) =>
    query.includes('cursor=older-page'),
  ).length;
}

test.describe('Momente Timeline progressive loading (#975)', () => {
  test('reveals compact Timeline once, defers distant media and loads the next page near the end', async ({
    page,
  }, testInfo) => {
    const tracker: Tracker = {
      timelineRequests: [],
      mediaReadAccess: [],
      failNextPageOnce: false,
      nextPageFailures: 0,
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, tracker);
    await signIn(page);

    const firstEntry = page.locator('.story-timeline-item').first();
    await expect(firstEntry).toHaveAttribute('data-timeline-revealed', 'true');
    const transitionDuration = await firstEntry.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    );
    expect(transitionDuration).toContain('0.21s');
    await expect
      .poll(() =>
        firstEntry.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            opacity: Number.parseFloat(style.opacity),
            transform: style.transform,
          };
        }),
      )
      .toEqual({ opacity: 1, transform: 'none' });
    await expect(
      page.getByRole('button', {
        name: storyProducts.storyFilters.loadMore,
        exact: true,
      }),
    ).toHaveCount(0);
    expect(tracker.mediaReadAccess).toHaveLength(0);
    await capture(page, testInfo, 'story-975-390-light.png');

    const distant = page.getByRole('link', {
      name: /Gemeinsamer Septembermoment 19/,
    });
    await distant.scrollIntoViewIfNeeded();
    await expect.poll(() => tracker.mediaReadAccess.length).toBe(1);

    // Reaching distant content already puts the 125%-ahead pagination boundary
    // in range. The next page may therefore be consumed before the sentinel can
    // be addressed directly; that is the intended prefetch contract.
    await expect.poll(() => nextPageRequestCount(tracker)).toBe(1);
    await expect(
      page.getByText(olderItem.memory.title, { exact: true }),
    ).toBeAttached();
    await expect(page.locator('.story-pagination-sentinel')).toHaveCount(0);
    await page.waitForTimeout(150);
    expect(nextPageRequestCount(tracker)).toBe(1);
    await page
      .getByText(olderItem.memory.title, { exact: true })
      .scrollIntoViewIfNeeded();
    await capture(page, testInfo, 'story-975-near-end-loaded.png');

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test('failed automatic pagination retains content, stops retrying and exposes the quiet manual fallback', async ({
    page,
  }, testInfo) => {
    const tracker: Tracker = {
      timelineRequests: [],
      mediaReadAccess: [],
      failNextPageOnce: true,
      nextPageFailures: 0,
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, tracker);
    await signIn(page);

    const firstTitle = firstPage[0].memory.title;
    await page.locator('.story-pagination-sentinel').scrollIntoViewIfNeeded();
    await expect.poll(() => nextPageRequestCount(tracker)).toBe(1);
    await expect(page.getByText(firstTitle, { exact: true })).toBeAttached();
    const fallback = page.getByRole('button', {
      name: storyProducts.storyFilters.loadMore,
      exact: true,
    });
    await expect(fallback).toBeVisible();
    await page.waitForTimeout(200);
    expect(nextPageRequestCount(tracker)).toBe(1);
    await capture(page, testInfo, 'story-975-pagination-fallback.png');

    await fallback.click();
    await expect.poll(() => nextPageRequestCount(tracker)).toBe(2);
    await expect(
      page.getByText(olderItem.memory.title, { exact: true }),
    ).toBeAttached();
    await expect(fallback).toHaveCount(0);
  });

  test('reduced motion and enlarged text keep the Compact Timeline immediately readable', async ({
    page,
  }, testInfo) => {
    const tracker: Tracker = {
      timelineRequests: [],
      mediaReadAccess: [],
      failNextPageOnce: false,
      nextPageFailures: 0,
    };
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await installMocks(page, tracker);
    await signIn(page);
    await page.addStyleTag({ content: 'html { font-size: 125% !important; }' });

    const firstEntry = page.locator('.story-timeline-item').first();
    await expect(firstEntry).toHaveAttribute('data-timeline-revealed', 'true');
    const reducedMotion = await firstEntry.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        opacity: style.opacity,
        transform: style.transform,
        transition: style.transitionDuration,
      };
    });
    expect(reducedMotion).toEqual({
      opacity: '1',
      transform: 'none',
      transition: '0s',
    });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectNoOverflow(page);
    await capture(page, testInfo, 'story-975-320-large-text-reduced-dark.png');
  });

  test('Expanded Web preserves the same content-first Timeline without pagination chrome', async ({
    page,
  }, testInfo) => {
    const tracker: Tracker = {
      timelineRequests: [],
      mediaReadAccess: [],
      failNextPageOnce: false,
      nextPageFailures: 0,
    };
    await page.setViewportSize({ width: 1440, height: 900 });
    await installMocks(page, tracker);
    await signIn(page);
    await expect(page.locator('.story-timeline-item').first()).toHaveAttribute(
      'data-timeline-revealed',
      'true',
    );
    await expect(
      page.getByRole('button', {
        name: storyProducts.storyFilters.loadMore,
        exact: true,
      }),
    ).toHaveCount(0);
    await capture(page, testInfo, 'story-975-1440-expanded.png');
  });
});
