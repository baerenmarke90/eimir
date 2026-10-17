import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import memoryProduct from '../../src/i18n/locales/memoryProduct';
import navigation from '../../src/i18n/locales/navigation';
import {
  SPACE_ID,
  captureScreenshot,
  getTimelineItems,
  installMocks,
  signIn,
} from '../support/storyTimelineFixture';

async function expectMemoryControlsContained(page: Page) {
  const controls = await page
    .locator('.product-editor-page')
    .evaluate((root) => {
      const bounds = root.getBoundingClientRect();
      return [
        ...root.querySelectorAll(
          '.memory-form .form-actions > *, .memory-form .file-picker, .memory-form .file-picker strong, .memory-delete-confirmation, .memory-delete-confirmation button',
        ),
      ].map((element) => {
        const box = element.getBoundingClientRect();
        return {
          left: box.left - bounds.left,
          right: bounds.right - box.right,
          width: box.width,
          height: box.height,
          button: element.tagName === 'BUTTON',
        };
      });
    });
  for (const control of controls) {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeGreaterThanOrEqual(0);
    if (control.button) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
    }
  }
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
  await page.getByRole('link', { name: /Breakfast by the canal/ }).click();
  await page
    .getByRole('link', { name: memoryProduct.edit, exact: true })
    .click();
  await expect(page.locator('.memory-form')).toBeVisible();
  return { unexpected, deletes, release, completed: () => completed };
}

for (const profile of [
  { width: 390, theme: 'light', large: false },
  { width: 430, theme: 'dark', large: false },
  { width: 1440, theme: 'light', large: false },
  { width: 1440, theme: 'dark', large: false },
  { width: 320, theme: 'dark', large: true },
] as const) {
  test(`Memory deletion keeps confirmed cache settlement separate from a departed task at ${profile.width}px ${profile.theme}`, async ({
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
    await page
      .getByRole('button', { name: memoryProduct.delete, exact: true })
      .click();
    await page
      .getByRole('button', { name: memoryProduct.deleteCancel, exact: true })
      .click();
    expect(state.deletes).toEqual([]);
    await page
      .getByRole('button', { name: memoryProduct.delete, exact: true })
      .click();
    const confirm = page.getByRole('button', {
      name: memoryProduct.deleteConfirm,
      exact: true,
    });
    await confirm.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByText(de.states.server.title, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('#memory-edit-title')).toHaveValue(
      'Breakfast by the canal',
    );
    await expect(confirm).toBeEnabled();
    await captureScreenshot(page, info, `${prefix}-error.png`, {
      fullPage: true,
    });
    await confirm.click();
    const pending = page.getByRole('button', {
      name: memoryProduct.deleting,
      exact: true,
    });
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
    await expectMemoryControlsContained(page);
    await page
      .getByRole('link', { name: de.common.cancel, exact: true })
      .click();
    await expect(page.locator('.memory-form')).toHaveCount(0);
    await page
      .getByRole('link', { name: navigation.more, exact: true })
      .click();
    await expect(page).toHaveURL(/\/more$/);
    if (profile.width === 390) {
      await page.goBack();
      await page
        .getByRole('link', { name: memoryProduct.edit, exact: true })
        .click();
      await expect(pending).toBeDisabled();
      await expect(
        page.getByRole('button', { name: memoryProduct.save, exact: true }),
      ).toBeDisabled();
      await page
        .getByRole('link', { name: de.common.cancel, exact: true })
        .click();
      await expect(page.locator('.memory-form')).toHaveCount(0);
      await page
        .getByRole('link', { name: navigation.more, exact: true })
        .click();
      await expect(page).toHaveURL(/\/more$/);
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
    await expect(page).toHaveURL(/\/more$/);
    expect(
      await page.evaluate(
        () => (window as Window & { deleteToasts?: string[] }).deleteToasts,
      ),
    ).not.toContain('snackbar.memoryDeleted');
    await captureScreenshot(page, info, `${prefix}-departed.png`, {
      fullPage: true,
    });
    await page
      .getByRole('link', { name: navigation.story, exact: true })
      .click();
    await page
      .getByRole('tab', { name: de.story.tabTimeline, exact: true })
      .click();
    await expect(page.locator('.story-timeline').first()).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Breakfast by the canal/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: /First coffee in new home/ }),
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
    await page
      .locator('#memory-edit-body')
      .fill('Unsaved words stay after failed deletion');
    await page
      .getByRole('button', { name: memoryProduct.delete, exact: true })
      .click();
    await page.context().setOffline(true);
    await page
      .getByRole('button', { name: memoryProduct.deleteConfirm, exact: true })
      .click();
    await expect(
      page.getByText(de.states.offline.title, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('#memory-edit-body')).toHaveValue(
      'Unsaved words stay after failed deletion',
    );
    expect(state.deletes).toEqual([]);
    await captureScreenshot(
      page,
      info,
      `memory-delete-offline-360-${theme}.png`,
      { fullPage: true },
    );
    await page.context().setOffline(false);
    await page
      .getByRole('button', { name: memoryProduct.deleteCancel, exact: true })
      .click();
    expect(state.deletes).toEqual([]);
    await page
      .getByRole('button', { name: memoryProduct.delete, exact: true })
      .click();
    await page
      .getByRole('button', { name: memoryProduct.deleteConfirm, exact: true })
      .click();
    await expect.poll(() => state.deletes.length).toBe(1);
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        r.url().endsWith('/memories/mem-canal'),
    );
    state.release();
    await response;
    await expect(page).toHaveURL(/\/story$/);
    expect(state.deletes).toEqual(['1']);
    expect(state.unexpected).toEqual([]);
  });
}
