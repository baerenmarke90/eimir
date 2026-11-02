import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import storyProducts from '../../src/i18n/locales/storyProducts';
import m5s3 from '../../src/i18n/locales/m5s3';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  DETAIL_COMMENTS,
  installMocks,
  signIn,
  SPACE_ID,
} from '../support/storyTimelineFixture';

const PLAN_ID = 'plan-picnic';
const DESCRIPTION_URL = 'https://example.org/park';
const COMMENT_URL = 'https://example.org/picnic';
const copy = storyProducts.comments;

async function openPlan(
  page: Page,
  options: { failCreate?: boolean; canComment?: boolean } = {},
) {
  const unknown = await installMocks(page, { strict: true });
  const calls = {
    previews: [] as string[],
    creates: [] as { body: string; key: string }[],
    edits: 0,
    deletes: 0,
  };
  let comments = [{ ...DETAIL_COMMENTS[1], body: 'I can bring a blanket.' }];
  const receipts = new Map<string, (typeof comments)[number]>();
  let failCreate = Boolean(options.failCreate);
  const plan = {
    id: PLAN_ID,
    spaceId: SPACE_ID,
    title: 'Picnic in the park',
    description: `Pick a spot for our picnic.\n${DESCRIPTION_URL}`,
    status: 'PLANNED',
    plannedOn: '2099-09-14',
    plannedStart: null,
    plannedEnd: null,
    experiencedOn: null,
    anticipationEnabled: false,
    sourceWishId: null,
    placeId: null,
    createdBy: ACCOUNT_ID,
    creator: { id: ACCOUNT_ID, displayName: 'Lea' },
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
    version: 1,
    capabilities: { ...CAPABILITIES, canComment: options.canComment ?? true },
    attachments: [],
  };
  await page.route(`**/api/v1/spaces/${SPACE_ID}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const base = `/api/v1/spaces/${SPACE_ID}`;
    if (path === `${base}/plans` && method === 'GET') {
      const status = new URL(request.url()).searchParams.get('status');
      return route.fulfill({
        json: {
          items: !status || status === 'PLANNED' ? [plan] : [],
          hasMore: false,
          nextCursor: null,
        },
      });
    }
    if (path === `${base}/wishes` && method === 'GET')
      return route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    if (path === `${base}/places` && method === 'GET')
      return route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    if (path === `${base}/plans/${PLAN_ID}` && method === 'GET')
      return route.fulfill({ json: plan });
    if (path === `${base}/plans/${PLAN_ID}/comments`) {
      if (method === 'GET')
        return route.fulfill({
          json: { items: comments, hasMore: false, nextCursor: null },
        });
      if (method === 'POST') {
        const body = request.postDataJSON().body;
        const key = request.headers()['idempotency-key'];
        if (!key)
          throw new Error('Plan replies need the shared create identity');
        calls.creates.push({ body, key });
        if (failCreate) {
          failCreate = false;
          return route.fulfill({
            status: 503,
            json: { code: 'UNAVAILABLE', status: 503, title: 'Unavailable' },
          });
        }
        let result = receipts.get(key);
        if (!result) {
          result = { ...DETAIL_COMMENTS[0], id: 'created-comment', body };
          receipts.set(key, result);
          comments = [result, ...comments];
        }
        return route.fulfill({ status: 201, json: result });
      }
    }
    if (path === `${base}/comments/created-comment`) {
      if (method === 'PATCH') {
        calls.edits += 1;
        expect(request.headers()['if-match']).toBe('1');
        comments = comments.map((item) =>
          item.id === 'created-comment'
            ? { ...item, body: request.postDataJSON().body, version: 2 }
            : item,
        );
        return route.fulfill({ json: comments[0] });
      }
      if (method === 'DELETE') {
        calls.deletes += 1;
        expect(request.headers()['if-match']).toBe('2');
        comments = comments.filter((item) => item.id !== 'created-comment');
        return route.fulfill({ status: 204 });
      }
    }
    if (path === `${base}/link-preview` && method === 'POST') {
      const body = request.postDataJSON();
      expect(Object.keys(body)).toEqual(['url']);
      calls.previews.push(body.url);
      return route.fulfill({
        json:
          body.url === DESCRIPTION_URL
            ? {
                available: true,
                title: 'A quiet afternoon in the park',
                description: 'Open lawns and a place for a picnic.',
              }
            : { available: false, title: null, description: null },
      });
    }
    return route.fallback();
  });
  await signIn(page);
  await page.goto('/plan');
  await page.locator('.planen-next-link').click();
  await expect(
    page.getByRole('heading', { name: plan.title, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText('I can bring a blanket.', { exact: true }),
  ).toBeVisible();
  return { calls, unknown };
}

const scenarios = [
  { width: 360, theme: 'light' },
  { width: 390, theme: 'dark' },
  { width: 430, theme: 'light' },
  { width: 1440, theme: 'dark' },
  { width: 320, theme: 'light', large: true },
] as const;

for (const scenario of scenarios) {
  test(`Plan discussion and link resolution complete and return at ${scenario.width} ${scenario.theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.emulateMedia({
      colorScheme: scenario.theme,
      reducedMotion: 'reduce',
    });
    const state = await openPlan(page);
    if ('large' in scenario)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(state.calls.previews).toEqual([]);
    const description = page.locator('.planen-section-content');
    await expect(description.getByRole('link')).toHaveAttribute(
      'href',
      DESCRIPTION_URL,
    );
    await description
      .getByText(storyProducts.authoredLinks.previews_one, { exact: true })
      .click();
    await description.getByRole('button', { name: /Linkvorschau/ }).click();
    await expect(
      description.getByRole('link', { name: /A quiet afternoon/ }),
    ).toBeFocused();
    expect(state.calls.previews).toEqual([DESCRIPTION_URL]);

    const panel = page.locator('.comments-panel');
    await panel.getByRole('button', { name: copy.write }).click();
    await expect(panel.getByRole('textbox')).toBeFocused();
    await panel.getByRole('textbox').fill(`We can bring lunch. ${COMMENT_URL}`);
    await captureScreenshot(
      page,
      testInfo,
      `plan-comment-composer-${scenario.width}-${scenario.theme}.png`,
      { fullPage: true },
    );
    await panel.getByRole('button', { name: copy.send, exact: true }).click();
    await expect(
      panel.getByRole('link', { name: new RegExp(COMMENT_URL) }),
    ).toBeVisible();
    expect(state.calls.creates).toHaveLength(1);
    expect(state.calls.previews).toEqual([DESCRIPTION_URL]);
    await panel
      .getByText(storyProducts.authoredLinks.previews_one, { exact: true })
      .click();
    await panel.getByRole('button', { name: /Linkvorschau/ }).click();
    await expect(panel.getByRole('status')).toContainText(
      storyProducts.authoredLinks.unavailable,
    );
    await expect(panel.getByRole('link')).toHaveAttribute('href', COMMENT_URL);
    const own = panel
      .locator('.comment-card')
      .filter({ has: page.locator('.comment-author-self') });
    await own.getByRole('button', { name: copy.edit }).click();
    await own.getByRole('textbox').fill(`Bring lunch and tea. ${COMMENT_URL}`);
    await own.getByRole('button', { name: copy.save, exact: true }).click();
    await expect(own.getByRole('textbox')).toHaveCount(0);
    await expect(panel.getByText(/Bring lunch and tea/)).toBeVisible();
    expect(state.calls.edits).toBe(1);
    await captureScreenshot(
      page,
      testInfo,
      `plan-comment-result-${scenario.width}-${scenario.theme}.png`,
      { fullPage: true },
    );
    await page.locator('.planen-completion-action').scrollIntoViewIfNeeded();
    await captureScreenshot(
      page,
      testInfo,
      `plan-comment-viewport-${scenario.width}-${scenario.theme}.png`,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    const reflow = await page.evaluate(() => ({
      width: innerWidth,
      page: document.documentElement.scrollWidth,
      wide: [...document.querySelectorAll('main *')]
        .filter(
          (element) => element.getBoundingClientRect().right > innerWidth + 1,
        )
        .map((element) => ({
          tag: element.tagName,
          class: element.className,
          width: element.getBoundingClientRect().width,
        }))
        .slice(-12),
    }));
    expect(reflow.page, JSON.stringify(reflow.wide)).toBeLessThanOrEqual(
      reflow.width + 1,
    );
    const edited = panel
      .locator('.comment-card')
      .filter({ hasText: 'Bring lunch and tea.' });
    await edited.getByLabel(copy.moreActions).click();
    await edited.getByRole('button', { name: copy.delete }).click();
    await expect(panel.getByText(/Bring lunch and tea/)).toHaveCount(0);
    expect(state.calls.deletes).toBe(1);
    await page.getByRole('button', { name: taskBoundary.back }).click();
    await expect(page).toHaveURL(/\/plan(?:#plans)?$/);
    await expect(page.locator('.planen-next-link')).toBeVisible();
    await expect(
      page.getByRole('tab', { name: m5s3.overview.segmentPlans }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(state.unknown).toEqual([]);
  });
}

test('a failed Plan reply keeps its draft and retries the same create identity', async ({
  page,
}) => {
  const state = await openPlan(page, { failCreate: true });
  const panel = page.locator('.comments-panel');
  await panel.getByRole('button', { name: copy.write }).click();
  const field = panel.getByRole('textbox');
  await field.fill('Preserved after failure.');
  await panel.getByRole('button', { name: copy.send, exact: true }).click();
  await expect(field).toHaveValue('Preserved after failure.');
  await expect(
    panel.getByRole('button', { name: copy.send, exact: true }),
  ).toBeEnabled();
  await panel.getByRole('button', { name: copy.send, exact: true }).click();
  await expect(
    panel.getByText('Preserved after failure.', { exact: true }),
  ).toBeVisible();
  expect(state.calls.creates).toHaveLength(2);
  expect(state.calls.creates[0].key).toBe(state.calls.creates[1].key);
  expect(state.unknown).toEqual([]);
});

test('Plan read capability keeps conversation readable without offering a forbidden write', async ({
  page,
}) => {
  const state = await openPlan(page, { canComment: false });
  await expect(
    page.locator('.comments-panel').getByText('I can bring a blanket.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: copy.write })).toHaveCount(0);
  expect(state.calls.creates).toEqual([]);
  expect(state.unknown).toEqual([]);
});

test('Plan editing preserves a started reply and offline mode cannot submit it', async ({
  page,
}) => {
  const state = await openPlan(page);
  const panel = page.locator('.comments-panel');
  await panel.getByRole('button', { name: copy.write }).click();
  await panel
    .getByRole('textbox')
    .fill('Keep this thought while checking our schedule.');
  await page
    .locator('.page-heading')
    .getByRole('button', { name: copy.edit, exact: true })
    .click();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: copy.cancel, exact: true }).click();
  await expect(panel.getByRole('textbox')).toHaveValue(
    'Keep this thought while checking our schedule.',
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    window.dispatchEvent(new Event('offline'));
  });
  await expect(panel.getByText(copy.offline)).toBeVisible();
  await expect(
    panel.getByRole('button', { name: copy.send, exact: true }),
  ).toHaveCount(0);
  expect(state.calls.creates).toEqual([]);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    window.dispatchEvent(new Event('online'));
  });
  await expect(panel.getByRole('textbox')).toHaveValue(
    'Keep this thought while checking our schedule.',
  );
  expect(state.calls.creates).toEqual([]);
  expect(state.unknown).toEqual([]);
});
