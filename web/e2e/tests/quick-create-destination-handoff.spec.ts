import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import navigation from '../../src/i18n/locales/navigation';
import privateArea from '../../src/i18n/locales/privateArea';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-01T10:00:00Z';
const backToStoryName = new RegExp(
  storyProducts.milestoneProduct.backToStory.replace(/^←\s*/, ''),
  'i',
);

/**
 * Browser harness for the #810/#839 Quick Create destination contract:
 *
 *   Quick Create -> action -> correct destination -> correct create area
 *   -> correct vertical position -> relevant focused task visible
 *   -> no accidental focus -> no unnecessary keyboard
 *
 * All seven actions must land the user on the right composition, correctly
 * positioned, without any of them being forced into an input (no
 * unsolicited on-screen keyboard). This is driven by the single shared
 * shared task-origin and route-entry primitives rather than destination hacks.
 */
async function installProductMocks(page: Page): Promise<void> {
  let savedMilestone: Record<string, unknown> | null = null;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    const fulfillJson = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await fulfillJson({
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
      await fulfillJson({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'browser-e2e-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: 'Anna', id: ACCOUNT_ID });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await fulfillJson({ serverAdmin: false });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await fulfillJson([
        { role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' },
      ]);
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await fulfillJson({ id: SPACE_ID, createdAt: TEST_NOW, partners: [] });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profile-preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    ) {
      await fulfillJson({
        accountId: ACCOUNT_ID,
        createdAt: TEST_NOW,
        displayName: 'Anna',
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson({ items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        keepsake: null,
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        sharedStorySummary: { heartMoments: 0, memories: 0, milestones: 0 },
        space: { partner: null, spaceId: SPACE_ID },
        thinkingOfYouAvailableAt: null,
        upcoming: [],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/milestones`
    ) {
      savedMilestone = {
        ...request.postDataJSON(),
        id: '44444444-4444-4444-8444-444444444444',
        spaceId: SPACE_ID,
        authorId: ACCOUNT_ID,
        author: { id: ACCOUNT_ID, displayName: 'Anna' },
        capabilities: { canEdit: true, canDelete: true, canComment: true },
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
        version: 1,
      };
      await fulfillJson(savedMilestone, 201);
      return;
    }

    if (
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/milestones/44444444-4444-4444-8444-444444444444` &&
      savedMilestone
    ) {
      await fulfillJson(savedMilestone);
      return;
    }

    if (
      method === 'PATCH' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/milestones/44444444-4444-4444-8444-444444444444` &&
      savedMilestone
    ) {
      savedMilestone = {
        ...savedMilestone,
        ...request.postDataJSON(),
        updatedAt: TEST_NOW,
        version: 2,
      };
      await fulfillJson(savedMilestone);
      return;
    }

    if (
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/milestones/44444444-4444-4444-8444-444444444444/comments`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/wishes`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The browser test did not define this API request: ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function assertNothingUnexpectedlyFocused(page: Page): Promise<void> {
  const activeTag = await page.evaluate(
    () => document.activeElement?.tagName ?? null,
  );
  expect(activeTag).not.toBe('INPUT');
  expect(activeTag).not.toBe('TEXTAREA');
}

async function openQuickCreateAndChoose(
  page: Page,
  actionLabel: string,
): Promise<void> {
  await page.getByRole('button', { name: navigation.newContent }).click();
  await expect(
    page.getByRole('dialog', { name: navigation.quickCreateTitle }),
  ).toBeVisible();
  await page.getByText(actionLabel, { exact: true }).click();
}

test.describe('Quick Create -> Wish / Plan: open the focused task without forcing focus', () => {
  test('390x844: Wish opens the task, no forced focus/keyboard, Back returns to Today', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/today');
    await signIn(page);

    await openQuickCreateAndChoose(page, navigation.quickCreateWish);

    await expect(page).toHaveURL(/\/plan\/wishes\/new$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const titleInput = page.locator('#planning-create-title');
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeInViewport();
    await expect(titleInput).not.toBeFocused();
    await assertNothingUnexpectedlyFocused(page);

    await page.goBack();
    await expect(page).toHaveURL(/\/today$/);
  });

  test('390x844: Plan opens the composer, and does not autofocus the title or the place picker', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/today');
    await signIn(page);

    await openQuickCreateAndChoose(page, navigation.quickCreatePlan);

    await expect(page).toHaveURL(/\/plan\/plans\/new$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const titleInput = page.locator('#planning-create-title');
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeInViewport();
    await expect(titleInput).not.toBeFocused();
    await expect(page.locator('#planning-create-place')).not.toBeFocused();
  });

  test('a normal /plan visit without Quick Create does not force focus into either composer', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/today');
    await signIn(page);

    await page.goto('/plan');
    await expect(
      page.getByRole('heading', { name: m5s3.overview.title }),
    ).toBeVisible();

    await expect(page.locator('#planning-create-title')).toHaveCount(0);
  });

  test('320 CSS px reflow: the opened Wish composer stays reachable without horizontal overflow', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/today');
    await signIn(page);

    await openQuickCreateAndChoose(page, navigation.quickCreateWish);

    const titleInput = page.locator('#planning-create-title');
    await expect(titleInput).toBeVisible();
    await expect(titleInput).not.toBeFocused();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('small-height viewport: the opened Plan composer is not hidden by sticky chrome', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.setViewportSize({ width: 390, height: 520 });
    await page.goto('/today');
    await signIn(page);

    await openQuickCreateAndChoose(page, navigation.quickCreatePlan);

    const titleInput = page.locator('#planning-create-title');
    await expect(titleInput).toBeInViewport();
    await expect(titleInput).not.toBeFocused();
  });

  test('1440 Expanded: the desktop popover opens the Wish composer without forcing focus', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/today');
    await signIn(page);

    await page.getByRole('button', { name: navigation.newContent }).click();
    await expect(
      page.getByRole('menu', { name: navigation.quickCreateTitle }),
    ).toBeVisible();
    await page
      .getByRole('menuitem', { name: navigation.quickCreateWish })
      .click();

    await expect(page).toHaveURL(/\/plan\/wishes\/new$/);
    const titleInput = page.locator('#planning-create-title');
    await expect(titleInput).toBeInViewport();
    await expect(titleInput).not.toBeFocused();
  });
});

test.describe('Quick Create -> dedicated /new routes: land at the correct start position', () => {
  const dedicatedDestinations = [
    {
      action: () => navigation.quickCreateMemory,
      urlPattern: /\/story\/memories\/new$/,
      heading: () => de.memory.heading,
      primaryFieldSelector: '#title',
    },
    {
      action: () => navigation.quickCreateHeartMoment,
      urlPattern: /\/story\/heart-moments\/new$/,
      heading: () => storyProducts.heartMomentProduct.createHeading,
      primaryFieldSelector: '#heart-moment-text',
    },
    {
      action: () => navigation.quickCreateMilestone,
      urlPattern: /\/story\/milestones\/new$/,
      heading: () => storyProducts.milestoneProduct.createHeading,
      primaryFieldSelector: '#milestone-title',
    },
    {
      action: () => navigation.quickCreatePrivateNote,
      urlPattern: /\/more\/private\/notes\/new$/,
      heading: () => privateArea.notes.createTitle,
      primaryFieldSelector: '#private-note-title',
    },
    {
      action: () => navigation.quickCreateGiftIdea,
      urlPattern: /\/more\/private\/gift-ideas\/new$/,
      heading: () => privateArea.gifts.createTitle,
      primaryFieldSelector: '#gift-title',
    },
  ] as const;

  for (const destination of dedicatedDestinations) {
    test(`390x844: ${destination.action()} lands on its create composition at the top, without forced focus`, async ({
      page,
    }) => {
      await installProductMocks(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/today');
      await signIn(page);

      await openQuickCreateAndChoose(page, destination.action());

      await expect(page).toHaveURL(destination.urlPattern);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      // Some create pages also carry a visually hidden `sr-only` heading
      // for `aria-labelledby` (e.g. Milestone/Heart Moment); restrict to
      // the visible page-level h1 to avoid ambiguity.
      await expect(
        page.getByRole('heading', { name: destination.heading(), level: 1 }),
      ).toBeInViewport();

      const primaryField = page.locator(destination.primaryFieldSelector);
      await expect(primaryField).toBeVisible();
      await expect(primaryField).toBeInViewport();
      await expect(primaryField).not.toBeFocused();
      await assertNothingUnexpectedlyFocused(page);
    });
  }

  test('the destination still lands correctly when the originating page was scrolled (Notiz)', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/today');
    await signIn(page);

    // Push the origin page far down before invoking Quick Create, mirroring
    // the manual Product Owner session that found Notiz/Geschenkidee
    // positioning unreliable. /today's mocked content is short, so a
    // synthetic min-height stands in for a populated Today feed to make
    // the origin page genuinely scrollable.
    await page.addStyleTag({ content: 'body { min-height: 3000px; }' });
    await page.evaluate(() => window.scrollTo(0, 2000));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);

    await openQuickCreateAndChoose(page, navigation.quickCreatePrivateNote);

    await expect(page).toHaveURL(/\/more\/private\/notes\/new$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const titleInput = page.locator('#private-note-title');
    await expect(titleInput).toBeInViewport();
    await expect(titleInput).not.toBeFocused();
  });

  test('the destination still lands correctly when the originating page was scrolled (Geschenkidee)', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/today');
    await signIn(page);

    await page.addStyleTag({ content: 'body { min-height: 3000px; }' });
    await page.evaluate(() => window.scrollTo(0, 2000));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);

    await openQuickCreateAndChoose(page, navigation.quickCreateGiftIdea);

    await expect(page).toHaveURL(/\/more\/private\/gift-ideas\/new$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const titleInput = page.locator('#gift-title');
    await expect(titleInput).toBeInViewport();
    await expect(titleInput).not.toBeFocused();
  });

  test('320 CSS px reflow: Notiz lands without horizontal overflow', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/today');
    await signIn(page);

    await openQuickCreateAndChoose(page, navigation.quickCreatePrivateNote);

    await expect(page.locator('#private-note-title')).toBeInViewport();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('small-height viewport: Geschenkidee lands at the same top-of-page position as direct entry', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.setViewportSize({ width: 390, height: 520 });
    await page.goto('/today');
    await signIn(page);

    await openQuickCreateAndChoose(page, navigation.quickCreateGiftIdea);

    await expect(page).toHaveURL(/\/more\/private\/gift-ideas\/new$/);
    // On a 390x520 viewport the page's own content (heading + intro text)
    // is taller than the viewport, so the title field sits below the fold
    // for a direct visit too; what matters here is that Quick Create lands
    // at the same top-of-page start position as direct entry, rather than
    // leaving the previous page's scroll offset in place.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(
      page.getByRole('heading', { name: privateArea.gifts.createTitle }),
    ).toBeInViewport();
  });

  test('Dark theme + reduced motion: Notiz still lands correctly', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/today');
    await signIn(page);

    await openQuickCreateAndChoose(page, navigation.quickCreatePrivateNote);

    await expect(page.locator('#private-note-title')).toBeInViewport();
    await expect(page.locator('#private-note-title')).not.toBeFocused();
  });

  test('Browser Back from a dedicated /new route returns to Today', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/today');
    await signIn(page);

    await openQuickCreateAndChoose(page, navigation.quickCreatePrivateNote);
    await expect(page).toHaveURL(/\/more\/private\/notes\/new$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/today$/);
  });

  test('Direct Route Entry: visiting /story/memories/new without Quick Create still works', async ({
    page,
  }) => {
    await installProductMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/today');
    await signIn(page);

    await page.goto('/story/memories/new');
    await expect(
      page.getByRole('heading', { name: de.memory.heading }),
    ).toBeVisible();
    await expect(page.locator('#title')).toBeVisible();
  });
});

for (const viewport of [
  { name: 'Compact', width: 390, height: 844 },
  { name: 'Expanded', width: 1440, height: 900 },
] as const) {
  test(`Quick Create Milestone preserves its origin through confirmed Save and edit (${viewport.name})`, async ({
    page,
  }, testInfo) => {
    await installProductMocks(page);
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto('/today');
    await signIn(page);
    await expect(page.locator('.today-content')).toBeVisible();
    await expect(page.locator('.today-page .ui-state-error')).toHaveCount(0);

    await page.getByRole('button', { name: navigation.newContent }).click();
    await expect(
      page.getByRole(viewport.name === 'Compact' ? 'dialog' : 'menu', {
        name: navigation.quickCreateTitle,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`shell-milestone-sheet-${viewport.width}.png`),
      fullPage: true,
    });
    await page
      .getByRole(viewport.name === 'Compact' ? 'link' : 'menuitem', {
        name: navigation.quickCreateMilestone,
      })
      .click();
    await expect(page).toHaveURL(/\/story\/milestones\/new$/);
    await expect(page.locator('#milestone-title')).not.toBeFocused();
    await expect(
      page.getByRole('button', { name: taskBoundary.back, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`shell-milestone-task-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: de.common.cancel }).click();
    await expect(page).toHaveURL(/\/today$/);

    await page.getByRole('button', { name: navigation.newContent }).click();
    await page
      .getByRole(viewport.name === 'Compact' ? 'link' : 'menuitem', {
        name: navigation.quickCreateMilestone,
      })
      .click();
    await page.getByRole('button', { name: taskBoundary.back }).click();
    await expect(page).toHaveURL(/\/today$/);

    await page.getByRole('button', { name: navigation.newContent }).click();
    await page
      .getByRole(viewport.name === 'Compact' ? 'link' : 'menuitem', {
        name: navigation.quickCreateMilestone,
      })
      .click();
    await page.locator('#milestone-title').fill('Our first home');
    const createRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().endsWith(`/spaces/${SPACE_ID}/milestones`),
    );
    await page
      .getByRole('button', { name: storyProducts.milestoneProduct.save })
      .click();
    expect((await createRequest).postDataJSON()).toEqual(
      expect.objectContaining({ title: 'Our first home' }),
    );
    await expect(page).toHaveURL(
      /\/story\/milestones\/44444444-4444-4444-8444-444444444444$/,
    );
    await expect(
      page.getByRole('heading', { name: 'Our first home' }),
    ).toBeVisible();
    await expect(page.locator('.comments-panel .ui-state')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`shell-milestone-result-${viewport.width}.png`),
      fullPage: true,
    });

    await page
      .getByRole('link', { name: storyProducts.milestoneProduct.edit })
      .click();
    await expect(page).toHaveURL(/\/edit$/);
    await page.getByRole('link', { name: de.common.cancel }).click();
    await expect(page).toHaveURL(
      /\/story\/milestones\/44444444-4444-4444-8444-444444444444$/,
    );
    await page
      .getByRole('link', { name: storyProducts.milestoneProduct.edit })
      .click();
    await page.locator('#milestone-title').fill('Our next home');
    await page
      .getByRole('button', { name: storyProducts.milestoneProduct.save })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Our next home' }),
    ).toBeVisible();
    await page.locator('.shell-detail-back').click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole('button', { name: navigation.newContent }),
    ).toBeFocused();

    await page.goto('/story/milestones/new');
    await page.getByRole('button', { name: backToStoryName }).click();
    await expect(page).toHaveURL(/\/story$/);
  });
}
