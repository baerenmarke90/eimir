import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import m5s5 from '../../src/i18n/locales/m5s5';
import taskSheets from '../../src/i18n/locales/taskSheets';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { fulfillFreeEntitlements } from '../support/freeEntitlements';
import { expectToday } from '../support/today';

/**
 * #1808 (step B2): a shopping list keeps changes made without a connection on
 * the device and sends them once the connection is back. The server fixture
 * below honors `Idempotency-Key` like the real endpoint (first request 201,
 * an equivalent repeat 200 with the original item).
 */
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';
const COLLECTION_ID = '00000000-0000-0000-0000-000000000030';
const AT = '2026-11-14T10:00:00Z';
const fill = (template: string, values: Record<string, string | number> = {}) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
    template,
  );
const outboxText = m5s3.collection.outbox;
const waiting = (count: number) =>
  fill(
    count === 1
      ? outboxText.waitingOffline_one
      : outboxText.waitingOffline_other,
    { count },
  );

interface Item {
  id: string;
  collectionId: string;
  createdBy: string;
  title: string;
  quantity: string | null;
  completed: boolean;
  completedBy: string | null;
  completedAt: string | null;
  position: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  creator: { id: string; displayName: string };
  completer: { id: string; displayName: string } | null;
  capabilities: { canComment: boolean; canDelete: boolean; canEdit: boolean };
}

function makeItem(id: string, title: string, position: number): Item {
  return {
    id,
    collectionId: COLLECTION_ID,
    createdBy: ACCOUNT_ID,
    title,
    quantity: null,
    completed: false,
    completedBy: null,
    completedAt: null,
    position,
    version: 1,
    createdAt: AT,
    updatedAt: AT,
    creator: { id: ACCOUNT_ID, displayName: 'Anna' },
    completer: null,
    capabilities: { canComment: false, canDelete: true, canEdit: true },
  };
}

