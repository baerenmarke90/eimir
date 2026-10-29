import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import m5s5 from '../../src/i18n/locales/m5s5';
import navigation from '../../src/i18n/locales/navigation';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { expectToday } from '../support/today';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';
const COLLECTION_ID = '00000000-0000-0000-0000-000000000030';

interface MutableCollectionItem {
  capabilities: {
    canComment: boolean;
    canDelete: boolean;
    canEdit: boolean;
  };
  collectionId: string;
  completed: boolean;
  createdAt: string;
  createdBy: string;
  creator: { id: string; displayName: string };
  id: string;
  position: number;
  title: string;
  updatedAt: string;
  version: number;
}

function collectionItem(
  id: string,
  title: string,
  position: number,
  completed = false,
): MutableCollectionItem {
  return {
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    collectionId: COLLECTION_ID,
    completed,
    createdAt: '2026-09-21T10:00:00Z',
    createdBy: ACCOUNT_ID,
    creator: { id: ACCOUNT_ID, displayName: 'Anna' },
    id,
    position,
    title,
    updatedAt: '2026-09-21T10:00:00Z',
    version: 1,
  };
}

async function installMocks(
  page: Page,
  {
    initiallyPinned = false,
    sharedAchievementsEnabled = false,
    failFinalCompletionOnce = false,
    openItemAfterCompletedPreview = false,
    itemCount,
  }: {
    initiallyPinned?: boolean;
    sharedAchievementsEnabled?: boolean;
    failFinalCompletionOnce?: boolean;
    openItemAfterCompletedPreview?: boolean;
    itemCount?: number;
  } = {},
) {
  let pinnedCollectionId: string | null = initiallyPinned
    ? COLLECTION_ID
    : null;
  const items = openItemAfterCompletedPreview
    ? [
        ...['Brot', 'Butter', 'Eier', 'Reis', 'Salz'].map((title, index) =>
          collectionItem(
            `00000000-0000-0000-0000-0000000001${index}0`,
            title,
            index,
            true,
          ),
        ),
        collectionItem('00000000-0000-0000-0000-000000000031', 'Milch', 5),
      ]
    : [
        collectionItem('00000000-0000-0000-0000-000000000031', 'Milch', 0),
        collectionItem('00000000-0000-0000-0000-000000000032', 'Brot', 1, true),
        collectionItem('00000000-0000-0000-0000-000000000033', 'Äpfel', 2),
      ];
  if (itemCount !== undefined) {
    const titles = ['Milch', 'Brot', 'Äpfel', 'Butter', 'Reis', 'Salz'];
    items.splice(
      0,
      items.length,
      ...Array.from({ length: itemCount }, (_, index) =>
        collectionItem(
          `00000000-0000-0000-0000-0000000001${index}0`,
          titles[index] ?? `Entry ${index + 1}`,
          index,
          index === 1,
        ),
      ),
    );
  }
  let finalCompletionFailed = false;
  let collectionGetCount = 0;
  let dashboardGetCount = 0;
  let itemCreateCount = 0;
  const itemWrites: {
    itemId: string;
    completed?: boolean;
    ifMatch?: string;
  }[] = [];
  let collectionVersion = 1;

  const collection = () => ({
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    createdAt: '2026-09-21T10:00:00Z',
    createdBy: ACCOUNT_ID,
    creator: { id: ACCOUNT_ID, displayName: 'Anna' },
    id: COLLECTION_ID,
    items,
    spaceId: SPACE_ID,
    title: 'Einkauf',
    updatedAt: '2026-09-21T10:00:00Z',
    version: collectionVersion,
  });

  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
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
      pathname === `/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}`
    ) {
      collectionGetCount += 1;
      await json(collection(), 200, { ETag: `"${collectionVersion}"` });
      return;
    }
    if (
      method === 'PATCH' &&
      pathname.startsWith(
        `/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/items/`,
      )
    ) {
      const itemId = pathname.split('/').at(-1);
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) {
        await json(
          {
            code: 'COLLECTION_ITEM_NOT_FOUND',
            detail: 'Collection item not found.',
            status: 404,
            title: 'Not found',
          },
          404,
        );
        return;
      }
      const body = request.postDataJSON() as {
        completed?: boolean;
        title?: string;
      };
      itemWrites.push({
        itemId: item.id,
        completed: body.completed,
        ifMatch: request.headers()['if-match'],
      });
      const wasComplete =
        items.length > 0 && items.every((candidate) => candidate.completed);
      const completesFinalItem =
        body.completed === true &&
        !item.completed &&
        items.every(
          (candidate) => candidate.id === item.id || candidate.completed,
        );
      if (
        failFinalCompletionOnce &&
        !finalCompletionFailed &&
        completesFinalItem
      ) {
        finalCompletionFailed = true;
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
      if (typeof body.completed === 'boolean') item.completed = body.completed;
      if (typeof body.title === 'string') item.title = body.title;
      item.version += 1;
      item.updatedAt = '2026-09-21T10:05:00Z';
      const isComplete =
        items.length > 0 && items.every((candidate) => candidate.completed);
      const becameComplete = !wasComplete && isComplete;
      await json(item, 200, {
        ETag: `"${item.version}"`,
        'X-Eimir-Collection-Completion-Transition': String(becameComplete),
        ...(sharedAchievementsEnabled && becameComplete
          ? { 'X-Eimir-Shared-Achievement': 'collection-completed' }
          : {}),
      });
      return;
    }
    if (
      method === 'POST' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/items`
    ) {
      const body = request.postDataJSON() as { title: string };
      const created = collectionItem(
        `00000000-0000-0000-0000-${String(34 + itemCreateCount++).padStart(12, '0')}`,
        body.title,
        items.length,
      );
      items.push(created);
      collectionVersion += 1;
      await json(created, 201, { ETag: '"1"' });
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
    itemWrites,
    collectionGetCount: () => collectionGetCount,
    dashboardGetCount: () => dashboardGetCount,
    pin: (selectedCollectionId: string | null) => {
      pinnedCollectionId = selectedCollectionId;
    },
    snapshot: () => structuredClone(collection()),
    reviseItem(
      id: string,
      changes: Partial<MutableCollectionItem>,
      advanceRoot = true,
    ) {
      const item = items.find((entry) => entry.id === id);
      if (!item) throw new Error('Missing fixture item');
      Object.assign(item, changes);
      if (advanceRoot) collectionVersion += 1;
    },
    reorder(itemIds: string[]) {
      items.forEach((item) => {
        item.position = itemIds.indexOf(item.id);
      });
      collectionVersion += 1;
      return collection();
    },
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

async function openToday(page: Page): Promise<void> {
  await page.goto('/today');
  await expectToday(page);
}

async function navigateToToday(page: Page): Promise<void> {
  await page.getByRole('link', { name: navigation.today, exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expectToday(page);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')]
      .map((element) => ({
        element: element.tagName.toLowerCase(),
        className:
          typeof element.className === 'string' ? element.className : '',
        right: Math.round(element.getBoundingClientRect().right),
      }))
      .filter(({ right }) => right > document.documentElement.clientWidth)
      .slice(0, 12),
  }));
  expect(
    dimensions.scrollWidth,
    JSON.stringify(dimensions.offenders),
  ).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectNoWcagViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

for (const view of [
  { name: '390-light', width: 390, scheme: 'light' as const },
  { name: '1280-dark', width: 1280, scheme: 'dark' as const },
]) {
  for (const outcome of ['success', 'failure'] as const) {
    test(`Today quick-add preserves a newer draft after late ${outcome} (${view.name})`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: view.width, height: 844 });
      await page.emulateMedia({
        colorScheme: view.scheme,
        reducedMotion: 'reduce',
      });
      await page.addInitScript(() =>
        localStorage.setItem('eimir.theme', 'system'),
      );
      await installMocks(page, { initiallyPinned: true });
      await signIn(page);
      const titles: string[] = [];
      let release!: () => void;
      await page.route(
        `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/items`,
        async (route) => {
          if (route.request().method() !== 'POST') return route.fallback();
          titles.push(route.request().postDataJSON().title);
          if (titles.length === 1) {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            if (outcome === 'failure') {
              await route.fulfill({
                status: 503,
                contentType: 'application/problem+json',
                body: JSON.stringify({
                  status: 503,
                  title: 'Service unavailable',
                  detail: 'The write was not confirmed.',
                }),
              });
              return;
            }
          }
          await route.fallback();
        },
      );
      const pinned = page.locator('.today-section-pinned-collection');
      const add = pinned.getByRole('button', {
        name: m5s5.today.pinnedCollection.addAction,
      });
      await add.click();
      const dialog = page.getByRole('dialog', {
        name: m5s5.today.pinnedCollection.addAction,
      });
      const input = dialog.getByLabel(m5s3.collection.itemTitle);
      await input.fill('Butter');
      await dialog
        .getByRole('button', { name: m5s3.collection.addItem })
        .click();
      await expect.poll(() => titles.length).toBe(1);
      await input.fill('Reis');
      await input.press('Enter');
      expect(titles).toEqual(['Butter']);
      release();
      await expect(
        dialog.getByRole('button', { name: m5s3.collection.addItem }),
      ).toBeEnabled();
      await expect(input).toHaveValue('Reis');
      await expect(input).toHaveAttribute('aria-invalid', 'false');
      if (outcome === 'failure')
        await expect(
          dialog.getByText(de.states.server.title, { exact: true }),
        ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectNoWcagViolations(page);
      await page.screenshot({
        path: testInfo.outputPath(
          `today-add-draft-${outcome}-${view.name}.png`,
        ),
        fullPage: true,
        animations: 'disabled',
      });
      await dialog
        .getByRole('button', { name: m5s3.collection.addItem })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(add).toBeFocused();
      expect(titles).toEqual(['Butter', 'Reis']);
      await expect(pinned.getByText('Reis', { exact: true })).toBeVisible();
      await pinned
        .getByRole('link', {
          name: m5s5.today.pinnedCollection.openAriaLabel.replace(
            '{{title}}',
            'Einkauf',
          ),
        })
        .click();
      await expect(
        page
          .locator(
            `[data-sortable-item-id="00000000-0000-0000-0000-0000000000${outcome === 'success' ? '35' : '34'}"]`,
          )
          .getByRole('textbox'),
      ).toHaveValue('Reis');
      await page.goBack();
      await expect(pinned.getByText('Reis', { exact: true })).toBeVisible();
      expect(titles).toEqual(['Butter', 'Reis']);
    });
  }

  test(`Today quick-add rejects offline submission and requires deliberate retry (${view.name})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: 844 });
    await page.emulateMedia({
      colorScheme: view.scheme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    await installMocks(page, { initiallyPinned: true });
    await signIn(page);
    const titles: string[] = [];
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/items`,
      async (route) => {
        if (route.request().method() === 'POST')
          titles.push(route.request().postDataJSON().title);
        await route.fallback();
      },
    );
    const pinned = page.locator('.today-section-pinned-collection');
    const add = pinned.getByRole('button', {
      name: m5s5.today.pinnedCollection.addAction,
    });
    await add.click();
    const dialog = page.getByRole('dialog', {
      name: m5s5.today.pinnedCollection.addAction,
    });
    const input = dialog.getByLabel(m5s3.collection.itemTitle);
    await input.fill('Butter');
    await page.context().setOffline(true);
    await dialog.getByRole('button', { name: m5s3.collection.addItem }).click();
    await expect(
      dialog.getByText(de.states.offline.title, { exact: true }),
    ).toBeVisible();
    await expect(input).toHaveValue('Butter');
    await expect(input).toBeFocused();
    expect(titles).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`today-add-offline-${view.name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page.context().setOffline(false);
    await expect(
      page.getByText(de.states.offline.banner, { exact: true }),
    ).toHaveCount(0);
    await expect(input).toHaveValue('Butter');
    expect(titles).toEqual([]);
    await dialog.getByRole('button', { name: m5s3.collection.addItem }).click();
    await expect(dialog).toHaveCount(0);
    await expect(add).toBeFocused();
    await expect(pinned.getByText('Butter', { exact: true })).toBeVisible();
    expect(titles).toEqual(['Butter']);
  });
}

