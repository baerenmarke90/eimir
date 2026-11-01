import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import { DASHBOARD_MODULE_KEYS } from '../../src/client/dashboardModules';
import planningCopy from '../../src/i18n/locales/m5s3';
import memoryProduct from '../../src/i18n/locales/memoryProduct';
import copy from '../../src/i18n/locales/photoPlaces';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import {
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  getTimelineItems,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const BASE = `/api/v1/spaces/${SPACE_ID}`;
const place = {
  id: 'saved-place',
  name: 'Our park by the water',
  address: 'River Lane',
  latitude: 52.5,
  longitude: 13.4,
  spaceId: SPACE_ID,
  version: 1,
  createdAt: '2026-10-29T12:00:00Z',
  updatedAt: '2026-10-29T12:00:00Z',
  capabilities: CAPABILITIES,
};
for (const scenario of [
  { width: 390, height: 844, theme: 'light', scale: 1 },
  { width: 430, height: 932, theme: 'dark', scale: 1 },
  { width: 1280, height: 900, theme: 'light', scale: 1 },
  { width: 320, height: 760, theme: 'dark', scale: 2 },
])
  test(`rediscovery and Diary modes open, edit, add Place, return at ${scenario.width} ${scenario.theme} text ${scenario.scale}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(
      (theme) => localStorage.setItem('eimir.theme', theme),
      scenario.theme,
    );
    const unexpected = await installMocks(page);
    let linked = false;
    let links = 0;
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === `${BASE}/places`)
        return route.fulfill({
          json: { items: [place], nextCursor: null, hasMore: false },
        });
      if (path === `${BASE}/moments/memories/mem-canal/places`)
        return route.fulfill({
          json: {
            items: linked ? [place] : [],
            nextCursor: null,
            hasMore: false,
          },
        });
      if (
        path === `${BASE}/places/saved-place/memories/mem-canal` &&
        route.request().method() === 'PUT'
      ) {
        linked = true;
        links++;
        return route.fulfill({ status: 204 });
      }
      if (path.endsWith('/content') && path.includes('/attachments/'))
        return route.fulfill({
          contentType: 'image/png',
          body: readFileSync(
            fileURLToPath(
              new URL(
                '../fixtures/plan-cover-fit/landscape.png',
                import.meta.url,
              ),
            ),
          ),
        });
      return route.fallback();
    });
    await signIn(page);
    await page.goto('/story');
    if (scenario.scale > 1)
      await page.addStyleTag({
        content: `html { font-size: ${scenario.scale * 100}% !important; }`,
      });
    const discover = page.getByRole('tab', {
      name: de.story.tabDiscover,
      exact: true,
    });
    const diary = page.getByRole('tab', {
      name: de.story.tabTimeline,
      exact: true,
    });
    await expect(discover).toHaveAttribute('aria-selected', 'true');
    await expect(diary).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(1);
    await expect(
      page.getByRole('heading', {
        name: de.story.discoverHeading,
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: de.story.tabTimeline, exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.momente-tapestry-item')).toHaveCount(
      getTimelineItems().length - 1,
    );
    expect(
      await page.locator('.momente-tapestry-kind').allTextContents(),
    ).toEqual(['', '', '']);
    const overflowDetails = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main *'))
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > innerWidth || rect.right > innerWidth + 1;
        })
        .slice(0, 14)
        .map((node) => ({
          tag: node.tagName,
          className: node.className,
          width: node.getBoundingClientRect().width,
        })),
    );

    expect(overflowDetails).toEqual([]);
    if (scenario.scale === 1) {
      const cards = await page
        .locator('.momente-tapestry-item')
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            x: node.getBoundingClientRect().x,
            y: node.getBoundingClientRect().y,
          })),
        );
      expect(cards[1].x).toBeGreaterThan(cards[0].x);
      expect(Math.abs(cards[1].y - cards[0].y)).toBeLessThan(1);
    }

    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);

    await captureScreenshot(
      page,
      info,
      `moments-${scenario.width}-${scenario.theme}-${scenario.scale}.png`,
      { fullPage: true },
    );
    await diary.click();
    await expect(diary).toHaveAttribute('aria-selected', 'true');
    const offsets = await page
      .locator('.story-timeline-marker')
      .evaluateAll((markers) =>
        markers.map((marker) => {
          const entry = marker.closest('.story-timeline-item');
          const card = entry?.querySelector('.story-card-link');
          if (!entry || !card)
            throw new Error(
              'A timeline marker must belong to its card and rail.',
            );
          const rail = getComputedStyle(entry, '::before');
          const box = entry.getBoundingClientRect();
          const cardBox = card.getBoundingClientRect();
          const node = marker.getBoundingClientRect();
          return {
            horizontal: Math.abs(
              node.left + node.width / 2 - (box.left + parseFloat(rail.left)),
            ),
            vertical: Math.abs(
              node.top + node.height / 2 - (cardBox.top + cardBox.height / 2),
            ),
          };
        }),
      );
    expect(offsets.length).toBeGreaterThan(0);
    for (const offset of offsets) {
      expect(offset.horizontal).toBeLessThanOrEqual(1);
      expect(offset.vertical).toBeLessThanOrEqual(1);
    }
    await page
      .locator('#momente-diary [data-task-item-key="memory-mem-canal"]')
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Breakfast by the canal',
        level: 1,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: copy.add, exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('link', { name: memoryProduct.edit, exact: true })
      .click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-canal\/edit$/);
    await page.getByRole('button', { name: copy.add, exact: true }).click();
    const picker = page.getByRole('dialog', { name: copy.add });
    await expect(picker).toBeVisible();
    await expect(picker.locator('select')).toHaveCount(0);
    await picker.getByRole('button', { name: /Our park by the water/ }).click();
    await expect(picker).toBeHidden();
    await expect(page.getByText(place.name, { exact: true })).toBeVisible();
    expect(links).toBe(1);
    await expect(
      page.getByRole('button', { name: copy.add, exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('link', { name: memoryProduct.backToMemory, exact: true })
      .click();
    await expect(page.getByText(place.name, { exact: true })).toBeVisible();
    await expect(page.locator('.moment-place-overflow')).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByRole('button', { name: taskBoundary.back, exact: true })
      .click();
    await expect(diary).toHaveAttribute('aria-selected', 'true');
    expect(unexpected).toEqual([]);
  });

for (const theme of ['light', 'dark'])
  test(`session restoration shows a restrained public startup logo: ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (value) => localStorage.setItem('eimir.theme', value),
      theme,
    );
    await installMocks(page);
    await signIn(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/api\/v1\/auth\/(me|memberships)$/, async (route) => {
      await gate;
      await route.fallback();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const startup = page.locator('.branded-startup');
    await expect(startup).toBeVisible();
    await expect(startup.locator('.ui-state')).toHaveCount(0);
    const logo = await startup.locator('.brand-mark').boundingBox();
    if (!logo) throw new Error('The public startup logo must be visible.');
    expect(logo.width).toBeLessThanOrEqual(72);
    if (!logo) throw new Error('The public startup logo must be visible.');
    expect(logo.width).toBeGreaterThanOrEqual(48);
    await expect(startup.getByRole('status')).toHaveText(
      de.states.loading.title,
    );
    expect(
      await startup
        .getByRole('status')
        .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
    ).toBeLessThanOrEqual(18);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await captureScreenshot(page, info, `startup-${theme}-390.png`);
    release();
    await expect(startup).toHaveCount(0);
  });

for (const [width, theme] of [
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
] as const)
  test(`Wir restores saved content and module choices before slow background reads: ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await installMocks(page);
    let delay = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/v1/auth/me', async (route) => {
      if (delay) await gate;
      await route.fallback();
    });
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/dashboard/preferences`,
      async (route) => {
        if (delay) await gate;
        await route.fulfill({
          json: {
            items: DASHBOARD_MODULE_KEYS.map((moduleKey) => ({
              moduleKey,
              visible: moduleKey !== 'relationship_presence',
            })),
          },
        });
      },
    );
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/dashboard`,
      async (route) => {
        const revalidating = delay;
        if (delay) await gate;
        await route.fulfill({
          json: {
            space: {
              spaceId: SPACE_ID,
              partner: { id: 'partner', displayName: 'Alex' },
            },
            relationshipDuration: null,
            retrospective: null,
            recentShared: [],
            sharedStorySummary: { memories: 0, heartMoments: 0, milestones: 0 },
            viewerLocalDate: '2026-09-17',
            upcoming: [
              {
                id: 'startup-plan',
                type: 'PLAN',
                titleOrText: revalidating
                  ? 'Fresh afternoon together'
                  : 'Saved afternoon together',
                scheduledOn: '2026-09-19',
                scheduledAt: null,
                occurredOn: null,
                createdAt: '2026-09-17T12:00:00Z',
              },
            ],
          },
        });
      },
    );
    await signIn(page);
    await page.goto('/today');
    await expect(
      page.getByText('Saved afternoon together', { exact: true }),
    ).toBeVisible();
    delay = true;
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(
        page.getByText('Saved afternoon together', { exact: true }),
      ).toBeVisible();
      await expect(page.locator('.overview-cache-notice')).toBeVisible();
      await expect(page.locator('.today-hero')).toHaveCount(0);
      await expect(page.locator('.branded-startup')).toHaveCount(0);
      await expect(page.locator('.today-page .ui-state')).toHaveCount(0);
      await captureScreenshot(
        page,
        info,
        `wir-background-start-${width}-${theme}.png`,
        { fullPage: true },
      );
    } finally {
      release();
    }
    await expect(
      page.getByText('Fresh afternoon together', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.overview-cache-notice')).toHaveCount(0);
    await expect(page.locator('.today-hero')).toHaveCount(0);

    // Even with a saved overview, a current denial cannot authorize a cold start.
    await page.route('**/api/v1/auth/memberships', (route) =>
      route.fulfill({
        status: 403,
        json: { code: 'ACCESS_DENIED', title: 'Access denied' },
      }),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText('Fresh afternoon together', { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.today-content')).toHaveCount(0);
  });

test('a manually created map Place survives a failed relation and retries only its unfinished assignment', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page);
  let creates = 0;
  let links = 0;
  let linked = false;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === `${BASE}/places/lookup`)
      return route.fulfill({
        json: {
          items: [
            {
              name: place.name,
              address: place.address,
              latitude: place.latitude,
              longitude: place.longitude,
            },
          ],
          attribution: '© OpenStreetMap contributors',
        },
      });
    if (path === `${BASE}/places` && method === 'POST') {
      creates++;
      return route.fulfill({
        status: 201,
        json: { ...place, ...route.request().postDataJSON() },
      });
    }
    if (path === `${BASE}/places`)
      return route.fulfill({
        json: {
          items: creates ? [place] : [],
          nextCursor: null,
          hasMore: false,
        },
      });
    if (path === `${BASE}/moments/memories/mem-canal/places`)
      return route.fulfill({
        json: {
          items: linked ? [place] : [],
          nextCursor: null,
          hasMore: false,
        },
      });
    if (
      path === `${BASE}/places/saved-place/memories/mem-canal` &&
      method === 'PUT'
    ) {
      links++;
      if (links === 1)
        return route.fulfill({
          status: 500,
          json: {
            status: 500,
            code: 'TEST_LINK_FAILURE',
            title: 'Temporary assignment failure',
          },
        });
      linked = true;
      return route.fulfill({ status: 204 });
    }
    return route.fallback();
  });
  await page.route('**/*.tile.openstreetmap.org/**', (route) => route.abort());
  await signIn(page);
  await page.goto('/story/memories/mem-canal');
  await expect(
    page.getByRole('button', { name: copy.add, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('link', { name: memoryProduct.edit, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal\/edit$/);
  await page.getByRole('button', { name: copy.add, exact: true }).click();
  const picker = page.getByRole('dialog', { name: copy.add });
  await picker
    .getByRole('button', { name: planningCopy.map.open, exact: true })
    .click();
  const map = page.getByRole('dialog', { name: planningCopy.map.title });
  await map.getByLabel(planningCopy.map.searchLabel).fill('River park');
  await map
    .getByRole('button', { name: planningCopy.map.search, exact: true })
    .click();
  await map
    .getByRole('button', {
      name: `${place.name}, ${place.address}`,
      exact: true,
    })
    .click();
  await map
    .getByRole('button', { name: planningCopy.map.confirm, exact: true })
    .click();
  const retry = picker.getByRole('button', { name: copy.retryLink });
  await expect(retry).toBeEnabled();
  expect(creates).toBe(1);
  expect(links).toBe(1);
  await expect(picker.getByRole('alert')).toBeVisible();
  await retry.click();
  await expect(picker).toBeHidden();
  await expect(page.getByText(place.name, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: copy.add, exact: true }),
  ).toHaveCount(0);
  expect(creates).toBe(1);
  expect(links).toBe(2);
});