async function installShoppingMocks(page: Page) {
  const items: Item[] = [
    makeItem('00000000-0000-0000-0000-000000000031', 'Milch', 0),
    makeItem('00000000-0000-0000-0000-000000000032', 'Brot', 1),
    makeItem('00000000-0000-0000-0000-000000000033', 'Äpfel', 2),
  ];
  let version = 1;
  let serial = 0;
  let pinnedCollectionId: string | null = null;
  let dashboardGetCount = 0;
  // The couple has no shopping list until one is created.
  let hasShoppingList = true;
  const collectionListQueries: string[] = [];
  const sharedAchievementsEnabled = false;
  const created = new Map<string, Item>();
  const createRequests: {
    key: string | undefined;
    title: string;
    status: number;
  }[] = [];
  const updates: { itemId: string; completed?: boolean; ifMatch?: string }[] =
    [];
  const createBodies: { title: string; quantity?: string | null }[] = [];
  const suggestions: {
    id: string;
    title: string;
    quantity: string | null;
    lastBoughtAt: string;
    timesBought: number;
  }[] = [];
  const finishRequests: string[][] = [];
  const createCollectionBodies: { title: string; kind?: string }[] = [];
  const state = { failCreates: false, createCount: 0, achievements: false };

  const collection = () => ({
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    createdAt: AT,
    createdBy: ACCOUNT_ID,
    creator: { id: ACCOUNT_ID, displayName: 'Anna' },
    id: COLLECTION_ID,
    kind: 'SHOPPING',
    items,
    spaceId: SPACE_ID,
    title: 'Einkauf',
    updatedAt: AT,
    version,
  });

  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillFreeEntitlements(route, SPACE_ID)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const json = async (
      body: unknown,
      status = 200,
      headers: Record<string, string> = {},
    ) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await json({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
        auth: {
          localPassword: true,
          passkey: true,
          magicLink: true,
          oidc: false,
        },
      });
      return;
    }
    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await json({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'pinned-list-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'pinned-list-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await json({ displayName: 'Anna', id: ACCOUNT_ID });
      return;
    }
    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      await json({
        accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        accessToken: 'pinned-list-refreshed-token',
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        refreshToken: 'pinned-list-refresh-token-2',
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await json({ serverAdmin: false });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await json([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await json({
        id: SPACE_ID,
        createdAt: '2026-01-01T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Anna' },
          { id: PARTNER_ID, displayName: 'Ben' },
        ],
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await json({
        durationDisplayMode: 'YEARS_MONTHS',
        relationshipStartedOn: '2026-01-01',
        showRelationshipDuration: true,
        spaceId: SPACE_ID,
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/configuration`
    ) {
      await json(
        {
          canManageSpaceConfiguration: true,
          dailyContextTimezone: 'Europe/Berlin',
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: false,
          energyVisibilityMode: 'MUTUAL_REVEAL',
          loveNotesEnabled: false,
          sharedAchievementsEnabled,
          spaceId: SPACE_ID,
          supportGesturesEnabled: false,
          version: 1,
          vibeCheckEnabled: false,
          vibeVisibilityMode: 'MUTUAL_REVEAL',
        },
        200,
        { ETag: '"1"' },
      );
      return;
    }
    if (
      method === 'GET' &&
      (pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}` ||
        pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}`)
    ) {
      const isPartner = pathname.endsWith(PARTNER_ID);
      await json({
        accountId: isPartner ? PARTNER_ID : ACCOUNT_ID,
        createdAt: '2026-01-01T00:00:00Z',
        displayName: isPartner ? 'Ben' : 'Anna',
        id: isPartner
          ? '00000000-0000-0000-0000-000000000022'
          : '00000000-0000-0000-0000-000000000020',
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await json({
        items: [
          { moduleKey: 'relationship_presence', visible: true },
          { moduleKey: 'upcoming', visible: true, itemLimit: 1 },
          {
            moduleKey: 'pinned_collection',
            visible: true,
            ...(pinnedCollectionId
              ? { selectedCollectionId: pinnedCollectionId }
              : {}),
          },
          { moduleKey: 'keepsake', visible: true },
          { moduleKey: 'relationship_signal', visible: true },
          { moduleKey: 'monthly_highlights', visible: true },
          { moduleKey: 'recent_shared', visible: true },
          { moduleKey: 'shared_story_summary', visible: true },
        ],
      });
      return;
    }
    if (
      method === 'PATCH' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/dashboard/preferences/pinned_collection`
    ) {
      const body = request.postDataJSON() as {
        selectedCollectionId?: string | null;
        visible?: boolean;
      };
      pinnedCollectionId = body.selectedCollectionId ?? null;
      await json({
        moduleKey: 'pinned_collection',
        visible: body.visible ?? true,
        ...(pinnedCollectionId
          ? { selectedCollectionId: pinnedCollectionId }
          : {}),
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      dashboardGetCount += 1;
      await json({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Ben' },
        },
        relationshipDuration: {
          daysTogether: 264,
          displayMode: 'YEARS_MONTHS',
          startedOn: '2026-01-01',
        },
        retrospective: null,
        keepsake: null,
        recentShared: [],
        upcoming: [],
        sharedStorySummary: {
          heartMoments: 0,
          memories: 0,
          milestones: 0,
        },
        thinkingOfYouAvailableAt: null,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await json({ hasMore: false, items: [], nextCursor: null });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await json({ unreadCount: 0 });
      return;
    }
    if (
      (method === 'GET' || method === 'POST') &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await json({ state: 'ACTIVE' });
      return;
    }
    if (
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/suggestions`
    ) {
      await json({ items: suggestions });
      return;
    }
    if (
      method === 'DELETE' &&
      pathname.startsWith(
        `/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/suggestions/`,
      )
    ) {
      const index = suggestions.findIndex(
        (entry) => entry.id === pathname.split('/').at(-1),
      );
      if (index >= 0) suggestions.splice(index, 1);
      await route.fulfill({ status: 204 });
      return;
    }
    if (
      method === 'POST' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/finish`
    ) {
      const body = request.postDataJSON() as { itemIds: string[] };
      finishRequests.push(body.itemIds);
      const taken = items.filter(
        (entry) => entry.completed && body.itemIds.includes(entry.id),
      );
      for (const entry of taken) {
        items.splice(items.indexOf(entry), 1);
        suggestions.push({
          id: `00000000-0000-0000-0000-${String(900 + suggestions.length).padStart(12, '0')}`,
          title: entry.title,
          quantity: entry.quantity,
          lastBoughtAt: AT,
          timesBought: 1,
        });
      }
      items.forEach((entry, position) => {
        entry.position = position;
      });
      if (taken.length) version += 1;
      await json(
        { collection: collection(), finishedCount: taken.length },
        200,
        {
          ETag: `"${version}"`,
          ...(state.achievements && taken.length && items.length === 0
            ? { 'X-Eimir-Shared-Achievement': 'collection-completed' }
            : {}),
        },
      );
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/collections`
    ) {
      collectionListQueries.push(new URL(request.url()).search);
      await json({
        items: hasShoppingList ? [collection()] : [],
        nextCursor: null,
      });
      return;
    }
    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/collections`
    ) {
      const body = request.postDataJSON() as { title: string; kind?: string };
      createCollectionBodies.push(body);
      hasShoppingList = true;
      await json({ ...collection(), title: body.title }, 201, {
        ETag: `"${version}"`,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}`
    ) {
      await json(collection(), 200, { ETag: `"${version}"` });
      return;
    }
    if (
      method === 'PATCH' &&
      pathname.startsWith(
        `/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/items/`,
      )
    ) {
      const item = items.find(
        (entry) => entry.id === pathname.split('/').at(-1),
      );
      if (!item) {
        await json(
          {
            code: 'COLLECTION_ITEM_NOT_FOUND',
            detail: 'Not found.',
            status: 404,
            title: 'Not found',
          },
          404,
        );
        return;
      }
      const body = request.postDataJSON() as {
        completed?: boolean;
        quantity?: string | null;
        title?: string;
      };
      if (body.quantity !== undefined) item.quantity = body.quantity;
      if (body.title !== undefined) item.title = body.title;
      updates.push({
        itemId: item.id,
        completed: body.completed,
        ifMatch: request.headers()['if-match'],
      });
      if (typeof body.completed === 'boolean') {
        item.completed = body.completed;
        item.completedBy = body.completed ? ACCOUNT_ID : null;
        item.completedAt = body.completed ? AT : null;
        item.completer = body.completed
          ? { id: ACCOUNT_ID, displayName: 'Anna' }
          : null;
      }
      item.version += 1;
      await json(item, 200, {
        ETag: `"${item.version}"`,
        'X-Eimir-Collection-Completion-Transition': 'false',
      });
      return;
    }
    if (
      method === 'POST' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/items`
    ) {
      const body = request.postDataJSON() as {
        title: string;
        quantity?: string | null;
      };
      createBodies.push(body);
      const key = request.headers()['idempotency-key'];
      if (state.failCreates) {
        createRequests.push({ key, title: body.title, status: 503 });
        await json(
          {
            code: 'SERVER_ERROR',
            detail: 'The write was not confirmed.',
            status: 503,
            title: 'Service unavailable',
          },
          503,
        );
        return;
      }
      const replay = key ? created.get(key) : undefined;
      if (replay) {
        createRequests.push({ key, title: body.title, status: 200 });
        await json(replay, 200, { ETag: `"${replay.version}"` });
        return;
      }
      const item = makeItem(
        `00000000-0000-0000-0000-${String(40 + serial++).padStart(12, '0')}`,
        body.title,
        items.length,
      );
      item.quantity = body.quantity ?? null;
      items.push(item);
      if (key) created.set(key, item);
      state.createCount += 1;
      version += 1;
      createRequests.push({ key, title: body.title, status: 201 });
      await json(item, 201, { ETag: `"${item.version}"` });
      return;
    }

    await json(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Unexpected ${method} ${pathname}`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return {
    state,
    createRequests: () => createRequests,
    updates: () => updates,
    titles: () => items.map((item) => item.title),
    item: (title: string) => items.find((entry) => entry.title === title),
    createBodies: () => createBodies,
    finishRequests: () => finishRequests,
    suggestionTitles: () => suggestions.map((entry) => entry.title),
    seedSuggestion: (title: string, quantity: string | null = null) => {
      suggestions.push({
        id: `00000000-0000-0000-0000-${String(800 + suggestions.length).padStart(12, '0')}`,
        title,
        quantity,
        lastBoughtAt: AT,
        timesBought: 1,
      });
    },
    createCollectionBodies: () => createCollectionBodies,
    collectionListQueries: () => collectionListQueries,
    withoutShoppingList: () => {
      hasShoppingList = false;
    },
    /** The partner changes the list on their own phone. */
    partnerAdds: (title: string) => {
      items.push({
        ...makeItem(
          `00000000-0000-0000-0000-${String(80 + serial++).padStart(12, '0')}`,
          title,
          items.length,
        ),
        createdBy: PARTNER_ID,
        creator: { id: PARTNER_ID, displayName: 'Ben' },
      });
      version += 1;
    },
    pin: (id: string | null) => {
      pinnedCollectionId = id;
    },
    dashboardGets: () => dashboardGetCount,
  };
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await expect(page).toHaveURL(/\/today$/);
  await expectToday(page);
}

/** For lists whose entries are all in the cart: ready when the heading shows. */
async function openCartList(page: Page): Promise<void> {
  await page.goto(`/plan/collections/${COLLECTION_ID}`);
  await expect(page.getByRole('heading', { name: 'Einkauf' })).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: new RegExp(`^${m5s3.collection.trayShopping} · `),
    }),
  ).toBeVisible();
}

async function openList(page: Page): Promise<void> {
  await page.goto(`/plan/collections/${COLLECTION_ID}`);
  await expect(page.getByRole('heading', { name: 'Einkauf' })).toBeVisible();
  await expect(page.getByText('Milch')).toBeVisible();
}

const addEntry = async (page: Page, title: string) => {
  await page.getByLabel(m5s3.collection.newItem).fill(title);
  await page.getByRole('button', { name: m5s3.collection.addItem }).click();
};

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test('a shopping list keeps changes made without a connection and sends them once when it is back', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await installShoppingMocks(page);
  await signIn(page);
  await openList(page);

  await context.setOffline(true);
  await addEntry(page, 'Hafermilch');
  await page
    .getByRole('button', {
      name: m5s3.collection.markDone.replace('{{title}}', 'Milch'),
    })
    .click();

  await expect(page.getByText('Hafermilch')).toBeVisible();
  await expect(page.getByText(waiting(2))).toBeVisible();
  await expect(page.getByText(outboxText.itemWaiting).first()).toBeAttached();
  expect(api.createRequests()).toEqual([]);

  await context.setOffline(false);

  await expect(page.locator('.shared-list-outbox')).toHaveCount(0);
  await expect(page.getByText(outboxText.itemWaiting)).toHaveCount(0);
  await expect
    .poll(() =>
      api.createRequests().map((entry) => `${entry.status}:${entry.title}`),
    )
    .toEqual(['201:Hafermilch']);
  expect(api.item('Milch')?.completed).toBe(true);
  expect(api.titles()).toEqual(['Milch', 'Brot', 'Äpfel', 'Hafermilch']);
  expect(api.updates()).toHaveLength(1);
});

test('what was kept survives a reload and is sent with the same request identity', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await installShoppingMocks(page);
  await signIn(page);
  await openList(page);
  await context.setOffline(true);
  await addEntry(page, 'Roggenbrot');
  await expect(page.getByText(waiting(1))).toBeVisible();

  // The connection returns, but the server does not take the write yet.
  api.state.failCreates = true;
  await context.setOffline(false);
  await expect.poll(() => api.createRequests().length).toBeGreaterThan(0);
  await page.reload();

  await expect(page.getByText('Roggenbrot')).toBeVisible();
  await expect(page.locator('.shared-list-outbox')).toBeVisible();
  expect(api.titles()).not.toContain('Roggenbrot');

  api.state.failCreates = false;

  await expect(page.locator('.shared-list-outbox')).toHaveCount(0, {
    timeout: 20_000,
  });
  expect(api.titles().filter((title) => title === 'Roggenbrot')).toHaveLength(
    1,
  );
  const keys = new Set(api.createRequests().map((entry) => entry.key));
  expect(keys.size).toBe(1);
  expect(api.state.createCount).toBe(1);
});

const VIEWS = [
  {
    name: '390 light',
    file: '390-light',
    width: 390,
    height: 844,
    scheme: 'light',
  },
  {
    name: '390 dark',
    file: '390-dark',
    width: 390,
    height: 844,
    scheme: 'dark',
  },
  {
    name: '360 light',
    file: '360-light',
    width: 360,
    height: 780,
    scheme: 'light',
  },
  {
    name: '430 light',
    file: '430-light',
    width: 430,
    height: 932,
    scheme: 'light',
  },
  {
    name: '1280 light (Expanded)',
    file: '1280-light',
    width: 1280,
    height: 800,
    scheme: 'light',
  },
] as const;

for (const view of VIEWS) {
  test(`the waiting state is readable, accessible and fits (${view.name})`, async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.emulateMedia({ colorScheme: view.scheme });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    await installShoppingMocks(page);
    await signIn(page);
    await openList(page);
    await page.screenshot({
      path: testInfo.outputPath(`shopping-list-online-${view.file}.png`),
      animations: 'disabled',
    });

    await context.setOffline(true);
    await addEntry(page, 'Hafermilch');
    await page
      .getByRole('button', {
        name: m5s3.collection.markDone.replace('{{title}}', 'Brot'),
      })
      .click();
    await expect(page.getByText(waiting(2))).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `shopping-list-offline-waiting-${view.file}.png`,
      ),
      animations: 'disabled',
    });

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('the waiting state reflows at 320px with text enlarged to 200%', async ({
  page,
  context,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => localStorage.setItem('eimir.theme', 'system'));
  await installShoppingMocks(page);
  await signIn(page);
  await openList(page);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });

  await context.setOffline(true);
  await addEntry(page, 'Hafermilch');
  await expect(page.getByText(waiting(1))).toBeVisible();

  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'shopping-list-offline-waiting-320-large-text.png',
    ),
    animations: 'disabled',
  });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

/**
 * #1808 (step C1): the list page leads with how much is missing and who did
 * what. Anna created the list (rose), Ben is the other person (blue).
 */
function seedComposition(
  api: Awaited<ReturnType<typeof installShoppingMocks>>,
) {
  Object.assign(api.item('Milch') ?? {}, {
    createdBy: PARTNER_ID,
    creator: { id: PARTNER_ID, displayName: 'Ben' },
  });
  Object.assign(api.item('Brot') ?? {}, { quantity: '2' });
  Object.assign(api.item('Äpfel') ?? {}, {
    quantity: '1 kg',
    completed: true,
    completedBy: PARTNER_ID,
    completer: { id: PARTNER_ID, displayName: 'Ben' },
  });
}

const summaryText = m5s3.collection.summary;

for (const view of VIEWS) {
  test(`the list leads with its count, bar, markers and tray (${view.name})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.emulateMedia({ colorScheme: view.scheme });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const api = await installShoppingMocks(page);
    seedComposition(api);
    await signIn(page);
    await openList(page);

    const summary = page.getByRole('region', { name: summaryText.region });
    await expect(summary).toContainText(
      fill(summaryText.shoppingOpen_other, { count: 2 }),
    );
    await expect(summary).toContainText(
      fill(summaryText.shoppingShare, { name: 'Ben', count: 1 }),
    );
    // Compact keeps the cart in a bar above the navigation; Expanded shows
    // the cart section inline.
    if (view.width < 840) {
      await expect(
        page.getByRole('button', {
          name: new RegExp(fill(m5s3.collection.cart.bar_one, { count: 1 })),
        }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole('heading', {
          name: new RegExp(m5s3.collection.trayShopping),
        }),
      ).toBeVisible();
    }
    await expect(page.getByText('2×')).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`shopping-list-composition-${view.file}.png`),
      animations: 'disabled',
    });

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('an entry with a quantity is sent with it and the input stays ready', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await installShoppingMocks(page);
  await signIn(page);
  await openList(page);

  await page.getByLabel(m5s3.collection.newItem).fill('Hafermilch');
  await page.getByLabel(m5s3.collection.quantityLabel).fill('2 l');
  await page.getByRole('button', { name: m5s3.collection.addItem }).click();

  await expect(page.getByText('Hafermilch')).toBeVisible();
  await expect(page.getByText('2 l')).toBeVisible();
  await expect(page.getByLabel(m5s3.collection.newItem)).toBeFocused();
  await expect
    .poll(() => api.createBodies().map((body) => body.quantity))
    .toEqual(['2 l']);
});

test("the partner's new entry shows up on an open list without a reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await installShoppingMocks(page);
  await signIn(page);
  await openList(page);

  api.partnerAdds('Salz');

  await expect(page.getByText('Salz')).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText(fill(m5s3.collection.addedBy, { name: 'Ben' })).first(),
  ).toBeAttached();
});

test('the cart bar opens the cart as a sheet and an entry can be put back', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  const api = await installShoppingMocks(page);
  seedComposition(api);
  await signIn(page);
  await openList(page);

  await page
    .getByRole('button', {
      name: new RegExp(fill(m5s3.collection.cart.bar_one, { count: 1 })),
    })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Äpfel')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('shopping-list-cart-sheet-390-light.png'),
    animations: 'disabled',
  });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await dialog
    .getByRole('button', {
      name: m5s3.collection.markOpen.replace('{{title}}', 'Äpfel'),
    })
    .click();

  await expect.poll(() => api.item('Äpfel')?.completed).toBe(false);
});

test('an entry opens from its name and its quantity is changed in the sheet', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await installShoppingMocks(page);
  await signIn(page);
  await openList(page);

  await page
    .getByRole('button', {
      name: m5s3.collection.openItem.replace('{{title}}', 'Milch'),
    })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(m5s3.collection.quantityLabel).fill('2 l');
  await page.screenshot({
    path: testInfo.outputPath('shopping-list-item-sheet-390-light.png'),
    animations: 'disabled',
  });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await dialog.getByRole('button', { name: m5s3.common.saveChanges }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('2 l')).toBeVisible();
  await expect.poll(() => api.item('Milch')?.quantity).toBe('2 l');
});

test('a shopping list is created from the list overview', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await installShoppingMocks(page);
  await signIn(page);
  await page.goto('/more/collections');

  await page
    .getByRole('button', { name: m5s3.collection.create, exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: m5s3.collection.kind.SHOPPING })
    .click();
  await dialog.getByLabel(m5s3.common.title, { exact: true }).fill('Einkauf');
  await page.screenshot({
    path: testInfo.outputPath('shopping-list-create-390-light.png'),
    animations: 'disabled',
  });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await dialog.getByRole('button', { name: m5s3.common.save }).click();

  await expect(page).toHaveURL(
    new RegExp(`/plan/collections/${COLLECTION_ID}`),
  );
  expect(api.createCollectionBodies()).toEqual([
    { title: 'Einkauf', kind: 'SHOPPING' },
  ]);
});