test('shows an optimistic collection-detail check, rolls back a failed write and retries', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page);
  await signIn(page);

  let releaseFailure: (() => void) | null = null;
  let failFirstWrite = true;
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/items/*`,
    async (route) => {
      if (route.request().method() !== 'PATCH' || !failFirstWrite) {
        await route.fallback();
        return;
      }
      failFirstWrite = false;
      await new Promise<void>((resolve) => {
        releaseFailure = resolve;
      });
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'SERVER_ERROR',
          detail: 'The write was not confirmed.',
          status: 503,
          title: 'Service unavailable',
          type: 'about:blank',
        }),
      });
    },
  );

  await page.goto(`/plan/collections/${COLLECTION_ID}`);
  const row = page.locator(
    '[data-sortable-item-id="00000000-0000-0000-0000-000000000031"]',
  );
  const markDone = m5s3.collection.markDone.replace('{{title}}', 'Milch');
  const markOpen = m5s3.collection.markOpen.replace('{{title}}', 'Milch');
  await row.getByRole('button', { name: markDone }).click();
  await expect.poll(() => releaseFailure !== null).toBe(true);
  await expect(row.getByRole('button', { name: markOpen })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(row.getByRole('button', { name: markOpen })).toBeDisabled();
  await expect(row.getByRole('status')).toHaveText(m5s3.common.saving);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'planning-collection-detail-pending-390-light.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });

  releaseFailure?.();
  await expect(row.getByRole('button', { name: markDone })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(
    page.getByRole('button', { name: de.common.retry }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      'planning-collection-detail-rollback-390-light.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: de.common.retry }).click();
  await expect(row.getByRole('button', { name: markOpen })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: de.common.retry })).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'planning-collection-detail-confirmed-1280-light.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'planning-collection-detail-confirmed-320-dark-200pct.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
});

for (const outcome of ['failure', 'success'] as const) {
  test(`retains a newer shared checklist read after a late checkbox ${outcome}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const network = await installMocks(page);
    await signIn(page);
    const itemId = '00000000-0000-0000-0000-000000000031';
    const writes: string[] = [];
    let releaseWrite!: () => void;
    let releaseRead: (() => void) | undefined;
    let blockRecovery = false;
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}`,
      async (route) => {
        if (blockRecovery && route.request().method() === 'GET') {
          await new Promise<void>((resolve) => {
            releaseRead = resolve;
          });
        }
        await route.fallback();
      },
    );
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/items/${itemId}`,
      async (route) => {
        writes.push(route.request().headers()['if-match']);
        if (writes.length > 1) {
          await route.fallback();
          return;
        }
        await new Promise<void>((resolve) => {
          releaseWrite = resolve;
        });
        await route.fulfill({
          status: outcome === 'failure' ? 503 : 200,
          contentType: 'application/json',
          body: JSON.stringify(
            outcome === 'failure'
              ? {
                  code: 'SERVER_ERROR',
                  detail: 'The write was not confirmed.',
                  status: 503,
                  title: 'Service unavailable',
                  type: 'about:blank',
                }
              : { ...collectionItem(itemId, 'Milch', 0, true), version: 2 },
          ),
        });
      },
    );
    await page.goto(`/plan/collections/${COLLECTION_ID}`);
    const row = page.locator(`[data-sortable-item-id="${itemId}"]`);
    await row
      .getByRole('button', {
        name: m5s3.collection.markDone.replace('{{title}}', 'Milch'),
      })
      .click();
    await expect.poll(() => Boolean(releaseWrite)).toBe(true);
    await expect(row.getByRole('status')).toHaveText(m5s3.common.saving);
    await expect(
      row.getByRole('button', {
        name: m5s3.collection.markOpen.replace('{{title}}', 'Milch'),
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    network.reviseItem(itemId, {
      title: 'Hafermilch',
      completed: false,
      version: 3,
    });
    network.reorder([
      '00000000-0000-0000-0000-000000000033',
      '00000000-0000-0000-0000-000000000032',
      itemId,
    ]);
    const readsBefore = network.collectionGetCount();
    // Adding another row triggers the existing authorized detail refresh.
    await page
      .getByRole('textbox', { name: m5s3.collection.newItem })
      .fill('Kaffee');
    await page.getByRole('button', { name: m5s3.collection.addItem }).click();
    await expect.poll(network.collectionGetCount).toBeGreaterThan(readsBefore);
    await expect(row.getByRole('textbox')).toHaveValue('Hafermilch');
    const markDone = m5s3.collection.markDone.replace(
      '{{title}}',
      'Hafermilch',
    );
    await expect(row.getByRole('button', { name: markDone })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    blockRecovery = true;
    releaseWrite();
    if (outcome === 'success')
      await expect.poll(() => Boolean(releaseRead)).toBe(true);
    else
      await expect(
        page.getByRole('button', { name: de.common.retry }),
      ).toBeVisible();
    // The late callback must preserve the newer read even before recovery returns.
    await expect(row.getByRole('textbox')).toHaveValue('Hafermilch');
    await expect(row.getByRole('button', { name: markDone })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(
      page.locator('[data-sortable-item-id]').nth(2),
    ).toHaveAttribute('data-sortable-item-id', itemId);
    await expect(
      page
        .locator(
          '[data-sortable-item-id="00000000-0000-0000-0000-000000000034"]',
        )
        .getByRole('textbox'),
    ).toHaveValue('Kaffee');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`shared-newer-${outcome}-390-light.png`),
      fullPage: true,
      animations: 'disabled',
    });
    blockRecovery = false;
    releaseRead?.();
    if (outcome === 'failure')
      await page.getByRole('button', { name: de.common.retry }).click();
    else await row.getByRole('button', { name: markDone }).click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes).toEqual(['1', '3']);
    await expect(
      row.getByRole('button', {
        name: m5s3.collection.markOpen.replace('{{title}}', 'Hafermilch'),
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(row.getByRole('status')).toHaveCount(0);
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`shared-newer-${outcome}-1280-dark.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page
      .getByRole('link', { name: m5s3.common.backToCollections })
      .click();
    await page.goBack();
    await expect(row.getByRole('textbox')).toHaveValue('Hafermilch');
    await expect(
      row.getByRole('button', {
        name: m5s3.collection.markOpen.replace('{{title}}', 'Hafermilch'),
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(writes).toEqual(['1', '3']);
  });
}

for (const view of [
  { name: '390-light', width: 390, scheme: 'light' as const },
  { name: '1280-dark', width: 1280, scheme: 'dark' as const },
]) {
  for (const outcome of ['success', 'failure'] as const) {
    test(`Today checkbox retains a newer authorized read after late ${outcome} (${view.name})`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: view.width, height: 844 });
      await page.emulateMedia({
        colorScheme: view.scheme,
        reducedMotion: 'reduce',
      });
      await page.addInitScript(() =>
        localStorage.setItem('eimir.theme', 'system'),
      );
      const network = await installMocks(page, { initiallyPinned: true });
      await signIn(page);
      const milk = '00000000-0000-0000-0000-000000000031';
      const bread = '00000000-0000-0000-0000-000000000032';
      const apples = '00000000-0000-0000-0000-000000000033';
      let releaseWrite: (() => void) | undefined;
      let releaseRecovery: (() => void) | undefined;
      let holdRecovery = false;
      let writeFinished = false;
      const writes: string[] = [];
      await page.route(
        `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}`,
        async (route) => {
          if (holdRecovery && route.request().method() === 'GET')
            await new Promise<void>((resolve) => {
              releaseRecovery = resolve;
            });
          await route.fallback();
        },
      );
      await page.route(
        `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/items/${milk}`,
        async (route) => {
          if (route.request().method() !== 'PATCH') {
            await route.fallback();
            return;
          }
          writes.push(route.request().headers()['if-match']);
          if (writes.length > 1) {
            await route.fallback();
            return;
          }
          if (outcome === 'success')
            network.reviseItem(milk, { completed: true, version: 2 }, false);
          const response = network
            .snapshot()
            .items.find((entry) => entry.id === milk);
          await new Promise<void>((resolve) => {
            releaseWrite = resolve;
          });
          await route.fulfill({
            status: outcome === 'success' ? 200 : 503,
            contentType: 'application/json',
            body: JSON.stringify(
              outcome === 'success'
                ? response
                : {
                    code: 'SERVER_ERROR',
                    detail: 'The write was not confirmed.',
                    status: 503,
                    title: 'Service unavailable',
                    type: 'about:blank',
                  },
            ),
          });
          writeFinished = true;
        },
      );
      const pinned = page.locator('.today-section-pinned-collection');
      await pinned
        .getByRole('button', {
          name: m5s3.collection.markDone.replace('{{title}}', 'Milch'),
        })
        .click();
      await expect.poll(() => Boolean(releaseWrite)).toBe(true);
      await expect(
        pinned.getByRole('button', {
          name: m5s3.collection.markOpen.replace('{{title}}', 'Milch'),
        }),
      ).toHaveAttribute('aria-pressed', 'true');
      network.reviseItem(
        milk,
        { title: 'Hafermilch', completed: false, version: 5 },
        false,
      );
      network.reorder([apples, bread, milk]);
      // The existing Add flow refreshes the authorized detail while the toggle is pending.
      const reads = network.collectionGetCount();
      await pinned
        .getByRole('button', { name: m5s5.today.pinnedCollection.addAction })
        .click();
      const dialog = page.getByRole('dialog', {
        name: m5s5.today.pinnedCollection.addAction,
      });
      await dialog.getByLabel(m5s3.collection.itemTitle).fill('Kaffee');
      await dialog
        .getByRole('button', { name: m5s3.collection.addItem })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect.poll(network.collectionGetCount).toBeGreaterThan(reads);
      const currentToggle = pinned.getByRole('button', {
        name: m5s3.collection.markDone.replace('{{title}}', 'Hafermilch'),
      });
      await expect(currentToggle).toHaveAttribute('aria-pressed', 'false');
      holdRecovery = true;
      releaseWrite?.();
      await expect.poll(() => writeFinished).toBe(true);
      if (outcome === 'failure')
        await expect(
          page.getByText(m5s5.today.pinnedCollection.toggleFailed, {
            exact: true,
          }),
        ).toBeVisible();
      // Recovery is held so a refetch cannot conceal a corrupt late callback.
      await expect(currentToggle).toHaveAttribute('aria-pressed', 'false');
      await expect(pinned.getByText('Kaffee', { exact: true })).toBeVisible();
      await expect(
        pinned.locator('.today-pinned-list-title').first(),
      ).toHaveText('Äpfel');
      await expectNoHorizontalOverflow(page);
      await expectNoWcagViolations(page);
      await page.screenshot({
        path: testInfo.outputPath(`today-newer-${outcome}-${view.name}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      holdRecovery = false;
      releaseRecovery?.();
      await currentToggle.click();
      await expect.poll(() => writes.length).toBe(2);
      expect(writes).toEqual(['1', '5']);
      await expect(
        pinned.getByRole('button', {
          name: m5s3.collection.markOpen.replace('{{title}}', 'Hafermilch'),
        }),
      ).toHaveAttribute('aria-pressed', 'true');
      await pinned
        .getByRole('link', {
          name: m5s5.today.pinnedCollection.openAriaLabel.replace(
            '{{title}}',
            'Einkauf',
          ),
        })
        .click();
      await expect(
        page.locator(`[data-sortable-item-id="${milk}"]`).getByRole('textbox'),
      ).toHaveValue('Hafermilch');
      await page.goBack();
      await expect(
        pinned.getByText('Hafermilch', { exact: true }),
      ).toBeVisible();
      expect(writes).toEqual(['1', '5']);
    });
  }
}

for (const view of [
  { name: '390-light', width: 390, height: 844, theme: 'light' as const },
  { name: '1280-dark', width: 1280, height: 800, theme: 'dark' as const },
]) {
  for (const scenario of [
    'newer order failure',
    'newer order success',
    'newer item success',
  ] as const) {
    test(`shared reorder preserves ${scenario} after reconnect (${view.name})`, async ({
      page,
      context,
    }, testInfo) => {
      await page.setViewportSize({ width: view.width, height: view.height });
      await page.emulateMedia({
        colorScheme: view.theme,
        reducedMotion: 'reduce',
      });
      await page.clock.install();
      const network = await installMocks(page);
      await signIn(page);
      const milk = '00000000-0000-0000-0000-000000000031';
      const bread = '00000000-0000-0000-0000-000000000032';
      const apples = '00000000-0000-0000-0000-000000000033';
      const success = scenario !== 'newer order failure';
      const newerOrder = scenario !== 'newer item success';
      let releaseWrite!: () => void;
      let releaseRecovery: (() => void) | undefined;
      let holdRecovery = false;
      const writes: string[] = [];
      await page.route(
        `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}`,
        async (route) => {
          if (holdRecovery && route.request().method() === 'GET') {
            await new Promise<void>((resolve) => {
              releaseRecovery = resolve;
            });
          }
          await route.fallback();
        },
      );
      await page.route(
        `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/order`,
        async (route) => {
          writes.push(route.request().headers()['if-match']);
          const { itemIds } = route.request().postDataJSON() as {
            itemIds: string[];
          };
          const response =
            success || writes.length > 1
              ? structuredClone(network.reorder(itemIds))
              : undefined;
          if (writes.length === 1)
            await new Promise<void>((resolve) => {
              releaseWrite = resolve;
            });
          await route.fulfill({
            status: success || writes.length > 1 ? 200 : 503,
            contentType: 'application/json',
            body: JSON.stringify(
              success || writes.length > 1
                ? response
                : {
                    code: 'SERVER_ERROR',
                    status: 503,
                    title: 'Write unavailable',
                    type: 'about:blank',
                  },
            ),
          });
        },
      );
      await page.goto(`/plan/collections/${COLLECTION_ID}`);
      const names = () =>
        page
          .locator('[data-sortable-item-id] input[name="title"]')
          .evaluateAll((inputs) =>
            inputs.map((input) => (input as HTMLInputElement).value),
          );
      const handle = page.getByRole('button', {
        name: m5s3.collection.reorderItem.replace('{{title}}', 'Äpfel'),
      });
      await handle.focus();
      await page.keyboard.press('ArrowUp');
      await expect.poll(() => Boolean(releaseWrite)).toBe(true);
      await expect(page.getByRole('status')).toHaveText(
        m5s3.collection.reordering,
      );
      await expect.poll(names).toEqual(['Milch', 'Äpfel', 'Brot']);
      network.reviseItem(
        milk,
        { title: 'Hafermilch', completed: true, version: 3 },
        false,
      );
      if (newerOrder) network.reorder([apples, milk, bread]);
      const expectedNames = newerOrder
        ? ['Äpfel', 'Hafermilch', 'Brot']
        : ['Hafermilch', 'Äpfel', 'Brot'];
      const reads = network.collectionGetCount();
      // Reconnection refreshes a stale authorized read without replaying the held write.
      await context.setOffline(true);
      await page.clock.fastForward(61_000);
      await context.setOffline(false);
      await expect.poll(network.collectionGetCount).toBeGreaterThan(reads);
      await expect.poll(names).toEqual(expectedNames);
      await expect(page.getByRole('status')).toHaveText(
        m5s3.collection.reordering,
      );
      expect(writes).toEqual(['1']);
      holdRecovery = true;
      releaseWrite();
      if (success) await expect.poll(() => Boolean(releaseRecovery)).toBe(true);
      else
        await expect(
          page.getByRole('button', { name: de.common.retry }),
        ).toBeVisible();
      await expect.poll(names).toEqual(expectedNames);
      const milkRow = page.locator(`[data-sortable-item-id="${milk}"]`);
      await expect(
        milkRow.getByRole('button', {
          name: m5s3.collection.markOpen.replace('{{title}}', 'Hafermilch'),
        }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expectNoHorizontalOverflow(page);
      await expectNoWcagViolations(page);
      await page.screenshot({
        path: testInfo.outputPath(
          `shared-order-${scenario.replaceAll(' ', '-')}-${view.name}.png`,
        ),
        fullPage: true,
        animations: 'disabled',
      });
      holdRecovery = false;
      releaseRecovery?.();
      if (!success)
        await page.getByRole('button', { name: de.common.retry }).click();
      else {
        await expect(handle).toBeEnabled();
        await handle.focus();
        await page.keyboard.press(newerOrder ? 'ArrowDown' : 'ArrowUp');
      }
      await expect.poll(() => writes.length).toBe(2);
      expect(writes[1]).toBe(newerOrder && success ? '3' : '2');
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: de.common.retry }),
      ).toHaveCount(0);
      await expect(milkRow.getByRole('textbox')).toHaveValue('Hafermilch');
      await page
        .getByRole('link', { name: m5s3.common.backToCollections })
        .click();
      await page.goBack();
      await expect(milkRow.getByRole('textbox')).toHaveValue('Hafermilch');
      expect(writes).toHaveLength(2);
    });
  }
}

for (const outcome of ['success', 'failure'] as const) {
  test(`shared reorder respects a newer denied read after late ${outcome}`, async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize({
      width: outcome === 'success' ? 390 : 1280,
      height: 844,
    });
    await page.emulateMedia({
      colorScheme: outcome === 'success' ? 'light' : 'dark',
      reducedMotion: 'reduce',
    });
    await page.clock.install();
    const network = await installMocks(page);
    await signIn(page);
    let denied = false;
    let reads = 0;
    let releaseWrite!: () => void;
    let releaseRecovery: (() => void) | undefined;
    let holdRecovery = false;
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}`,
      async (route) => {
        reads += 1;
        if (holdRecovery)
          await new Promise<void>((resolve) => {
            releaseRecovery = resolve;
          });
        if (!denied) {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 403,
            code: 'PERMISSION_DENIED',
            title: 'Permission denied',
            type: 'about:blank',
          }),
        });
      },
    );
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/order`,
      async (route) => {
        const { itemIds } = route.request().postDataJSON() as {
          itemIds: string[];
        };
        const response = structuredClone(network.reorder(itemIds));
        await new Promise<void>((resolve) => {
          releaseWrite = resolve;
        });
        await route.fulfill({
          status: outcome === 'success' ? 200 : 503,
          contentType: 'application/json',
          body: JSON.stringify(
            outcome === 'success'
              ? response
              : {
                  status: 503,
                  code: 'SERVER_ERROR',
                  title: 'Write unavailable',
                  type: 'about:blank',
                },
          ),
        });
      },
    );
    await page.goto(`/plan/collections/${COLLECTION_ID}`);
    await page
      .getByRole('button', {
        name: m5s3.collection.reorderItem.replace('{{title}}', 'Äpfel'),
      })
      .focus();
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => Boolean(releaseWrite)).toBe(true);
    denied = true;
    await context.setOffline(true);
    await page.clock.fastForward(61_000);
    await context.setOffline(false);
    await expect(
      page.getByText(de.states.permission.title, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Einkauf' })).toHaveCount(0);
    const readsBefore = reads;
    holdRecovery = true;
    const response = page.waitForResponse((entry) =>
      entry.url().endsWith(`/collections/${COLLECTION_ID}/order`),
    );
    releaseWrite();
    await (await response).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await expect(page.getByRole('heading', { name: 'Einkauf' })).toHaveCount(0);
    await expect(
      page.getByText(de.states.permission.title, { exact: true }),
    ).toBeVisible();
    expect(reads).toBe(readsBefore);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`shared-order-denied-${outcome}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    holdRecovery = false;
    releaseRecovery?.();
  });
}

test('keeps a shared Collection reorder in place until confirmed or rolled back', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const network = await installMocks(page);
  await signIn(page);

  let releaseFailure: (() => void) | null = null;
  let failFirstWrite = true;
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/order`,
    async (route) => {
      const itemIds = (route.request().postDataJSON() as { itemIds: string[] })
        .itemIds;
      if (failFirstWrite) {
        failFirstWrite = false;
        await new Promise<void>((resolve) => {
          releaseFailure = resolve;
        });
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'SERVER_ERROR',
            detail: 'The order was not saved.',
            status: 503,
            title: 'Service unavailable',
            type: 'about:blank',
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(network.reorder(itemIds)),
      });
    },
  );

  await page.goto(`/plan/collections/${COLLECTION_ID}`);
  const rows = page.locator('[data-sortable-item-id]');
  const names = async () =>
    rows
      .locator('input[name="title"]')
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      );
  const moveApples = page.getByRole('button', {
    name: m5s3.collection.reorderItem.replace('{{title}}', 'Äpfel'),
  });
  await moveApples.focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(names).toEqual(['Milch', 'Äpfel', 'Brot']);
  await expect.poll(() => releaseFailure !== null).toBe(true);
  await expect(page.getByRole('status')).toHaveText(m5s3.collection.reordering);
  await expect(moveApples).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'planning-collection-reorder-pending-390-light.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });

  releaseFailure?.();
  await expect.poll(names).toEqual(['Milch', 'Brot', 'Äpfel']);
  await expect(
    page.getByRole('button', { name: de.common.retry }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      'planning-collection-reorder-rollback-390-light.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });

  await page.getByRole('button', { name: de.common.retry }).click();
  await expect.poll(names).toEqual(['Milch', 'Äpfel', 'Brot']);
  await expect(page.getByRole('button', { name: de.common.retry })).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'planning-collection-reorder-confirmed-1280-light.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'planning-collection-reorder-confirmed-320-dark-200pct.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
});

test('pins a shared Collection personally and keeps the compact Wir projection directly useful', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const network = await installMocks(page);
  await signIn(page);

  await page.goto(`/plan/collections/${COLLECTION_ID}`);
  await expect(page.getByRole('heading', { name: 'Einkauf' })).toBeVisible();

  await page.getByRole('button', { name: m5s3.collection.pinToToday }).click();
  await expect(
    page.getByRole('button', { name: m5s3.collection.unpinFromToday }),
  ).toBeVisible();

  await openToday(page);
  const pinnedSection = page.locator('.today-section-pinned-collection');
  await expect(pinnedSection).toBeVisible();
  await expect(
    pinnedSection.getByRole('heading', { name: 'Einkauf' }),
  ).toBeVisible();
  await expect(pinnedSection.getByText('Milch')).toBeVisible();
  await expect(pinnedSection.getByText('Brot')).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('today-pinned-collection-390-light.png'),
    fullPage: true,
    animations: 'disabled',
  });

  const milkDoneName = m5s3.collection.markDone.replace('{{title}}', 'Milch');
  const milkOpenName = m5s3.collection.markOpen.replace('{{title}}', 'Milch');
  const collectionGetsBeforeToggle = network.collectionGetCount();
  const dashboardGetsBeforeToggle = network.dashboardGetCount();
  await pinnedSection.getByRole('button', { name: milkDoneName }).click();
  await expect(
    pinnedSection.getByRole('button', { name: milkOpenName }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => network.collectionGetCount())
    .toBe(collectionGetsBeforeToggle);
  expect(network.dashboardGetCount()).toBe(dashboardGetsBeforeToggle);

  const addButton = pinnedSection.getByRole('button', {
    name: m5s5.today.pinnedCollection.addAction,
  });
  await addButton.click();
  const addDialog = page.getByRole('dialog', {
    name: m5s5.today.pinnedCollection.addAction,
  });
  await expect(addDialog).toBeVisible();
  const addInput = addDialog.getByLabel(m5s3.collection.itemTitle);
  await expect(addInput).toBeFocused();
  await addInput.fill('Butter');
  await addDialog
    .getByRole('button', { name: m5s3.collection.addItem })
    .click();
  await expect(addDialog).toHaveCount(0);
  await expect(addButton).toBeFocused();
  await expect(pinnedSection.getByText('Butter')).toBeVisible();
  await expect
    .poll(() => network.collectionGetCount())
    .toBe(collectionGetsBeforeToggle + 1);
  expect(network.dashboardGetCount()).toBe(dashboardGetsBeforeToggle);

  const openListName = m5s5.today.pinnedCollection.openAriaLabel.replace(
    '{{title}}',
    'Einkauf',
  );
  await pinnedSection.getByRole('link', { name: openListName }).click();
  await expect(page).toHaveURL(
    new RegExp(`/plan/collections/${COLLECTION_ID}$`),
  );
});

for (const view of [
  { name: '390-light', width: 390, scheme: 'light' as const, largeText: false },
  { name: '1280-dark', width: 1280, scheme: 'dark' as const, largeText: false },
  {
    name: '320-dark-200pct',
    width: 320,
    scheme: 'dark' as const,
    largeText: true,
  },
]) {
  test(`offline Today checkbox rolls back without replay and allows a deliberate later toggle at ${view.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: 844 });
    await page.emulateMedia({
      colorScheme: view.scheme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const network = await installMocks(page, { initiallyPinned: true });
    await signIn(page);
    if (view.largeText)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const pinned = page.locator('.today-section-pinned-collection');
    const markDone = m5s3.collection.markDone.replace('{{title}}', 'Milch');
    const markOpen = m5s3.collection.markOpen.replace('{{title}}', 'Milch');
    await expect(pinned.getByRole('button', { name: markDone })).toBeEnabled();

    await page.context().setOffline(true);
    await pinned.getByRole('button', { name: markDone }).click();
    await expect(
      page.getByText(m5s5.today.pinnedCollection.toggleFailed, { exact: true }),
    ).toBeVisible();
    await expect(
      pinned.getByRole('button', { name: markDone }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(network.itemWrites).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`today-checklist-offline-${view.name}.png`),
      fullPage: true,
      animations: 'disabled',
    });

    await page.context().setOffline(false);
    await expect(
      page.getByText(de.states.offline.banner, { exact: true }),
    ).toHaveCount(0);
    const openListName = m5s5.today.pinnedCollection.openAriaLabel.replace(
      '{{title}}',
      'Einkauf',
    );
    await pinned.getByRole('link', { name: openListName }).click();
    await expect(page.getByRole('heading', { name: 'Einkauf' })).toBeVisible();
    await expect(page.getByRole('button', { name: markDone })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(network.itemWrites).toEqual([]);
    await page.goBack();
    await expect(pinned.getByRole('button', { name: markDone })).toBeEnabled();
    expect(network.itemWrites).toEqual([]);

    await pinned.getByRole('button', { name: markDone }).click();
    await expect.poll(() => network.itemWrites.length).toBe(1);
    await expect(
      pinned.getByRole('button', { name: markOpen }),
    ).toHaveAttribute('aria-pressed', 'true');
    await pinned.getByRole('link', { name: openListName }).click();
    await expect(page.getByRole('button', { name: markOpen })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.goBack();
    await expect(pinned.getByRole('button', { name: markOpen })).toBeEnabled();
    await pinned.getByRole('button', { name: markOpen }).click();
    await expect.poll(() => network.itemWrites.length).toBe(2);
    await expect(
      pinned.getByRole('button', { name: markDone }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      network.itemWrites.map(({ completed, ifMatch }) => ({
        completed,
        ifMatch,
      })),
    ).toEqual([
      { completed: true, ifMatch: '1' },
      { completed: false, ifMatch: '2' },
    ]);
    await page.screenshot({
      path: testInfo.outputPath(`today-checklist-confirmed-${view.name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  });
}

test('celebrates only the confirmed final pinned Collection completion and stays retry-safe', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page, {
    initiallyPinned: true,
    sharedAchievementsEnabled: true,
    failFinalCompletionOnce: true,
  });
  await signIn(page);

  const pinnedSection = page.locator('.today-section-pinned-collection');
  const milkDoneName = m5s3.collection.markDone.replace('{{title}}', 'Milch');
  const appleDoneName = m5s3.collection.markDone.replace('{{title}}', 'Äpfel');

  await pinnedSection.getByRole('button', { name: milkDoneName }).click();
  await expect(
    pinnedSection.getByRole('heading', {
      name: m5s5.today.pinnedCollection.sharedAchievementTitle,
    }),
  ).toHaveCount(0);

  const appleButton = pinnedSection.getByRole('button', {
    name: appleDoneName,
  });
  await appleButton.click();
  await expect(appleButton).toBeEnabled();
  await expect(
    pinnedSection.getByRole('heading', {
      name: m5s5.today.pinnedCollection.sharedAchievementTitle,
    }),
  ).toHaveCount(0);

  await appleButton.click();
  await expect(
    pinnedSection.getByRole('heading', {
      name: m5s5.today.pinnedCollection.sharedAchievementTitle,
    }),
  ).toBeVisible();
  await expect(
    pinnedSection.getByText(
      m5s5.today.pinnedCollection.sharedAchievementBody.replace(
        '{{title}}',
        'Einkauf',
      ),
    ),
  ).toBeVisible();
  await expect(
    pinnedSection.locator('.shared-achievement-confirmation'),
  ).toHaveCount(1);
  await expect(pinnedSection.getByText('Milch')).toBeVisible();
  await expect(pinnedSection.getByText('Äpfel')).toBeVisible();
  await expect(
    pinnedSection.getByRole('link', {
      name: m5s5.today.pinnedCollection.sharedAchievementAction,
    }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'today-pinned-collection-celebration-390-light.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });

  const appleOpenName = m5s3.collection.markOpen.replace('{{title}}', 'Äpfel');
  await pinnedSection.getByRole('button', { name: appleOpenName }).click();
  await expect(
    pinnedSection.locator('.shared-achievement-confirmation'),
  ).toHaveAttribute('data-presence', 'exiting');
  await expect(
    pinnedSection.locator('.shared-achievement-confirmation'),
  ).toHaveCount(0);
  await expect(pinnedSection.getByText('Milch')).toBeVisible();
});

test('keeps the pinned Collection compact on Expanded Web without introducing a dashboard grid', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMocks(page, { initiallyPinned: true });
  await signIn(page);

  const pinnedSection = page.locator('.today-section-pinned-collection');
  await expect(pinnedSection).toBeVisible();
  await expect(
    pinnedSection.getByRole('heading', { name: 'Einkauf' }),
  ).toBeVisible();
  await expect(pinnedSection.getByText('Milch')).toBeVisible();
  await expect(pinnedSection.getByText('Äpfel')).toBeVisible();

  const sectionWidth = await pinnedSection.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(sectionWidth).toBeLessThan(900);

  await pinnedSection
    .getByRole('button', { name: m5s5.today.pinnedCollection.addAction })
    .click();
  const addDialog = page.getByRole('dialog', {
    name: m5s5.today.pinnedCollection.addAction,
  });
  await expect(addDialog).toBeVisible();
  const dialogWidth = await addDialog.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(dialogWidth).toBeLessThan(700);
  await page.keyboard.press('Escape');
  await expect(addDialog).toHaveCount(0);
  await expect(
    pinnedSection.getByRole('button', {
      name: m5s5.today.pinnedCollection.addAction,
    }),
  ).toBeFocused();

  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('today-pinned-collection-1280-light.png'),
    fullPage: true,
    animations: 'disabled',
  });
});

test('keeps the add task and plus usable across Compact widths and 320px 200-percent reflow', async ({
  page,
}, testInfo) => {
  await installMocks(page, { initiallyPinned: true });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await signIn(page);

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const pinnedSection = page.locator('.today-section-pinned-collection');
    const addButton = pinnedSection.getByRole('button', {
      name: m5s5.today.pinnedCollection.addAction,
    });
    await expect(addButton).toBeVisible();
    const target = await addButton.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  }

  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const pinnedSection = page.locator('.today-section-pinned-collection');
  const addButton = pinnedSection.getByRole('button', {
    name: m5s5.today.pinnedCollection.addAction,
  });
  await addButton.click();
  const addDialog = page.getByRole('dialog', {
    name: m5s5.today.pinnedCollection.addAction,
  });
  await expect(addDialog).toBeVisible();
  await expect(addDialog.getByLabel(m5s3.collection.itemTitle)).toBeFocused();
  await expect(
    addDialog.getByRole('button', { name: m5s3.collection.addItem }),
  ).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath(
      'today-pinned-collection-add-320-dark-200pct-reduced-motion.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
});

for (const width of [320, 360, 390, 430]) {
  test(`keeps the open item first, the completed list visible and the page the only scroller after the celebration at ${width}px with reduced motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 800 });
    await installMocks(page, {
      initiallyPinned: true,
      sharedAchievementsEnabled: true,
      openItemAfterCompletedPreview: true,
    });
    await signIn(page);

    const pinnedSection = page.locator('.today-section-pinned-collection');
    const previewItems = pinnedSection.locator('.today-pinned-list-items > li');
    // The only open item sits behind five completed ones but is still shown first.
    await expect(previewItems).toHaveCount(4);
    await expect(previewItems.first()).toContainText('Milch');

    const milkDoneName = m5s3.collection.markDone.replace('{{title}}', 'Milch');
    await pinnedSection.getByRole('button', { name: milkDoneName }).click();

    const celebration = pinnedSection.locator(
      '.shared-achievement-confirmation',
    );
    await expect(
      celebration.getByRole('heading', {
        name: m5s5.today.pinnedCollection.sharedAchievementTitle,
      }),
    ).toBeVisible();
    // Same information without decorative motion.
    await expect(celebration).toHaveCSS('animation-name', 'none');
    // The completed list stays visible and usable next to the celebration.
    await expect(previewItems).toHaveCount(4);
    await expect(
      pinnedSection.getByRole('button', {
        name: m5s3.collection.markOpen.replace('{{title}}', 'Brot'),
      }),
    ).toBeEnabled();

    // Progressive disclosure is inline; nothing becomes a nested vertical scroller.
    await pinnedSection.locator('.today-pinned-list-disclosure').click();
    await expect(previewItems).toHaveCount(6);
    const nestedScrollers = await pinnedSection.evaluate(
      (section) =>
        [section, ...section.querySelectorAll('*')].filter((element) => {
          const { overflowY } = getComputedStyle(element);
          return (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            element.scrollHeight > element.clientHeight
          );
        }).length,
    );
    expect(nestedScrollers).toBe(0);

    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
  });
}

async function holdPersonalPin(
  page: Page,
  network: Awaited<ReturnType<typeof installMocks>>,
) {
  let pending: { route: Route; selectedCollectionId: string | null } | null =
    null;
  let readsUnavailable = false;
  let reads = 0;
  const writes: (string | null)[] = [];
  await page.route('**/dashboard/preferences', async (route) => {
    reads += 1;
    if (readsUnavailable)
      await route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Preference read unavailable',
          status: 500,
        }),
      });
    else await route.fallback();
  });
  await page.route(
    '**/dashboard/preferences/pinned_collection',
    async (route) => {
      const body = route.request().postDataJSON() as {
        selectedCollectionId: string | null;
      };
      writes.push(body.selectedCollectionId);
      pending = { route, selectedCollectionId: body.selectedCollectionId };
    },
  );
  return {
    writes,
    reads: () => reads,
    failReads: (value: boolean) => {
      readsUnavailable = value;
    },
    confirm: async () => {
      if (!pending) throw new Error('No personal pin is waiting.');
      const current = pending;
      pending = null;
      network.pin(current.selectedCollectionId);
      await current.route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          moduleKey: 'pinned_collection',
          visible: true,
          selectedCollectionId: current.selectedCollectionId,
        }),
      });
    },
    fail: async (status = 500) => {
      if (!pending) throw new Error('No personal pin is waiting.');
      const current = pending;
      pending = null;
      await current.route.fulfill({
        status,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Preference write unavailable',
          status,
        }),
      });
    },
  };
}

