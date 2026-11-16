import type { Page, TestInfo } from '@playwright/test';
import { captureScreenshot } from '../support/storyTimelineFixture';

/** Keep historical R3 evidence immutable; explicit exports use the shared helper. */
export async function captureR3Evidence(
  page: Page,
  testInfo: TestInfo,
  fileName: string,
  fullPage = true,
): Promise<void> {
  await captureScreenshot(page, testInfo, fileName, { fullPage });
}