test('a shopping list opens from its Wir tile as a sheet with the cart bar at its bottom edge', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // The sheet slides in; reduced motion makes its position stable to measure.
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const api = await installShoppingMocks(page);
  seedComposition(api);
  api.pin(COLLECTION_ID);
  await signIn(page);

  const tile = page.locator('.today-section-pinned-collection');
  await expect(
    tile.getByRole('heading', { name: 'Einkauf', level: 3 }),
  ).toBeVisible();
  await tile
    .getByRole('link', {
      name: m5s5.today.wirLists.openAria.replace('{{title}}', 'Einkauf'),
    })
    .click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Einkauf' })).toBeVisible();
  await expect(page).toHaveURL(/\/today$/);
  const bar = sheet.getByRole('button', {
    name: new RegExp(fill(m5s3.collection.cart.bar_one, { count: 1 })),
  });
  await expect(bar).toBeVisible();
  // There is no bottom navigation under the sheet: the bar sits at its edge.
  const sheetBox = await sheet.boundingBox();
  const barBox = await bar.boundingBox();
  expect(sheetBox && barBox).toBeTruthy();
  if (sheetBox && barBox) {
    const gap = sheetBox.y + sheetBox.height - (barBox.y + barBox.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(40);
  }
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('shopping-list-wir-sheet-390-light.png'),
    animations: 'disabled',
  });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  // The cart opens above the list sheet and closing it returns to the list.
  await bar.click();
  await expect(
    page.getByRole('dialog').last().getByText('Äpfel'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet.getByRole('heading', { name: 'Einkauf' })).toBeVisible();

  await sheet.getByRole('button', { name: taskSheets.close }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/today$/);
});

