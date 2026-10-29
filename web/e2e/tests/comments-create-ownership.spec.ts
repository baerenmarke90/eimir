import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
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
  holdInitial = false,
) {
  await page.setViewportSize({ width: scenario.width, height: 900 });
  await page.emulateMedia({
    colorScheme: scenario.theme,
    reducedMotion: 'reduce',
  });
  const unknown = await installMocks(page, { strict: true });
  let comments = holdInitial
    ? []
    : DETAIL_COMMENTS.map((item) => ({ ...item }));
  const receipts = new Map<string, (typeof DETAIL_COMMENTS)[number]>();
  const writes: { body: string; key: string | undefined }[] = [];
  let release!: () => void;
  let releaseOldRead!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const oldRead = new Promise<void>((resolve) => {
    releaseOldRead = resolve;
  });
  let fullReads = 0;
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/${scenario.kind}/${scenario.id}/comments*`,
    async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        const presence =
          new URL(request.url()).searchParams.get('limit') === '1';
        if (!presence && ++fullReads === 1 && holdInitial) {
          await oldRead;
          return route.fulfill({
            json: { items: [], hasMore: false, nextCursor: null },
          });
        }
        return route.fulfill({
          json: { items: comments, hasMore: false, nextCursor: null },
        });
      }
      if (request.method() !== 'POST') return route.fallback();
      const key = request.headers()['idempotency-key'];
      const body = request.postDataJSON().body;
      writes.push({ body, key });
      if (!key) throw new Error('Expected server-addressable create identity');
      let result = receipts.get(key);
      if (!result) {
        result = {
          ...DETAIL_COMMENTS[0],
          id: `comment-created-${receipts.size + 1}`,
          body,
        };
        receipts.set(key, result);
        comments = [...comments, result];
      }
      if (writes.length === 1) await held;
      await route.fulfill({ status: 201, json: result });
    },
  );
  await signIn(page);
  await page
    .locator('#momente-diary')
    .getByRole('link', { name: new RegExp(scenario.title) })
    .click();
  const panel = page.locator('.comments-panel');
  await expect(
    panel.getByRole('button', { name: copy.send, exact: true }),
  ).toBeVisible();
  if (!holdInitial) {
    await expect(
      panel.getByText('Still smiling about this.', { exact: true }),
    ).toBeVisible();
    await expect(panel.getByText('Me too.', { exact: true })).toBeVisible();
  }
  return {
    panel,
    writes,
    release,
    releaseOldRead,
    unknown,
    reads: () => fullReads,
  };
}

async function compose(page: Page, body: string) {
  const panel = page.locator('.comments-panel');
  await panel.getByRole('button', { name: copy.send, exact: true }).click();
  const field = panel.getByRole('textbox');
  await field.fill(body);
  return field;
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
  test(`${scenario.kind} create admits one immediate submit at ${scenario.width} ${scenario.theme}`, async ({
    page,
  }) => {
    const state = await openJourney(page, scenario);
    await compose(page, 'The first submitted thought.');
    await state.panel.locator('form.comment-form').evaluate((form) => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    await expect.poll(() => state.writes.length).toBe(1);
    await expect(
      state.panel.getByRole('button', { name: copy.sending }),
    ).toBeDisabled();
    state.release();
    await expect(state.panel.getByRole('textbox')).toHaveCount(0);
    await expect(
      state.panel.getByText('The first submitted thought.', { exact: true }),
    ).toHaveCount(1);
    expect(state.writes).toHaveLength(1);
    await page.goBack();
    await expect(page).toHaveURL(/\/story\?tab=timeline$/);
    expect(state.unknown).toEqual([]);
  });

  test(`${scenario.kind} create retains resource admission through return at ${scenario.width} ${scenario.theme}`, async ({
    page,
  }, info) => {
    const state = await openJourney(page, scenario);
    await compose(page, 'The first submitted thought.');
    await state.panel
      .getByRole('button', { name: copy.send, exact: true })
      .click();
    await expect.poll(() => state.writes.length).toBe(1);
    await page.goBack();
    await expect(page).toHaveURL(/\/story\?tab=timeline$/);
    await page
      .locator('#momente-diary')
      .getByRole('link', { name: new RegExp(scenario.title) })
      .click();
    const next = await compose(page, 'A new visit keeps its own words.');
    await expect(
      state.panel.getByRole('button', { name: copy.sending }),
    ).toBeDisabled();
    if (scenario.width === 390)
      await captureScreenshot(
        page,
        info,
        'comment-create-return-pending-390-dark.png',
        { fullPage: true },
      );
    await state.panel.locator('form.comment-form').dispatchEvent('submit');
    expect(state.writes).toHaveLength(1);
    state.release();
    await expect(
      state.panel.getByRole('button', { name: copy.send, exact: true }),
    ).toBeEnabled();
    await expect(next).toHaveValue('A new visit keeps its own words.');
    await expect(
      state.panel.getByText('The first submitted thought.', { exact: true }),
    ).toBeVisible();
    await expect(
      state.panel.getByText('Me too.', { exact: true }),
    ).toBeVisible();
    expect(state.writes).toHaveLength(1);
    await accessible(page);
    await captureScreenshot(
      page,
      info,
      `comment-create-return-${scenario.width}-${scenario.theme}.png`,
      { fullPage: true },
    );
    if (scenario.width === 430) {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      await accessible(page);
      expect(
        await page.evaluate(() =>
          Array.from(document.querySelectorAll('main *'))
            .filter(
              (element) =>
                element.getBoundingClientRect().right > window.innerWidth + 1,
            )
            .map((element) => element.className),
        ),
      ).toEqual([]);
      await captureScreenshot(page, info, 'comment-create-return-320-200.png', {
        fullPage: true,
      });
    }
    await state.panel
      .getByRole('button', { name: copy.send, exact: true })
      .click();
    await expect(state.panel.getByRole('textbox')).toHaveCount(0);
    await expect(
      state.panel.getByText('A new visit keeps its own words.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(state.writes).toHaveLength(2);
    expect(state.writes[1].key).not.toBe(state.writes[0].key);
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

test('comment create replaces the pending initial read without erasing later words', async ({
  page,
}, info) => {
  const state = await openJourney(page, cases[0], true);
  const field = await compose(page, 'Saved while the first read waits.');
  await state.panel
    .getByRole('button', { name: copy.send, exact: true })
    .click();
  await expect.poll(() => state.writes.length).toBe(1);
  await field.fill('Later words stay in this task.');
  state.release();
  await expect.poll(state.reads).toBe(2);
  await expect(
    state.panel.getByText('Saved while the first read waits.', { exact: true }),
  ).toBeVisible();
  await expect(
    state.panel.getByRole('button', { name: copy.send, exact: true }),
  ).toBeEnabled();
  state.releaseOldRead();
  await expect(field).toHaveValue('Later words stay in this task.');
  await expect(
    state.panel.getByText('Saved while the first read waits.', { exact: true }),
  ).toBeVisible();
  await accessible(page);
  await captureScreenshot(
    page,
    info,
    'comment-create-initial-read-360-light.png',
    { fullPage: true },
  );
  expect(state.writes).toHaveLength(1);
  await state.panel
    .getByRole('button', { name: copy.send, exact: true })
    .click();
  await expect(state.panel.getByRole('textbox')).toHaveCount(0);
  await expect(
    state.panel.getByText('Later words stay in this task.', { exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(2);
  await page.goBack();
  await expect(page).toHaveURL(/\/story\?tab=timeline$/);
  expect(state.unknown).toEqual([]);
});
