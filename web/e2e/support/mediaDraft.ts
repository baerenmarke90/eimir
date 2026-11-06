import { expect, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';

/** Select one media identity without opening a second task or saving the draft. */
export async function selectDraftMedia(page: Page, index = 0) {
  await page.locator('.photo-draft-tile').nth(index).click();
  await expectInlineDraftActions(page);
  return page.getByRole('group', {
    name: de.memory.photoSelected,
    exact: true,
  });
}

/** Contextual actions remain usable inline; no Done/dismiss step is needed. */
export async function expectInlineDraftActions(page: Page) {
  await expect(page.locator('dialog.photo-draft-preview-sheet')).toHaveCount(0);
  await expect(
    page.getByRole('group', { name: de.memory.photoSelected, exact: true }),
  ).toBeVisible();
}