test('suggestions from earlier trips are added in one tap, removed on their own and say who sees them', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  const api = await installShoppingMocks(page);
  api.seedSuggestion('Haferdrink', '2 l');
  api.seedSuggestion('Butter');
  api.seedSuggestion('Salz');
  await signIn(page);
  await openList(page);

  const chips = page.getByRole('region', {
    name: m5s3.collection.suggestions.heading,
  });
  await expect(chips).toBeVisible();
  await expect(chips.getByText(m5s3.collection.suggestions.note)).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('shopping-list-suggestions-390-light.png'),
    animations: 'disabled',
  });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await chips
    .getByRole('button', {
      name: m5s3.collection.suggestions.add.replace(
        '{{title}}',
        'Haferdrink · 2 l',
      ),
    })
    .click();
  await expect(page.getByText('Haferdrink')).toBeVisible();
  await expect
    .poll(() => api.createBodies().map((body) => body.quantity))
    .toEqual(['2 l']);
  // What is on the list is not suggested again.
  await expect(chips.getByText('Haferdrink · 2 l')).toHaveCount(0);

  await chips
    .getByRole('button', {
      name: m5s3.collection.suggestions.remove.replace('{{title}}', 'Butter'),
    })
    .click();
  await expect(chips.getByText('Butter')).toHaveCount(0);
  await expect.poll(() => api.suggestionTitles()).not.toContain('Butter');
  await expect(chips.getByText('Salz')).toBeVisible();
});

