import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import people from '../../src/i18n/locales/people';
import sources from '../../src/i18n/locales/photoSources';
import {
  captureScreenshot,
  installMocks,
  ME,
  PARTNER_ID,
  SPACE_ID,
  signIn,
  TINY_PNG,
} from '../support/storyTimelineFixture';

const base = `/api/v1/spaces/${SPACE_ID}`;
const attachment = {
  id: 'avatar-photo',
  status: 'READY',
  mediaType: 'IMAGE',
  mimeType: 'image/png',
  size: TINY_PNG.length,
  width: 1,
  height: 1,
  version: 1,
  hasThumbnail: false,
};

async function installAvatarSources(page: Page) {
  const unknown = await installMocks(page, { strict: true });
  const starts: Record<string, unknown>[] = [];
  const uploads: Record<string, unknown>[] = [];
  const saved: Record<string, unknown>[] = [];
  let selectedSource = 'immich';
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === `${base}/profiles/${PARTNER_ID}`)
      return route.fulfill({
        json: {
          id: 'partner-profile',
          accountId: PARTNER_ID,
          displayName: 'Alex',
          preferences: [],
          version: 1,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      });
    if (path === `${base}/important-dates`) return route.fulfill({ json: [] });
    if (path === `${base}/related-persons`) {
      if (request.method() === 'POST') {
        const person = {
          ...request.postDataJSON(),
          id: 'new-person',
          version: 1,
          createdAt: '2026-11-05',
          updatedAt: '2026-11-05',
        };
        saved.push(person);
        return route.fulfill({ status: 201, json: person });
      }
      return route.fulfill({ json: saved });
    }
    if (path === `${base}/related-persons/new-person`)
      return route.fulfill({ json: saved[0] });
    if (path === `${base}/photo-sources`)
      return route.fulfill({
        json: {
          enabled: true,
          canImport: true,
          googleAvailable: true,
          immichConnected: true,
          immichConnectionToken: 'fixture:linked',
          immichOrigin: 'https://photos.example',
        },
      });
    if (path === `${base}/photo-selections`) {
      const body = request.postDataJSON();
      starts.push(body);
      selectedSource = body.source;
      return route.fulfill({
        status: 201,
        json: {
          id: 'avatar-selection',
          source: selectedSource,
          status: selectedSource === 'google' ? 'AUTHORIZING' : 'READY',
          authorizationUrl:
            selectedSource === 'google'
              ? 'https://accounts.google.com/authorize'
              : null,
          pollAfterSeconds: 3,
          items: [{ id: 'one' }, { id: 'two' }],
          hasMore: false,
        },
      });
    }
    if (path === `${base}/photo-selections/avatar-selection/poll`)
      return route.fulfill({
        json: {
          id: 'avatar-selection',
          source: selectedSource,
          status: 'READY',
          items: [{ id: 'one' }],
          hasMore: false,
        },
      });
    if (path.includes('/photo-selections/avatar-selection/items/'))
      return route.fulfill({ contentType: 'image/png', body: TINY_PNG });
    if (
      path === `${base}/photo-selections/avatar-selection` &&
      request.method() === 'DELETE'
    )
      return route.fulfill({ status: 204 });
    if (path === `${base}/attachments` && request.method() === 'POST') {
      uploads.push(request.postDataJSON());
      return route.fulfill({
        status: 201,
        json: {
          attachment,
          method: 'STREAM',
          requiredHeaders: {},
          uploadUrl: `${base}/attachments/avatar-photo/content`,
        },
      });
    }
    if (path.startsWith(`${base}/attachments/avatar-photo`)) {
      if (request.method() === 'PUT') return route.fulfill({ status: 204 });
      if (path.endsWith('/read-access'))
        return route.fulfill({
          json: {
            method: 'STREAM',
            url: `${base}/attachments/avatar-photo/content`,
            mediaType: 'IMAGE',
          },
        });
      if (path.endsWith('/content'))
        return route.fulfill({ contentType: 'image/png', body: TINY_PNG });
      return route.fulfill({ json: attachment });
    }
    return route.fallback();
  });
  return { unknown, starts, uploads, saved };
}

