import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import navigation from '../../src/i18n/locales/navigation';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import deFixture from '../fixtures/locales/de';
import {
  expectFloatingAddAction,
  expectInlineAddLayout,
  expectLabeledAddAction,
  expectOverviewActionPlacement,
} from '../support/addAction';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

test.setTimeout(60_000);

async function installContent(page: Page, dense = false) {
  const unexpected = await installMocks(page, { strict: true });
  const date = '2026-10-27T10:00:00Z';
  const base = {
    spaceId: SPACE_ID,
    createdBy: ACCOUNT_ID,
    creator: ME,
    createdAt: date,
    updatedAt: date,
    version: 1,
    capabilities: CAPABILITIES,
  };
  const places = [
    {
      ...base,
      archived: false,
      id: 'park',
      name: 'Volkspark',
      description: deFixture.placesAndLists.placeDescription,
      address: 'Parkstraße, Berlin',
      latitude: 52.51,
      longitude: 13.35,
      geocodingSource: 'openstreetmap',
    },
  ];
  const makeItem = (id: string, title: string, position: number) => ({
    ...base,
    id,
    collectionId: 'tv',
    title,
    position,
    completed: false,
  });
  const collections = [
    {
      ...base,
      id: 'tv',
      title: 'Trash-TV',
      items: dense
        ? Array.from({ length: 24 }, (_, index) =>
            makeItem(
              `item-${index}`,
              index === 1
                ? deFixture.placesAndLists.longListEntry
                : `Unsere Serie ${index + 1}`,
              index,
            ),
          )
        : [makeItem('jungle', 'Dschungelcamp', 0)],
    },
  ];
  let failTitle = true;
  const linked = new Set(['mem-canal']);
  const writes: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const root = `/api/v1/spaces/${SPACE_ID}`;
    const method = request.method();
    if (!path.startsWith(root)) return route.fallback();
    const sub = path.slice(root.length);
    if (sub === '/dashboard/preferences')
      return route.fulfill({
        json: {
          items: [
            {
              moduleKey: 'pinned_collection',
              visible: true,
              selectedCollectionId: null,
            },
          ],
        },
      });
    if (sub === '/places') {
      if (method === 'GET') {
        const params = new URL(request.url()).searchParams;
        const scope = params.get('scope') ?? 'ALL';
        const items = places.filter(
          (place) =>
            scope === 'ALL' || place.archived === (scope === 'ARCHIVED'),
        );
        return route.fulfill({ json: { items, nextCursor: null } });
      }
      if (method === 'POST') {
        const created = {
          ...base,
          archived: false,
          ...request.postDataJSON(),
          id: 'new-place',
        };
        places.push(created);
        writes.push('create-place');
        return route.fulfill({ status: 201, json: created });
      }
    }
    const placeId = sub.match(/^\/places\/([^/]+)$/)?.[1];
    if (placeId) {
      const place = places.find((value) => value.id === placeId);
      if (!place) throw new Error('Missing Place fixture');
      if (method === 'PATCH') {
        Object.assign(place, request.postDataJSON(), {
          version: place.version + 1,
        });
        writes.push('edit-place');
      }
      return route.fulfill({ json: place });
    }
    if (sub === '/places/park/memories/mem-canal' && method === 'DELETE') {
      linked.delete('mem-canal');
      writes.push('unlink-moment');
      return route.fulfill({ status: 204 });
    }
    if (
      /^\/places\/[^/]+\/(memories|heart-moments|milestones|content)$/.test(sub)
    )
      return route.fulfill({
        json: { items: sub === '/places/park/memories' ? [...linked] : [] },
      });
    if (sub === '/collections') {
      if (method === 'GET')
        return route.fulfill({
          json: { items: collections, nextCursor: null },
        });
      if (method === 'POST') {
        const created = {
          ...base,
          ...request.postDataJSON(),
          id: 'new-list',
          items: [],
        };
        collections.push(created);
        writes.push('create-list');
        return route.fulfill({ status: 201, json: created });
      }
    }
    const collectionId = sub.match(/^\/collections\/([^/]+)$/)?.[1];
    if (collectionId)
      return route.fulfill({
        json: collections.find((value) => value.id === collectionId),
      });
    if (sub === '/collections/tv/items' && method === 'POST') {
      collections[0].items.push(
        makeItem(
          'summer',
          request.postDataJSON().title,
          collections[0].items.length,
        ),
      );
      writes.push('add-item');
      return route.fulfill({ status: 201, json: collections[0].items.at(-1) });
    }
    const itemId = sub.match(/^\/collections\/tv\/items\/([^/]+)$/)?.[1];
    if (itemId) {
      if (method === 'DELETE') {
        collections[0].items = collections[0].items.filter(
          (item) => item.id !== itemId,
        );
        writes.push('delete-item');
        return route.fulfill({ status: 204 });
      }
      const item = collections[0].items.find((item) => item.id === itemId);
      if (!item) throw new Error('Missing item fixture');
      const update = request.postDataJSON();
      if (update.title && failTitle) {
        failTitle = false;
        return route.fulfill({
          status: 503,
          json: {
            type: 'about:blank',
            title: 'Temporarily unavailable',
            status: 503,
          },
        });
      }
      Object.assign(item, update, { version: item.version + 1 });
      writes.push(update.title ? 'edit-item' : 'check-item');
      return route.fulfill({ json: item });
    }
    if (sub === '/collections/tv/order') {
      const ids: string[] = request.postDataJSON().itemIds;
      collections[0].items.forEach((item) => {
        item.position = ids.indexOf(item.id);
      });
      collections[0].version += 1;
      writes.push('sort');
      return route.fulfill({ json: collections[0] });
    }
    return route.fallback();
  });
  return { unexpected, writes };
}

