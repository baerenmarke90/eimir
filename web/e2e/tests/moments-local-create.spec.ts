import composer from '../../src/i18n/locales/composer';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import en from '../../src/i18n/locales/en.json' with { type: 'json' };
import mapCopy from '../../src/i18n/locales/memoryMap';
import storyCopy from '../../src/i18n/locales/storyProducts';
import taskCopy from '../../src/i18n/locales/taskBoundary';
import {
  expectFloatingAddAction,
  expectLabeledAddAction,
  expectOverviewActionPlacement,
} from '../support/addAction';
import { storyDetailBack } from '../support/memoryDiary';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const ORIGIN = '/story?tab=timeline&type=MILESTONE&year=2024&order=asc';

async function setup(page: Page) {
  const created: string[] = [];
  const records = new Map<string, object>();
  await installMocks(page);
  await page.route('**/api/v1/spaces/*/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const resource = path.split('/').at(-1) ?? '';
    if (
      request.method() === 'POST' &&
      ['memories', 'heart-moments', 'milestones'].includes(resource)
    ) {
      const body = request.postDataJSON();
      const id = `created-${resource}`;
      const record = {
        ...body,
        id,
        spaceId: SPACE_ID,
        author: ME,
        authorId: ACCOUNT_ID,
        capabilities: CAPABILITIES,
        attachment: null,
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      created.push(resource);
      records.set(id, record);
      return route.fulfill({ status: 201, json: record });
    }
    if (request.method() === 'GET' && records.has(resource))
      return route.fulfill({ json: records.get(resource) });
    if (path.endsWith('/comments'))
      return route.fulfill({ json: { items: [], hasMore: false } });
    if (path.endsWith('/memory-map'))
      return route.fulfill({
        json: {
          items: [
            {
              memoryId: 'mem-canal',
              title: 'By the lake',
              happenedOn: '2026-10-30',
              placeId: 'lake',
              placeName: 'Lake',
              latitude: 49,
              longitude: 7,
            },
          ],
          nextCursor: null,
        },
      });
    return route.fallback();
  });
  await signIn(page);
  return created;
}

async function choose(page: Page, label: string) {
  await page.getByRole('button', { name: de.story.addMoment }).click();
  const sheet = page.getByRole('dialog', { name: de.story.addMoment });
  await expect(sheet.getByRole('link')).toHaveCount(3);
  await sheet.getByRole('link', { name: label, exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(
    await page.evaluate(() => document.activeElement?.tagName),
  ).not.toMatch(/INPUT|TEXTAREA/);
}

for (const target of [
  {
    resource: 'memories',
    label: composer.diaryEntry,
    field: de.memory.bodyLabel,
    save: de.memory.save,
  },
  {
    resource: 'heart-moments',
    label: de.story.kind.heartMoment,
    field: storyCopy.heartMomentProduct.textLabel,
    save: storyCopy.heartMomentProduct.save,
  },
  {
    resource: 'milestones',
    label: de.story.kind.milestone,
    field: storyCopy.milestoneProduct.titleLabel,
    save: storyCopy.milestoneProduct.save,
  },
]) {
  test(`${target.resource}: local capture shows the saved result and restores the filtered diary`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const created = await setup(page);
    await page.goto(ORIGIN);
    await choose(page, target.label);
    await expect(page).toHaveURL(`/story/${target.resource}/new`);
    await page.getByLabel(target.field, { exact: true }).fill('Our new moment');
    await page.getByRole('button', { name: target.save, exact: true }).click();
    await expect(page).toHaveURL(
      `/story/${target.resource}/created-${target.resource}`,
    );
    await expect(
      page.getByText('Our new moment', { exact: true }).first(),
    ).toBeVisible();
    expect(created).toEqual([target.resource]);
    await storyDetailBack(page).click();
    await expect(page).toHaveURL(ORIGIN);
    await expect(
      page.getByRole('tab', { name: de.story.tabTimeline }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.story-task-active-scope')).toContainText(
      '2024',
    );
    await expect(
      page.getByRole('button', { name: de.story.addMoment }),
    ).toBeFocused();
  });
}

test('the contextual choice closes and restores focus for Escape and Back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const created = await setup(page);
  const trigger = page.getByRole('button', { name: de.story.addMoment });
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL('/story?tab=timeline');
  await expect(trigger).toBeFocused();
  expect(created).toEqual([]);
  await expect(page.locator('.mobile-bottom-shell button')).toHaveCount(0);
});

test('discovery and selected map place survive opening and cancelling capture', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  for (const origin of ['/story?tab=discover', '/story/map?place=49%3A7']) {
    await page.goto(origin);
    await choose(page, composer.diaryEntry);
    await page.locator('.task-back-control').click();
    await expect(page).toHaveURL(origin);
    await expect(
      page.getByRole('button', { name: de.story.addMoment }),
    ).toBeFocused();
    if (origin.includes('/map'))
      await expect(
        page.getByRole('tab', { name: mapCopy.entry }),
      ).toHaveAttribute('aria-selected', 'true');
  }
});

