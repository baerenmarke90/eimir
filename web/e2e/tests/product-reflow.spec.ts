import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s5 from '../../src/i18n/locales/m5s5';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-01T10:00:00Z';

const ACCOUNT = { id: ACCOUNT_ID, displayName: 'Lea Sommer' };
const PARTNER = { id: PARTNER_ID, displayName: 'Alex Winter' };
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };
const EMPTY_PAGE = { hasMore: false, items: [], nextCursor: null };

const STORY_ITEMS = [
  {
    kind: 'MEMORY',
    effectiveDate: '2026-09-01',
    memory: {
      id: 'memory-1',
      title: 'Ein Wochenende am Wasser',
      happenedOn: '2026-09-01',
      createdAt: TEST_NOW,
      author: ACCOUNT,
      capabilities: CAPABILITIES,
      attachments: [],
    },
  },
  {
    kind: 'HEART_MOMENT',
    effectiveDate: '2026-08-31',
    heartMoment: {
      id: 'heart-1',
      text: 'Danke, dass du heute für mich da warst.',
      emotion: 'LOVED',
      happenedOn: '2026-08-31',
      createdAt: TEST_NOW,
      author: PARTNER,
      capabilities: CAPABILITIES,
      attachment: null,
    },
  },
  {
    kind: 'MILESTONE',
    effectiveDate: '2026-08-30',
    milestone: {
      id: 'milestone-1',
      title: 'Drei Jahre wir',
      happenedOn: '2026-08-30',
      createdAt: TEST_NOW,
      author: ACCOUNT,
      capabilities: CAPABILITIES,
    },
  },
];

const AFFECTED_SURFACES = [
  '/today',
  '/story',
  '/story?tab=timeline',
  '/more/profile',
  '/more/notifications',
  '/story/memories/new',
  '/more/people',
  '/more/settings',
  '/today/activity',
  '/more/private/notes',
] as const;

const CLEAN_REFERENCE_SURFACES = ['/plan', '/more', '/search'] as const;

async function installApiMocks(page: Page): Promise<string[]> {
  const unexpectedRequests: string[] = [];

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
        account: ACCOUNT,
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'product-reflow-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'product-reflow-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson(ACCOUNT);
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      await fulfillJson({
        accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        accessToken: 'product-reflow-refreshed-token',
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        refreshToken: 'product-reflow-refresh-token-2',
      });
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
      await fulfillJson({
        id: SPACE_ID,
        createdAt: '2023-06-17T00:00:00Z',
        partners: [ACCOUNT, PARTNER],
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: '2023-06-17',
        showRelationshipDuration: true,
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
      (pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}` ||
        pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}`)
    ) {
      const isPartner = pathname.endsWith(PARTNER_ID);
      await fulfillJson({
        accountId: isPartner ? PARTNER_ID : ACCOUNT_ID,
        createdAt: TEST_NOW,
        displayName: isPartner ? PARTNER.displayName : ACCOUNT.displayName,
        id: isPartner ? '55555555-5555-4555-8555-555555555555' : PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({
        items: [
          { moduleKey: 'upcoming', visible: true, itemLimit: 2 },
          { moduleKey: 'shared_story_summary', visible: true },
        ],
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        space: { spaceId: SPACE_ID, partner: PARTNER },
        relationshipDuration: {
          daysTogether: 1174,
          startedOn: '2023-06-17',
        },
        retrospective: null,
        recentShared: [],
        sharedStorySummary: {
          memories: 4,
          heartMoments: 1,
          milestones: 0,
        },
        upcoming: [
          {
            id: 'plan-1',
            type: 'PLAN',
            titleOrText: 'Wochenendtrip an die Ostsee',
            scheduledAt: '2026-09-20T09:00:00Z',
          },
          {
            id: 'plan-2',
            type: 'PLAN',
            titleOrText: 'Kino-Abend mit Popcorn',
            scheduledAt: '2026-09-12T18:00:00Z',
          },
        ],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
      await fulfillJson({
        items: STORY_ITEMS,
        hasMore: false,
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/discover`
    ) {
      await fulfillJson({
        selectionDate: '2026-09-01',
        lead: STORY_ITEMS[0],
        items: STORY_ITEMS.slice(1),
        leadContext: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/`) &&
      pathname.endsWith('/comments')
    ) {
      await fulfillJson(EMPTY_PAGE);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson(EMPTY_PAGE);
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
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications`
    ) {
      await fulfillJson(EMPTY_PAGE);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/related-persons`
    ) {
      await fulfillJson([
        {
          id: 'person-1',
          displayName: 'Lisa Beispielname',
          relationship: 'FRIEND',
          birthday: '1995-05-12',
          birthdayYearKnown: true,
          visibility: 'SHARED',
          avatarAttachmentId: null,
          version: 1,
          createdAt: TEST_NOW,
          updatedAt: TEST_NOW,
        },
      ]);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/important-dates`
    ) {
      await fulfillJson([]);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/private/notes`
    ) {
      await fulfillJson(EMPTY_PAGE);
      return;
    }

    if (
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/rules/relationship_anniversary_reminder/preference`
    ) {
      await fulfillJson({
        ruleKey: 'relationship_anniversary_reminder',
        enabled: true,
        parameters: { daysBefore: [30, 7, 1], localTime: '09:00:00' },
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/invitations`
    ) {
      await fulfillJson([]);
      return;
    }

    if (
      method === 'GET' &&
      [
        `/api/v1/spaces/${SPACE_ID}/search`,
        `/api/v1/spaces/${SPACE_ID}/collections`,
        `/api/v1/spaces/${SPACE_ID}/plans`,
        `/api/v1/spaces/${SPACE_ID}/places`,
        `/api/v1/spaces/${SPACE_ID}/wishes`,
      ].includes(pathname)
    ) {
      await fulfillJson(EMPTY_PAGE);
      return;
    }

    if (
      (method === 'GET' || method === 'POST') &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    unexpectedRequests.push(`${method} ${pathname}`);
    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The product reflow test did not define ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return unexpectedRequests;
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function expectHorizontalReflow(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const visibleBoxes = Array.from(
      document.querySelectorAll<HTMLElement>('body *'),
    )
      .map((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: element.getAttribute('class') || '',
          display: style.display,
          position: style.position,
          cssWidth: style.width,
          minWidth: style.minWidth,
          maxWidth: style.maxWidth,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          scrollWidth: element.scrollWidth,
          visible:
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0,
        };
      })
      .filter((box) => box.visible);
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#main-content a[href], #main-content button, #main-content input, #main-content select, #main-content textarea, #main-content summary',
      ),
    )
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        let reachableByScroll = false;
        for (
          let ancestor = element.parentElement;
          ancestor && ancestor !== document.body;
          ancestor = ancestor.parentElement
        ) {
          const overflowX = getComputedStyle(ancestor).overflowX;
          if (
            (overflowX === 'auto' || overflowX === 'scroll') &&
            ancestor.scrollWidth > ancestor.clientWidth + 1
          ) {
            reachableByScroll = true;
            break;
          }
        }
        return {
          label:
            element.getAttribute('aria-label') ||
            element.getAttribute('name') ||
            element.textContent?.trim().slice(0, 80) ||
            element.tagName,
          left: rect.left,
          right: rect.right,
          reachableByScroll,
        };
      });

    return {
      route: `${location.pathname}${location.search}`,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      overflowingBoxes: visibleBoxes
        .filter((box) => box.left < -1 || box.right > root.clientWidth + 1)
        .sort((a, b) => b.right - a.right)
        .slice(0, 12),
      clippedControls: controls
        .filter(
          (control) =>
            (control.left < -1 || control.right > root.clientWidth + 1) &&
            !control.reachableByScroll,
        )
        .map(({ label, left, right }) => ({ label, left, right })),
    };
  });

  expect(
    result.scrollWidth,
    `Horizontal overflow on ${result.route}: ${JSON.stringify(result.overflowingBoxes, null, 2)}`,
  ).toBeLessThanOrEqual(result.clientWidth);
  expect(result.clippedControls, `Clipped controls on ${result.route}`).toEqual(
    [],
  );
}

