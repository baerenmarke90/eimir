import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import storyProducts from '../../src/i18n/locales/storyProducts';
import {
  DETAIL_COMMENTS,
  SPACE_ID,
  captureScreenshot,
  installMocks,
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

async function openJourney(page: Page, scenario: (typeof cases)[number]) {
  await page.setViewportSize({ width: scenario.width, height: 900 });
  await page.emulateMedia({
    colorScheme: scenario.theme,
    reducedMotion: 'reduce',
  });
  const unknown = await installMocks(page, { strict: true });
  let comments = DETAIL_COMMENTS.map((item) => ({ ...item }));
  const writes: {
    method: string;
    ifMatch: string | undefined;
    body: unknown;
  }[] = [];
  const parentEndpoint = `/api/v1/spaces/${SPACE_ID}/${scenario.kind}/${scenario.id}/comments`;
  await page.route(`**${parentEndpoint}*`, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        json: { items: comments, hasMore: false, nextCursor: null },
      });
    } else if (request.method() === 'POST') {
      writes.push({
        method: 'POST',
        ifMatch: request.headers()['if-match'],
        body: request.postDataJSON(),
      });
      const created = {
        ...DETAIL_COMMENTS[0],
        id: 'comment-new',
        body: request.postDataJSON().body,
      };
      comments = [...comments, created];
      await route.fulfill({ status: 201, json: created });
    } else await route.fallback();
  });
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/comments/comment-own`,
    async (route) => {
      const request = route.request();
      writes.push({
        method: request.method(),
        ifMatch: request.headers()['if-match'],
        body: request.postData() ? request.postDataJSON() : null,
      });
      if (request.method() === 'PATCH') {
        const updated = {
          ...comments[0],
          body: request.postDataJSON().body,
          version: 2,
        };
        comments = [updated, comments[1]];
        await route.fulfill({ json: updated });
      } else if (request.method() === 'DELETE') {
        comments = comments.filter((item) => item.id !== 'comment-own');
        await route.fulfill({ status: 204 });
      } else await route.fallback();
    },
  );
  await signIn(page);
  await page.getByRole('link', { name: new RegExp(scenario.title) }).click();
  const panel = page.locator('.comments-panel');
  await expect(
    panel.getByText('Still smiling about this.', { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText('Me too.', { exact: true })).toBeVisible();
  await expect(panel.locator('.comment-menu-trigger')).toHaveCount(1);
  return { panel, writes, unknown };
}

for (const scenario of cases) {
  for (const operation of ['create', 'update', 'delete'] as const) {
    test(`${scenario.kind} ${operation} requires deliberate online retry at ${scenario.width} ${scenario.theme}`, async ({
      page,
    }, info) => {
      const state = await openJourney(page, scenario);
      if (operation === 'create') {
        await state.panel
          .getByRole('button', { name: copy.send, exact: true })
          .click();
        await state.panel.getByRole('textbox').fill('A thought worth keeping.');
      } else {
        await state.panel.locator('.comment-menu-trigger').click();
        if (operation === 'update') {
          await state.panel
            .getByRole('button', { name: copy.edit, exact: true })
            .click();
          await state.panel
            .getByRole('textbox')
            .fill('An edited thought worth keeping.');
        }
      }
      const action = state.panel.getByRole('button', {
        name:
          operation === 'create'
            ? copy.send
            : operation === 'update'
              ? copy.save
              : copy.delete,
        exact: true,
      });
      await page.context().setOffline(true);
      await action.click();
      await expect(
        state.panel.getByText(de.states.offline.title, { exact: true }),
      ).toBeVisible();
      if (operation === 'delete')
        await state.panel.locator('.comment-menu-trigger').click();
      await expect(action).toBeEnabled();
      expect(state.writes).toEqual([]);
      if (operation !== 'delete')
        await expect(state.panel.getByRole('textbox')).toHaveValue(
          operation === 'create'
            ? 'A thought worth keeping.'
            : 'An edited thought worth keeping.',
        );
      else
        await expect(
          state.panel.getByText('Still smiling about this.', { exact: true }),
        ).toBeVisible();

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
      if (
        operation === 'create' ||
        (operation === 'delete' && scenario.width === 390)
      ) {
        await captureScreenshot(
          page,
          info,
          `comments-${operation}-offline-${scenario.width}-${scenario.theme}.png`,
          { fullPage: true },
        );
      }

      if (scenario.width === 430) {
        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
        });
        await expect(action).toBeVisible();
        expect(
          await page.evaluate(() =>
            Array.from(document.querySelectorAll('main *'))
              .filter(
                (element) =>
                  element.getBoundingClientRect().right > window.innerWidth + 1,
              )
              .map((element) => ({
                tag: element.tagName,
                className: element.className,
                width: element.getBoundingClientRect().width,
              })),
          ),
        ).toEqual([]);
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze()
          ).violations,
        ).toEqual([]);
        if (operation === 'update')
          await captureScreenshot(
            page,
            info,
            'comments-edit-offline-320-200.png',
            { fullPage: true },
          );
      }

      await page.context().setOffline(false);
      // The settled error remains actionable after a real offline/online cycle.
      await expect(
        state.panel.getByText(de.states.offline.title, { exact: true }),
      ).toBeVisible();
      await expect(action).toBeEnabled();
      expect(state.writes).toEqual([]);
      await action.click();
      await expect.poll(() => state.writes.length).toBe(1);
      const write = state.writes[0];
      expect(write.method).toBe(
        operation === 'create'
          ? 'POST'
          : operation === 'update'
            ? 'PATCH'
            : 'DELETE',
      );
      if (operation !== 'create') expect(write.ifMatch).toBe('1');
      if (operation === 'delete')
        await expect(
          state.panel.getByText('Still smiling about this.', { exact: true }),
        ).toHaveCount(0);
      else
        await expect(
          state.panel.locator('.comment-card > p').filter({
            hasText:
              operation === 'create'
                ? 'A thought worth keeping.'
                : 'An edited thought worth keeping.',
          }),
        ).toBeVisible();
      await expect(
        state.panel.getByText('Me too.', { exact: true }),
      ).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/\/story\?tab=timeline$/);
      await expect(
        page.getByRole('link', { name: new RegExp(scenario.title) }),
      ).toBeVisible();
      expect(state.writes).toHaveLength(1);
      expect(state.unknown).toEqual([]);
    });
  }
}
