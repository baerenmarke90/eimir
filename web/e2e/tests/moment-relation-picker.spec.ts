import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import m5s3 from '../../src/i18n/locales/m5s3';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import taskSheets from '../../src/i18n/locales/taskSheets';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  signIn,
  SPACE_ID,
} from '../support/storyTimelineFixture';

const PLACE_ID = 'place-mobile-picker';
const CHAPTER_ID = 'chapter-mobile-picker';
const MEMORY_TITLE = 'Breakfast by the canal';
const MILESTONE_TITLE = 'Two years together';
const TEST_DATE = '2026-09-01T00:00:00Z';

type Relation = {
  targetId: string;
  targetType: 'MEMORY' | 'MILESTONE' | 'HEART_MOMENT';
};

async function installRelations(page: Page, owner: 'place' | 'chapter') {
  const unexpected = await installMocks(page, { strict: true });
  const relations: Relation[] = [];
  const writes: string[] = [];
  const resource =
    owner === 'place' ? `places/${PLACE_ID}` : `chapters/${CHAPTER_ID}`;
  const root = `/api/v1/spaces/${SPACE_ID}/${resource}`;
  const place = {
    id: PLACE_ID,
    spaceId: SPACE_ID,
    name: 'Our place by the water',
    description: 'A quiet place for our shared moments.',
    address: 'Canal walk',
    latitude: null,
    longitude: null,
    createdBy: ACCOUNT_ID,
    creator: ME,
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
    version: 1,
    capabilities: CAPABILITIES,
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (
      request.method() === 'GET' &&
      path === `/api/v1/spaces/${SPACE_ID}/places`
    ) {
      await route.fulfill({
        json: { items: [place], nextCursor: null, hasMore: false },
      });
      return;
    }
    if (request.method() === 'GET' && path === root) {
      await route.fulfill({
        json:
          owner === 'place'
            ? place
            : {
                id: CHAPTER_ID,
                spaceId: SPACE_ID,
                title: 'Our summer',
                description: 'Small and big moments together.',
                createdBy: ACCOUNT_ID,
                creator: ME,
                createdAt: TEST_DATE,
                updatedAt: TEST_DATE,
                version: 1,
                startOn: null,
                endOn: null,
                placeId: null,
                capabilities: CAPABILITIES,
              },
      });
      return;
    }
    if (request.method() === 'GET' && path === `${root}/content`) {
      await route.fulfill({ json: { items: relations } });
      return;
    }
    const relation = path
      .slice(root.length)
      .match(/^\/(memories|milestones|heart-moments)(?:\/([^/]+))?$/);
    if (path.startsWith(root) && relation) {
      const kind =
        relation[1] === 'memories'
          ? 'MEMORY'
          : relation[1] === 'heart-moments'
            ? 'HEART_MOMENT'
            : 'MILESTONE';
      if (request.method() === 'PUT') {
        writes.push(relation[2]);
        relations.push({ targetId: relation[2], targetType: kind });
        await route.fulfill({ status: 204 });
      } else {
        expect(request.method()).toBe('GET');
        await route.fulfill({
          json: {
            items: relations
              .filter((entry) => entry.targetType === kind)
              .map((entry) => entry.targetId),
          },
        });
      }
      return;
    }
    if (path.endsWith('/moments/memories/mem-canal/places')) {
      await route.fulfill({ json: { items: [], nextCursor: null } });
      return;
    }
    if (path.endsWith('/search')) {
      await route.fulfill({
        json: {
          items: [
            {
              id: 'mem-canal',
              type: 'MEMORY',
              scope: 'SHARED',
              title: MEMORY_TITLE,
              excerpt: 'A wonderful morning by the water.',
              occurredOn: '2026-05-12',
              parentId: null,
            },
            {
              id: 'private',
              type: 'HEART_MOMENT',
              scope: 'PRIVATE',
              title: 'Private thought',
              excerpt: null,
              occurredOn: '2026-05-12',
              parentId: null,
            },
          ],
          nextCursor: null,
        },
      });
      return;
    }
    await route.fallback();
  });
  return { unexpected, writes, resource };
}

