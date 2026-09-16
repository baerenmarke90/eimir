import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s5 from '../../src/i18n/locales/m5s5';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';

/**
 * R2 exact-build visual/behavioral evidence (#966): the bounded gaps closed
 * against the current-main inventory in
 * docs/product/design/r2-momente-timeline.md — real month headings in
 * Timeline, Search-origin return, and Heart Moment/Milestone Back restoring
 * the scope they were opened from. This is supplementary to the existing
 * momente-timeline-reference.spec.ts / story-years-product-reference.spec.ts
 * / f2-task-boundaries.spec.ts coverage, not a replacement for it.
 */

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const ME = { id: ACCOUNT_ID, displayName: 'Lea Sommer' };
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };
const EVIDENCE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docs',
  'product',
  'design',
  'evidence',
  'r2',
);

async function captureScreenshot(
  page: Page,
  testInfo: TestInfo,
  fileName: string,
): Promise<void> {
  const outputPath = testInfo.outputPath(fileName);
  await page.screenshot({ path: outputPath, fullPage: true });
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.copyFileSync(outputPath, path.join(EVIDENCE_DIR, fileName));
}

function timelineItems() {
  return [
    {
      kind: 'MEMORY',
      effectiveDate: '2026-08-26T00:00:00Z',
      memory: {
        id: 'mem-august',
        title: 'Late August Vacation',
        happenedOn: '2026-08-26',
        createdAt: '2026-08-26T00:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachments: [],
      },
    },
    {
      kind: 'MILESTONE',
      effectiveDate: '2026-08-01T00:00:00Z',
      milestone: {
        id: 'ms-moved-in',
        title: 'Moved in together',
        happenedOn: '2026-08-01',
        createdAt: '2026-08-01T00:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
      },
    },
    {
      kind: 'HEART_MOMENT',
      effectiveDate: '2026-07-05T00:00:00Z',
      heartMoment: {
        id: 'hm-picnic',
        text: 'Thinking of our spring picnic',
        emotion: 'LOVED',
        happenedOn: '2026-07-05',
        createdAt: '2026-07-05T00:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachment: null,
      },
    },
  ];
}

