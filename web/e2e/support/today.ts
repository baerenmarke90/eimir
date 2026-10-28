import { expect, type Page } from '@playwright/test';

/** The authenticated Today content, rather than its URL or loading shell, is ready. */
export async function expectToday(page: Page): Promise<void> {
  await expect(page.locator('.today-content')).toBeVisible();
  await expect(page.locator('.today-content h1')).toHaveCount(1);
}
