import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import m5s5 from '../../src/i18n/locales/m5s5';

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
  }: {
    initiallyPinned?: boolean;
    sharedAchievementsEnabled?: boolean;
    failFinalCompletionOnce?: boolean;
    openItemAfterCompletedPreview?: boolean;
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
  let finalCompletionFailed = false;
  let collectionGetCount = 0;
  let dashboardGetCount = 0;
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
        '00000000-0000-0000-0000-000000000034',
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
    collectionGetCount: () => collectionGetCount,
    dashboardGetCount: () => dashboardGetCount,
  };
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectNoWcagViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

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

  await page.goto('/today');
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