async function installMocks(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const fulfillJson = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await fulfillJson({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
        auth: { localPassword: true, passkey: true, magicLink: true, oidc: false },
      });
      return;
    }
    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await fulfillJson({
        account: { displayName: ME.displayName, id: ME.id },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'r2-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'r2-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: ME.displayName, id: ME.id });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await fulfillJson({ serverAdmin: false });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await fulfillJson([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await fulfillJson({ id: SPACE_ID, createdAt: '2023-06-17T00:00:00Z', partners: [ME] });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID, version: 1,
        relationshipStartedOn: '2023-06-17', showRelationshipDuration: true,
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile-preferences`) {
      await fulfillJson({ items: [] });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`) {
      await fulfillJson({
        accountId: ACCOUNT_ID, createdAt: '2023-06-17T00:00:00Z',
        displayName: ME.displayName, id: PROFILE_ID, preferences: [],
        profileAttachmentId: null, updatedAt: '2023-06-17T00:00:00Z', version: 1,
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/timeline`) {
      const order = url.searchParams.get('order');
      let items = timelineItems();
      const type = url.searchParams.get('type');
      if (type) items = items.filter((item) => item.kind === type);
      if (order === 'ASC') items = [...items].reverse();
      await fulfillJson({
        items, hasMore: false, nextCursor: null,
        availableYears: [2026],
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/memories/mem-august`) {
      await fulfillJson({
        id: 'mem-august', spaceId: SPACE_ID, title: 'Late August Vacation',
        body: 'A perfect end to summer.', happenedOn: '2026-08-26',
        author: ME, authorId: ACCOUNT_ID, attachments: [], capabilities: CAPABILITIES,
        createdAt: '2026-08-26T00:00:00Z', updatedAt: '2026-08-26T00:00:00Z', version: 1,
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/memories/mem-august/comments`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/heart-moments/hm-picnic`) {
      await fulfillJson({
        id: 'hm-picnic', spaceId: SPACE_ID, text: 'Thinking of our spring picnic',
        emotion: 'LOVED', happenedOn: '2026-07-05', author: ME, authorId: ACCOUNT_ID,
        capabilities: CAPABILITIES, createdAt: '2026-07-05T00:00:00Z',
        updatedAt: '2026-07-05T00:00:00Z', version: 1, visibility: 'SHARED', attachment: null,
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/heart-moments/hm-picnic/comments`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/milestones/ms-moved-in`) {
      await fulfillJson({
        id: 'ms-moved-in', spaceId: SPACE_ID, title: 'Moved in together',
        description: null, happenedOn: '2026-08-01', author: ME, authorId: ACCOUNT_ID,
        capabilities: CAPABILITIES, createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z', version: 1,
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/milestones/ms-moved-in/comments`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/search`) {
      const q = url.searchParams.get('q') ?? '';
      const type = url.searchParams.getAll('type');
      const matches = [
        {
          type: 'MEMORY', id: 'mem-august', title: 'Late August Vacation',
          excerpt: 'A perfect end to summer.', occurredOn: '2026-08-26', scope: 'SHARED',
        },
        {
          type: 'HEART_MOMENT', id: 'hm-picnic', title: 'Thinking of our spring picnic',
          excerpt: null, occurredOn: '2026-07-05', scope: 'SHARED',
        },
        {
          type: 'MILESTONE', id: 'ms-moved-in', title: 'Moved in together',
          excerpt: null, occurredOn: '2026-08-01', scope: 'SHARED',
        },
      ].filter(
        (item) =>
          item.title.toLowerCase().includes(q.toLowerCase()) &&
          (type.length === 0 || type.includes(item.type)),
      );
      await fulfillJson({ items: matches, nextCursor: null });
      return;
    }

    await fulfillJson({}, 200);
  });
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/story?tab=timeline');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

test.describe('R2 Momente/Timeline evidence (#966)', () => {
  test('groups the Timeline under real month headings, newest month first', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    const august = page.getByRole('heading', { name: 'August 2026', level: 2 });
    const july = page.getByRole('heading', { name: 'Juli 2026', level: 2 });
    await expect(august).toBeVisible();
    await expect(july).toBeVisible();
    const augustBox = await august.boundingBox();
    const julyBox = await july.boundingBox();
    expect(augustBox && julyBox && augustBox.y).toBeLessThan(julyBox?.y ?? Number.POSITIVE_INFINITY);

    // A single, real month heading — not a surrounding card.
    await expect(page.locator('.story-year-month')).toHaveCount(2);

    await captureScreenshot(page, testInfo, 'r2-timeline-month-headings-390-light.png');
  });

  test('applying the oldest-first order re-requests and visibly reorders the Timeline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    await page.getByRole('button', { name: storyProducts.storyFilters.toggleButton }).click();
    await page
      .getByLabel(storyProducts.storyFilters.order)
      .selectOption({ label: storyProducts.storyFilters.oldest });
    await page.getByRole('button', { name: storyProducts.storyFilters.apply }).click();

    await expect(page).toHaveURL(/order=ASC/);
    await expect(page.getByText(storyProducts.storyFilters.oldest)).toBeVisible();
  });

  test('opening a Heart Moment from a filtered Timeline and pressing Back restores that filter', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline&type=HEART_MOMENT');
    await page.waitForSelector('.story-timeline');

    await page.getByRole('link', { name: /Thinking of our spring picnic/i }).click();
    await expect(page).toHaveURL(/\/story\/heart-moments\/hm-picnic/);

    await page.getByRole('button', { name: taskBoundary.back }).click();
    await expect(page).toHaveURL(/type=HEART_MOMENT/);
  });

  test('opening a Milestone from a filtered Timeline and pressing Back restores that filter', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline&type=MILESTONE');
    await page.waitForSelector('.story-timeline');

    await page.getByRole('link', { name: /Moved in together/i }).click();
    await expect(page).toHaveURL(/\/story\/milestones\/ms-moved-in/);

    await page.getByRole('button', { name: taskBoundary.back }).click();
    await expect(page).toHaveURL(/type=MILESTONE/);
  });

  test('Search restores its submitted query/kind after returning from a canonical detail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/search');

    await page.getByLabel(m5s5.search.label).fill('August Vacation');
    await page.getByRole('button', { name: m5s5.search.submit }).click();
    await expect(page.getByRole('heading', { name: 'Late August Vacation' })).toBeVisible();

    await page.getByRole('link', { name: /Late August Vacation/i }).click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-august/);

    await page.getByRole('button', { name: taskBoundary.back }).click();
    await expect(page).toHaveURL(/\/search/);
    await expect(page.getByLabel(m5s5.search.label)).toHaveValue('August Vacation');
    await expect(page.getByRole('heading', { name: 'Late August Vacation' })).toBeVisible();
  });

  test('Search results for Heart Moment/Milestone deep-link to their canonical detail, not the Story landing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/search');

    await page.getByLabel(m5s5.search.label).fill('Moved in together');
    await page.getByRole('button', { name: m5s5.search.submit }).click();
    await page.getByRole('link', { name: /Moved in together/i }).click();
    await expect(page).toHaveURL(/\/story\/milestones\/ms-moved-in/);
  });

  test('320px reflow produces no horizontal overflow with month headings', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    await captureScreenshot(page, testInfo, 'r2-timeline-320-reflow.png');
  });

  test('dark mode captures month headings at 390x844', async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => window.localStorage.setItem('eimir.theme', 'system'));
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await captureScreenshot(page, testInfo, 'r2-timeline-month-headings-390-dark.png');
  });

  test('representative Expanded (1280px) captures month headings', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');
    await captureScreenshot(page, testInfo, 'r2-timeline-month-headings-1280-light.png');
  });

  test('reduced motion preserves the same month-grouped structure', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    await expect(page.getByRole('heading', { name: 'August 2026', level: 2 })).toBeVisible();
    await captureScreenshot(page, testInfo, 'r2-timeline-reduced-motion-390-light.png');
  });
});