for (const scenario of [
  { width: 390, colorScheme: 'light', owner: 'place' },
  { width: 1280, colorScheme: 'dark', owner: 'place' },
  { width: 430, colorScheme: 'light', owner: 'chapter' },
] as const) {
  test(`shared moment picker saves and returns at ${scenario.width}px (${scenario.colorScheme}, ${scenario.owner})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.emulateMedia({
      colorScheme: scenario.colorScheme,
      reducedMotion: 'reduce',
    });
    const state = await installRelations(page, scenario.owner);
    await signIn(page);
    const path =
      scenario.owner === 'place'
        ? `/plan/places/${PLACE_ID}`
        : `/plan/chapters/${CHAPTER_ID}`;
    await page.goto(path);
    const trigger = page.getByRole('button', {
      name: m5s3.relations.addLabel,
      exact: true,
    });
    await trigger.click();
    const sheet = page.getByRole('dialog', { name: m5s3.relations.addLabel });
    await expect(sheet.getByRole('searchbox')).not.toBeFocused();
    await expect(sheet.getByRole('combobox')).toHaveCount(0);
    await sheet
      .getByRole('checkbox', { name: new RegExp(MEMORY_TITLE) })
      .check();
    await sheet
      .getByRole('button', {
        name: m5s3.relations.filter.MILESTONE,
        exact: true,
      })
      .click();
    await sheet
      .getByRole('checkbox', { name: new RegExp(MILESTONE_TITLE) })
      .check();
    await expect(
      sheet.getByRole('button', {
        name: m5s3.relations.addSelected_other.replace('{{count}}', '2'),
      }),
    ).toBeEnabled();
    await captureScreenshot(
      page,
      testInfo,
      `moment-picker-${scenario.width}-${scenario.colorScheme}-${scenario.owner}.png`,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(state.writes).toEqual([]);
    await sheet
      .getByRole('button', {
        name: m5s3.relations.addSelected_other.replace('{{count}}', '2'),
      })
      .click();
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(
      page.getByRole('link', { name: new RegExp(MEMORY_TITLE) }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: new RegExp(MILESTONE_TITLE) }),
    ).toBeVisible();
    expect(state.writes).toEqual(['mem-canal', 'ms-2years']);
    await captureScreenshot(
      page,
      testInfo,
      `moment-picker-saved-${scenario.width}-${scenario.colorScheme}-${scenario.owner}.png`,
      { fullPage: true },
    );
    await page.getByRole('link', { name: new RegExp(MEMORY_TITLE) }).click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
    await page
      .getByRole('button', { name: taskBoundary.back, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(
      page.getByRole('link', { name: new RegExp(MEMORY_TITLE) }),
    ).toBeVisible();
    expect(state.unexpected).toEqual([]);
  });
}

test('large-text picker searches shared history and cancels a staged choice safely', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const state = await installRelations(page, 'place');
  await signIn(page);
  await page.goto(`/plan/places/${PLACE_ID}`);
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  const trigger = page.getByRole('button', {
    name: m5s3.relations.addLabel,
    exact: true,
  });
  await trigger.click();
  const sheet = page.getByRole('dialog', { name: m5s3.relations.addLabel });
  await sheet.getByRole('searchbox').fill('Breakfast');
  await expect(sheet.getByRole('checkbox')).toHaveCount(1);
  await expect(sheet.getByText('Private thought')).toHaveCount(0);
  await sheet.getByRole('checkbox', { name: new RegExp(MEMORY_TITLE) }).check();
  await captureScreenshot(
    page,
    testInfo,
    'moment-picker-320-dark-large-text.png',
  );
  expect(
    await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBe(true);
  const completion = sheet.getByRole('button', {
    name: m5s3.relations.addSelected_one.replace('{{count}}', '1'),
  });
  const bounds = await completion.boundingBox();
  expect(bounds).not.toBeNull();
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(800);
  await sheet
    .getByRole('button', { name: taskSheets.close, exact: true })
    .click();
  await sheet
    .getByRole('button', { name: m5s3.relations.discard, exact: true })
    .click();
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(state.writes).toEqual([]);
  expect(state.unexpected).toEqual([]);
});
