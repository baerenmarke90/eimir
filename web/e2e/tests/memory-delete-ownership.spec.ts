import fs from 'node:fs';
import AxeBuilder from '../support/axe';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import memoryProduct from '../../src/i18n/locales/memoryProduct';
import { deleteViaMenu, itemMenuTrigger } from '../support/itemMenu';
import {
  captureScreenshot,
  getTimelineItems,
  installMocks,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

/** The delete confirmation sheet and its actions stay inside the viewport. */
async function expectDeleteSheetContained(page: Page) {
  const controls = await page.getByRole('alertdialog').evaluate((dialog) => {
    const viewportWidth = document.documentElement.clientWidth;
    return [...dialog.querySelectorAll('.form-actions > *')].map((element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: viewportWidth - box.right,
        width: box.width,
        height: box.height,
      };
    });
  });
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeGreaterThanOrEqual(0);
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }
}

/** Deletion starts from the item menu of the detail page. */
async function startMemoryDelete(page: Page) {
  await deleteViaMenu(page, de.common.delete);
  await expect(page.getByRole('alertdialog')).toBeVisible();
}

function deleteSheetButton(page: Page, name: string) {
  return page
    .getByRole('alertdialog')
    .getByRole('button', { name, exact: true });
}

async function openMemoryDeleteJourney(page: Page, failFirst: boolean) {
  const unexpected = await installMocks(page, { strict: true });
  let deleted = false;
  let completed = 0;
  const deletes: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.addInitScript(() => {
    (window as Window & { deleteToasts?: string[] }).deleteToasts = [];
    window.addEventListener('eimir:snackbar', (event) => {
      (window as Window & { deleteToasts?: string[] }).deleteToasts?.push(
        (event as CustomEvent).detail.messageKey,
      );
    });
  });
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/memories/mem-canal`,
    async (route) => {
      if (route.request().method() !== 'DELETE') {
        if (!deleted) {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 404,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            status: 404,
            code: 'NOT_FOUND',
            title: 'Not found',
            type: 'about:blank',
          }),
        });
        return;
      }
      deletes.push(route.request().headers()['if-match']);
      if (failFirst && deletes.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            title: 'Unavailable',
            type: 'about:blank',
          }),
        });
        return;
      }
      await gate;
      deleted = true;
      await route.fulfill({ status: 204 });
      completed += 1;
    },
  );
  await page.route(`**/api/v1/spaces/${SPACE_ID}/timeline*`, async (route) => {
    if (!deleted) {
      await route.fallback();
      return;
    }
    const items = getTimelineItems().filter(
      (item) => item.memory?.id !== 'mem-canal',
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, hasMore: false, nextCursor: null }),
    });
  });
  await page.route(`**/api/v1/spaces/${SPACE_ID}/discover*`, async (route) => {
    if (!deleted) {
      await route.fallback();
      return;
    }
    const items = getTimelineItems().filter(
      (item) => item.memory?.id !== 'mem-canal',
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        selectionDate: '2026-09-17',
        lead: items[0],
        items: items.slice(1),
        leadContext: null,
      }),
    });
  });
  await signIn(page);
  await page.goto('/story?tab=timeline');
  await page
    .locator('#momente-diary')
    .getByRole('link', { name: /Breakfast by the canal/ })
    .click();
  await expect(itemMenuTrigger(page)).toBeVisible();
  return { unexpected, deletes, release, completed: () => completed };
}

for (const profile of [
  { width: 390, theme: 'light', large: false },
  { width: 430, theme: 'dark', large: false },
  { width: 1440, theme: 'light', large: false },
  { width: 1440, theme: 'dark', large: false },
  { width: 320, theme: 'dark', large: true },
] as const) {
  test(`Memory deletion from the detail menu stays pending in its confirmation and settles into the Timeline at ${profile.width}px ${profile.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: profile.width, height: 900 });
    await page.emulateMedia({
      colorScheme: profile.theme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const state = await openMemoryDeleteJourney(page, true);
    if (profile.large)
      await page.locator('html').evaluate((element) => {
        element.style.fontSize = '200%';
      });
    const prefix = `memory-delete-${profile.width}-${profile.theme}${profile.large ? '-large' : ''}`;
    await startMemoryDelete(page);
    await deleteSheetButton(page, de.common.cancel).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(state.deletes).toEqual([]);
    await startMemoryDelete(page);
    const confirm = deleteSheetButton(page, memoryProduct.deleteConfirm);
    await confirm.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByText(de.states.server.title, { exact: true }),
    ).toBeVisible();
    // The failed request keeps the confirmation open for a deliberate retry.
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(confirm).toBeEnabled();
    await captureScreenshot(page, info, `${prefix}-error.png`, {
      fullPage: true,
    });
    await confirm.click();
    const pending = deleteSheetButton(page, de.common.deleting);
    await expect(pending).toBeDisabled();
    await expect.poll(() => state.deletes.length).toBe(2);
    await captureScreenshot(page, info, `${prefix}-pending.png`, {
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    fs.writeFileSync(
      info.outputPath(`${prefix}-geometry.json`),
      JSON.stringify(
        await page.evaluate(() => ({
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          overflow: [...document.querySelectorAll('body *')]
            .filter(
              (e) =>
                e.getBoundingClientRect().right + scrollX >
                  document.documentElement.clientWidth + 1 ||
                e.scrollWidth > e.clientWidth + 1,
            )
            .map((e) => ({
              tag: e.tagName,
              class: e.className,
              right: e.getBoundingClientRect().right + scrollX,
              width: e.clientWidth,
              scroll: e.scrollWidth,
            })),
        })),
        null,
        2,
      ),
    );
    expect(widths.scroll).toBe(widths.client);
    await expectDeleteSheetContained(page);
    if (profile.width === 390) {
      // While the request is pending the confirmation cannot be left through
      // the browser's Back: the task stays open and the delete stays pending.
      const detailUrl = page.url();
      await page.goBack();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await expect(pending).toBeDisabled();
      expect(page.url()).toBe(detailUrl);
    }
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        r.url().endsWith('/memories/mem-canal'),
    );
    state.release();
    await response;
    await expect.poll(state.completed).toBe(1);
    // Complete the response microtasks and subsequent browser paints. Deferred
    // cache/recovery ownership is independently held and tested in components.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    // The confirmed delete returns to the Timeline scope the item was opened from.
    await expect(page).toHaveURL(/\/story\?tab=timeline$/);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as Window & { deleteToasts?: string[] }).deleteToasts,
      ),
    ).toContain('snackbar.memoryDeleted');
    await expect(page.locator('.story-timeline').first()).toBeVisible();
    await expect(
      page
        .locator('#momente-diary')
        .getByRole('link', { name: /Breakfast by the canal/ }),
    ).toHaveCount(0);
    await expect(
      page
        .locator('#momente-diary')
        .getByRole('link', { name: /First coffee in new home/ }),
    ).toBeVisible();
    await captureScreenshot(page, info, `${prefix}-returned.png`, {
      fullPage: true,
    });
    expect(state.deletes).toEqual(['1', '1']);
    expect(state.unexpected).toEqual([]);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Memory offline delete requires a deliberate retry after reconnect in ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const state = await openMemoryDeleteJourney(page, false);
    await startMemoryDelete(page);
    await page.context().setOffline(true);
    await deleteSheetButton(page, memoryProduct.deleteConfirm).click();
    await expect(
      page.getByText(de.states.offline.title, { exact: true }),
    ).toBeVisible();
    // The failed offline attempt keeps the confirmation open and sends nothing.
    await expect(page.getByRole('alertdialog')).toBeVisible();
    expect(state.deletes).toEqual([]);
    await captureScreenshot(
      page,
      info,
      `memory-delete-offline-360-${theme}.png`,
      { fullPage: true },
    );
    await page.context().setOffline(false);
    await deleteSheetButton(page, de.common.cancel).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(state.deletes).toEqual([]);
    await startMemoryDelete(page);
    await deleteSheetButton(page, memoryProduct.deleteConfirm).click();
    await expect.poll(() => state.deletes.length).toBe(1);
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        r.url().endsWith('/memories/mem-canal'),
    );
    state.release();
    await response;
    // Deleting returns to the Timeline scope the item was opened from (#1907).
    await expect(page).toHaveURL(/\/story\?tab=timeline$/);
    expect(state.deletes).toEqual(['1']);
    expect(state.unexpected).toEqual([]);
  });
}