async function openOverview(page: Page, kind: 'places' | 'collections') {
  await page.goto(`/more/${kind}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    kind === 'places' ? m5s3.place.heading : m5s3.collection.overviewHeading,
  );
  await expect(page.locator('.content-overview-row').first()).toBeVisible();
  const action = page.getByRole('button', {
    name: kind === 'places' ? m5s3.place.create : m5s3.collection.create,
    exact: true,
  });
  const dock = page.locator('.mobile-bottom-shell');
  const icon = kind === 'places' ? 'orte' : 'listen';
  if (await dock.isVisible()) {
    await expectFloatingAddAction(action, dock);
    await expect(action.locator(`.eimir-icon-${icon}`)).toBeHidden();
  } else {
    await expectLabeledAddAction(action, icon);
    await expectOverviewActionPlacement(action);
    const [control, scope] = await Promise.all([
      action.boundingBox(),
      page.locator('.planen-status-scope').boundingBox(),
    ]);
    if (!control || !scope) throw new Error('Missing overview controls');
    expect(control.y + control.height).toBeLessThanOrEqual(scope.y);
  }
}

for (const scenario of [
  { width: 360, theme: 'light', dense: false, large: false },
  { width: 390, theme: 'dark', dense: false, large: false },
  { width: 430, theme: 'light', dense: false, large: false },
  { width: 1280, theme: 'dark', dense: false, large: false },
  { width: 390, theme: 'light', dense: false, large: true },
  { width: 390, theme: 'dark', dense: true, large: false },
] as const) {
  test(`compact content at ${scenario.width} ${scenario.theme} dense=${scenario.dense} large=${scenario.large}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await page.emulateMedia({
      colorScheme: scenario.theme,
      reducedMotion: 'reduce',
    });
    if (scenario.large)
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.style.fontSize = '200%';
        });
      });
    const state = await installContent(page, scenario.dense);
    await signIn(page);
    for (const kind of ['places', 'collections'] as const) {
      await openOverview(page, kind);
      const suffix = `${scenario.width}-${scenario.theme}${scenario.large ? '-large' : ''}${scenario.dense ? '-dense' : ''}`;
      await captureScreenshot(
        page,
        testInfo,
        `planning-${kind}-overview-${suffix}.png`,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .include('.shared-content-page')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.locator('.content-overview-row').first().click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        kind === 'places' ? 'Volkspark' : 'Trash-TV',
      );
      if (!scenario.large && scenario.width < 840)
        expect(
          (await page.getByRole('heading', { level: 1 }).boundingBox())?.y,
        ).toBeLessThan(180);
      if (scenario.width < 840)
        await expect(page.locator('.mobile-bottom-shell')).toBeInViewport();
      await captureScreenshot(page, testInfo, `${kind}-detail-${suffix}.png`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (kind === 'places')
        await page.locator('.relation-moment-link').first().hover();
      const axe = await new AxeBuilder({ page })
        .include('.shared-content-page')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(axe.violations).toEqual([]);
      if (kind === 'collections') {
        const field = page.getByRole('textbox', {
          name: m5s3.collection.newItem,
        });
        const add = page.getByRole('button', {
          name: m5s3.collection.addItem,
          exact: true,
        });
        await expectLabeledAddAction(add);
        await expectInlineAddLayout(field, add);
        expect(await page.getByRole('textbox').count()).toBe(1);
      } else {
        if (!scenario.large) {
          const preview = await page
            .locator('.relation-moment-link')
            .first()
            .boundingBox();
          const actions = await page
            .getByRole('button', {
              name: m5s3.relations.actions.replace(
                '{{title}}',
                'Breakfast by the canal',
              ),
            })
            .boundingBox();
          if (!preview || !actions) throw new Error('Missing moment controls');
          expect(actions.x).toBeGreaterThan(preview.x);
          expect(actions.y).toBeLessThan(preview.y + preview.height);
        }

        await expect(page.getByText(m5s3.place.noDescription)).toHaveCount(0);
        await expect(
          page.getByRole('link', { name: '© OpenStreetMap' }),
        ).toBeVisible();
      }
    }
    expect(state.unexpected).toEqual([]);
  });
}