test('Einkauf fertig empties the cart, keeps the titles as suggestions and shows the end state', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  const api = await installShoppingMocks(page);
  seedComposition(api);
  // Everything but the bread is bought, so the cart holds two entries.
  Object.assign(api.item('Milch') ?? {}, {
    completed: true,
    completedBy: ACCOUNT_ID,
    completer: { id: ACCOUNT_ID, displayName: 'Anna' },
  });
  await signIn(page);
  await openCartList(page);

  await page
    .getByRole('button', {
      name: new RegExp(fill(m5s3.collection.cart.bar_other, { count: 2 })),
    })
    .click();
  const cart = page.getByRole('dialog');
  await page.screenshot({
    path: testInfo.outputPath('shopping-list-finish-cart-390-light.png'),
    animations: 'disabled',
  });
  await cart
    .getByRole('button', { name: m5s3.collection.finish.action })
    .click();

  await expect(
    page.getByText(
      m5s3.collection.endState.done_other.replace('{{count}}', '2'),
    ),
  ).toBeVisible();
  expect(api.finishRequests()).toHaveLength(1);
  expect(api.finishRequests()[0]).toHaveLength(2);
  expect(api.titles()).toEqual(['Brot']);
  expect(api.suggestionTitles().sort()).toEqual(['Milch', 'Äpfel']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('shopping-list-finished-390-light.png'),
    animations: 'disabled',
  });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('finishing when nothing is left to buy is a shared moment when the couple has it on', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('eimir.theme', 'system'));
  const api = await installShoppingMocks(page);
  api.state.achievements = true;
  for (const title of ['Milch', 'Brot', 'Äpfel']) {
    Object.assign(api.item(title) ?? {}, {
      completed: true,
      completedBy: title === 'Brot' ? ACCOUNT_ID : PARTNER_ID,
      completer:
        title === 'Brot'
          ? { id: ACCOUNT_ID, displayName: 'Anna' }
          : { id: PARTNER_ID, displayName: 'Ben' },
    });
  }
  await signIn(page);
  await openCartList(page);

  await page
    .getByRole('button', {
      name: new RegExp(fill(m5s3.collection.cart.bar_other, { count: 3 })),
    })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: m5s3.collection.finish.action })
    .click();

  await expect(page.getByText(m5s3.collection.endState.title)).toBeVisible();
  const shares = [
    m5s3.collection.endState.share
      .replace('{{name}}', 'Anna')
      .replace('{{count}}', '1'),
    m5s3.collection.endState.share
      .replace('{{name}}', 'Ben')
      .replace('{{count}}', '2'),
  ].join(', ');
  await expect(
    page.getByText(
      m5s3.collection.endState.bodyShares.replace('{{shares}}', shares),
    ),
  ).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('shopping-list-moment-390-dark.png'),
    animations: 'disabled',
  });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('Einkauf fertig waits for a connection and says so', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await installShoppingMocks(page);
  seedComposition(api);
  await signIn(page);
  await openCartList(page);

  await context.setOffline(true);
  await page
    .getByRole('button', {
      name: new RegExp(fill(m5s3.collection.cart.bar_one, { count: 1 })),
    })
    .click();
  const cart = page.getByRole('dialog');

  await expect(
    cart.getByRole('button', { name: m5s3.collection.finish.action }),
  ).toBeDisabled();
  await expect(cart.getByText(m5s3.collection.finish.offline)).toBeVisible();
  expect(api.finishRequests()).toEqual([]);
});

