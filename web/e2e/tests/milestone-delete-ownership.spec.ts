import { fulfillFreeEntitlements } from '../support/freeEntitlements';
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '../support/axe';
import {
  expect,
  type Page,
  type Route,
  type TestInfo,
  test,
} from '@playwright/test';
import de from '../../src/i18n/locales/de';
import storyProducts from '../../src/i18n/locales/storyProducts';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { deleteViaMenu, itemMenuTrigger } from '../support/itemMenu';
import { mockEmptyPartnerNickname } from '../support/partnerNickname';
import { fulfillNoOccasionSources } from '../support/occasionSources';

const accountId = '11111111-1111-4111-8111-111111111111';
const spaceId = '22222222-2222-4222-8222-222222222222';
const account = { id: accountId, displayName: 'Alex' };
const partner = {
  id: '99999999-9999-4999-8999-999999999999',
  displayName: 'Lea',
};
const milestone = {
  id: 'milestone-home',
  spaceId,
  authorId: accountId,
  author: account,
  title: 'Our first home',
  body: 'A shared beginning, with room for all our stories.',
  happenedOn: '2026-08-01',
  createdAt: '2026-08-01T12:00:00Z',
  updatedAt: '2026-08-01T12:00:00Z',
  version: 1,
  capabilities: { canEdit: true, canDelete: true, canComment: true },
};
const copy = storyProducts.milestoneProduct;

async function installFixture(page: Page) {
  const unknown: string[] = [];
  const deletions: { id: string; version: string | undefined }[] = [];
  const held: Route[] = [];
  let deleted = false;
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillFreeEntitlements(route, spaceId)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const local = pathname.replace(`/api/v1/spaces/${spaceId}`, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (pathname === '/api/v1/instance/status' && method === 'GET')
      return json({
        maintenanceMode: false,
        registrationAvailable: true,
        auth: {
          localPassword: true,
          passkey: false,
          magicLink: false,
          oidc: false,
        },
      });
    if (pathname === '/api/v1/auth/sign-in' && method === 'POST')
      return json({
        account,
        tokens: {
          accessToken: 'milestone-test-access',
          refreshToken: 'milestone-test-refresh',
          accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
          refreshExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
    if (pathname === '/api/v1/auth/me' && method === 'GET')
      return json(account);
    if (pathname === '/api/v1/auth/capabilities' && method === 'GET')
      return json({ serverAdmin: false });
    if (pathname === '/api/v1/auth/memberships' && method === 'GET')
      return json([{ role: 'MEMBER', spaceId, status: 'ACTIVE' }]);
    if (local === '' && method === 'GET')
      return json({
        id: spaceId,
        createdAt: '2023-06-17T00:00:00Z',
        partners: [account, partner],
      });
    if (local === '/profile' && method === 'GET')
      return json({
        spaceId,
        version: 1,
        relationshipStartedOn: '2023-06-17',
        showRelationshipDuration: true,
      });
    if (local === '/profile-preferences' && method === 'GET')
      return json({ items: [] });
    if (local === `/profiles/${accountId}` && method === 'GET')
      return json({
        accountId,
        id: accountId,
        displayName: account.displayName,
        preferences: [],
        profileAttachmentId: null,
        version: 1,
        createdAt: milestone.createdAt,
        updatedAt: milestone.updatedAt,
      });
    if (local === '/notifications/unread-count' && method === 'GET')
      return json({ unreadCount: 0 });
    const items = deleted
      ? []
      : [{ kind: 'MILESTONE', effectiveDate: milestone.createdAt, milestone }];
    if (local === '/dashboard' && method === 'GET')
      return json({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner, spaceId },
        upcoming: [],
        viewerLocalDate: '2026-10-17',
      });
    if (local === '/timeline' && method === 'GET')
      return json({ items, hasMore: false, nextCursor: null });
    if (local === '/discover' && method === 'GET')
      return json({
        selectionDate: '2026-10-17',
        lead: items[0] ?? null,
        items: [],
        leadContext: null,
      });
    if (local === '/chapters' && method === 'GET')
      return json({ items: [], hasMore: false, nextCursor: null });
    if (local === '/story-views' && method === 'POST')
      return route.fulfill({ status: 204 });
    if (local === `/milestones/${milestone.id}/comments` && method === 'GET')
      return json({ items: [], hasMore: false, nextCursor: null });
    if (local === `/milestones/${milestone.id}` && method === 'GET')
      return json(
        deleted ? { code: 'NOT_FOUND' } : milestone,
        deleted ? 404 : 200,
      );
    if (local === `/milestones/${milestone.id}` && method === 'DELETE') {
      deletions.push({
        id: milestone.id,
        version: request.headers()['if-match'],
      });
      held.push(route);
      return;
    }
    // Momente reads the recap overview for its own entry row; this fixture has none.
    if (local === '/recaps' && method === 'GET')
      return json({
        canCompose: false,
        editions: [],
        periods: [],
        hasMore: false,
      });
    if (await fulfillNoOccasionSources(route)) return;
    unknown.push(`${method} ${pathname}`);
    return json({ code: 'UNEXPECTED_FIXTURE_REQUEST' }, 500);
  });
  await mockEmptyPartnerNickname(page, spaceId, partner.id);
  return {
    unknown,
    deletions,
    async respond(status: 204 | 503) {
      await expect.poll(() => held.length).toBe(1);
      const route = held.shift();
      if (!route) throw new Error('No pending Milestone delete request.');
      if (status === 204) {
        deleted = true;
        await route.fulfill({ status });
      } else
        await route.fulfill({
          status,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Unavailable',
            status,
            code: 'SERVER_ERROR',
            detail: 'Try again.',
          }),
        });
    },
  };
}

