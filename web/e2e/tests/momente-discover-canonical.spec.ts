import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '99999999-9999-4999-8999-999999999999';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const ME = { id: ACCOUNT_ID, displayName: 'Lea Sommer' };
const PARTNER = { id: PARTNER_ID, displayName: 'Alex' };
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };

interface RequestTracker {
  discoverRequests: number;
  timelineRequests: number;
}

function discoverSelection() {
  const lead = {
    kind: 'MEMORY',
    effectiveDate: '2026-09-12T08:30:00Z',
    memory: {
      id: 'discover-lead',
      title: 'Morning by the lake',
      body: 'A quiet morning worth rediscovering.',
      happenedOn: '2026-09-12',
      createdAt: '2026-09-12T08:30:00Z',
      author: ME,
      capabilities: CAPABILITIES,
      visibility: 'SHARED',
      attachments: [],
    },
  };

  return {
    selectionDate: '2026-09-17',
    lead,
    leadContext: null,
    items: [
      {
        kind: 'HEART_MOMENT',
        effectiveDate: '2026-05-04T19:00:00Z',
        heartMoment: {
          id: 'discover-heart',
          text: 'Thinking of you',
          emotion: 'LOVED',
          happenedOn: '2026-05-04',
          createdAt: '2026-05-04T19:00:00Z',
          author: PARTNER,
          capabilities: CAPABILITIES,
          visibility: 'SHARED',
          attachment: null,
        },
      },
      {
        kind: 'MILESTONE',
        effectiveDate: '2024-11-18T00:00:00Z',
        milestone: {
          id: 'discover-milestone',
          title: 'Our first apartment',
          body: null,
          happenedOn: '2024-11-18',
          createdAt: '2024-11-18T00:00:00Z',
          author: ME,
          capabilities: CAPABILITIES,
        },
      },
      {
        kind: 'MEMORY',
        effectiveDate: '2025-02-14T18:00:00Z',
        memory: {
          id: 'discover-memory',
          title: 'Winter evening',
          body: 'Hot tea and nowhere else to be.',
          happenedOn: '2025-02-14',
          createdAt: '2025-02-14T18:00:00Z',
          author: PARTNER,
          capabilities: CAPABILITIES,
          visibility: 'SHARED',
          attachments: [],
        },
      },
    ],
  };
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
          accessToken: 'discover-971-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'discover-971-refresh-token',
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
      pathname === `/api/v1/spaces/${SPACE_ID}/discover`
    ) {
      tracker.discoverRequests += 1;
      await fulfillJson(discoverSelection());
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
      tracker.timelineRequests += 1;
      await fulfillJson({
        items: [],
        availableYears: [],
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
  await page.goto('/story?tab=discover');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function captureEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
}

test.describe('Momente canonical Discover integration (#971 Slice 4)', () => {
  test('uses only canonical Discover data and captures Compact and Expanded evidence', async ({
    page,
  }, testInfo) => {
    const tracker: RequestTracker = {
      discoverRequests: 0,
      timelineRequests: 0,
    };

    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, tracker);
    await signIn(page);
    await page.waitForSelector('.momente-discover-page');

    expect(tracker.discoverRequests).toBeGreaterThan(0);
    expect(tracker.timelineRequests).toBe(0);
    await expect(page.getByText('Morning by the lake')).toBeVisible();
    await expect(page.getByText('Thinking of you')).toBeVisible();
    await expect(page.getByText('Our first apartment')).toBeVisible();
    await expect(page.getByText('Winter evening')).toBeVisible();

    await captureEvidence(page, testInfo, 'story-971-discover-390-compact.png');

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.momente-discover-page')).toBeVisible();
    expect(tracker.timelineRequests).toBe(0);
    await captureEvidence(
      page,
      testInfo,
      'story-971-discover-1440-expanded.png',
    );
  });
});
