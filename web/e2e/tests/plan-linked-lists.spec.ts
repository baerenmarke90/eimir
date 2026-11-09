import memoryCopy from '../../src/i18n/locales/memoryProduct';
import fixtures from '../fixtures/locales/de';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import copy from '../../src/i18n/locales/m5s3';
import de from '../../src/i18n/locales/de';
import storyCopy from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  ME,
  SPACE_ID,
  captureScreenshot,
  installMocks,
  signIn,
} from '../support/storyTimelineFixture';

const base = `/api/v1/spaces/${SPACE_ID}`;
const planId = '44444444-4444-4444-8444-444444444444';
const placeId = '55555555-5555-4555-8555-555555555555';
const stamp = '2026-11-09T10:00:00Z';

async function fixture(page: Page, withStory = false) {
  await page.addInitScript(
    ({ accountId, spaceId }) => {
      localStorage.setItem(
        `eimir:product-tour:v1:${accountId}:${spaceId}`,
        'seen',
      );
    },
    { accountId: ACCOUNT_ID, spaceId: SPACE_ID },
  );
  const unexpected = await installMocks(page, { strict: true });
  const place = {
    id: placeId,
    spaceId: SPACE_ID,
    name: 'Bostalsee',
    address: 'Am See 1, Nohfelden',
    latitude: 49.56,
    longitude: 7.07,
    description: null,
    createdBy: ACCOUNT_ID,
    creator: ME,
    capabilities: CAPABILITIES,
    createdAt: stamp,
    updatedAt: stamp,
    version: 1,
  };
  const plan = {
    id: planId,
    spaceId: SPACE_ID,
    title: fixtures.planLinkedLists.title,
    description: fixtures.planLinkedLists.description,
    status: 'COMPLETED',
    experiencedOn: '2026-11-08',
    plannedOn: null,
    plannedStart: null,
    plannedEnd: null,
    sourceWishId: null,
    placeId,
    attachments: [],
    createdBy: ACCOUNT_ID,
    creator: ME,
    capabilities: CAPABILITIES,
    createdAt: stamp,
    updatedAt: stamp,
    version: 2,
  };
  const list = (id: string, title: string, completed: boolean | null) => ({
    id,
    spaceId: SPACE_ID,
    title,
    createdBy: ACCOUNT_ID,
    creator: ME,
    capabilities: CAPABILITIES,
    createdAt: stamp,
    updatedAt: stamp,
    version: 1,
    items:
      completed === null
        ? []
        : [
            {
              id: `${id}-item`,
              collectionId: id,
              title: 'Picknickdecke',
              completed,
              position: 0,
              createdBy: ACCOUNT_ID,
              creator: ME,
              capabilities: CAPABILITIES,
              createdAt: stamp,
              updatedAt: stamp,
              version: 1,
            },
          ],
  });
  const lists = [
    list('list-z', 'Zeit zu zweit', true),
    list('list-a', 'Alles fürs Picknick', false),
    list('list-empty', 'Ideen', null),
  ];
  const linked = new Set<string>();
  const calls = {
    links: [] as string[],
    planUpdates: [] as Record<string, unknown>[],
    memory: null as Record<string, unknown> | null,
    heart: null as Record<string, unknown> | null,
    failLinks: false,
    failSourceLinks: false,
    sourceLinks: [] as string[],
  };
  const sourceBase = {
    spaceId: SPACE_ID,
    author: ME,
    authorId: ACCOUNT_ID,
    capabilities: CAPABILITIES,
    happenedOn: '2026-11-08',
    createdAt: stamp,
    updatedAt: stamp,
    version: 1,
    attachments: [],
    tags: [],
    selectedCoverAttachmentId: null,
  };
  const storySources = [
    {
      slug: 'memories',
      kind: 'MEMORY',
      value: {
        ...sourceBase,
        id: 'memory-linked',
        title: 'Unser Picknick am See',
        body: 'Unser gemeinsamer Rückblick.',
      },
    },
    {
      slug: 'heart-moments',
      kind: 'HEART_MOMENT',
      value: {
        ...sourceBase,
        id: 'heart-linked',
        text: 'Mit dir war dieser Tag besonders.',
        emotion: 'LOVED',
        visibility: 'SHARED',
        attachment: null,
        location: null,
      },
    },
    {
      slug: 'milestones',
      kind: 'MILESTONE',
      value: {
        ...sourceBase,
        id: 'milestone-linked',
        title: 'Unser erster gemeinsamer Ausflug',
        body: 'Ein wichtiger Tag für uns.',
      },
    },
  ];
  const sourceResources = new Map<string, Record<string, unknown>>(
    storySources.map(({ slug, value }) => [`${slug}/${value.id}`, value]),
  );
  const sourcePlans = new Map(
    storySources.map(({ slug, value }) => [
      `${slug}/${value.id}`,
      new Set(withStory ? [planId] : []),
    ]),
  );
  let savedMemory: Record<string, unknown> | null = null;
  let savedHeart: Record<string, unknown> | null = null;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    if (path === `${base}/plans/${planId}/story`) {
      const items = [...sourceResources].flatMap(([key, source]) => {
        if (
          !sourcePlans.get(key)?.has(planId) ||
          source.visibility === 'PRIVATE'
        )
          return [];
        const kind = key.startsWith('memories/')
          ? 'MEMORY'
          : key.startsWith('heart-moments/')
            ? 'HEART_MOMENT'
            : 'MILESTONE';
        const field =
          kind === 'MEMORY'
            ? 'memory'
            : kind === 'HEART_MOMENT'
              ? 'heartMoment'
              : 'milestone';
        return [{ kind, effectiveDate: source.happenedOn, [field]: source }];
      });
      return route.fulfill({
        json: { items, nextCursor: null, hasMore: false },
      });
    }
    const sourcePath = path.slice(base.length + 1);
    const relation = sourcePath.match(
      /^(memories|heart-moments|milestones)\/([^/]+)\/plans(?:\/([^/]+))?$/,
    );
    if (relation) {
      const key = `${relation[1]}/${relation[2]}`;
      const linkedPlans = sourcePlans.get(key) ?? new Set<string>();
      sourcePlans.set(key, linkedPlans);
      if (method === 'GET')
        return route.fulfill({ json: { items: [...linkedPlans] } });
      if (sourceResources.get(key)?.visibility === 'PRIVATE')
        return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
      if (method === 'PUT') {
        if (calls.failSourceLinks)
          return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } });
        linkedPlans.add(relation[3]);
        calls.sourceLinks.push(key);
      } else if (method === 'DELETE') linkedPlans.delete(relation[3]);
      else throw new Error(`Unexpected source relation method: ${method}`);
      return route.fulfill({ status: 204 });
    }
    if (method === 'GET' && sourceResources.has(sourcePath))
      return route.fulfill({ json: sourceResources.get(sourcePath) });
    if (
      method === 'GET' &&
      /\/(places|comments)$/.test(sourcePath) &&
      sourceResources.has(sourcePath.replace(/\/(places|comments)$/, ''))
    )
      return route.fulfill({
        json: { items: [], nextCursor: null, hasMore: false },
      });
    if (path === `${base}/plans/${planId}`) {
      if (method === 'PATCH') {
        const update = request.postDataJSON();
        calls.planUpdates.push(update);
        Object.assign(plan, update, { version: plan.version + 1 });
      }
      return route.fulfill({ json: plan });
    }
    if (path === `${base}/plans/${planId}/collections`)
      return route.fulfill({
        json: lists.filter((item) => linked.has(item.id)),
      });
    if (path.startsWith(`${base}/plans/${planId}/collections/`)) {
      const id = path.split('/').at(-1)!;
      if (method === 'PUT') {
        if (calls.failLinks)
          return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } });
        linked.add(id);
        calls.links.push(id);
      } else if (method === 'DELETE') linked.delete(id);
      else throw new Error(`Unexpected relation method: ${method}`);
      return route.fulfill({ status: 204 });
    }
    if (path === `${base}/plans`)
      return route.fulfill({
        json: { items: [plan], nextCursor: null, hasMore: false },
      });
    if (path === `${base}/places/${placeId}`)
      return route.fulfill({ json: place });
    if (path === `${base}/places`)
      return route.fulfill({
        json: { items: [place], nextCursor: null, hasMore: false },
      });
    if (path === `${base}/collections`) {
      const scope = url.searchParams.get('scope') ?? 'ALL';
      return route.fulfill({
        json: {
          items: lists.filter((item) => {
            const done =
              item.items.length > 0 &&
              item.items.every((entry) => entry.completed);
            return scope === 'ALL' || (scope === 'COMPLETED' ? done : !done);
          }),
          nextCursor: null,
          hasMore: false,
        },
      });
    }
    const selectedList = lists.find(
      (item) => path === `${base}/collections/${item.id}`,
    );
    if (selectedList) return route.fulfill({ json: selectedList });
    if (
      method === 'PATCH' &&
      path.includes('/collections/') &&
      path.includes('/items/')
    ) {
      const item = lists
        .flatMap((list) => list.items)
        .find((entry) => path.endsWith(`/${entry.id}`))!;
      Object.assign(item, request.postDataJSON(), {
        version: item.version + 1,
      });
      return route.fulfill({ json: item });
    }
    if (path === `${base}/dashboard/preferences`)
      return route.fulfill({ json: { items: [] } });
    if (path === `${base}/memories` && method === 'POST') {
      calls.memory = request.postDataJSON();
      savedMemory = {
        ...calls.memory,
        id: 'memory-new',
        spaceId: SPACE_ID,
        author: ME,
        authorId: ACCOUNT_ID,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachments: [],
        createdAt: stamp,
        updatedAt: stamp,
        version: 1,
      };
      sourceResources.set('memories/memory-new', savedMemory);
      return route.fulfill({ status: 201, json: savedMemory });
    }
    if (path === `${base}/memories/memory-new`)
      return route.fulfill({ json: savedMemory });
    if (path === `${base}/memories/memory-new/places`)
      return route.fulfill({
        json: {
          items: calls.memory?.placeIds ? [place] : [],
          hasMore: false,
          nextCursor: null,
        },
      });
    if (
      path === `${base}/memories/memory-new/plans/${planId}` &&
      method === 'PUT'
    )
      return route.fulfill({ status: 204 });
    if (path === `${base}/memories/memory-new/comments`)
      return route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    if (path === `${base}/heart-moments` && method === 'POST') {
      calls.heart = request.postDataJSON();
      savedHeart = {
        ...calls.heart,
        id: 'heart-new',
        spaceId: SPACE_ID,
        author: ME,
        authorId: ACCOUNT_ID,
        capabilities: CAPABILITIES,
        attachment: null,
        attachments: [],
        createdAt: stamp,
        updatedAt: stamp,
        version: 1,
      };
      sourceResources.set('heart-moments/heart-new', savedHeart);
      return route.fulfill({ status: 201, json: savedHeart });
    }
    if (path === `${base}/heart-moments/heart-new`)
      return route.fulfill({ json: savedHeart });
    if (path === `${base}/heart-moments/heart-new/places`)
      return route.fulfill({
        json: {
          items: calls.heart?.placeId ? [place] : [],
          hasMore: false,
          nextCursor: null,
        },
      });
    if (path === `${base}/heart-moments/heart-new/comments`)
      return route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    if (path === `${base}/milestones` && method === 'POST') {
      const saved = {
        ...sourceBase,
        ...request.postDataJSON(),
        id: 'milestone-new',
      };
      sourceResources.set('milestones/milestone-new', saved);
      return route.fulfill({ status: 201, json: saved });
    }
    if (await fulfillDefaultProductContext(route)) return;
    return route.fallback();
  });
  await signIn(page);
  await page.goto(`/plan/plans/${planId}`);
  await expect(
    page.getByRole('heading', { name: plan.title, exact: true }),
  ).toBeVisible();
  return {
    unexpected,
    calls,
    lists,
    linked,
    place,
    plan,
    storySources,
    sourcePlans,
  };
}

