import { expect, type Page } from '@playwright/test';
import storyProducts from '../../src/i18n/locales/storyProducts';

/** Open the contextual media task without changing or committing the outer draft. */
export async function openDraftActions(page: Page, index = 0) {
  const task = page.locator('dialog.photo-draft-preview-sheet[open]');
  if (!(await task.count()))
    await page.locator('.photo-draft-tile').nth(index).click();
  await expect(task).toBeVisible();
  return task;
}

export async function closeDraftActions(page: Page) {
  const task = page.locator('dialog.photo-draft-preview-sheet[open]');
  if (await task.count())
    await task
      .getByRole('button', { name: storyProducts.gallery.done, exact: true })
      .click();
  await expect(task).toHaveCount(0);
}