for (const view of [
  { width: 360, theme: 'light' },
  { width: 390, theme: 'dark' },
  { width: 1440, theme: 'light' },
] as const) {
  test(`google task offers reopening the window and retrying a failed photo at ${view.width} ${view.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    await page.emulateMedia({
      colorScheme: view.theme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __opens: number; __replaced: string[] };
      w.__opens = 0;
      w.__replaced = [];
      window.open = () => {
        w.__opens += 1;
        return {
          closed: false,
          opener: null,
          close() {},
          location: {
            replace(url: string) {
              w.__replaced.push(url);
            },
          },
        } as unknown as Window;
      };
    });
    const state = await installAvatarSources(page);
    let released = false;
    let failedOnce = false;
    // Registered after the shared fixture, so these handlers win.
    await page.route(
      `**${base}/photo-selections/avatar-selection/poll`,
      (route) =>
        route.fulfill({
          json: {
            id: 'avatar-selection',
            source: 'google',
            status: released ? 'READY' : 'PICKING',
            pollAfterSeconds: 1,
            items: released ? [{ id: 'one' }] : [],
            hasMore: false,
          },
        }),
    );
    await page.route(
      `**${base}/photo-selections/avatar-selection/items/**`,
      (route) => {
        if (!failedOnce) {
          failedOnce = true;
          return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } });
        }
        return route.fulfill({ contentType: 'image/png', body: TINY_PNG });
      },
    );
    await signIn(page);
    await page.goto('/more/people');
    await page
      .getByRole('link', { name: people.addPersonAction, exact: true })
      .click();
    const editor = page.locator('.person-editor-page');
    await editor
      .getByLabel(people.nameLabel, { exact: true })
      .fill(ME.displayName);
    await editor.locator('.people-photo-options summary').click();
    await editor.getByRole('button', { name: sources.more }).click();
    const sheet = page.locator('.photo-source-sheet');
    await expect(sheet).toBeVisible();
    // The save and visibility contract is stated before anything is authorized.
    await expect(
      sheet.getByText(sources.googleConsent, { exact: true }),
    ).toBeVisible();
    await sheet
      .getByRole('button', { name: sources.google, exact: true })
      .click();
    const reopen = sheet.getByRole('button', {
      name: sources.reopenGoogle,
      exact: true,
    });
    await expect(reopen).toBeVisible();
    await expect(
      sheet.getByText(sources.waiting, { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as never as { __opens: number }).__opens,
      ),
    ).toBe(1);
    await captureScreenshot(
      page,
      info,
      `google-task-waiting-${view.width}-${view.theme}.png`,
    );
    await reopen.click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as never as { __opens: number }).__opens),
      )
      .toBe(2);
    const replaced = await page.evaluate(
      () => (window as never as { __replaced: string[] }).__replaced,
    );
    expect(new Set(replaced)).toEqual(
      new Set(['https://accounts.google.com/authorize']),
    );
    released = true;
    const retry = sheet.getByRole('button', {
      name: sources.retryImport_one.replace('{{count}}', '1'),
      exact: true,
    });
    await expect(retry).toBeVisible();
    await expect(
      sheet.getByText(sources.importFailed, { exact: true }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).include('.photo-source-sheet').analyze())
        .violations,
    ).toEqual([]);
    const reflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    expect(reflow).toBe(true);
    await captureScreenshot(
      page,
      info,
      `google-task-retry-${view.width}-${view.theme}.png`,
    );
    await retry.click();
    await expect(sheet).toBeHidden();
    await expect(editor.locator('.people-portrait img')).toBeVisible();
    expect(state.saved).toHaveLength(0);
    expect(state.uploads).toHaveLength(1);
  });
}

for (const view of [
  { width: 360, theme: 'light' },
  { width: 390, theme: 'dark' },
  { width: 1440, theme: 'light' },
] as const) {
  for (const source of ['immich', 'google'] as const) {
    test(`person avatar uses ${source}, retains the draft on cancel and saves explicitly at ${view.width} ${view.theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: view.width, height: 900 });
      await page.emulateMedia({
        colorScheme: view.theme,
        reducedMotion: 'reduce',
      });
      await page.addInitScript(() => {
        window.localStorage.setItem('eimir.theme', 'system');
        window.open = () =>
          ({
            closed: false,
            opener: null,
            close() {},
            location: { replace() {} },
          }) as unknown as Window;
      });
      const state = await installAvatarSources(page);
      await signIn(page);
      await page.goto('/more/people');
      await page
        .getByRole('link', { name: people.addPersonAction, exact: true })
        .click();
      const editor = page.locator('.person-editor-page');
      await editor
        .getByLabel(people.nameLabel, { exact: true })
        .fill(ME.displayName);
      await editor.locator('.people-photo-options summary').click();
      await editor.getByRole('button', { name: sources.more }).click();
      const sheet = page.locator('.photo-source-sheet');
      await expect(sheet).toBeVisible();
      await page.keyboard.press('Tab');
      await expect
        .poll(() =>
          sheet.evaluate((node) => node.contains(document.activeElement)),
        )
        .toBe(true);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect(
        editor.getByLabel(people.nameLabel, { exact: true }),
      ).toHaveValue(ME.displayName);
      await editor.getByRole('button', { name: sources.more }).click();
      await sheet
        .getByRole('button', { name: sources[source], exact: true })
        .click();
      if (source === 'immich') {
        await sheet
          .getByRole('checkbox', {
            name: sources.photo.replace('{{number}}', '1'),
            exact: true,
          })
          .check();
        await expect(
          sheet.getByRole('checkbox', {
            name: sources.photo.replace('{{number}}', '2'),
            exact: true,
          }),
        ).toBeDisabled();
        await sheet
          .getByRole('button', { name: sources.import, exact: true })
          .click();
      }
      await expect(sheet).toBeHidden();
      await expect(
        editor.getByText(people.avatarUploading, { exact: true }),
      ).toHaveCount(0);
      await expect(editor.locator('.people-portrait img')).toBeVisible();
      expect(state.saved).toHaveLength(0);
      expect(state.starts).toEqual([
        expect.objectContaining({ source, maxItems: 1, consent: true }),
      ]);
      expect(state.uploads).toEqual([
        expect.objectContaining({
          mediaType: 'IMAGE',
          preserveMetadata: false,
        }),
      ]);
      await expect(
        editor.getByRole('button', { name: people.saveChanges, exact: true }),
      ).toBeEnabled();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      const reflow = await page.evaluate(() => ({
        fits: document.documentElement.scrollWidth <= innerWidth,
        overflow: Array.from(document.querySelectorAll('*'))
          .filter(
            (element) => element.getBoundingClientRect().right > innerWidth + 1,
          )
          .map((element) => ({
            tag: element.tagName,
            className: element.className,
            width: element.getBoundingClientRect().width,
            right: element.getBoundingClientRect().right,
          }))
          .slice(0, 15),
      }));
      expect(reflow.fits, JSON.stringify(reflow.overflow)).toBe(true);
      await captureScreenshot(
        page,
        info,
        `polish-avatar-${source}-${view.width}-${view.theme}.png`,
      );
      const save = editor.getByRole('button', {
        name: people.saveChanges,
        exact: true,
      });
      // The former import pointer can land at Save's edge. Hover must not
      // move the hit target away and create an enter/leave feedback loop.
      await page.mouse.move(0, 0);
      await save.scrollIntoViewIfNeeded();
      const bounds = await save.boundingBox();
      if (!bounds) throw new Error('Person completion action is not visible');
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height - 0.25,
      );
      const positions = await save.evaluate(async (element) => {
        const values: number[] = [];
        for (let frame = 0; frame < 4; frame += 1) {
          await new Promise(requestAnimationFrame);
          values.push(element.getBoundingClientRect().y);
        }
        return values;
      });
      expect(new Set(positions).size).toBe(1);
      await save.click();
      await expect(editor).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: ME.displayName, exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel(people.visibilityLabel)).toHaveCount(0);
      await expect(page.locator('.people-profile-hero img')).toBeVisible();
      expect(state.saved).toEqual([
        expect.objectContaining({
          displayName: ME.displayName,
          avatarAttachmentId: attachment.id,
        }),
      ]);
      expect(state.unknown).toEqual([]);
    });
  }
}
