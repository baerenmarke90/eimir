import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type Page,
  type Route,
  type TestInfo,
  test,
} from '@playwright/test';
import de from '../../src/i18n/locales/de';
import navigation from '../../src/i18n/locales/navigation';
import storyProducts from '../../src/i18n/locales/storyProducts';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  getTimelineItems,
  installMocks,
  ME,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const copy = storyProducts.heartMomentProduct;
const resourceId = 'hm-love';
const detailPath = `/story/heart-moments/${resourceId}`;
const endpoint = `/api/v1/spaces/${SPACE_ID}/heart-moments/${resourceId}`;

async function openJourney(
  page: Page,
  visibility: 'SHARED' | 'PRIVATE' = 'SHARED',
) {
  const unknown = await installMocks(page, { strict: true });
  let deleted = false;
  const deletes: string[] = [];
  const held: Route[] = [];
  const resource = {
    id: resourceId,
    spaceId: SPACE_ID,
    author: ME,
    authorId: ACCOUNT_ID,
    text: 'Thinking of you',
    tags: [],
    emotion: 'LOVED',
    visibility,
    attachment: null,
    happenedOn: '2026-01-20',
    createdAt: '2026-01-20T19:00:00Z',
    updatedAt: '2026-01-20T19:00:00Z',
    version: 1,
    capabilities: CAPABILITIES,
  };
  await page.route(`**${endpoint}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      deletes.push(route.request().headers()['if-match']);
      held.push(route);
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: deleted ? 404 : 200,
        json: deleted
          ? {
              code: 'NOT_FOUND',
              status: 404,
              title: 'Not found',
              type: 'about:blank',
            }
          : resource,
      });
      return;
    }
    await route.fallback();
  });
  const items = () =>
    getTimelineItems().filter(
      (item) =>
        item.heartMoment?.id !== resourceId ||
        (!deleted && visibility === 'SHARED'),
    );
  await page.route(`**/api/v1/spaces/${SPACE_ID}/timeline*`, (route) =>
    route.fulfill({
      json: {
        items: items(),
        hasMore: false,
        nextCursor: null,
      },
    }),
  );
  await page.route(`**/api/v1/spaces/${SPACE_ID}/discover*`, (route) => {
    const selection = items();
    return route.fulfill({
      json: {
        selectionDate: '2026-10-18',
        lead: selection[0],
        items: selection.slice(1),
        leadContext: null,
      },
    });
  });
  await signIn(page);
  if (visibility === 'PRIVATE') {
    // Owner-only content must never be manufactured into the shared Timeline.
    await expect(page.locator(`a[href="${detailPath}"]`)).toHaveCount(0);
    await page.goto(detailPath);
    await expect(
      page.getByText(copy.commentsPrivate, { exact: true }),
    ).toBeVisible();
  } else {
    await page
      .locator('#momente-diary')
      .getByRole('link', { name: /Thinking of you/ })
      .click();
  }
  await page.getByRole('link', { name: copy.edit, exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: copy.textLabel, exact: true }),
  ).toHaveValue(resource.text);
  return {
    deletes,
    unknown,
    async respond(status: 204 | 503) {
      await expect.poll(() => held.length).toBe(1);
      const route = held.shift();
      if (!route) throw new Error('Missing admitted Heart Moment deletion.');
      if (status === 204) {
        deleted = true;
        await route.fulfill({ status });
      } else
        await route.fulfill({
          status,
          contentType: 'application/problem+json',
          json: {
            status,
            code: 'SERVICE_UNAVAILABLE',
            title: 'Unavailable',
            type: 'about:blank',
          },
        });
    },
  };
}

async function confirm(page: Page) {
  await page.getByRole('button', { name: copy.delete, exact: true }).click();
  await page
    .getByRole('button', { name: copy.deleteCancel, exact: true })
    .click();
  await page.getByRole('button', { name: copy.delete, exact: true }).click();
  await page
    .getByRole('button', { name: copy.deleteConfirm, exact: true })
    .focus();
  await page.keyboard.press('Enter');
}

async function inspect(page: Page, info: TestInfo, name: string) {
  const geometry = await page
    .locator('.product-editor-page')
    .evaluate((root) => {
      const bounds = root.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        controls: [
          ...root.querySelectorAll(
            '.form-grid textarea, .form-grid input:not([type="file"]):not([type="checkbox"]):not([type="radio"]), .file-picker, .file-picker strong, .form-actions > *, .memory-delete-confirmation, .memory-delete-confirmation button',
          ),
        ].map((element) => {
          const box = element.getBoundingClientRect();
          return {
            left: box.left - bounds.left,
            right: bounds.right - box.right,
            height: box.height,
            interactive: element.matches(
              'button,input,textarea,.button-link,.file-picker',
            ),
          };
        }),
      };
    });
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  for (const control of geometry.controls) {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeGreaterThanOrEqual(0);
    if (control.interactive) expect(control.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await captureScreenshot(page, info, `${name}.png`, { fullPage: true });
}

for (const profile of [
  { width: 390, theme: 'light', visibility: 'SHARED', returnPending: true },
  { width: 430, theme: 'dark', visibility: 'SHARED' },
  { width: 1440, theme: 'light', visibility: 'SHARED' },
  { width: 1440, theme: 'dark', visibility: 'SHARED' },
  { width: 320, theme: 'dark', visibility: 'SHARED', large: true },
  { width: 390, theme: 'dark', visibility: 'PRIVATE' },
] as const) {
  test(`Heart Moment deletion owns ${profile.visibility} intent at ${profile.width}px ${profile.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: profile.width, height: 950 });
    await page.emulateMedia({
      colorScheme: profile.theme,
      reducedMotion: 'reduce',
    });
    const state = await openJourney(page, profile.visibility);
    if ('large' in profile)
      await page.locator('html').evaluate((element) => {
        element.style.fontSize = '200%';
      });
    await page
      .getByRole('textbox', { name: copy.textLabel, exact: true })
      .fill('A later draft belongs to this editor.');
    await confirm(page);
    await expect(
      page.getByRole('button', { name: copy.deleting, exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: copy.save, exact: true }),
    ).toBeDisabled();
    await state.respond(503);
    await expect(
      page.getByText(de.states.server.title, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: copy.textLabel, exact: true }),
    ).toHaveValue('A later draft belongs to this editor.');
    await inspect(
      page,
      info,
      `heart-delete-failure-${profile.width}-${profile.theme}-${profile.visibility}`,
    );
    await page
      .getByRole('button', { name: copy.deleteConfirm, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: copy.deleting, exact: true }),
    ).toBeDisabled();
    await inspect(
      page,
      info,
      `heart-delete-pending-${profile.width}-${profile.theme}-${profile.visibility}`,
    );
    if ('returnPending' in profile) {
      await page
        .getByRole('link', { name: copy.backToHeartMoment, exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: copy.makePrivate, exact: true }),
      ).toBeDisabled();
      await page.getByRole('link', { name: copy.edit, exact: true }).click();
      await expect(
        page.getByRole('button', { name: copy.deleting, exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: copy.save, exact: true }),
      ).toBeDisabled();
      await inspect(page, info, 'heart-delete-return-pending-390-light');
    }
    await page
      .getByRole('link', { name: navigation.more, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: de.more.title }),
    ).toBeVisible();
    const response = page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && r.status() === 204,
    );
    await state.respond(204);
    await response;
    await expect(
      page.getByRole('heading', { name: de.more.title }),
    ).toBeVisible();
    await captureScreenshot(
      page,
      info,
      `heart-delete-other-task-${profile.width}-${profile.theme}-${profile.visibility}.png`,
      { fullPage: true },
    );
    await page
      .getByRole('link', { name: navigation.story, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: de.story.timelineTitle, exact: true }),
    ).toBeVisible();
    await expect(page.locator(`a[href="${detailPath}"]`)).toHaveCount(0);
    expect(state.deletes).toEqual(['1', '1']);
    expect(state.unknown).toEqual([]);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Heart Moment offline deletion never replays in ${theme}`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const state = await openJourney(page);
    await page
      .getByRole('textbox', { name: copy.textLabel, exact: true })
      .fill('Keep this offline thought.');
    await context.setOffline(true);
    await confirm(page);
    await expect(
      page.getByText(de.states.offline.title, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: copy.textLabel, exact: true }),
    ).toHaveValue('Keep this offline thought.');
    await expect(
      page.getByRole('button', { name: copy.deleteConfirm, exact: true }),
    ).toBeEnabled();
    await inspect(page, info, `heart-delete-offline-360-${theme}`);
    await context.setOffline(false);
    await expect(
      page.getByRole('button', { name: copy.deleteConfirm, exact: true }),
    ).toBeEnabled();
    expect(state.deletes).toEqual([]);
    await page
      .getByRole('button', { name: copy.deleteConfirm, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: copy.deleting, exact: true }),
    ).toBeDisabled();
    await state.respond(204);
    await expect(page).toHaveURL(/\/story$/);
    await expect(
      page.getByRole('heading', { name: de.story.timelineTitle, exact: true }),
    ).toBeVisible();
    await expect(page.locator(`a[href="${detailPath}"]`)).toHaveCount(0);
    expect(state.deletes).toEqual(['1']);
    expect(state.unknown).toEqual([]);
  });
}