async function noOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    outside: [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > innerWidth + 1;
      })
      .slice(0, 12)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        right: element.getBoundingClientRect().right,
      })),
  }));
  expect(layout.width, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.viewport + 1,
  );
}

for (const view of [
  { width: 360, theme: 'light', large: false },
  { width: 390, theme: 'dark', large: false },
  { width: 430, theme: 'light', large: false },
  { width: 1280, theme: 'dark', large: false },
  { width: 320, theme: 'light', large: true },
] as const) {
  test(`canonical list linking and return at ${view.width}px ${view.theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    await page.emulateMedia({
      colorScheme: view.theme,
      reducedMotion: 'reduce',
    });
    const state = await fixture(page);
    if (view.large)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await expect(
      page.getByRole('button', { name: copy.collection.create, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: copy.collection.planHeading }),
    ).toHaveCount(0);
    await captureScreenshot(
      page,
      testInfo,
      `plan-without-lists-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    await page
      .getByRole('button', { name: de.common.edit, exact: true })
      .click();
    await page
      .locator('#plan-edit-section')
      .getByRole('button', { name: copy.collection.create, exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: copy.collection.choose });
    await expect(dialog).toBeVisible();
    const choices = dialog.getByRole('checkbox');
    await expect(choices).toHaveCount(3);
    expect(
      await choices.evaluateAll((nodes) =>
        nodes.map((node) => node.closest('label')?.textContent),
      ),
    ).toEqual([
      expect.stringContaining('Alles fürs Picknick'),
      expect.stringContaining('Ideen'),
      expect.stringContaining('Zeit zu zweit'),
    ]);
    await dialog.getByRole('checkbox', { name: /Alles fürs Picknick/ }).check();
    await dialog.getByRole('checkbox', { name: /Zeit zu zweit/ }).check();
    await noOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await captureScreenshot(
      page,
      testInfo,
      `lists-picker-${view.width}-${view.theme}.png`,
    );
    await dialog
      .getByRole('button', { name: copy.collection.link, exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: copy.collection.create, exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole('link', { name: /Alles fürs Picknick/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Zeit zu zweit/ }),
    ).toBeVisible();
    expect(state.calls.links).toEqual(['list-a', 'list-z']);
    await captureScreenshot(
      page,
      testInfo,
      `plan-lists-edit-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    await page
      .getByRole('button', { name: de.common.cancel, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: de.common.edit, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: copy.collection.create, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Verknüpfung zu/ }),
    ).toHaveCount(0);
    await noOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await captureScreenshot(
      page,
      testInfo,
      `plan-lists-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    await page.getByRole('link', { name: /Alles fürs Picknick/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Alles fürs Picknick', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: copy.collection.markDone.replace('{{title}}', 'Picknickdecke'),
      })
      .click();
    await expect(
      page.getByRole('button', {
        name: copy.collection.markOpen.replace('{{title}}', 'Picknickdecke'),
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: taskBoundary.back, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: state.plan.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Alles fürs Picknick/ }),
    ).toContainText('1 erledigt');
    await expect(
      page.getByRole('button', { name: copy.collection.create, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Verknüpfung zu/ }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: de.common.edit, exact: true })
      .click();
    await page
      .getByRole('button', {
        name: copy.collection.unlink.replace(
          '{{title}}',
          'Alles fürs Picknick',
        ),
      })
      .click();
    await expect(
      page.getByRole('link', { name: /Alles fürs Picknick/ }),
    ).toHaveCount(0);
    expect(state.lists).toHaveLength(3);
    await page
      .getByRole('button', { name: copy.common.saveChanges, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: de.common.edit, exact: true }),
    ).toBeVisible();
    expect(state.calls.planUpdates).toHaveLength(1);
    await expect(
      page.getByRole('button', { name: copy.collection.create, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Verknüpfung zu/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: /Zeit zu zweit/ }),
    ).toBeVisible();
    await noOverflow(page);
    await page.goto('/more/collections?scope=COMPLETED');
    if (view.large)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await expect(
      page.getByRole('link', { name: /Zeit zu zweit/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: copy.collection.scope.COMPLETED,
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await noOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await captureScreenshot(
      page,
      testInfo,
      `lists-completed-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    expect(state.unexpected).toEqual([]);
  });
}

test('completed-list scope survives detail return and reopened items leave that scope', async ({
  page,
}, testInfo) => {
  const state = await fixture(page);
  await page.goto('/more/collections');
  await page
    .getByRole('button', { name: copy.collection.scope.COMPLETED, exact: true })
    .click();
  await expect(page.getByRole('link', { name: /Zeit zu zweit/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ideen/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Zeit zu zweit/ }).click();
  await page
    .getByRole('button', {
      name: copy.collection.markOpen.replace('{{title}}', 'Picknickdecke'),
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: copy.collection.markDone.replace('{{title}}', 'Picknickdecke'),
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .click();
  await expect(page).toHaveURL(/\/more\/collections\?scope=COMPLETED$/);
  await expect(
    page.getByRole('button', {
      name: copy.collection.scope.COMPLETED,
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(copy.collection.emptyScope)).toBeVisible();
  await captureScreenshot(page, testInfo, 'completed-lists-after-reopen.png');
  await page
    .getByRole('button', { name: copy.collection.scope.OPEN, exact: true })
    .click();
  await expect(page.getByRole('link', { name: /Zeit zu zweit/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ideen/ })).toBeVisible();
  expect(state.unexpected).toEqual([]);
});

test('Memory continuation saves the canonical source Place and returns to the completed Plan', async ({
  page,
}, testInfo) => {
  const state = await fixture(page);
  await page
    .getByRole('button', { name: copy.planStory.memoryAction, exact: true })
    .click();
  await expect(
    page.getByText(state.place.address, { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(de.memory.bodyLabel)).toHaveValue(
    state.plan.description,
  );
  await page.getByLabel(de.memory.bodyLabel).fill('Unser eigener Rückblick.');
  await captureScreenshot(page, testInfo, 'memory-source-place.png', {
    fullPage: true,
  });
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(page).toHaveURL(/\/story\/memories\/memory-new$/);
  expect(state.calls.memory?.placeIds).toEqual([placeId]);
  await expect(
    page.getByText('Unser eigener Rückblick.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/plan/plans/${planId}$`));
  await expect(
    page.getByRole('link', {
      name: /Ein Tag am See.*Erinnerung|Erinnerung.*Ein Tag am See/,
    }),
  ).toBeVisible();
  expect(state.unexpected).toEqual([]);
});

test('private HeartMoment continuation saves a protected location snapshot', async ({
  page,
}, testInfo) => {
  const state = await fixture(page);
  await page
    .getByRole('button', {
      name: copy.planStory.heartMomentAction,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', { name: state.place.name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole('radio', {
      name: storyCopy.heartMomentProduct.visibilityPrivate,
      exact: true,
    })
    .check();
  await captureScreenshot(page, testInfo, 'heart-source-place-private.png', {
    fullPage: true,
  });
  await page
    .getByRole('button', {
      name: storyCopy.heartMomentProduct.save,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/story\/heart-moments\/heart-new$/);
  expect(state.calls.heart?.visibility).toBe('PRIVATE');
  expect(state.calls.heart?.placeId).toBeUndefined();
  expect(state.calls.heart?.location).toEqual({
    name: state.place.name,
    address: state.place.address,
    latitude: state.place.latitude,
    longitude: state.place.longitude,
  });
  expect(state.calls.sourceLinks).not.toContain('heart-moments/heart-new');
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/plan/plans/${planId}$`));
  expect(state.unexpected).toEqual([]);
});

for (const view of [
  { width: 360, theme: 'light', large: false },
  { width: 390, theme: 'dark', large: false },
  { width: 430, theme: 'light', large: false },
  { width: 1280, theme: 'dark', large: false },
  { width: 320, theme: 'light', large: true },
] as const) {
  test(`completed Plan and all three source backlinks at ${view.width}px ${view.theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    await page.emulateMedia({
      colorScheme: view.theme,
      reducedMotion: 'reduce',
    });
    const state = await fixture(page, true);
    if (view.large)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const context = page.getByRole('region', {
      name: copy.planStory.linksHeading,
    });
    await expect(context.getByRole('link')).toHaveCount(3);
    await noOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await captureScreenshot(
      page,
      testInfo,
      `plan-story-${view.width}-${view.theme}.png`,
      { fullPage: true },
    );
    for (const source of state.storySources) {
      const title =
        'title' in source.value ? source.value.title : source.value.text;
      await context.getByRole('link', { name: new RegExp(title) }).click();
      await expect(page).toHaveURL(
        new RegExp(`/story/${source.slug}/${source.value.id}$`),
      );
      const reverse = page.getByRole('region', {
        name:
          source.kind === 'MEMORY'
            ? memoryCopy.planning.heading
            : copy.planStory.plansHeading,
      });
      await expect(
        reverse.getByRole('link', { name: new RegExp(state.plan.title) }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: copy.planStory.addPlan,
          exact: true,
        }),
      ).toHaveCount(0);
      await noOverflow(page);
      if (source.kind === 'HEART_MOMENT')
        await captureScreenshot(
          page,
          testInfo,
          `heart-plan-backlink-${view.width}-${view.theme}.png`,
          { fullPage: true },
        );
      await reverse
        .getByRole('link', { name: new RegExp(state.plan.title) })
        .click();
      await expect(page).toHaveURL(new RegExp(`/plan/plans/${planId}$`));
      await expect(context.getByRole('link')).toHaveCount(3);
    }
    expect(state.calls.sourceLinks).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });
}

test('shared HeartMoment capture retains its Plan in both directions', async ({
  page,
}) => {
  const state = await fixture(page);
  state.calls.failSourceLinks = true;
  await page
    .getByRole('button', {
      name: copy.planStory.heartMomentAction,
      exact: true,
    })
    .click();
  await page
    .getByLabel(storyCopy.heartMomentProduct.textLabel, { exact: true })
    .fill('Dieser Tag bleibt bei uns.');
  await page
    .getByRole('button', {
      name: storyCopy.heartMomentProduct.save,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/story\/heart-moments\/heart-new$/);
  const reverse = page.getByRole('region', {
    name: copy.planStory.plansHeading,
  });
  await expect(
    page.getByText('Dieser Tag bleibt bei uns.', { exact: true }),
  ).toBeVisible();
  await expect(
    reverse.getByRole('button', { name: de.common.retry, exact: true }),
  ).toBeVisible();
  expect(state.calls.sourceLinks).toEqual([]);
  state.calls.failSourceLinks = false;
  await reverse
    .getByRole('button', { name: de.common.retry, exact: true })
    .click();
  await expect(
    reverse.getByRole('link', { name: new RegExp(state.plan.title) }),
  ).toBeVisible();
  expect(state.calls.sourceLinks).toEqual(['heart-moments/heart-new']);
  await reverse.getByRole('link').click();
  await expect(
    page
      .getByRole('region', { name: copy.planStory.linksHeading })
      .getByRole('link', { name: /Dieser Tag bleibt bei uns/ }),
  ).toBeVisible();
  expect(state.unexpected).toEqual([]);
});

test('Milestone capture retains its Plan and existing Milestones can unlink and relink in Edit', async ({
  page,
}) => {
  const state = await fixture(page);
  await page
    .getByRole('button', { name: copy.planStory.milestoneAction, exact: true })
    .click();
  await page
    .getByLabel(storyCopy.milestoneProduct.titleLabel, { exact: true })
    .fill('Unser erster Tag am See');
  await page
    .getByRole('button', { name: storyCopy.milestoneProduct.save, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\/milestones\/milestone-new$/);
  const reverse = page.getByRole('region', {
    name: copy.planStory.plansHeading,
  });
  await expect(
    reverse.getByRole('link', { name: new RegExp(state.plan.title) }),
  ).toBeVisible();
  expect(state.calls.sourceLinks).toEqual(['milestones/milestone-new']);
  await reverse.getByRole('link').click();
  await page
    .getByRole('region', { name: copy.planStory.linksHeading })
    .getByRole('link', { name: /Unser erster Tag am See/ })
    .click();
  await page
    .getByRole('link', { name: storyCopy.milestoneProduct.edit, exact: true })
    .click();
  await page
    .getByRole('button', {
      name: memoryCopy.planning.remove.replace('{{title}}', state.plan.title),
    })
    .click();
  await expect(
    page
      .getByRole('region', { name: memoryCopy.planning.heading })
      .getByText(state.plan.title, { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', {
      name: copy.planStory.addPlan,
      exact: true,
    })
    .click();
  const picker = page.getByRole('dialog', {
    name: copy.planStory.addPlan,
  });
  await picker
    .getByRole('button', { name: new RegExp(state.plan.title) })
    .click();
  await expect(picker).not.toBeVisible();
  expect(state.calls.sourceLinks).toEqual([
    'milestones/milestone-new',
    'milestones/milestone-new',
  ]);
  expect(state.unexpected).toEqual([]);
});

test('Plan field drafts survive attempted list and new-list navigation', async ({
  page,
}) => {
  const state = await fixture(page);
  state.linked.add('list-a');
  await page.reload();
  await page.getByRole('button', { name: de.common.edit, exact: true }).click();
  const description = page.getByLabel(copy.common.description, { exact: true });
  await description.fill('Unser noch nicht gespeicherter Plantext.');
  await page
    .locator('#plan-edit-section')
    .getByRole('link', { name: /Alles fürs Picknick/ })
    .click();
  const discard = page.getByRole('alertdialog', {
    name: copy.common.discardTitle,
  });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: copy.common.keepEditing }).click();
  await expect(description).toHaveValue(
    'Unser noch nicht gespeicherter Plantext.',
  );
  await page
    .getByRole('button', { name: copy.collection.create, exact: true })
    .click();
  await page
    .getByRole('dialog', { name: copy.collection.choose })
    .getByRole('button', { name: copy.collection.createNew })
    .click();
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: copy.common.keepEditing }).click();
  await expect(page).toHaveURL(new RegExp(`/plan/plans/${planId}$`));
  await expect(description).toHaveValue(
    'Unser noch nicht gespeicherter Plantext.',
  );
  expect(state.unexpected).toEqual([]);
});

test('related Story continues past an empty page with a valid next cursor', async ({
  page,
}) => {
  const state = await fixture(page, true);
  const cursors: Array<string | null> = [];
  await page.route(`**/plans/${planId}/story*`, async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    cursors.push(cursor);
    if (cursor) return route.fallback();
    return route.fulfill({
      json: { items: [], hasMore: true, nextCursor: 'after-empty' },
    });
  });
  await page.reload();
  await expect(
    page
      .getByRole('region', { name: copy.planStory.linksHeading })
      .getByRole('link'),
  ).toHaveCount(3);
  expect(cursors).toEqual([null, 'after-empty']);
  expect(state.unexpected).toEqual([]);
});
