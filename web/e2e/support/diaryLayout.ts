import type { Page } from '@playwright/test';

/**
 * Moments design setting (Album or compact list), stored per device.
 * Album is the product default, so specs that assert the compact
 * composition (spine, markers, stripes, tapestry geometry) pin it explicitly
 * before the first navigation; Album has its own spec.
 */
export type DiaryLayoutChoice = 'album' | 'compact';

export async function pinDiaryLayout(
  page: Page,
  layout: DiaryLayoutChoice,
): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('eimir.diaryLayout', value);
  }, layout);
}