test('read, check, edit with failure recovery, sort, delete, create and return', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installContent(page);
  await signIn(page);
  await openOverview(page, 'places');
  await page.getByRole('link', { name: /Volkspark/ }).click();
  await page
    .getByRole('button', {
      name: m5s3.relations.actions.replace(
        '{{title}}',
        'Breakfast by the canal',
      ),
    })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: m5s3.relations.unlinkPlace, exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: /Breakfast by the canal/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: m5s3.relations.addLabel, exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog
    .getByLabel(m5s3.place.name, { exact: true })
    .fill('Unser Volkspark');
  await captureScreenshot(page, testInfo, 'place-editor-390-light.png');
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('alertdialog')).toBeVisible();
  await dialog.getByRole('button', { name: m5s3.common.keepEditing }).click();
  await dialog.getByRole('button', { name: m5s3.common.saveChanges }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Unser Volkspark',
  );
  await page.getByRole('button', { name: taskBoundary.back }).click();
  await page.getByRole('button', { name: m5s3.place.scopeALL }).click();
  const createPlace = page.getByRole('button', {
    name: m5s3.place.create,
    exact: true,
  });
  await createPlace.press('Enter');
  dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(createPlace).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(createPlace).toBeFocused();
  await createPlace.click();
  await dialog.getByLabel(m5s3.place.name, { exact: true }).fill('Unser Café');
  await captureScreenshot(page, testInfo, 'place-create-390-light.png');
  await dialog
    .getByRole('button', { name: m5s3.common.save, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Unser Café',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: taskBoundary.back }).click();
  await expect(page).toHaveURL(/\/more\/places\?scope=ALL$/);
  await expect(page.getByRole('link', { name: /Unser Café/ })).toBeVisible();

  await openOverview(page, 'collections');
  await page.getByRole('link', { name: /Trash-TV/ }).click();
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await page
    .getByRole('textbox', { name: m5s3.collection.newItem })
    .fill('Sommerhaus');
  await page
    .getByRole('button', { name: m5s3.collection.addItem, exact: true })
    .click();
  await expect(page.getByText('Sommerhaus', { exact: true })).toBeVisible();
  await page
    .getByRole('button', {
      name: m5s3.collection.markDone.replace('{{title}}', 'Dschungelcamp'),
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: m5s3.collection.markOpen.replace('{{title}}', 'Dschungelcamp'),
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  // A finished entry moves into the tray under the open ones.
  await expect(
    page
      .getByRole('region', { name: m5s3.collection.trayGeneric })
      .getByText('Dschungelcamp'),
  ).toBeVisible();
  await expect(page.locator('.shared-list-items > li').first()).toContainText(
    'Sommerhaus',
  );
  await page
    .getByRole('button', {
      name: m5s3.collection.openItem.replace('{{title}}', 'Sommerhaus'),
    })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('Sommerhaus gemeinsam');
  await dialog.getByRole('button', { name: m5s3.common.saveChanges }).click();
  await expect(dialog.getByRole('textbox')).toHaveValue('Sommerhaus gemeinsam');
  await expect(dialog.locator('.problem-state, [role="alert"]')).toBeVisible();
  await captureScreenshot(page, testInfo, 'list-entry-error-390-light.png');
  await dialog.getByRole('button', { name: m5s3.common.saveChanges }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByText('Sommerhaus gemeinsam', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: m5s3.collection.menu.open }).click();
  await page
    .getByRole('button', { name: m5s3.collection.sort, exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByRole('button', {
      name: m5s3.collection.reorderItem.replace(
        '{{title}}',
        'Sommerhaus gemeinsam',
      ),
    })
    .press('ArrowUp');
  await expect(page.locator('.shared-list-items > li').first()).toContainText(
    'Sommerhaus gemeinsam',
  );
  await page
    .getByRole('button', { name: m5s3.collection.finishSorting, exact: true })
    .click();
  await page
    .getByRole('button', {
      name: m5s3.collection.openItem.replace('{{title}}', 'Dschungelcamp'),
    })
    .click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: m5s3.common.delete, exact: true })
    .click();
  await expect(
    dialog.getByText(
      m5s3.collection.deleteItemConsequence.replace(
        '{{title}}',
        'Dschungelcamp',
      ),
    ),
  ).toBeVisible();
  await dialog.getByRole('button', { name: m5s3.common.confirmDelete }).click();
  await expect(page.getByText('Dschungelcamp', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: m5s3.collection.markDone.replace(
        '{{title}}',
        'Sommerhaus gemeinsam',
      ),
    }),
  ).toBeFocused();
  await page
    .getByRole('link', { name: navigation.more, exact: true })
    .last()
    .click();
  await page.locator('a[href="/more/collections"]').click();
  await page.getByRole('button', { name: m5s3.collection.scope.ALL }).click();
  const createList = page.getByRole('button', {
    name: m5s3.collection.create,
    exact: true,
  });
  await createList.click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(createList).toBeHidden();
  await dialog.getByLabel(m5s3.common.title, { exact: true }).fill('Draft');
  await dialog
    .getByRole('button', { name: de.common.cancel, exact: true })
    .click();
  await page
    .getByRole('button', { name: m5s3.common.keepEditing, exact: true })
    .click();
  await expect(
    dialog.getByLabel(m5s3.common.title, { exact: true }),
  ).toHaveValue('Draft');
  await dialog
    .getByRole('button', { name: de.common.cancel, exact: true })
    .click();
  await page
    .getByRole('button', { name: m5s3.common.discardConfirm, exact: true })
    .click();
  await expect(page).toHaveURL(/\/more\/collections\?scope=ALL$/);
  await expect(createList).toBeFocused();
  await createList.click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByLabel(m5s3.common.title, { exact: true })
    .fill('Unser Wochenende');
  await dialog
    .getByRole('button', { name: m5s3.common.save, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Unser Wochenende',
  );
  await captureScreenshot(page, testInfo, 'list-created-390-light.png');
  await page.getByRole('button', { name: taskBoundary.back }).click();
  await expect(page).toHaveURL(/\/more\/collections\?scope=ALL$/);
  await expect(
    page.getByRole('link', { name: /Unser Wochenende/ }),
  ).toBeVisible();
  expect(state.writes).toEqual([
    'unlink-moment',
    'edit-place',
    'create-place',
    'add-item',
    'check-item',
    'edit-item',
    'sort',
    'delete-item',
    'create-list',
  ]);
  expect(state.unexpected).toEqual([]);
});

test('Places archive and restore keep linked moments and the selected scope on return', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const state = await installContent(page);
  await signIn(page);
  await openOverview(page, 'places');
  const filters = page.getByRole('group', { name: m5s3.place.scope });
  await expect(filters.getByRole('button')).toHaveCount(3);
  await expect(
    filters.getByRole('button', { name: m5s3.place.scopeACTIVE, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: /Volkspark/ }).click();
  await page.getByRole('button', { name: de.common.edit, exact: true }).click();
  await page
    .getByRole('button', { name: m5s3.place.archive, exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: /Breakfast by the canal/ }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .first()
    .click();
  await expect(page.locator('.content-overview-row')).toHaveCount(0);
  await page
    .getByRole('button', { name: m5s3.place.scopeARCHIVED, exact: true })
    .click();
  await expect(page.getByRole('link', { name: /Volkspark/ })).toBeVisible();
  await captureScreenshot(page, info, 'places-archived-390-dark.png');
  await page.getByRole('link', { name: /Volkspark/ }).click();
  await page.getByRole('button', { name: de.common.edit, exact: true }).click();
  await page
    .getByRole('button', { name: m5s3.place.restore, exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/scope=ARCHIVED/);
  await expect(page.locator('.content-overview-row')).toHaveCount(0);
  await page
    .getByRole('button', { name: m5s3.place.scopeACTIVE, exact: true })
    .click();
  await expect(page.getByRole('link', { name: /Volkspark/ })).toBeVisible();
  expect(state.writes).toEqual(['edit-place', 'edit-place']);
  expect(state.unexpected).toEqual([]);
});