async function openDetail(page: Page, largeText = false) {
  await page.goto('/story?tab=timeline');
  await page.getByLabel(de.login.email).fill('alex@example.test');
  await page.getByLabel(de.login.password).fill('long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  const entry = page
    .locator('#momente-diary')
    .getByRole('link')
    .filter({
      has: page.getByRole('heading', { name: milestone.title, exact: true }),
    });
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page).toHaveURL(
    new RegExp(`/story/milestones/${milestone.id}$`),
  );
  await expect(
    page.getByRole('heading', { name: milestone.title, exact: true, level: 2 }),
  ).toBeVisible();
  // Deletion starts from the item menu of the detail page, not from the editor.
  await expect(itemMenuTrigger(page)).toBeVisible();
  if (largeText)
    await page.addStyleTag({ content: ':root { font-size: 200%; }' });
}

function deleteSheetButton(page: Page, name: string) {
  return page
    .getByRole('alertdialog')
    .getByRole('button', { name, exact: true });
}

/** Opens the confirmation twice: the first time it is cancelled without effect. */
async function startDelete(page: Page) {
  await deleteViaMenu(page, de.common.delete);
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await deleteSheetButton(page, de.common.cancel).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await deleteViaMenu(page, de.common.delete);
  await expect(page.getByRole('alertdialog')).toBeVisible();
}

async function confirm(page: Page) {
  await deleteSheetButton(page, copy.deleteConfirm).focus();
  await page.keyboard.press('Enter');
}

