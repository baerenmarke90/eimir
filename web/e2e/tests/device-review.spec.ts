import AxeBuilder from '../support/axe';
import { expect, test } from '@playwright/test';
import tags from '../../src/i18n/locales/contextTags';
import momentCopy from '../../src/i18n/locales/m5s5';
import memory from '../../src/i18n/locales/memoryProduct';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import {
  closeComposerDate,
  closeContextTags,
  showComposerDate,
  showContextSuggestions,
  showContextTags,
} from '../support/memoryDiary';
import {
  ACCOUNT_ID,
  captureScreenshot,
  installMocks,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

for (const [width, theme] of [
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`device review: link and unlink existing intentions, stable comment metadata ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const unexpected = await installMocks(page, {
      strict: true,
      withDetailComments: true,
    });
    const targets = { plans: new Set<string>(), wishes: new Set<string>() };
    const writes: string[] = [];
    const plan = {
      id: 'linked-plan',
      spaceId: SPACE_ID,
      title: 'Unser gemeinsames Wochenende am See mit Picknick',
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z',
      version: 1,
      status: 'PLANNED',
      author: { id: ACCOUNT_ID, displayName: 'Lea' },
      capabilities: { canEdit: true, canDelete: true, canComment: true },
      attachments: [],
      tags: [],
    };
    const wish = {
      ...plan,
      id: 'linked-wish',
      title: 'Gemeinsam ans Meer',
      status: 'OPEN',
    };
    for (const kind of ['plans', 'wishes'] as const) {
      const item = kind === 'plans' ? plan : wish;
      const path = `/api/v1/spaces/${SPACE_ID}/${kind}`;
      await page.route(
        (url) => url.pathname === path,
        (route) =>
          route.fulfill({
            json: { items: [item], nextCursor: null, hasMore: false },
          }),
      );
      await page.route(`**${path}/${item.id}`, (route) =>
        route.fulfill({ json: item }),
      );
      await page.route(
        `**/api/v1/spaces/${SPACE_ID}/memories/mem-canal/${kind}**`,
        async (route) => {
          const method = route.request().method();
          const id =
            new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
          if (method === 'GET')
            return route.fulfill({ json: { items: [...targets[kind]] } });
          expect(['PUT', 'DELETE']).toContain(method);
          expect(id).toBe(kind === 'plans' ? plan.id : wish.id);
          writes.push(`${method}:${kind}`);
          if (method === 'PUT') targets[kind].add(id);
          else targets[kind].delete(id);
          return route.fulfill({ status: 204 });
        },
      );
    }
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/plans/${plan.id}/story*`,
      (route) =>
        route.fulfill({
          json: { items: [], nextCursor: null, hasMore: false },
        }),
    );
    await page.route(
      (url) => url.pathname === `/api/v1/spaces/${SPACE_ID}/places`,
      (route) =>
        route.fulfill({
          json: { items: [], nextCursor: null, hasMore: false },
        }),
    );
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/wishes/${wish.id}/reminder`,
      (route) => route.fulfill({ json: { dueAt: null } }),
    );
    await signIn(page);
    await page.goto('/story/memories/mem-canal');
    const group = page.getByRole('region', {
      name: memory.planning.detailHeading,
      exact: true,
    });
    const own = page
      .locator('.comment-card')
      .filter({ hasText: 'Still smiling about this.' });
    const partner = page
      .locator('.comment-card')
      .filter({ hasText: 'Me too.' });
    await expect(own).toBeVisible();
    await expect(partner).toBeVisible();
    await expect(group).toHaveCount(0);
    await own.scrollIntoViewIfNeeded();
    const ownDate = await own.locator('time').boundingBox();
    const partnerDate = await partner.locator('time').boundingBox();
    if (!ownDate || !partnerDate)
      throw new Error('Comment timestamps unavailable');
    expect(ownDate.x + ownDate.width).toBeCloseTo(
      partnerDate.x + partnerDate.width,
      1,
    );
    await own.locator('summary').click();
    const after = await own.locator('time').boundingBox();
    expect(after?.x).toBe(ownDate.x);
    expect(after?.y).toBe(ownDate.y);
    await page.keyboard.press('Escape');
    await captureScreenshot(
      page,
      info,
      `device-comments-${width}-${theme}.png`,
      { fullPage: true },
    );
    await expect(
      page.getByRole('button', { name: memory.planning.add, exact: true }),
    ).toHaveCount(0);
    await page.getByRole('link', { name: memory.edit, exact: true }).click();
    const linked = page.getByRole('region', { name: memory.planning.heading });
    for (const kind of ['plans', 'wishes'] as const) {
      await page
        .getByRole('button', { name: memory.planning.add, exact: true })
        .click();
      const dialog = page.getByRole('dialog', { name: memory.planning.add });
      await dialog
        .getByRole('button', { name: memory.planning[kind], exact: true })
        .click();
      await dialog
        .getByRole('button', {
          name: kind === 'plans' ? plan.title : wish.title,
          exact: true,
        })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(
        linked.getByText(kind === 'plans' ? plan.title : wish.title, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(linked.getByRole('link')).toHaveCount(0);
    }
    await linked.scrollIntoViewIfNeeded();
    await captureScreenshot(page, info, `device-links-${width}-${theme}.png`);
    expect(
      (
        await new AxeBuilder({ page })
          .include('.memory-planning-links')
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByRole('link', { name: taskBoundary.back, exact: true })
      .click();
    await expect(group.getByRole('heading')).toHaveText(
      memory.planning.detailHeading,
    );
    const list = group.getByRole('list');
    const planLink = list.getByRole('link', {
      name: `${plan.title} ${momentCopy.kind.PLAN}`,
      exact: true,
    });
    const wishLink = list.getByRole('link', {
      name: `${wish.title} ${momentCopy.kind.WISH}`,
      exact: true,
    });
    await expect(list.getByRole('link')).toHaveCount(2);
    await expect(planLink).toHaveAttribute('href', '/plan/plans/linked-plan');
    await expect(wishLink).toHaveAttribute('href', '/plan/wishes/linked-wish');
    await group.scrollIntoViewIfNeeded();
    const [planBounds, wishBounds] = await Promise.all([
      planLink.boundingBox(),
      wishLink.boundingBox(),
    ]);
    if (!planBounds || !wishBounds) throw new Error('Missing planning links');
    expect(planBounds.height).toBeGreaterThanOrEqual(44);
    expect(wishBounds.height).toBeGreaterThanOrEqual(44);
    expect(planBounds.y + planBounds.height).toBeLessThanOrEqual(
      wishBounds.y + 1,
    );
    expect(planBounds.width).toBeCloseTo(wishBounds.width, 1);
    const divider = await list
      .getByRole('listitem')
      .nth(1)
      .evaluate(
        (row) => getComputedStyle(row, '::before').borderBlockStartWidth,
      );
    expect(parseFloat(divider)).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await captureScreenshot(
      page,
      info,
      `memory-planning-links-${width}-${theme}.png`,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include('.memory-planning-links-detail')
          .analyze()
      ).violations,
    ).toEqual([]);
    if (width === 360) {
      const largeText = await page.addStyleTag({
        content: 'html { font-size: 150%; }',
      });
      await expect(planLink).toBeVisible();
      const titleFits = await planLink.locator('strong').evaluate((title) => {
        const lineHeight = parseFloat(getComputedStyle(title).lineHeight);
        return (
          title.scrollWidth <= title.clientWidth &&
          title.clientHeight > lineHeight
        );
      });
      expect(titleFits).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await largeText.evaluate((style) => style.remove());
      await planLink.focus();
      await expect(planLink).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(wishLink).toBeFocused();
      await wishLink.press('Enter');
      await expect(page).toHaveURL(/\/plan\/wishes\/linked-wish$/);
      await expect(
        page.getByRole('heading', { name: wish.title, exact: true }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: taskBoundary.back, exact: true })
        .click();
      await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
      await planLink.click();
      await expect(page).toHaveURL(/\/plan\/plans\/linked-plan$/);
      await expect(
        page.getByRole('heading', { name: plan.title, exact: true }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: taskBoundary.back, exact: true })
        .click();
      await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
    }
    await page.getByRole('link', { name: memory.edit, exact: true }).click();
    await linked
      .getByRole('button', {
        name: memory.planning.remove.replace('{{title}}', plan.title),
      })
      .click();
    await expect(linked.getByText(plan.title, { exact: true })).toHaveCount(0);
    await expect(linked.getByText(wish.title, { exact: true })).toBeVisible();
    await page
      .getByRole('link', { name: taskBoundary.back, exact: true })
      .click();
    await expect(planLink).toHaveCount(0);
    await expect(list.getByRole('link')).toHaveCount(1);
    await expect(wishLink).toHaveAttribute('href', '/plan/wishes/linked-wish');
    expect(writes).toEqual(['PUT:plans', 'PUT:wishes', 'DELETE:plans']);
    expect(unexpected).toEqual([]);
  });
}

test('device review: shared learned labels and AI proposals remain explicit in the same HeartMoment tag editor', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page, { strict: true, withDetailComments: true });
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/context-tag-suggestions*`,
    (route) =>
      route.fulfill({
        json: { learned: ['Unser Konzert'], proposed: ['Belgien'] },
      }),
  );
  await signIn(page);
  await page.goto('/story/heart-moments/new');
  await showContextTags(page);
  const editor = page.getByRole('group', { name: tags.label });
  await showContextSuggestions(page);
  await expect(
    editor.getByRole('checkbox', { name: 'Unser Konzert', exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByRole('checkbox', { name: 'Belgien', exact: true }),
  ).toBeVisible();
  const serializedTags = page.locator(
    '.page-composer input[type="hidden"][name="tags"]',
  );
  await expect(serializedTags).toHaveCount(0);
  await editor
    .getByRole('checkbox', { name: 'Unser Konzert', exact: true })
    .click();
  await editor.getByRole('checkbox', { name: 'Belgien', exact: true }).click();
  expect(
    await serializedTags.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    ),
  ).toEqual(['Unser Konzert', 'Belgien']);
  await closeContextTags(page);
  const order = await page.evaluate(() => {
    const feeling = document.querySelector(
      '.heart-moment-create-emotion-picker',
    );
    const tags = document.querySelector('.composer-tool-row');
    return Boolean(
      feeling &&
        tags &&
        feeling.compareDocumentPosition(tags) &
          Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(order).toBe(true);
  const date = await showComposerDate(
    page,
    storyProducts.heartMomentProduct.happenedOnLabel,
  );
  await expect(date).toHaveAttribute('type', 'date');
  const dateLabelWeight = await date.evaluate((input) => {
    const label = (input as HTMLInputElement).labels?.[0];
    if (!label) throw new Error('Date label missing');
    return getComputedStyle(label).fontWeight;
  });
  expect(dateLabelWeight).toBe('400');
  await closeComposerDate(
    page,
    storyProducts.heartMomentProduct.happenedOnLabel,
  );
  await captureScreenshot(page, info, 'device-tags-heart-390.png', {
    fullPage: true,
  });
});
