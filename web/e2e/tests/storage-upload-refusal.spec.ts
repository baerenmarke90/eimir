import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import storageQuota from '../../src/i18n/locales/storageQuota';
import AxeBuilder from '../support/axe';
import {
  pageComposerContent as content,
  installPageComposerFixture,
} from '../support/pageComposer';
import { signIn } from '../support/storyTimelineFixture';

/*
 * A photo the Space's storage quota refuses (#2141 Q5, approved UI preflight
 * state 12): the composer keeps the words and the other photos, the refused
 * photo says why in plain words, and the rest saves.
 */

const photo = readFileSync(
  new URL(
    '../../../backend/demo_assets/images/lake-sunrise.jpg',
    import.meta.url,
  ),
);

async function capture(page: Page, info: TestInfo, name: string) {
  const output = info.outputPath(name);
  await page
    .locator('.photo-draft-error')
    .first()
    .evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: output, animations: 'disabled' });
  if (process.env.VISUAL_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.VISUAL_EVIDENCE_DIR, { recursive: true });
    fs.copyFileSync(output, path.join(process.env.VISUAL_EVIDENCE_DIR, name));
  }
}

test('a photo the full storage refuses keeps the draft and the rest saves', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await installPageComposerFixture(page);
  await signIn(page);
  await page.goto('/story/memories/new');
  await page
    .getByLabel(de.memory.titleLabelOptional, { exact: true })
    .fill(content.memoryTitle);
  await page.locator('textarea[name="body"]').fill(content.memoryBody);

  state.uploads.quotaFailuresRemaining = 1;
  await page
    .locator('input[type="file"][accept*="image/jpeg"]')
    .first()
    .setInputFiles([
      { name: 'lake-one.jpg', mimeType: 'image/jpeg', buffer: photo },
      { name: 'lake-two.jpg', mimeType: 'image/jpeg', buffer: photo },
    ]);
  const tiles = page.locator('.photo-draft-tile');
  await expect(tiles).toHaveCount(2);
  // The refused photo is selected and says why; the other one is ready.
  await expect(page.locator('.photo-draft-tile-status.is-failed')).toHaveCount(
    1,
  );
  await expect(page.getByText(storageQuota.uploadRefused)).toBeVisible();
  await expect(page.getByText(de.memory.photoFailedNotSaved)).toBeVisible();
  // The words stay; nothing was lost.
  await expect(page.locator('textarea[name="body"]')).toHaveValue(
    content.memoryBody,
  );

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await capture(page, info, `2141-upload-refused-${width}-light.png`);
  }
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await capture(page, info, '2141-upload-refused-390-dark-reduced.png');
  expect(
    (await new AxeBuilder({ page }).include('.photo-draft-gallery').analyze())
      .violations,
  ).toEqual([]);
  await page.emulateMedia({
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });

  // As with every failed upload, the refused photo is removed before saving;
  // the words and the other photo stay.
  await page.locator('.photo-draft-stage-remove').first().click();
  await expect(tiles).toHaveCount(1);
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(page).toHaveURL(/\/memories\/composer-created-memories$/);
  const saved = state.resources.get('memories/composer-created-memories');
  if (!saved) throw new Error('The confirmed Memory must be readable.');
  expect(saved.attachments).toHaveLength(1);
  expect(state.uploads.failedRequests).toBe(1);
  expect(state.unexpected).toEqual([]);
});
