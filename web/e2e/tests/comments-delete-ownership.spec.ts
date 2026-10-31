import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import storyProducts from '../../src/i18n/locales/storyProducts';
import {
  captureScreenshot,
  DETAIL_COMMENTS,
  installMocks,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const copy = storyProducts.comments;
const cases = [
  {
    kind: 'memories',
    id: 'mem-canal',
    title: 'Breakfast by the canal',
    width: 360,
    theme: 'light',
  },
  {
    kind: 'heart-moments',
    id: 'hm-love',
    title: 'Thinking of you',
    width: 390,
    theme: 'dark',
  },
  {
    kind: 'milestones',
    id: 'ms-2years',
    title: 'Two years together',
    width: 430,
    theme: 'light',
  },
  {
    kind: 'memories',
    id: 'mem-canal',
    title: 'Breakfast by the canal',
    width: 1440,
    theme: 'dark',
  },
] as const;

async function openJourney(
  page: Page,
  scenario: (typeof cases)[number],
  fail = false,
) {
  await page.setViewportSize({ width: scenario.width, height: 900 });
  await page.emulateMedia({
    colorScheme: scenario.theme,
    reducedMotion: 'reduce',
  });
  const unknown = await installMocks(page, { strict: true });
  let comments = DETAIL_COMMENTS.map((item) => ({ ...item }));
  const writes: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/${scenario.kind}/${scenario.id}/comments*`,
    async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        json: { items: comments, hasMore: false, nextCursor: null },
      });
    },
  );
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/comments/comment-own`,
    async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      writes.push(route.request().headers()['if-match']);
      if (writes.length === 1) {
        await held;
        if (fail)
          return route.fulfill({
            status: 503,
            json: { status: 503, code: 'SERVER_ERROR', title: 'Unavailable' },
          });
      }
      comments = comments.filter((item) => item.id !== 'comment-own');
      return route.fulfill({ status: 204 });
    },
  );
  await signIn(page);
  await page
    .locator('#momente-diary')
    .getByRole('link', { name: new RegExp(scenario.title) })
    .click();
  const panel = page.locator('.comments-panel');
  await expect(
    panel.getByText(DETAIL_COMMENTS[0].body, { exact: true }),
  ).toBeVisible();
  return { panel, writes, release, unknown };
}
async function deleteButton(page: Page) {
  const panel = page.locator('.comments-panel');
  await panel.getByLabel(copy.moreActions, { exact: true }).click();
  return panel.getByRole('button', { name: copy.delete, exact: true });
}
async function accessible(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

for (const scenario of cases) {
  test(`${scenario.kind} delete remains pending through return at ${scenario.width} ${scenario.theme}`, async ({
    page,
  }, info) => {
    const state = await openJourney(page, scenario);
    await (await deleteButton(page)).click();
    await expect.poll(() => state.writes.length).toBe(1);
    await page.goBack();
    await expect(page).toHaveURL(/\/story\?tab=timeline$/);
    await page
      .locator('#momente-diary')
      .getByRole('link', { name: new RegExp(scenario.title) })
      .click();
    const button = await deleteButton(page);
    await expect(button).toBeDisabled();
    await expect(
      state.panel.getByText(DETAIL_COMMENTS[0].body, { exact: true }),
    ).toBeVisible();
    if (scenario.width === 390 || scenario.width === 1440)
      await captureScreenshot(
        page,
        info,
        `comment-delete-pending-${scenario.width}-${scenario.theme}.png`,
        { fullPage: true },
      );
    state.release();
    await expect(
      state.panel.getByText(DETAIL_COMMENTS[0].body, { exact: true }),
    ).toHaveCount(0);
    await expect(
      state.panel.getByText(DETAIL_COMMENTS[1].body, { exact: true }),
    ).toBeVisible();
    expect(state.writes).toEqual(['1']);
    await accessible(page);
    await captureScreenshot(
      page,
      info,
      `comment-delete-complete-${scenario.width}-${scenario.theme}.png`,
      { fullPage: true },
    );
    if (scenario.width === 430) {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      await accessible(page);
      await captureScreenshot(
        page,
        info,
        'comment-delete-complete-320-200.png',
        { fullPage: true },
      );
    }
    await page.goBack();
    await expect(page).toHaveURL(/\/story\?tab=timeline$/);
    await expect(
      page
        .locator('#momente-diary')
        .getByRole('link', { name: new RegExp(scenario.title) }),
    ).toBeVisible();
    expect(state.unknown).toEqual([]);
  });
}

test('comment delete admits one same-frame double activation', async ({
  page,
}) => {
  const state = await openJourney(page, cases[0]);
  await (await deleteButton(page)).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect.poll(() => state.writes.length).toBe(1);
  state.release();
  await expect(
    state.panel.getByText(DETAIL_COMMENTS[0].body, { exact: true }),
  ).toHaveCount(0);
  expect(state.writes).toEqual(['1']);
  expect(state.unknown).toEqual([]);
});

test('failed comment delete preserves both comments and requires deliberate retry', async ({
  page,
}, info) => {
  const state = await openJourney(page, cases[0], true);
  await (await deleteButton(page)).click();
  await expect.poll(() => state.writes.length).toBe(1);
  state.release();
  await expect(
    state.panel.getByText(de.states.server.title, { exact: true }),
  ).toBeVisible();
  await expect(
    state.panel.getByText(DETAIL_COMMENTS[0].body, { exact: true }),
  ).toBeVisible();
  await expect(
    state.panel.getByText(DETAIL_COMMENTS[1].body, { exact: true }),
  ).toBeVisible();
  expect(state.writes).toEqual(['1']);
  await accessible(page);
  await captureScreenshot(page, info, 'comment-delete-error-360-light.png', {
    fullPage: true,
  });
  await (await deleteButton(page)).click();
  await expect(
    state.panel.getByText(DETAIL_COMMENTS[0].body, { exact: true }),
  ).toHaveCount(0);
  await expect(
    state.panel.getByText(de.states.server.title, { exact: true }),
  ).toHaveCount(0);
  expect(state.writes).toEqual(['1', '1']);
  expect(state.unknown).toEqual([]);
});