async function openSurfaceAt400Percent(
  page: Page,
  path: string,
): Promise<void> {
  await page.goto(path);
  await expect(page.locator('#main-content')).toBeVisible();
  await page.locator('html').evaluate((element) => {
    element.style.zoom = '4';
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expectHorizontalReflow(page);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`WCAG 1.4.10 product surfaces reflow at 1280x1024 and 400 percent zoom in ${colorScheme} mode`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.addInitScript(() =>
      localStorage.setItem('eimir.theme', 'system'),
    );
    await page.setViewportSize({ width: 1280, height: 1024 });
    const unexpectedRequests = await installApiMocks(page);

    await page.goto('/today');
    await signIn(page);

    for (const path of [...AFFECTED_SURFACES, ...CLEAN_REFERENCE_SURFACES]) {
      await openSurfaceAt400Percent(page, path);
    }

    expect(unexpectedRequests).toEqual([]);
  });
}

test('representative layout families keep their accepted normal viewport reflow', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const unexpectedRequests = await installApiMocks(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/today');
  await signIn(page);

  for (const width of [320, 390, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1024 });
    for (const path of [
      '/today',
      '/story',
      '/more/profile',
      '/more/notifications',
      '/story/memories/new',
      '/more/people',
      '/more/settings',
      '/more/private/notes',
    ]) {
      await page.goto(path);
      await expect(page.locator('#main-content')).toBeVisible();
      await expectHorizontalReflow(page);
      if (path === '/today') {
        await expect(
          page.getByRole('heading', {
            name: m5s5.dashboard.storySummaryTitle,
            level: 2,
          }),
        ).toBeVisible();
      }
    }
  }

  expect(unexpectedRequests).toEqual([]);
});

test('400 percent reflow keeps keyboard-reachable controls inside the viewport', async ({
  page,
}) => {
  const unexpectedRequests = await installApiMocks(page);
  await page.setViewportSize({ width: 1280, height: 1024 });
  await page.goto('/today');
  await signIn(page);

  for (const path of [
    '/story?tab=timeline',
    '/story/memories/new',
    '/more/settings',
  ]) {
    await openSurfaceAt400Percent(page, path);
    const firstControl = page
      .locator(
        '#main-content a[href]:visible, #main-content button:visible, #main-content input:visible, #main-content select:visible, #main-content textarea:visible, #main-content summary:visible',
      )
      .first();
    await firstControl.focus();
    await expect(firstControl).toBeFocused();
    await page.keyboard.press('Tab');
    await expectHorizontalReflow(page);
  }

  expect(unexpectedRequests).toEqual([]);
});
