import { expect, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';

/** Wait for the focused capture task, then explicitly choose optional enrichment. */
export async function showMemoryDetails(page: Page): Promise<void> {
  const details = page.locator('details.memory-diary-details');
  await expect(details).toBeAttached();
  if ((await details.getAttribute('open')) === null) {
    await details
      .getByText(de.memory.diary.optionalDetails, { exact: true })
      .click();
    await expect(details).toHaveAttribute('open', '');
  }
}