for (const view of [
  {
    name: '390-light',
    width: 390,
    scheme: 'light' as const,
    items: 3,
    scale: false,
  },
  {
    name: '390-dark-sparse',
    width: 390,
    scheme: 'dark' as const,
    items: 1,
    scale: false,
  },
  {
    name: '360-light-dense',
    width: 360,
    scheme: 'light' as const,
    items: 6,
    scale: false,
  },
  {
    name: '430-dark-empty',
    width: 430,
    scheme: 'dark' as const,
    items: 0,
    scale: false,
  },
  {
    name: '320-dark-200pct',
    width: 320,
    scheme: 'dark' as const,
    items: 3,
    scale: true,
  },
  {
    name: '1280-light',
    width: 1280,
    scheme: 'light' as const,
    items: 3,
    scale: false,
  },
]) {
  test(`personal list pin responds before confirmation in ${view.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: 844 });
    await page.emulateMedia({
      colorScheme: view.scheme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const network = await installMocks(page, { itemCount: view.items });
    await signIn(page);
    const held = await holdPersonalPin(page, network);
    await page.goto(`/plan/collections/${COLLECTION_ID}`);
    if (view.scale)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const action = page.locator('.planning-collection-dashboard-action');
    const button = action.getByRole('button');
    await expect(button).toBeEnabled();
    await button.click();
    await expect(button).toHaveText(m5s3.collection.unpinFromToday);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toBeDisabled();
    await expect(action.getByRole('status')).toHaveText(de.common.saving);
    await expect(button).toHaveAttribute(
      'aria-describedby',
      'collection-pin-pending',
    );
    await button.evaluate((element) => {
      (element as HTMLButtonElement).click();
      (element as HTMLButtonElement).click();
    });
    await expect.poll(() => held.writes.length).toBe(1);
    await expect(
      page.getByPlaceholder(m5s3.collection.newItemPlaceholder),
    ).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`collection-pin-pending-${view.name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await expectNoWcagViolations(page);
    await held.confirm();
    await expect(button).toBeEnabled();
    await expect(action.getByRole('status')).toHaveCount(0);
    await navigateToToday(page);
    await expect(
      page.locator('.today-section-pinned-collection'),
    ).toBeVisible();
    await page
      .locator('.today-section-pinned-collection')
      .getByRole('link', {
        name: m5s5.today.pinnedCollection.openAriaLabel.replace(
          '{{title}}',
          'Einkauf',
        ),
      })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/plan/collections/${COLLECTION_ID}$`),
    );
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toBeEnabled();
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveText(m5s3.collection.pinToToday);
    await expect.poll(() => held.writes.length).toBe(2);
    await held.confirm();
    await expect(button).toBeEnabled();
    await navigateToToday(page);
    await expect(page.locator('.today-section-pinned-collection')).toHaveCount(
      0,
    );
    expect(held.writes).toEqual([COLLECTION_ID, null]);
  });
}

for (const view of [
  { name: '390-light', width: 390, scheme: 'light' as const },
  { name: '1280-dark', width: 1280, scheme: 'dark' as const },
]) {
  test(`offline personal pin has no reconnect replay and requires explicit activation at ${view.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: view.width, height: 844 });
    await page.emulateMedia({
      colorScheme: view.scheme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    const network = await installMocks(page);
    await signIn(page);
    const held = await holdPersonalPin(page, network);
    await page.goto(`/plan/collections/${COLLECTION_ID}`);
    const action = page.locator('.planning-collection-dashboard-action');
    const button = action.getByRole('button').first();
    await expect(button).toBeEnabled();

    await page.context().setOffline(true);
    await button.click();
    await expect(
      action.getByText(de.states.offline.title, { exact: true }),
    ).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(action.locator('#collection-pin-pending')).toHaveCount(0);
    expect(held.writes).toEqual([]);
    await expect(page.getByRole('heading', { name: 'Einkauf' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`collection-pin-offline-${view.name}.png`),
      fullPage: true,
      animations: 'disabled',
    });

    await page.context().setOffline(false);
    const readsBeforeRetry = held.reads();
    await action.getByRole('button', { name: de.common.retry }).click();
    await expect.poll(() => held.reads()).toBeGreaterThan(readsBeforeRetry);
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(held.writes).toEqual([]);
    await button.click();
    await expect.poll(() => held.writes.length).toBe(1);
    await held.confirm();
    await expect(button).toBeEnabled();
    await navigateToToday(page);
    await expect(
      page.locator('.today-section-pinned-collection'),
    ).toBeVisible();
    await page
      .locator('.today-section-pinned-collection')
      .getByRole('link', {
        name: m5s5.today.pinnedCollection.openAriaLabel.replace(
          '{{title}}',
          'Einkauf',
        ),
      })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/plan/collections/${COLLECTION_ID}$`),
    );
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toBeEnabled();

    await page.context().setOffline(true);
    await button.click();
    await expect(
      action.getByText(de.states.offline.title, { exact: true }),
    ).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(action.locator('#collection-pin-pending')).toHaveCount(0);
    expect(held.writes).toEqual([COLLECTION_ID]);
    await page.context().setOffline(false);
    await action.getByRole('button', { name: de.common.retry }).click();
    await expect(button).toBeEnabled();
    expect(held.writes).toEqual([COLLECTION_ID]);
    await button.click();
    await expect.poll(() => held.writes.length).toBe(2);
    await held.confirm();
    await expect(button).toBeEnabled();
    await navigateToToday(page);
    await expect(page.locator('.today-section-pinned-collection')).toHaveCount(
      0,
    );
    expect(held.writes).toEqual([COLLECTION_ID, null]);
  });
}

test('personal pin recovers failed writes, conflicts and reads without replaying a selection', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const network = await installMocks(page);
  await signIn(page);
  const held = await holdPersonalPin(page, network);
  await page.goto(`/plan/collections/${COLLECTION_ID}`);
  const action = page.locator('.planning-collection-dashboard-action');
  const button = action.getByRole('button').first();
  await expect(button).toBeEnabled();
  await button.click();
  await expect.poll(() => held.writes.length).toBe(1);
  await held.fail();
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(
    action.getByRole('button', { name: de.common.retry }),
  ).toBeVisible();
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: testInfo.outputPath('collection-pin-rollback-390-light.png'),
    fullPage: true,
  });
  const readsBeforeRetry = held.reads();
  await action.getByRole('button', { name: de.common.retry }).click();
  await expect.poll(() => held.reads()).toBeGreaterThan(readsBeforeRetry);
  expect(held.writes.length).toBe(1);
  await expect(button).toBeEnabled();
  await button.click();
  await expect.poll(() => held.writes.length).toBe(2);
  network.pin(COLLECTION_ID);
  await held.fail(409);
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(
    action.getByText(de.states.conflict.title, { exact: true }),
  ).toBeVisible();
  await button.click();
  await expect.poll(() => held.writes.length).toBe(3);
  held.failReads(true);
  await held.fail();
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Einkauf' })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('collection-pin-read-recovery-390-light.png'),
    fullPage: true,
  });
  held.failReads(false);
  await action.getByRole('button', { name: de.common.retry }).click();
  await expect(button).toBeEnabled();
  expect(held.writes).toEqual([COLLECTION_ID, COLLECTION_ID, null]);
});

for (const view of [
  { name: '390-light', width: 390, scheme: 'light' },
  { name: '1280-dark', width: 1280, scheme: 'dark' },
] as const) {
  for (const action of ['checkbox', 'reorder'] as const) {
    test(`offline shared ${action} ends without reconnect replay at ${view.name}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: view.width, height: 900 });
      await page.emulateMedia({
        colorScheme: view.scheme,
        reducedMotion: 'reduce',
      });
      await page.addInitScript(() =>
        localStorage.setItem('eimir.theme', 'system'),
      );
      const network = await installMocks(page);
      await signIn(page);
      const writes: string[] = [];
      page.on('request', (request) => {
        if (
          ['PATCH', 'PUT'].includes(request.method()) &&
          request.url().includes(`/collections/${COLLECTION_ID}/`)
        )
          writes.push(request.method());
      });
      await page.route(
        `**/api/v1/spaces/${SPACE_ID}/collections/${COLLECTION_ID}/order`,
        async (route) => {
          await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(
              network.reorder(route.request().postDataJSON().itemIds),
            ),
          });
        },
      );
      await page.goto(`/plan/collections/${COLLECTION_ID}`);
      const row = page.locator(
        '[data-sortable-item-id="00000000-0000-0000-0000-000000000031"]',
      );
      const titles = () =>
        page
          .locator('[data-sortable-item-id] input[name="title"]')
          .evaluateAll((inputs) =>
            inputs.map((input) => (input as HTMLInputElement).value),
          );
      await expect(row).toBeVisible();
      await page.context().setOffline(true);
      if (action === 'checkbox')
        await row
          .getByRole('button', {
            name: m5s3.collection.markDone.replace('{{title}}', 'Milch'),
          })
          .click();
      else {
        await page
          .getByRole('button', {
            name: m5s3.collection.reorderItem.replace('{{title}}', 'Äpfel'),
          })
          .focus();
        await page.keyboard.press('ArrowUp');
      }
      await expect(
        page.getByText(de.states.offline.title, { exact: true }),
      ).toBeVisible();
      if (action === 'checkbox')
        await expect(
          row.getByRole('button', {
            name: m5s3.collection.markDone.replace('{{title}}', 'Milch'),
          }),
        ).toHaveAttribute('aria-pressed', 'false');
      else await expect.poll(titles).toEqual(['Milch', 'Brot', 'Äpfel']);
      expect(writes).toEqual([]);
      await expectNoHorizontalOverflow(page);
      await expectNoWcagViolations(page);
      await page.screenshot({
        path: testInfo.outputPath(`shared-${action}-offline-${view.name}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      await page.context().setOffline(false);
      await expect(
        page.getByText(de.states.offline.banner, { exact: true }),
      ).toHaveCount(0);
      expect(writes).toEqual([]);
      await page.getByRole('button', { name: de.common.retry }).click();
      await expect(
        page.getByRole('button', { name: de.common.retry }),
      ).toHaveCount(0);
      await expect.poll(() => writes.length).toBe(1);
      if (action === 'checkbox')
        await expect(
          row.getByRole('button', {
            name: m5s3.collection.markOpen.replace('{{title}}', 'Milch'),
          }),
        ).toHaveAttribute('aria-pressed', 'true');
      else await expect.poll(titles).toEqual(['Milch', 'Äpfel', 'Brot']);
      await page.screenshot({
        path: testInfo.outputPath(
          `shared-${action}-confirmed-${view.name}.png`,
        ),
        fullPage: true,
        animations: 'disabled',
      });
      await openToday(page);
      await page.goto(`/plan/collections/${COLLECTION_ID}`);
      await expect(row).toBeVisible();
      expect(writes).toHaveLength(1);
    });
  }
}
