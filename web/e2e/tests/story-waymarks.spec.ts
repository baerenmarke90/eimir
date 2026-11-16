import { expect, type Page, test } from '@playwright/test';
import copy from '../../src/i18n/locales/relationshipReflections';
import AxeBuilder from '../support/axe';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  PARTNER,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

/*
 * #1907 F1: "Eure Wegmarken" on the story overview. Round days and
 * anniversaries are derived in the browser from the passport read and the
 * Milestones list, so the mocked reads below are the whole data source.
 */

const BASE = `/api/v1/spaces/${SPACE_ID}`;
const MOVED_IN = 'ms-moved-in';

// 17 June 2023 plus 1,230 days is the pinned day, 29 October 2026.
const STARTED_ON = '2023-06-17';

const MILESTONES = [
  { id: MOVED_IN, title: 'Zusammengezogen', happenedOn: '2024-09-01' },
  { id: 'ms-engaged', title: 'Verlobt', happenedOn: '2024-12-24' },
  { id: 'ms-trip', title: 'Erste Reise', happenedOn: '2023-08-12' },
];

function milestoneSummary(item: (typeof MILESTONES)[number]) {
  return {
    id: item.id,
    title: item.title,
    happenedOn: item.happenedOn,
    author: ME,
    capabilities: CAPABILITIES,
    createdAt: `${item.happenedOn}T00:00:00Z`,
    places: [],
  };
}

async function fixture(
  page: Page,
  options: {
    pro?: boolean;
    daysTogether?: number;
    startedOn?: string;
    milestones?: typeof MILESTONES;
  } = {},
) {
  const unexpected = await installMocks(page);
  const milestones = options.milestones ?? MILESTONES;
  let milestoneReads = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `${BASE}/entitlements`)
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          tier: options.pro === false ? 'FREE' : 'PREMIUM',
          status: 'ACTIVE',
          effectiveUntil: null,
          isInGracePeriod: false,
          capabilities: options.pro === false ? [] : ['relationship.passport'],
        },
      });
    if (path === `${BASE}/relationship-passport`)
      return route.fulfill({
        json: {
          partner: PARTNER,
          relationshipDuration: {
            startedOn: options.startedOn ?? STARTED_ON,
            daysTogether: options.daysTogether ?? 1230,
            displayMode: 'DAYS',
          },
          memories: 128,
          heartMoments: 12,
          milestones: milestones.length,
          completedPlans: 24,
          places: 18,
        },
      });
    if (path === `${BASE}/story-lifeline`)
      return route.fulfill({
        json: { startsOn: STARTED_ON, today: '2026-10-29', weeks: [] },
      });
    if (path === `${BASE}/milestones`) {
      milestoneReads++;
      return route.fulfill({
        json: {
          items: milestones.map(milestoneSummary),
          hasMore: false,
          nextCursor: null,
        },
      });
    }
    if (path === `${BASE}/milestones/${MOVED_IN}`)
      return route.fulfill({
        json: {
          id: MOVED_IN,
          spaceId: SPACE_ID,
          title: 'Zusammengezogen',
          description: 'Our first shared home.',
          happenedOn: '2024-09-01',
          author: ME,
          authorId: ACCOUNT_ID,
          capabilities: CAPABILITIES,
          createdAt: '2024-09-01T00:00:00Z',
          updatedAt: '2024-09-01T00:00:00Z',
          version: 1,
        },
      });
    if (path === `${BASE}/milestones/${MOVED_IN}/comments`)
      return route.fulfill({
        json: { hasMore: false, items: [], nextCursor: null },
      });
    return route.fallback();
  });
  return { unexpected, milestoneReads: () => milestoneReads };
}

async function openOverview(page: Page) {
  await signIn(page);
  await page.goto('/story/our-story');
  await expect(
    page.getByRole('heading', { level: 1, name: copy.passport.title }),
  ).toBeVisible();
}

const sectionOf = (page: Page) => page.locator('section.passport-waymarks');

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );

