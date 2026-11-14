import fixtures from '../fixtures/locales/de';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  ME,
  SPACE_ID,
  captureScreenshot,
  installMocks,
  signIn,
} from '../support/storyTimelineFixture';
import copy from '../../src/i18n/locales/m5s3';
import de from '../../src/i18n/locales/de';
import privateArea from '../../src/i18n/locales/privateArea';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import wishSelection from '../../src/i18n/locales/wishSelection';

const base = `/api/v1/spaces/${SPACE_ID}`;
const planId = '44444444-4444-4444-8444-444444444444';
const wishId = '55555555-5555-4555-8555-555555555555';
const placeId = '66666666-6666-4666-8666-666666666666';
const photo = {
  id: 'plan-photo',
  status: 'READY',
  mediaType: 'IMAGE',
  mimeType: 'image/png',
  size: 12000,
  width: 1600,
  height: 900,
  hasThumbnail: true,
  isSensitive: false,
};
const plan = (id: string, title: string, extra = {}) => ({
  id,
  title,
  spaceId: SPACE_ID,
  createdBy: ACCOUNT_ID,
  creator: ME,
  capabilities: CAPABILITIES,
  status: 'PLANNED',
  description: null,
  plannedOn: '2099-11-21',
  plannedStart: null,
  plannedEnd: null,
  experiencedOn: null,
  placeId: null,
  sourceWishId: null,
  anticipationEnabled: false,
  createdAt: '2026-11-05T08:00:00Z',
  updatedAt: '2026-11-05T08:00:00Z',
  version: 1,
  ...extra,
});
const wish = (id: string, title: string, status = 'OPEN') => ({
  id,
  title,
  status,
  spaceId: SPACE_ID,
  createdBy: ACCOUNT_ID,
  creator: ME,
  capabilities: CAPABILITIES,
  createdAt: '2026-11-05T08:00:00Z',
  updatedAt: '2026-11-05T08:00:00Z',
  version: 1,
});

async function fixture(page: Page, failLater = false) {
  await page.addInitScript(
    ({ accountId, spaceId }) => {
      localStorage.setItem(
        `eimir:product-tour:v1:${accountId}:${spaceId}`,
        'seen',
      );
    },
    { accountId: ACCOUNT_ID, spaceId: SPACE_ID },
  );
  const unexpected = await installMocks(page, { strict: true });
  const reads: string[] = [];
  let fail = failLater;
  const target = plan(planId, fixtures.planningFollowup.plan, {
    description: fixtures.planningFollowup.street,
    placeId,
    coverAttachment: photo,
  });
  const targetWish = wish(wishId, fixtures.planningFollowup.wish);
  const firstPage = Array.from({ length: 20 }, (_, i) =>
    plan(`plan-${i}`, `Ausflug ${i + 1}`),
  );
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === `${base}/plans`) {
      const cursor = url.searchParams.get('cursor') ?? '';
      reads.push(cursor);
      if (url.searchParams.get('overviewScope') === 'COMPLETED')
        return route.fulfill({
          json: {
            items: [
              plan('completed', fixtures.planningFollowup.completedPlan, {
                status: 'COMPLETED',
                experiencedOn: '2026-01-20',
              }),
            ],
            nextCursor: null,
          },
        });
      if (cursor && fail) {
        fail = false;
        return route.fulfill({
          status: 503,
          json: {
            code: 'SERVICE_UNAVAILABLE',
            title: 'Unavailable',
            status: 503,
          },
        });
      }
      return route.fulfill({
        json: {
          items: cursor ? [target] : firstPage,
          nextCursor: cursor ? null : 'later-plans',
        },
      });
    }
    if (path === `${base}/plans/${planId}`)
      return route.fulfill({ json: target });
    if (path === `${base}/wishes`) {
      const completed = url.searchParams.get('status') === 'COMPLETED';
      const cursor = url.searchParams.get('cursor');
      return route.fulfill({
        json: {
          items: completed
            ? [
                wish(
                  'done',
                  fixtures.planningFollowup.completedWish,
                  'COMPLETED',
                ),
              ]
            : cursor
              ? [targetWish]
              : [
                  wish('wish-z', fixtures.planningFollowup.lastWish),
                  wish('wish-b', fixtures.planningFollowup.secondWish),
                ],
          nextCursor: !completed && !cursor ? 'later-wishes' : null,
        },
      });
    }
    if (path === `${base}/wishes/${wishId}`)
      return route.fulfill({ json: targetWish });
    if (
      route.request().method() === 'GET' &&
      path === `${base}/wishes/${wishId}/reminder`
    )
      return route.fulfill({
        json: { dueAt: null },
        headers: { 'Cache-Control': 'private, no-store' },
      });
    if (path === `${base}/places`)
      return route.fulfill({
        json: {
          items: [
            {
              id: placeId,
              name: 'Starnberger See',
              address: 'Am See',
              latitude: 47.9,
              longitude: 11.3,
              creator: ME,
              capabilities: CAPABILITIES,
              createdAt: target.createdAt,
              updatedAt: target.updatedAt,
              version: 1,
            },
          ],
          nextCursor: null,
        },
      });
    if (path === `${base}/attachments/plan-photo/read-access`)
      return route.fulfill({
        json: {
          method: 'STREAM',
          url: `${base}/attachments/plan-photo/content`,
          expiresAt: null,
        },
      });
    if (path === `${base}/attachments/plan-photo/content`)
      return route.fulfill({
        contentType: 'image/png',
        body: readFileSync(
          new URL('../fixtures/plan-cover-fit/landscape.png', import.meta.url),
        ),
      });
    return route.fallback();
  });
  return { unexpected, reads };
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

