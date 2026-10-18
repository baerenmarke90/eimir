import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
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
  secondOwn = false,
) {
  await page.setViewportSize({ width: scenario.width, height: 900 });
  await page.emulateMedia({
    colorScheme: scenario.theme,
    reducedMotion: 'reduce',
  });
  const unknown = await installMocks(page, { strict: true });
  let comments = DETAIL_COMMENTS.map((item) => ({ ...item }));
  if (secondOwn)
    comments.push({
      ...comments[0],
      id: 'comment-other',
      body: 'Another thought of mine.',
    });
  const writes: { id: string; ifMatch: string | undefined; body: string }[] =
    [];
  let release!: (failed?: boolean) => void;
  const held = new Promise<boolean | undefined>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/${scenario.kind}/${scenario.id}/comments*`,
    (route) =>
      route.fulfill({
        json: { items: comments, hasMore: false, nextCursor: null },
      }),
  );
  await page.route(`**/api/v1/spaces/${SPACE_ID}/comments/*`, async (route) => {
    const request = route.request();
    if (request.method() !== 'PATCH') return route.fallback();
    const id = new URL(request.url()).pathname.split('/').at(-1);
    if (!id) throw new Error('Expected comment ID');
    writes.push({
      id,
      ifMatch: request.headers()['if-match'],
      body: request.postDataJSON().body,
    });
    if (writes.length === 1 && (await held)) {
      return route.fulfill({
        status: 503,
        json: {
          type: 'about:blank',
          title: 'Unavailable',
          status: 503,
          detail: 'Unavailable',
          code: 'UNAVAILABLE',
        },
      });
    }
    const current = comments.find((item) => item.id === id);
    if (!current) throw new Error('Expected existing comment');
    if (request.headers()['if-match'] !== String(current.version))
      return route.fulfill({
        status: 409,
        json: {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'Conflict',
          code: 'CONFLICT',
        },
      });
    const updated = {
      ...current,
      body: request.postDataJSON().body,
      version: current.version + 1,
      updatedAt: '2026-10-18T12:00:00Z',
    };
    comments = comments.map((item) => (item.id === id ? updated : item));
    await route.fulfill({ json: updated });
  });
  await signIn(page);
  await page.getByRole('link', { name: new RegExp(scenario.title) }).click();
  const panel = page.locator('.comments-panel');
  await expect(
    panel.getByText('Still smiling about this.', { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText('Me too.', { exact: true })).toBeVisible();
  return { panel, writes, release, unknown };
}

async function edit(panel: Locator, body: string) {
  const card = panel
    .locator('.comment-card')
    .filter({ has: panel.page().getByText(body, { exact: true }) });
  await card.locator('.comment-menu-trigger').click();
  await card.getByRole('button', { name: copy.edit, exact: true }).click();
  return panel.getByRole('textbox');
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
  for (const outcome of ['success', 'failure'] as const) {
    test(`${scenario.kind} edit ${outcome} preserves later words at ${scenario.width} ${scenario.theme}`, async ({
      page,
    }, info) => {
      const state = await openJourney(page, scenario);
      const field = await edit(state.panel, 'Still smiling about this.');
      await field.fill('The first submitted thought.');
      await state.panel
        .getByRole('button', { name: copy.save, exact: true })
        .click();
      await expect.poll(() => state.writes.length).toBe(1);
      await expect(
        state.panel.getByRole('button', { name: copy.saving }),
      ).toBeDisabled();
      await field.fill('A later thought stays with me.');
      state.release(outcome === 'failure');
      if (outcome === 'failure')
        await expect(
          state.panel.getByText(de.states.server.title, { exact: true }),
        ).toBeVisible();
      await expect(
        state.panel.getByRole('button', { name: copy.save, exact: true }),
      ).toBeEnabled();
      await expect(field).toHaveValue('A later thought stays with me.');
      expect(state.writes).toEqual([
        {
          id: 'comment-own',
          ifMatch: '1',
          body: 'The first submitted thought.',
        },
      ]);
      await accessible(page);
      if (outcome === 'success' || scenario.width === 390)
        await captureScreenshot(
          page,
          info,
          `comment-edit-${outcome}-${scenario.width}-${scenario.theme}.png`,
          { fullPage: true },
        );
      if (scenario.width === 430) {
        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
        });
        await expect(field).toHaveValue('A later thought stays with me.');
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
        if (outcome === 'success')
          await captureScreenshot(
            page,
            info,
            'comment-edit-success-320-200.png',
            { fullPage: true },
          );
      }
      await state.panel
        .getByRole('button', { name: copy.save, exact: true })
        .click();
      await expect(state.panel.getByRole('textbox')).toHaveCount(0);
      await expect(
        state.panel.getByText('A later thought stays with me.', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        state.panel.getByText('Me too.', { exact: true }),
      ).toBeVisible();
      expect(state.writes).toEqual([
        {
          id: 'comment-own',
          ifMatch: '1',
          body: 'The first submitted thought.',
        },
        {
          id: 'comment-own',
          ifMatch: outcome === 'success' ? '2' : '1',
          body: 'A later thought stays with me.',
        },
      ]);
      await page.goBack();
      await expect(page).toHaveURL(/\/story\?tab=timeline$/);
      await expect(
        page.getByRole('link', { name: new RegExp(scenario.title) }),
      ).toBeVisible();
      expect(state.unknown).toEqual([]);
    });
  }
}

for (const outcome of ['success', 'failure'] as const) {
  test(`departed comment edit ${outcome} cannot consume another task`, async ({
    page,
  }) => {
    const state = await openJourney(page, cases[1], true);
    const first = await edit(state.panel, 'Still smiling about this.');
    await first.fill('The first submitted thought.');
    await state.panel
      .getByRole('button', { name: copy.save, exact: true })
      .click();
    await expect.poll(() => state.writes.length).toBe(1);
    const next = await edit(state.panel, 'Another thought of mine.');
    await next.fill('A separate edit is still here.');
    state.release(outcome === 'failure');
    if (outcome === 'success')
      await expect(
        state.panel.getByText('The first submitted thought.', { exact: true }),
      ).toBeVisible();
    else
      await expect
        .poll(async () =>
          page.locator('.comment-edit-actions button[disabled]').count(),
        )
        .toBe(0);
    await expect(next).toHaveValue('A separate edit is still here.');
    await expect(
      state.panel.getByText(de.states.server.title, { exact: true }),
    ).toHaveCount(0);
    await expect(
      state.panel.getByRole('button', { name: copy.save, exact: true }),
    ).toBeEnabled();
    await state.panel
      .getByRole('button', { name: copy.save, exact: true })
      .click();
    await expect(
      state.panel.getByText('A separate edit is still here.', { exact: true }),
    ).toBeVisible();
    expect(state.writes[1]).toEqual({
      id: 'comment-other',
      ifMatch: '1',
      body: 'A separate edit is still here.',
    });
    await page.goBack();
    await expect(page).toHaveURL(/\/story\?tab=timeline$/);
    expect(state.unknown).toEqual([]);
  });
}
