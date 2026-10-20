import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type Page,
  type Route,
  type TestInfo,
  test,
} from '@playwright/test';
import de from '../../src/i18n/locales/de';
import navigation from '../../src/i18n/locales/navigation';
import storyProducts from '../../src/i18n/locales/storyProducts';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { mockEmptyPartnerNickname } from '../support/partnerNickname';

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

async function openEditor(page: Page, largeText = false) {
  await page.goto('/story?tab=timeline');
  await page.getByLabel(de.login.email).fill('alex@example.test');
  await page.getByLabel(de.login.password).fill('long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.locator('.story-card-milestone')).toBeVisible();
  await page.locator('.story-card-milestone').click();
  await expect(
    page.getByRole('heading', { name: milestone.title, exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: copy.edit, exact: true }).click();
  if (largeText)
    await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  await expect(page.getByLabel(copy.titleLabel)).toHaveValue(milestone.title);
}

async function confirm(page: Page) {
  await page.getByRole('button', { name: copy.delete, exact: true }).click();
  await page
    .getByRole('button', { name: copy.deleteCancel, exact: true })
    .click();
  await page.getByRole('button', { name: copy.delete, exact: true }).click();
  const button = page.getByRole('button', {
    name: copy.deleteConfirm,
    exact: true,
  });
  await button.focus();
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
  const controls = page.locator(
    '.product-editor-page input, .product-editor-page textarea, .product-editor-page button',
  );
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
    await openEditor(page, 'largeText' in variant);
    await page
      .getByLabel(copy.bodyLabel)
      .fill('A later draft stays with this editor.');
    await confirm(page);
    await expect(
      page.getByRole('button', { name: copy.deleting }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: copy.save, exact: true }),
    ).toBeDisabled();
    await fixture.respond(503);
    await expect(
      page.getByText(de.states.server.title, { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(copy.bodyLabel)).toHaveValue(
      'A later draft stays with this editor.',
    );
    await inspect(
      page,
      info,
      `milestone-failure-${variant.width}-${variant.theme}`,
    );
    await page
      .getByRole('button', { name: copy.deleteConfirm, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: copy.deleting }),
    ).toBeDisabled();
    await inspect(
      page,
      info,
      `milestone-pending-${variant.width}-${variant.theme}`,
    );
    await page
      .getByRole('link', { name: navigation.more, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: de.more.title }),
    ).toBeVisible();
    if ('returnPending' in variant) {
      await page.goBack();
      await expect(
        page.getByRole('button', { name: copy.deleting }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: copy.save, exact: true }),
      ).toBeDisabled();
      await inspect(page, info, 'milestone-return-pending-390-light');
      await page
        .getByRole('link', { name: navigation.more, exact: true })
        .click();
    }
    const completed = page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && r.status() === 204,
    );
    await fixture.respond(204);
    await completed;
    await expect(
      page.getByRole('heading', { name: de.more.title }),
    ).toBeVisible();
    await inspect(
      page,
      info,
      `milestone-other-task-${variant.width}-${variant.theme}`,
    );
    await page
      .getByRole('link', { name: navigation.story, exact: true })
      .click();
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
    await openEditor(page);
    await page.getByLabel(copy.bodyLabel).fill('Keep this offline draft.');
    await context.setOffline(true);
    await confirm(page);
    await expect(
      page.getByText(de.states.offline.title, { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(copy.bodyLabel)).toHaveValue(
      'Keep this offline draft.',
    );
    await expect(
      page.getByRole('button', { name: copy.deleteConfirm, exact: true }),
    ).toBeEnabled();
    await inspect(page, info, `milestone-offline-360-${theme}`);
    await context.setOffline(false);
    await expect(
      page.getByRole('button', { name: copy.deleteConfirm, exact: true }),
    ).toBeEnabled();
    expect(fixture.deletions).toEqual([]);
    await page
      .getByRole('button', { name: copy.deleteConfirm, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: copy.deleting }),
    ).toBeDisabled();
    await fixture.respond(204);
    await expect(page).toHaveURL(/\/story$/);
    await expect(page.locator('.story-card-milestone')).toHaveCount(0);
    expect(fixture.deletions).toEqual([{ id: milestone.id, version: '1' }]);
    expect(fixture.unknown).toEqual([]);
  });
}