async function inspect(page: Page, info: TestInfo, name: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  const controls = page
    .getByRole('alertdialog')
    .locator('.form-actions button');
  expect(await controls.count()).toBeGreaterThan(0);
  for (const control of await controls.all()) {
    const rect = await control.boundingBox();
    expect(rect).not.toBeNull();
    if (!rect) throw new Error('Missing visible editor control.');
    expect(rect.x).toBeGreaterThanOrEqual(-1);
    expect(rect.x + rect.width).toBeLessThanOrEqual(
      (page.viewportSize()?.width ?? 0) + 1,
    );
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  const output = info.outputPath(`${name}.png`);
  await page.screenshot({ path: output, fullPage: true });
  if (process.env.SCREENSHOT_EXPORT_DIR) {
    fs.mkdirSync(process.env.SCREENSHOT_EXPORT_DIR, { recursive: true });
    fs.copyFileSync(
      output,
      path.join(process.env.SCREENSHOT_EXPORT_DIR, `${name}.png`),
    );
  }
}

for (const variant of [
  { width: 390, theme: 'light', returnPending: true },
  { width: 430, theme: 'dark' },
  { width: 1440, theme: 'light' },
  { width: 1440, theme: 'dark' },
  { width: 320, theme: 'dark', largeText: true },
] as const) {
  test(`Milestone deletion owns its task at ${variant.width}px ${variant.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: variant.width, height: 960 });
    await page.emulateMedia({
      colorScheme: variant.theme,
      reducedMotion: 'reduce',
    });
    const fixture = await installFixture(page);
    await openDetail(page, 'largeText' in variant);
    await startDelete(page);
    await confirm(page);
    await expect(deleteSheetButton(page, de.common.deleting)).toBeDisabled();
    await fixture.respond(503);
    await expect(
      page.getByText(de.states.server.title, { exact: true }),
    ).toBeVisible();
    // The failed request keeps the confirmation open for a deliberate retry.
    await expect(deleteSheetButton(page, copy.deleteConfirm)).toBeEnabled();
    await inspect(
      page,
      info,
      `milestone-failure-${variant.width}-${variant.theme}`,
    );
    await deleteSheetButton(page, copy.deleteConfirm).click();
    await expect(deleteSheetButton(page, de.common.deleting)).toBeDisabled();
    await inspect(
      page,
      info,
      `milestone-pending-${variant.width}-${variant.theme}`,
    );
    if ('returnPending' in variant) {
      // While the request is pending the confirmation cannot be left through
      // the browser's Back: the task stays open and the delete stays pending.
      await page.goBack();
      await expect(page).toHaveURL(
        new RegExp(`/story/milestones/${milestone.id}$`),
      );
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await expect(deleteSheetButton(page, de.common.deleting)).toBeDisabled();
      await inspect(page, info, 'milestone-return-pending-390-light');
    }
    const completed = page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && r.status() === 204,
    );
    await fixture.respond(204);
    await completed;
    // The confirmed delete returns to the Timeline the item was opened from.
    await expect(page).toHaveURL(/\/story\?tab=timeline$/);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('.story-card-milestone')).toHaveCount(0);
    expect(fixture.deletions).toEqual([
      { id: milestone.id, version: '1' },
      { id: milestone.id, version: '1' },
    ]);
    expect(fixture.unknown).toEqual([]);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Milestone offline deletion requires deliberate retry in ${theme}`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const fixture = await installFixture(page);
    await openDetail(page);
    // The menu is offered online only, so the confirmation opens first.
    await startDelete(page);
    await context.setOffline(true);
    await confirm(page);
    await expect(
      page.getByText(de.states.offline.title, { exact: true }),
    ).toBeVisible();
    await expect(deleteSheetButton(page, copy.deleteConfirm)).toBeEnabled();
    await inspect(page, info, `milestone-offline-360-${theme}`);
    await context.setOffline(false);
    await expect(deleteSheetButton(page, copy.deleteConfirm)).toBeEnabled();
    expect(fixture.deletions).toEqual([]);
    await deleteSheetButton(page, copy.deleteConfirm).click();
    await expect(deleteSheetButton(page, de.common.deleting)).toBeDisabled();
    await fixture.respond(204);
    // Deleting returns to the Timeline scope the item was opened from (#1907).
    await expect(page).toHaveURL(/\/story\?tab=timeline$/);
    await expect(page.locator('.story-card-milestone')).toHaveCount(0);
    expect(fixture.deletions).toEqual([{ id: milestone.id, version: '1' }]);
    expect(fixture.unknown).toEqual([]);
  });
}
