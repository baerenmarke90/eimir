import AxeBuilder from '../support/axe';
import {
  expect,
  type Page,
  type Route,
  type TestInfo,
  test,
} from '@playwright/test';
import de from '../../src/i18n/locales/de';
import storyProducts from '../../src/i18n/locales/storyProducts';
import { deleteViaMenu, itemMenuTrigger } from '../support/itemMenu';
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
    await expect(page.locator('.visibility-private')).toBeVisible();
    await expect(page.locator('.visibility-private')).toHaveAccessibleName(
      copy.visibilityPrivate,
    );
    await expect(page.locator('.comments-panel')).toHaveCount(0);
  } else {
    await page
      .locator('#momente-diary')
      .getByRole('link', { name: /Thinking of you/ })
      .click();
  }
  // Deletion starts from the item menu of the detail page, not from the editor.
  await expect(itemMenuTrigger(page)).toBeVisible();
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

function deleteSheetButton(page: Page, name: string) {
  return page
    .getByRole('alertdialog')
    .getByRole('button', { name, exact: true });
}

/** Opens the confirmation twice: the first time it is cancelled without effect. */
async function startDelete(page: Page) {
  await deleteViaMenu(page, copy.delete);
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await deleteSheetButton(page, de.common.cancel).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await deleteViaMenu(page, copy.delete);
  await expect(page.getByRole('alertdialog')).toBeVisible();
}

async function confirm(page: Page) {
  await deleteSheetButton(page, copy.deleteConfirm).focus();
  await page.keyboard.press('Enter');
}

async function inspect(page: Page, info: TestInfo, name: string) {
  const geometry = await page.getByRole('alertdialog').evaluate((dialog) => {
    const viewportWidth = document.documentElement.clientWidth;
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      controls: [...dialog.querySelectorAll('.form-actions > *')].map(
        (element) => {
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            right: viewportWidth - box.right,
            height: box.height,
          };
        },
      ),
    };
  });
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.controls.length).toBeGreaterThan(0);
  for (const control of geometry.controls) {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeGreaterThanOrEqual(0);
    expect(control.height).toBeGreaterThanOrEqual(44);
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
    await startDelete(page);
    await confirm(page);
    await expect(deleteSheetButton(page, copy.deleting)).toBeDisabled();
    await state.respond(503);
    await expect(
      page.getByText(de.states.server.title, { exact: true }),
    ).toBeVisible();
    // The failed request keeps the confirmation open for a deliberate retry.
    await expect(deleteSheetButton(page, copy.deleteConfirm)).toBeEnabled();
    await inspect(
      page,
      info,
      `heart-delete-failure-${profile.width}-${profile.theme}-${profile.visibility}`,
    );
    await deleteSheetButton(page, copy.deleteConfirm).click();
    await expect(deleteSheetButton(page, copy.deleting)).toBeDisabled();
    await inspect(
      page,
      info,
      `heart-delete-pending-${profile.width}-${profile.theme}-${profile.visibility}`,
    );
    if ('returnPending' in profile) {
      // While the request is pending the confirmation cannot be left through
      // the browser's Back: the task stays open and the delete stays pending.
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await expect(deleteSheetButton(page, copy.deleting)).toBeDisabled();
      await inspect(page, info, 'heart-delete-return-pending-390-light');
    }
    const response = page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && r.status() === 204,
    );
    await state.respond(204);
    await response;
    // The confirmed delete leaves the deleted entry for the Timeline.
    await expect(page).toHaveURL(/\/story(\?tab=timeline)?$/);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: de.story.timelineTitle, exact: true }),
    ).toBeVisible();
    await captureScreenshot(
      page,
      info,
      `heart-delete-settled-${profile.width}-${profile.theme}-${profile.visibility}.png`,
      { fullPage: true },
    );
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
    // The menu is offered online only, so the confirmation opens first.
    await startDelete(page);
    await context.setOffline(true);
    await confirm(page);
    await expect(
      page.getByText(de.states.offline.title, { exact: true }),
    ).toBeVisible();
    await expect(deleteSheetButton(page, copy.deleteConfirm)).toBeEnabled();
    await inspect(page, info, `heart-delete-offline-360-${theme}`);
    await context.setOffline(false);
    await expect(deleteSheetButton(page, copy.deleteConfirm)).toBeEnabled();
    expect(state.deletes).toEqual([]);
    await deleteSheetButton(page, copy.deleteConfirm).click();
    await expect(deleteSheetButton(page, copy.deleting)).toBeDisabled();
    await state.respond(204);
    // Deleting returns to the Timeline scope the item was opened from (#1907).
    await expect(page).toHaveURL(/\/story\?tab=timeline$/);
    await expect(
      page.getByRole('heading', { name: de.story.timelineTitle, exact: true }),
    ).toBeVisible();
    await expect(page.locator(`a[href="${detailPath}"]`)).toHaveCount(0);
    expect(state.deletes).toEqual(['1']);
    expect(state.unknown).toEqual([]);
  });
}