const POLISH_VIEWS = [
  {
    name: '390 dark',
    file: '390-dark',
    width: 390,
    height: 844,
    scheme: 'dark',
  },
  {
    name: '360 light',
    file: '360-light',
    width: 360,
    height: 780,
    scheme: 'light',
  },
  {
    name: '430 light',
    file: '430-light',
    width: 430,
    height: 932,
    scheme: 'light',
  },
  {
    name: '1280 light (Expanded)',
    file: '1280-light',
    width: 1280,
    height: 800,
    scheme: 'light',
  },
] as const;

for (const view of POLISH_VIEWS) {
  test(`suggestions, the cart and the finish action fit and pass axe (${view.name})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.emulateMedia({ colorScheme: view.scheme });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const api = await installShoppingMocks(page);
    seedComposition(api);
    api.seedSuggestion('Haferdrink', '2 l');
    api.seedSuggestion('Butter');
    await signIn(page);
    await openList(page);

    await expect(
      page.getByRole('region', { name: m5s3.collection.suggestions.heading }),
    ).toBeVisible();
    // Compact keeps the cart in the bar, Expanded shows the finish action inline.
    if (view.width < 840) {
      await expect(
        page.getByRole('button', {
          name: new RegExp(fill(m5s3.collection.cart.bar_one, { count: 1 })),
        }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole('button', { name: m5s3.collection.finish.action }),
      ).toBeVisible();
    }
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`shopping-list-polish-${view.file}.png`),
      animations: 'disabled',
    });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('suggestions and the finish action reflow at 320px with text enlarged to 200%', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => localStorage.setItem('eimir.theme', 'system'));
  const api = await installShoppingMocks(page);
  seedComposition(api);
  api.seedSuggestion('Haferdrink', '2 l');
  await signIn(page);
  await openList(page);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });

  await expect(
    page.getByRole('region', { name: m5s3.collection.suggestions.heading }),
  ).toBeVisible();
  await expectNoOverflow(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('a checked entry glides into the cart, and with reduced motion it only appears there', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installShoppingMocks(page);
  await signIn(page);
  await openList(page);
  // The marker lives for a short time, so the style is read where it is seen.
  const seenWith = (
    property: 'animationName' | 'animationDuration',
    value: string,
  ) =>
    page.waitForFunction(
      ([name, expected]) => {
        const element = document.querySelector('[data-arriving="true"]');
        return (
          element !== null &&
          getComputedStyle(element)[name as 'animationName'] === expected
        );
      },
      [property, value] as const,
    );

  await page
    .getByRole('button', {
      name: m5s3.collection.markDone.replace('{{title}}', 'Brot'),
    })
    .click();
  await seenWith('animationName', 'shared-list-row-arrive');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page
    .getByRole('button', {
      name: m5s3.collection.markDone.replace('{{title}}', 'Äpfel'),
    })
    .click();
  await seenWith('animationDuration', '0s');
});

for (const view of [
  {
    name: '390 light',
    file: '390-light',
    width: 390,
    height: 844,
    scheme: 'light',
  },
  {
    name: '360 dark',
    file: '360-dark',
    width: 360,
    height: 780,
    scheme: 'dark',
  },
  {
    name: '1280 light (Expanded)',
    file: '1280-light',
    width: 1280,
    height: 800,
    scheme: 'light',
  },
] as const) {
  test(`the short way to a first shopping list fits and passes axe (${view.name})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.emulateMedia({ colorScheme: view.scheme });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const api = await installShoppingMocks(page);
    api.withoutShoppingList();
    await signIn(page);
    await page.goto('/more/collections');

    await expect(
      page.getByRole('heading', {
        name: m5s3.collection.defaultShopping.heading,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: m5s3.collection.defaultShopping.action,
      }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`shopping-starter-${view.file}.png`),
      animations: 'disabled',
    });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('one tap creates the default shopping list and opens it; the card is gone afterwards', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await installShoppingMocks(page);
  api.withoutShoppingList();
  await signIn(page);
  await page.goto('/more/collections');

  await page
    .getByRole('button', { name: m5s3.collection.defaultShopping.action })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/plan/collections/${COLLECTION_ID}$`),
  );
  await expect(
    page.getByRole('heading', { name: m5s3.collection.defaultShopping.title }),
  ).toBeVisible();
  expect(api.createCollectionBodies()).toEqual([
    { title: m5s3.collection.defaultShopping.title, kind: 'SHOPPING' },
  ]);
  // The server was asked about shopping lists of any state, one row is enough.
  expect(
    api
      .collectionListQueries()
      .some(
        (query) =>
          query.includes('kind=SHOPPING') &&
          query.includes('scope=ALL') &&
          query.includes('limit=1'),
      ),
  ).toBe(true);

  await page.goto('/more/collections');
  await expect(
    page.getByRole('heading', { name: m5s3.collection.overviewHeading }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: m5s3.collection.defaultShopping.action }),
  ).toHaveCount(0);
});

test('the short way is not offered while the couple already has a shopping list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installShoppingMocks(page);
  await signIn(page);
  await page.goto('/more/collections');

  await expect(
    page.getByRole('heading', { name: m5s3.collection.overviewHeading }),
  ).toBeVisible();
  await expect(page.getByText('Einkauf').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: m5s3.collection.defaultShopping.action }),
  ).toHaveCount(0);
});

const markDoneButton = (page: Page, title: string) =>
  page.getByRole('button', {
    name: m5s3.collection.markDone.replace('{{title}}', title),
  });

/** Stop the flying copy half way so a screenshot can show it. */
const pauseFlight = (page: Page) =>
  page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      if (target?.classList.contains('shared-list-flight')) {
        animation.pause();
        animation.currentTime = 100;
      }
    }
  });

for (const view of [
  {
    name: '390 light',
    file: '390-light',
    width: 390,
    height: 844,
    scheme: 'light',
  },
  {
    name: '360 dark',
    file: '360-dark',
    width: 360,
    height: 780,
    scheme: 'dark',
  },
  {
    name: '1280 light (Expanded)',
    file: '1280-light',
    width: 1280,
    height: 800,
    scheme: 'light',
  },
] as const) {
  test(`a checked entry flies into the cart (${view.name})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.emulateMedia({ colorScheme: view.scheme });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const api = await installShoppingMocks(page);
    seedComposition(api);
    await signIn(page);
    await openList(page);

    await markDoneButton(page, 'Brot').click();
    const flight = page.locator('.shared-list-flight');
    await expect(flight).toHaveCount(1);
    await expect(flight).toHaveText('Brot');
    await expect(flight).toHaveAttribute('aria-hidden', 'true');
    await pauseFlight(page);
    await page.screenshot({
      path: testInfo.outputPath(`cart-flight-${view.file}.png`),
      animations: 'allow',
    });
    // It never blocks the page and is gone when it has arrived.
    expect(
      await flight.evaluate(
        (element) => getComputedStyle(element).pointerEvents,
      ),
    ).toBe('none');
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.finish();
    });
    await expect(flight).toHaveCount(0);
    await expectNoOverflow(page);
  });
}

