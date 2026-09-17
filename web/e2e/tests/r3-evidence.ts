import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, TestInfo } from '@playwright/test';

const EVIDENCE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docs',
  'product',
  'design',
  'evidence',
  'r3',
);

/** Copies screenshots from Playwright's exact run into the reviewable R3 set. */
export async function captureR3Evidence(
  page: Page,
  testInfo: TestInfo,
  fileName: string,
  fullPage = true,
): Promise<void> {
  const outputPath = testInfo.outputPath(fileName);
  await page.screenshot({ path: outputPath, fullPage });
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.copyFileSync(outputPath, path.join(EVIDENCE_DIR, fileName));
}
