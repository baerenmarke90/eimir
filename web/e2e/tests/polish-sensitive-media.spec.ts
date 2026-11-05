import { expect, test } from '@playwright/test';
import memoryCopy from '../../src/i18n/locales/memoryProduct';
import sensitive from '../../src/i18n/locales/sensitiveMedia';
import {
  SPACE_ID,
  ME,
  PARTNER,
  CAPABILITIES,
  TINY_PNG,
  installMocks,
  signIn,
  captureScreenshot,
} from '../support/storyTimelineFixture';

for (const parentAuthor of [false, true]) {
  test(`saved image sensitivity marks, persists and unmarks for ${parentAuthor ? 'parent author' : 'individual uploader on a partner Memory'}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    const unknown = await installMocks(page, { strict: true });
    const base = `/api/v1/spaces/${SPACE_ID}`;
    const author = parentAuthor ? ME : PARTNER;
    let memory = {
      id: 'mem-canal',
      spaceId: SPACE_ID,
      authorId: author.id,
      author,
      title: 'Selected image protection',
      body: 'Our shared words',
      tags: [],
      happenedOn: '2026-11-05',
      createdAt: '2026-11-05T10:00:00Z',
      updatedAt: '2026-11-05T10:00:00Z',
      version: 1,
      capabilities: { ...CAPABILITIES, canDelete: parentAuthor },
      attachments: ['protected', 'own'].map((id, position) => ({
        id,
        position,
        status: 'READY',
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        size: TINY_PNG.length,
        width: 1,
        height: 1,
        hasThumbnail: false,
        isSensitive: false,
        canEditSensitivity: parentAuthor || id === 'own',
      })),
    };
    const classifications: boolean[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === `${base}/memories/mem-canal`) {
        if (request.method() === 'PATCH')
          memory = {
            ...memory,
            ...request.postDataJSON(),
            version: memory.version + 1,
          };
        return route.fulfill({ json: memory });
      }
      if (path === `${base}/memories/mem-canal/attachments`) {
        const body = request.postDataJSON();
        expect(request.headers()['if-match']?.replaceAll('"', '')).toBe(
          String(memory.version),
        );
        expect(
          body.attachments.find(
            (item: { attachmentId: string }) =>
              item.attachmentId === 'protected',
          ).isSensitive,
        ).toBe(false);
        memory = {
          ...memory,
          version: memory.version + 1,
          attachments: memory.attachments.map((photo) => ({
            ...photo,
            isSensitive: body.attachments.find(
              (item: { attachmentId: string }) =>
                item.attachmentId === photo.id,
            ).isSensitive,
          })),
        };
        classifications.push(memory.attachments[1].isSensitive);
        return route.fulfill({ json: memory });
      }
      if (/\/attachments\/(own|protected)\/read-access$/.test(path))
        return route.fulfill({
          json: {
            method: 'STREAM',
            url: `${base}/attachments/own/content`,
            mediaType: 'IMAGE',
          },
        });
      if (/\/attachments\/(own|protected)\/content$/.test(path))
        return route.fulfill({ contentType: 'image/png', body: TINY_PNG });
      return route.fallback();
    });
    await signIn(page);
    await page.goto('/story/memories/mem-canal/edit');
    const gallery = page.locator('.photo-draft-gallery');
    await gallery.locator('.photo-draft-tile').first().click();
    if (!parentAuthor)
      await expect(
        gallery.getByRole('checkbox', { name: sensitive.mark, exact: true }),
      ).toHaveCount(0);
    await gallery.locator('.photo-draft-tile').nth(1).click();
    const checkbox = gallery.getByRole('checkbox', {
      name: sensitive.mark,
      exact: true,
    });
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect(page.locator('dialog.photo-draft-preview-sheet')).toHaveCount(
      0,
    );
    await captureScreenshot(
      page,
      info,
      `polish-sensitive-${parentAuthor ? 'author' : 'uploader'}-390-dark.png`,
      { fullPage: true },
    );
    await page
      .getByRole('button', { name: memoryCopy.save, exact: true })
      .click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
    await page.reload();
    await page.goto('/story/memories/mem-canal/edit');
    await gallery.locator('.photo-draft-tile').nth(1).click();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await page
      .getByRole('button', { name: memoryCopy.save, exact: true })
      .click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
    await page.goto('/story/memories/mem-canal/edit');
    await gallery.locator('.photo-draft-tile').nth(1).click();
    await expect(checkbox).not.toBeChecked();
    expect(classifications).toEqual([true, false]);
    expect(unknown).toEqual([]);
  });
}