for (const view of [
  { width: 360, theme: 'light', large: false },
  { width: 390, theme: 'dark', large: false },
  { width: 430, theme: 'light', large: false },
  { width: 1280, theme: 'dark', large: false },
  { width: 320, theme: 'light', large: true },
] as const) {
  test(`scoped planning search and private destinations at ${view.width}px ${view.theme}`, async ({
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
    const state = await fixture(page);
    await signIn(page);
    await page.goto('/plan');
    if (view.large)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    const planSearch = page.getByRole('searchbox', {
      name: copy.overview.searchPlans,
    });
    await expect(planSearch).toHaveAttribute(
      'placeholder',
      copy.overview.searchPlans,
    );
    await expect(planSearch).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    if (!view.large) {
      const searchBox = await page
        .locator('.planen-panel:visible .planen-search')
        .boundingBox();
      expect(searchBox?.height).toBeLessThanOrEqual(56);
    }
    await expect(
      page.getByRole('link', {
        name: wishSelection.compactEntryAction,
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(planSearch).not.toBeFocused();
    await planSearch.fill('osterreich');
    await expect(page.locator('.planen-next-link')).toContainText(
      fixtures.planningFollowup.plan,
    );
    expect(state.reads).toContain('later-plans');
    await expect(
      page.getByRole('status').filter({ hasText: '1 Treffer' }),
    ).toBeVisible();
    await captureScreenshot(
      page,
      info,
      `planning-search-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    await page.locator('.planen-next-link').click();
    const facts = page.getByRole('region', { name: copy.plan.scheduleFacts });
    await expect(
      facts.getByRole('link', { name: /Starnberger See/ }),
    ).toBeVisible();
    await expect(
      facts.getByRole('link', { name: /Starnberger See/ }),
    ).toHaveAttribute('href', '/story/map?place=47.9%3A11.3');
    await expect(facts.locator('.planen-detail-schedule')).toBeVisible();
    await captureScreenshot(
      page,
      info,
      `plan-context-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    await page
      .getByRole('button', { name: taskBoundary.back, exact: true })
      .click();
    await expect(planSearch).toHaveValue('osterreich');
    await expect(page.locator('.planen-next-link')).toBeFocused();
    expect(new URL(page.url()).search).toBe('');
    await planSearch.fill('strasse see');
    await expect(page.locator('.planen-next-link')).toContainText(
      fixtures.planningFollowup.plan,
    );
    await page
      .getByRole('button', {
        name: copy.overview.experiencedPlans,
        exact: true,
      })
      .click();
    await expect(planSearch).toHaveValue('strasse see');
    await expect(
      page.getByRole('heading', {
        name: copy.overview.noSearchResults,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: copy.overview.clearSearch, exact: true })
      .click();
    await expect(planSearch).toBeFocused();
    await expect(
      page.getByRole('link', {
        name: new RegExp(fixtures.planningFollowup.completedPlan),
      }),
    ).toBeVisible();

    await page
      .getByRole('tab', { name: copy.overview.segmentWishes, exact: true })
      .click();
    const wishSearch = page.getByRole('searchbox', {
      name: copy.overview.searchWishes,
    });
    await expect(wishSearch).toHaveAttribute(
      'placeholder',
      copy.overview.searchWishes,
    );
    await expect(wishSearch).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.planen-wish-copy > strong')).toHaveText([
      fixtures.planningFollowup.wish,
      fixtures.planningFollowup.secondWish,
      fixtures.planningFollowup.lastWish,
    ]);
    await expect(page.locator('.planen-wish-group > h2')).toHaveText([
      'A',
      'B',
      'Z',
    ]);
    await expect(page.locator('.planen-wish-chevron')).toHaveCount(0);
    const selection = page.getByRole('link', {
      name: wishSelection.compactEntryAction,
      exact: true,
    });
    await expect(selection.locator('.eimir-icon')).toHaveCSS(
      'width',
      view.large ? '40px' : '20px',
    );
    await captureScreenshot(
      page,
      info,
      `wishbook-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    await wishSearch.fill('agypten fruhling');
    await expect(page.locator('.planen-wish-copy > strong')).toHaveText([
      fixtures.planningFollowup.wish,
    ]);
    await page.locator('.planen-wish-link').click();
    await expect(page).toHaveURL(new RegExp(`/plan/wishes/${wishId}$`));
    await page
      .getByRole('button', { name: taskBoundary.back, exact: true })
      .click();
    await expect(wishSearch).toHaveValue('agypten fruhling');
    await expect(page.locator('.planen-wish-link')).toBeFocused();
    await noOverflow(page);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByRole('button', { name: copy.overview.clearSearch, exact: true })
      .click();
    await expect(wishSearch).toBeFocused();

    await page.goto('/more');
    if (view.large)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    const identity = page.locator(
      '.more-profile-avatar .person-identity-avatar',
    );
    const geometry = await identity.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      border: getComputedStyle(element).borderTopWidth,
    }));
    expect(geometry.width).toBe(view.large ? 96 : 48);
    expect(geometry.border).toBe('0px');
    await expect(
      page.locator('.more-profile-destination .more-destination-icon'),
    ).toHaveCount(0);
    await captureScreenshot(
      page,
      info,
      `more-profile-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    await page
      .getByRole('link', { name: de.more.private.title, exact: true })
      .click();
    await expect(
      page.getByRole('link', {
        name: privateArea.partnerNotes.title,
        exact: true,
      }),
    ).toBeVisible();
    await captureScreenshot(
      page,
      info,
      `private-hub-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    await noOverflow(page);
    expect(state.unexpected).toEqual([]);
  });
}

test('a failed later Plan page never becomes an empty search and can be retried', async ({
  page,
}) => {
  const state = await fixture(page, true);
  await signIn(page);
  await page.goto('/plan');
  await page
    .getByRole('searchbox', { name: copy.overview.searchPlans })
    .fill('osterreich');
  await expect(
    page.getByRole('heading', {
      name: copy.overview.noSearchResults,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeVisible();
  await page
    .getByRole('button', { name: de.common.retry, exact: true })
    .click();
  await expect(page.locator('.planen-next-link')).toContainText(
    fixtures.planningFollowup.plan,
  );
  expect(state.unexpected).toEqual([]);
});

test('a linked archived Place remains visible next to the Plan schedule', async ({
  page,
}) => {
  const state = await fixture(page);
  let placeReads = 0;
  await page.route(`**${base}/places?**`, (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.route(`**${base}/places/${placeId}`, (route) => {
    placeReads++;
    return route.fulfill({
      json: {
        id: placeId,
        spaceId: SPACE_ID,
        name: 'Starnberger See',
        address: 'Am See',
        latitude: 47.9,
        longitude: 11.3,
        archivedAt: '2026-11-01T00:00:00Z',
        creator: ME,
        capabilities: CAPABILITIES,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
        version: 1,
      },
    });
  });
  await signIn(page);
  await page.goto(`/plan/plans/${planId}`);
  const facts = page.getByRole('region', { name: copy.plan.scheduleFacts });
  await expect(
    facts.getByRole('link', { name: /Starnberger See/ }),
  ).toBeVisible();
  await expect(
    facts.getByRole('link', { name: /Starnberger See/ }),
  ).toHaveAttribute('href', '/story/map?place=47.9%3A11.3');
  await expect(facts.locator('.planen-detail-schedule')).toBeVisible();
  expect(placeReads).toBe(1);
  expect(state.unexpected).toEqual([]);
});
