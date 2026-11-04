import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import memory from '../../src/i18n/locales/memoryProduct';
import tags from '../../src/i18n/locales/contextTags';
import storyProducts from '../../src/i18n/locales/storyProducts';
import {
  ACCOUNT_ID,
  SPACE_ID,
  installMocks,
  signIn,
  captureScreenshot,
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
      title: 'Unser Wochenende',
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z',
      version: 1,
      status: 'OPEN',
      author: { id: ACCOUNT_ID, displayName: 'Lea' },
      capabilities: { canEdit: true, canDelete: true, canComment: true },
      attachments: [],
      tags: [],
    };
    const wish = { ...plan, id: 'linked-wish', title: 'Gemeinsam ans Meer' };
    for (const kind of ['plans', 'wishes'] as const) {
      await page.route(`**/api/v1/spaces/${SPACE_ID}/${kind}**`, (route) => {
        const path = new URL(route.request().url()).pathname;
        return route.fulfill({
          json: path.endsWith(`/${kind}`)
            ? {
                items: [kind === 'plans' ? plan : wish],
                nextCursor: null,
                hasMore: false,
              }
            : kind === 'plans'
              ? plan
              : wish,
        });
      });
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
    await signIn(page);
    await page.goto('/story/memories/mem-canal');
    const own = page
      .locator('.comment-card')
      .filter({ hasText: 'Still smiling about this.' });
    const partner = page
      .locator('.comment-card')
      .filter({ hasText: 'Me too.' });
    await expect(own).toBeVisible();
    await expect(partner).toBeVisible();
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
        linked.getByRole('link', {
          name: kind === 'plans' ? plan.title : wish.title,
        }),
      ).toHaveAttribute('href', new RegExp(`/${kind}/linked-`));
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
    await linked
      .getByRole('button', {
        name: memory.planning.remove.replace('{{title}}', plan.title),
      })
      .click();
    await expect(linked.getByRole('link', { name: plan.title })).toHaveCount(0);
    await expect(linked.getByRole('link', { name: wish.title })).toBeVisible();
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
  const editor = page.getByRole('group', { name: tags.label });
  await editor.locator('summary').click();
  await expect(
    editor.getByRole('checkbox', { name: 'Unser Konzert', exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByRole('checkbox', { name: 'Belgien', exact: true }),
  ).toBeVisible();
  await expect(editor.locator('input[type="hidden"]')).toHaveCount(0);
  await editor
    .getByRole('checkbox', { name: 'Unser Konzert', exact: true })
    .click();
  await editor.getByRole('checkbox', { name: 'Belgien', exact: true }).click();
  expect(
    await editor
      .locator('input[type="hidden"]')
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      ),
  ).toEqual(['Unser Konzert', 'Belgien']);
  const order = await page.evaluate(() => {
    const feeling = document.querySelector(
      '.heart-moment-create-emotion-picker',
    );
    const tags = document.querySelector('.memory-tag-choices');
    return Boolean(
      feeling &&
        tags &&
        feeling.compareDocumentPosition(tags) &
          Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(order).toBe(true);
  await expect(
    page.getByLabel(storyProducts.heartMomentProduct.happenedOnLabel, {
      exact: true,
    }),
  ).toHaveAttribute('type', 'date');
  const dateLabelWeight = await page
    .getByLabel(storyProducts.heartMomentProduct.happenedOnLabel, {
      exact: true,
    })
    .evaluate((input) => {
      const label = (input as HTMLInputElement).labels?.[0];
      if (!label) throw new Error('Date label missing');
      return getComputedStyle(label).fontWeight;
    });
  expect(dateLabelWeight).toBe('400');
  await captureScreenshot(page, info, 'device-tags-heart-390.png', {
    fullPage: true,
  });
});
