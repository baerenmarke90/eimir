import { expect, type Page } from '@playwright/test';

/** #1715 keeps authored fields and tag enrichment directly visible. */
export async function showMemoryDetails(page: Page): Promise<void> {
  await expect(
    page.locator('.memory-task-fields .memory-tag-choices'),
  ).toBeVisible();
}