test('a dirty local capture keeps its draft before deliberate discard and return', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const created = await setup(page);
  await page.goto(ORIGIN);
  await choose(page, composer.diaryEntry);
  const narrative = page.getByLabel(de.memory.bodyLabel, { exact: true });
  await narrative.fill('A draft worth keeping');
  await page.locator('.task-back-control').click();
  const confirm = page.getByRole('alertdialog', {
    name: taskCopy.discardTitle,
  });
  await confirm.getByRole('button', { name: taskCopy.keepEditing }).click();
  await expect(narrative).toHaveValue('A draft worth keeping');
  await page.locator('.task-back-control').click();
  await confirm
    .getByRole('button', { name: taskCopy.discard, exact: true })
    .click();
  await expect(page).toHaveURL(ORIGIN);
  expect(created).toEqual([]);
});

test('the Core entry remains available with empty history, load errors, the Pro map gate and offline', async ({
  page,
  context,
}) => {
  await setup(page);
  await page.route('**/discover', (route) =>
    route.fulfill({
      json: {
        lead: null,
        items: [],
        leadContext: null,
        selectionDate: '2026-11-06',
      },
    }),
  );
  await page.route('**/timeline?*', (route) =>
    route.fulfill({ status: 503, json: { code: 'SERVICE_UNAVAILABLE' } }),
  );
  await page.route('**/memory-map?*', (route) =>
    route.fulfill({
      status: 403,
      json: { code: 'PREMIUM_ENTITLEMENT_REQUIRED' },
    }),
  );
  for (const origin of [
    '/story?tab=discover',
    '/story?tab=timeline',
    '/story/map',
  ]) {
    await page.goto(origin);
    await page.getByRole('button', { name: de.story.addMoment }).click();
    await expect(
      page.getByRole('dialog', { name: de.story.addMoment }).getByRole('link'),
    ).toHaveCount(3);
    await page.keyboard.press('Escape');
  }
  await context.setOffline(true);
  await page.getByRole('button', { name: de.story.addMoment }).click();
  await expect(
    page.getByRole('dialog', { name: de.story.addMoment }).getByRole('link'),
  ).toHaveCount(3);
});

test('local creation reflows accessibly in Compact and Expanded, Light/Dark and large text', async ({
  page,
}, info) => {
  await setup(page);
  for (const [width, theme] of [
    [360, 'light'],
    [390, 'dark'],
    [430, 'light'],
    [1280, 'dark'],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/story?tab=timeline');
    await expect(page.locator('.story-timeline').first()).toBeVisible();
    await captureScreenshot(page, info, `moments-local-${width}-${theme}.png`);
    const trigger = page.getByRole('button', { name: de.story.addMoment });
    if (width < 840) {
      await expectFloatingAddAction(
        trigger,
        page.locator('.mobile-bottom-shell'),
      );
    } else {
      await expectLabeledAddAction(trigger);
      await expectOverviewActionPlacement(trigger, true);
    }
    await trigger.click();
    const sheet = page.getByRole('dialog', { name: de.story.addMoment });
    await expect(sheet.getByRole('link').first()).toBeFocused();
    for (const row of await sheet.getByRole('link').all()) {
      expect(
        (await row.locator('svg').boundingBox())?.width,
      ).toBeLessThanOrEqual(32);
      expect((await row.boundingBox())?.height).toBeLessThanOrEqual(80);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await captureScreenshot(page, info, `moments-choice-${width}-${theme}.png`);
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.getByRole('button', { name: de.story.addMoment }).click();
  const sheet = page.getByRole('dialog', { name: de.story.addMoment });
  const finalChoice = sheet.getByRole('link').last();
  await finalChoice.focus();
  await expect(finalChoice).toBeInViewport({ ratio: 1 });
  expect(
    await sheet.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await captureScreenshot(page, info, 'moments-choice-320-dark-large.png');
});

test('the local label and three types follow the active English locale', async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { get: () => ['en'] });
    Object.defineProperty(navigator, 'language', { get: () => 'en' });
  });
  await installMocks(page);
  await page.goto('/story');
  await page.getByLabel(en.login.email).fill('lea@example.org');
  await page.getByLabel(en.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: en.login.submit }).click();
  await page.getByRole('button', { name: en.story.addMoment }).click();
  const sheet = page.getByRole('dialog', { name: en.story.addMoment });
  for (const label of [
    en.composer.diaryEntry,
    en.story.kind.heartMoment,
    en.story.kind.milestone,
  ])
    await expect(
      sheet.getByRole('link', { name: label, exact: true }),
    ).toBeVisible();
});