test('the first entry of a trip flies to a cart bar that only appears with it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installShoppingMocks(page);
  await signIn(page);
  await openList(page);
  await expect(page.locator('.shared-list-cartbar')).toHaveCount(0);

  await markDoneButton(page, 'Milch').click();

  await expect(page.locator('.shared-list-cartbar')).toBeVisible();
  await expect(page.locator('.shared-list-flight')).toHaveCount(1);
});

test('with reduced motion the checked entry simply appears in the cart: no flying copy', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installShoppingMocks(page);
  await signIn(page);
  await openList(page);

  await markDoneButton(page, 'Brot').click();

  await expect(page.locator('.shared-list-cartbar')).toBeVisible();
  await expect(page.locator('[data-arriving="true"]')).toHaveCount(1);
  await expect(page.locator('.shared-list-flight')).toHaveCount(0);
  // The entry is in the cart all the same.
  await page.locator('.shared-list-cartbar').click();
  await expect(page.getByRole('dialog').getByText('Brot')).toBeVisible();
});

for (const view of [
  {
    name: '390 light',
    file: '390-light',
    width: 390,
    height: 844,
    scheme: 'light',
  },
  {
    name: '1280 light (Expanded)',
    file: '1280-light',
    width: 1280,
    height: 800,
    scheme: 'light',
  },
] as const) {
  test(`the people of the list show next to the count (${view.name})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.emulateMedia({ colorScheme: view.scheme });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const api = await installShoppingMocks(page);
    seedComposition(api);
    await signIn(page);
    await openList(page);

    const discs = page.locator(
      '.shared-list-summary-head .list-people .partner-marker',
    );
    await expect(discs).toHaveText(['AN', 'BE']);
    await expect(page.locator('.list-people')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expectNoOverflow(page);
    await page
      .locator('.shared-list-summary')
      .screenshot({
        path: testInfo.outputPath(`list-people-${view.file}.png`),
      });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