for (const [width, theme, largeText] of [
  [390, 'light', false],
  [390, 'dark', false],
  [360, 'light', true],
  [1280, 'light', false],
] as const) {
  test(`story overview shows the reached waymarks at ${width} ${theme}${largeText ? ' large text' : ''}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    const state = await fixture(page);
    await openOverview(page);
    if (largeText)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    const section = sectionOf(page);
    await expect(
      section.getByRole('heading', { name: copy.waymarks.title }),
    ).toBeVisible();
    // 4 round days, the first anniversary and six Milestone anniversaries
    // are reached; the thread opens with the newest four.
    const total = 11;
    await expect(
      section.locator('.passport-waymarks-list').first().locator('li'),
    ).toHaveCount(4);
    await expect(
      section.getByRole('button', {
        name: copy.waymarks.showAll.replace('{{count}}', String(total)),
      }),
    ).toHaveAttribute('aria-expanded', 'false');
    // Newest first: the second anniversary of moving in, then the third of the
    // first trip, then the 1,000th day. The next chapter keeps one round day.
    await expect(
      section.locator('li').nth(0).locator('.passport-waymark-label'),
    ).toHaveText(
      copy.waymarks.milestoneYears_other
        .replace('{{count}}', '2')
        .replace('{{title}}', 'Zusammengezogen'),
    );
    await expect(
      section.locator('li').nth(2).locator('.passport-waymark-label'),
    ).toHaveText('1.000 Tage gemeinsam');
    await expect(
      page
        .locator('.passport-landmarks dl > div')
        .filter({ hasText: 'Verlobt' }),
    ).toContainText(
      copy.waymarks.milestoneYears_other
        .replace('{{count}}', '2')
        .replace('{{title}}', 'Verlobt'),
    );
    expect(state.milestoneReads()).toBe(1);
    expect(state.unexpected).toEqual([]);
    expect(await noHorizontalOverflow(page)).toBe(false);
    await section.scrollIntoViewIfNeeded();
    await captureScreenshot(
      page,
      info,
      `story-waymarks-${width}-${theme}${largeText ? '-large-text' : ''}.png`,
      { fullPage: true },
    );
    const results = await new AxeBuilder({ page })
      .include('.relationship-passport')
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('the rest opens in place, Milestone rows open their Milestone', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({
    reducedMotion: 'no-preference',
    colorScheme: 'light',
  });
  await fixture(page);
  await openOverview(page);
  const section = sectionOf(page);
  const more = section.locator('.passport-waymarks-more');
  const toggle = section.locator('.passport-waymarks-toggle');
  await expect(toggle).toHaveText(
    copy.waymarks.showAll.replace('{{count}}', '11'),
  );
  // Collapsed rows are neither visible nor reachable by keyboard.
  await expect(more).toBeHidden();
  await toggle.focus();
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveText(copy.waymarks.showFewer);
  await expect(more).toBeVisible();
  await expect(section.locator('li')).toHaveCount(11);
  // The page does not jump sideways or grow a second scroller.
  expect(await noHorizontalOverflow(page)).toBe(false);
  await captureScreenshot(page, info, 'story-waymarks-expanded-390-light.png', {
    fullPage: true,
    animations: 'disabled',
  });
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(more).toBeHidden();
  await toggle.press('Enter');
  await expect(more).toBeVisible();

  const row = section.getByRole('link', {
    name: new RegExp(
      `${copy.waymarks.milestoneYears_other
        .replace('{{count}}', '2')
        .replace('{{title}}', 'Zusammengezogen')}`,
    ),
  });
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/story/milestones/${MOVED_IN}$`));
  await expect(
    page.getByRole('heading', { name: 'Zusammengezogen' }).first(),
  ).toBeVisible();
  await page.goBack();
  await expect(sectionOf(page)).toBeVisible();
});

test('the section is omitted while nothing is reached', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await fixture(page, {
    startedOn: '2026-10-15',
    daysTogether: 14,
    milestones: [],
  });
  await openOverview(page);
  await expect(page.locator('.passport-landmarks')).toBeVisible();
  await expect(page.locator('section.passport-waymarks')).toHaveCount(0);
  await expect(page.getByText(copy.waymarks.title)).toHaveCount(0);
  await captureScreenshot(page, info, 'story-waymarks-none-390-light.png', {
    fullPage: true,
  });
});

test('Free keeps the existing Pro entry and reads no Milestones', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await fixture(page, { pro: false });
  await signIn(page);
  await page.goto('/story/our-story');
  await expect(page.getByText(copy.passport.locked)).toBeVisible();
  await expect(page.locator('section.passport-waymarks')).toHaveCount(0);
  expect(state.milestoneReads()).toBe(0);
});
