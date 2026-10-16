import { expect, type Page } from '@playwright/test';
import m5s5 from '../../src/i18n/locales/m5s5';

/** The authenticated Today content, rather than its URL or loading shell, is ready. */
export async function expectToday(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', {
      name: m5s5.today.headerTitle,
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
}
