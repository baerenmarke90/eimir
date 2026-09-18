import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import storyProducts from '../../src/i18n/locales/storyProducts';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '99999999-9999-4999-8999-999999999999';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const ME = { id: ACCOUNT_ID, displayName: 'Lea Sommer' };
const PARTNER = { id: PARTNER_ID, displayName: 'Alex' };
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };

interface RequestTracker {
  timelineRequests: number;
}

function timelineItems() {
  return [
    {
      kind: 'MEMORY',
      effectiveDate: '2026-09-12T08:30:00Z',
      memory: {
        id: 'mem-september',
        title: 'Morning by the lake',
        happenedOn: '2026-09-12',
        createdAt: '2026-09-12T08:30:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachments: [],
      },
    },
    {
      kind: 'HEART_MOMENT',
      effectiveDate: '2026-09-06T19:00:00Z',
      heartMoment: {
        id: 'hm-september',
        text: 'Thinking of you',
        emotion: 'LOVED',
        happenedOn: '2026-09-06',
        createdAt: '2026-09-06T19:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachment: null,
      },
    },
    {
      kind: 'MILESTONE',
      effectiveDate: '2026-08-28T00:00:00Z',
      milestone: {
        id: 'ms-august',
        title: 'A shared milestone',
        happenedOn: '2026-08-28',
        createdAt: '2026-08-28T00:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
      },
    },
    {
      kind: 'MEMORY',
      effectiveDate: '2026-08-15T10:00:00Z',
      memory: {
        id: 'mem-august',
        title: 'Long summer afternoon',
        happenedOn: '2026-08-15',
        createdAt: '2026-08-15T10:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachments: [],
      },
    },
  ];
}

async function installMocks(
  page: Page,
  tracker: RequestTracker,
): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;
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
        account: ME,
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'timeline-974-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'timeline-974-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson(ME);
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
        partners: [ME, PARTNER],
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
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    ) {
      await fulfillJson({
        accountId: ACCOUNT_ID,
        createdAt: '2023-06-17T00:00:00Z',
        displayName: ME.displayName,
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2023-06-17T00:00:00Z',
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
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
      tracker.timelineRequests += 1;
      const type = url.searchParams.get('type') ?? url.searchParams.get('kind');
      const items = type
        ? timelineItems().filter((item) => item.kind === type)
        : timelineItems();
      await fulfillJson({
        items,
        availableYears: [2026],
        hasMore: false,
        nextCursor: null,
      });
      return;
    }

    if (method === 'GET' && pathname.endsWith('/comments')) {
      await fulfillJson({ items: [], hasMore: false, nextCursor: null });
      return;
    }

    await fulfillJson({});
  });
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/story?tab=timeline');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function captureStoryEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
}

test.describe('Momente Timeline compact controls and refresh (#974)', () => {
  test('captures compact default, active-filter, large-text and Expanded states', async ({
    page,
  }, testInfo) => {
    const tracker = { timelineRequests: 0 };
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, tracker);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    const filter = page.getByRole('button', {
      name: storyProducts.storyFilters.toggleButton,
      exact: true,
    });
    await expect(filter).toBeVisible();
    const filterBox = await filter.boundingBox();
    expect(filterBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(filterBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(
      page.getByRole('button', { name: de.common.refresh }),
    ).toHaveCount(0);
    await captureStoryEvidence(page, testInfo, 'story-974-390-default.png');

    await page.goto('/story?tab=timeline&type=MEMORY');
    await page.waitForSelector('.story-timeline');
    await expect(filter).toBeVisible();
    await expect(filter.locator('.story-filter-active-badge')).toHaveText('1');
    await expect(page.locator('.story-task-active-scope')).toBeVisible();
    await captureStoryEvidence(
      page,
      testInfo,
      'story-974-390-filter-active.png',
    );

    await page.setViewportSize({ width: 320, height: 640 });
    await page.addStyleTag({
      content: 'html { font-size: 125% !important; }',
    });
    const hasLargeTextOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasLargeTextOverflow).toBe(false);
    const compactFilterBox = await filter.boundingBox();
    expect(compactFilterBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(compactFilterBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await captureStoryEvidence(page, testInfo, 'story-974-320-large-text.png');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/story?tab=timeline&type=MEMORY');
    await page.waitForSelector('.story-timeline');
    await expect(
      page.getByRole('button', { name: de.common.refresh }),
    ).toHaveCount(0);
    await captureStoryEvidence(page, testInfo, 'story-974-1440-expanded.png');
  });

  test('captures compact dark-mode state', async ({ page }, testInfo) => {
    const tracker = { timelineRequests: 0 };
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, tracker);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await captureStoryEvidence(page, testInfo, 'story-974-390-dark.png');
  });

  test('pull-to-refresh performs one authoritative filtered Timeline refetch', async ({
    page,
  }, testInfo) => {
    const tracker = { timelineRequests: 0 };
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'maxTouchPoints', {
        configurable: true,
        get: () => 1,
      });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, tracker);
    await signIn(page);
    await page.goto('/story?tab=timeline&type=MEMORY');
    await page.waitForSelector('.story-timeline');

    const indicator = page.locator('.app-pull-refresh-indicator');
    await expect(indicator).toHaveCount(1);
    await expect(page.locator('html')).toHaveClass(/app-pull-refresh-enabled/);
    const browserOverscroll = await page
      .locator('html')
      .evaluate((element) => getComputedStyle(element).overscrollBehaviorY);
    expect(browserOverscroll).toBe('none');

    const requestsBeforePull = tracker.timelineRequests;
    const browserRefreshSuppressed = await page.evaluate(() => {
      const dispatch = (type: string, y?: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', {
          configurable: true,
          value: y === undefined ? [] : [{ clientY: y }],
        });
        document.dispatchEvent(event);
        return event.defaultPrevented;
      };
      dispatch('touchstart', 100);
      return dispatch('touchmove', 190);
    });
    expect(browserRefreshSuppressed).toBe(true);
    await expect(indicator).toHaveClass(/is-ready/);
    await captureStoryEvidence(page, testInfo, 'story-974-pull-ready.png');

    await page.evaluate(() => {
      const event = new Event('touchend', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'touches', {
        configurable: true,
        value: [],
      });
      document.dispatchEvent(event);
    });

    await expect
      .poll(() => tracker.timelineRequests)
      .toBe(requestsBeforePull + 1);
    await page.waitForTimeout(100);
    expect(tracker.timelineRequests).toBe(requestsBeforePull + 1);
    await expect(page).toHaveURL(/tab=timeline/);
    await expect(page).toHaveURL(/type=MEMORY/);
    await expect(
      page.getByRole('tab', { name: de.story.tabTimeline }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page
        .getByRole('button', {
          name: storyProducts.storyFilters.toggleButton,
          exact: true,
        })
        .locator('.story-filter-active-badge'),
    ).toHaveText('1');
  });
});
