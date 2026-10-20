import { fulfillDefaultAppIcon } from './appIcon';
import fs from 'node:fs';
import path from 'node:path';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import de from '../../src/i18n/locales/de';

export const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
export const PARTNER_ID = '99999999-9999-4999-8999-999999999999';
export const SPACE_ID = '22222222-2222-4222-8222-222222222222';
export const PROFILE_ID = '33333333-3333-4333-8333-333333333333';

export const ME = { id: ACCOUNT_ID, displayName: 'Lea Sommer' };
export const PARTNER = { id: PARTNER_ID, displayName: 'Alex' };
export const CAPABILITIES = {
  canEdit: true,
  canDelete: true,
  canComment: true,
};

export const DETAIL_COMMENTS = [
  {
    id: 'comment-own',
    spaceId: SPACE_ID,
    authorId: ACCOUNT_ID,
    author: ME,
    body: 'Still smiling about this.',
    createdAt: '2026-09-16T18:00:00Z',
    updatedAt: '2026-09-16T18:00:00Z',
    version: 1,
  },
  {
    id: 'comment-partner',
    spaceId: SPACE_ID,
    authorId: PARTNER_ID,
    author: PARTNER,
    body: 'Me too.',
    createdAt: '2026-09-16T18:05:00Z',
    updatedAt: '2026-09-16T18:05:00Z',
    version: 1,
  },
];

export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export async function captureScreenshot(
  target: Page | Locator,
  testInfo: TestInfo,
  fileName: string,
  options?: { fullPage?: boolean },
): Promise<void> {
  const outputPath = testInfo.outputPath(fileName);
  await target.screenshot({ path: outputPath, ...options });
  const exportDir = process.env.SCREENSHOT_EXPORT_DIR;
  if (exportDir) {
    fs.mkdirSync(exportDir, { recursive: true });
    fs.copyFileSync(outputPath, path.join(exportDir, fileName));
  }
}

export function getTimelineItems() {
  return [
    {
      kind: 'MEMORY',
      effectiveDate: '2026-05-12T08:30:00Z',
      memory: {
        id: 'mem-canal',
        title: 'Breakfast by the canal',
        happenedOn: '2026-05-12',
        createdAt: '2026-05-12T08:30:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachments: [
          {
            id: 'att-canal-1',
            position: 0,
            status: 'READY',
            mediaType: 'IMAGE',
            mimeType: 'image/jpeg',
            hasThumbnail: true,
            width: 800,
            height: 800,
            size: 1024,
          },
        ],
      },
    },
    {
      kind: 'MEMORY',
      effectiveDate: '2026-04-03T10:00:00Z',
      memory: {
        id: 'mem-coffee',
        title: 'First coffee in new home',
        happenedOn: '2026-04-03',
        createdAt: '2026-04-03T10:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachments: [
          {
            id: 'att-coffee-1',
            position: 0,
            status: 'READY',
            mediaType: 'IMAGE',
            mimeType: 'image/jpeg',
            hasThumbnail: true,
            width: 800,
            height: 800,
            size: 1024,
          },
        ],
      },
    },
    {
      kind: 'MEMORY',
      effectiveDate: '2026-03-28T14:00:00Z',
      memory: {
        id: 'mem-hike',
        title: 'Mountain hike',
        happenedOn: '2026-03-28',
        createdAt: '2026-03-28T14:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachments: [],
      },
    },
    {
      kind: 'MILESTONE',
      effectiveDate: '2026-02-14T00:00:00Z',
      milestone: {
        id: 'ms-2years',
        title: 'Two years together',
        happenedOn: '2026-02-14',
        createdAt: '2026-02-14T00:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
      },
    },
    {
      kind: 'HEART_MOMENT',
      effectiveDate: '2026-01-20T19:00:00Z',
      heartMoment: {
        id: 'hm-love',
        text: 'Thinking of you',
        emotion: 'LOVED',
        happenedOn: '2026-01-20',
        createdAt: '2026-01-20T19:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachment: null,
      },
    },
  ];
}

export type MockOptions = {
  asPartner?: boolean;
  withDetailComments?: boolean;
  strict?: boolean;
};

export async function installMocks(
  page: Page,
  options: MockOptions = {},
): Promise<string[]> {
  const unexpected: string[] = [];
  const currentUserId = options.asPartner ? PARTNER_ID : ACCOUNT_ID;
  const currentUserName = options.asPartner ? 'Alex' : 'Lea Sommer';

  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    const fulfillJson = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname.endsWith('/partner-nickname')) {
      await fulfillJson({
        partnerId: options.asPartner ? ACCOUNT_ID : PARTNER_ID,
        nickname: null,
        version: 0,
      });
      return;
    }
    if (method === 'GET' && pathname.endsWith('/entitlements')) {
      await fulfillJson({
        spaceId: SPACE_ID,
        tier: 'FREE',
        status: 'ACTIVE',
        effectiveUntil: null,
        isInGracePeriod: false,
        capabilities: ['core'],
      });
      return;
    }
    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/story-views`
    ) {
      await route.fulfill({ status: 204 });
      return;
    }

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
        account: { displayName: currentUserName, id: currentUserId },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'timeline-ref-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'timeline-ref-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: currentUserName, id: currentUserId });
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
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${currentUserId}`
    ) {
      await fulfillJson({
        accountId: currentUserId,
        createdAt: '2023-06-17T00:00:00Z',
        displayName: currentUserName,
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
      method === 'POST' &&
      pathname.includes('/attachments/') &&
      pathname.endsWith('/read-access')
    ) {
      const match = pathname.match(/\/attachments\/([^/]+)\/read-access/);
      const attId = match ? match[1] : 'att';
      await fulfillJson({
        method: 'STREAM',
        url: `/api/v1/spaces/${SPACE_ID}/attachments/${attId}/content`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname.includes('/attachments/') &&
      pathname.endsWith('/content')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: TINY_PNG,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
      const url = new URL(request.url());
      const typeParam =
        url.searchParams.get('type') || url.searchParams.get('kind');
      let items = getTimelineItems();
      if (typeParam) {
        items = items.filter((item) => item.kind === typeParam);
      }
      await fulfillJson({
        items,
        hasMore: false,
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/discover`
    ) {
      const items = getTimelineItems();
      await fulfillJson({
        selectionDate: '2026-09-17',
        lead: items[0] ?? null,
        items: items.slice(1),
        leadContext: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories/mem-canal`
    ) {
      await fulfillJson({
        id: 'mem-canal',
        spaceId: SPACE_ID,
        title: 'Breakfast by the canal',
        body: 'A wonderful morning by the water.',
        happenedOn: '2026-05-12',
        author: ME,
        authorId: ACCOUNT_ID,
        attachments: [],
        capabilities: CAPABILITIES,
        createdAt: '2026-05-12T08:30:00Z',
        updatedAt: '2026-05-12T08:30:00Z',
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories/mem-canal/comments`
    ) {
      await fulfillJson({
        hasMore: false,
        items: options.withDetailComments ? DETAIL_COMMENTS : [],
        nextCursor: null,
      });
      return;
    }
    if (
      method === 'GET' &&
      ['mem-coffee', 'mem-hike'].some(
        (id) =>
          pathname === `/api/v1/spaces/${SPACE_ID}/memories/${id}/comments`,
      )
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/heart-moments/hm-love`
    ) {
      await fulfillJson({
        id: 'hm-love',
        spaceId: SPACE_ID,
        text: 'Thinking of you',
        emotion: 'LOVED',
        happenedOn: '2026-01-20',
        author: ME,
        authorId: ACCOUNT_ID,
        capabilities: CAPABILITIES,
        createdAt: '2026-01-20T19:00:00Z',
        updatedAt: '2026-01-20T19:00:00Z',
        version: 1,
        visibility: 'SHARED',
        attachment: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/heart-moments/hm-love/comments`
    ) {
      await fulfillJson({
        hasMore: false,
        items: options.withDetailComments ? DETAIL_COMMENTS : [],
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/milestones/ms-2years`
    ) {
      await fulfillJson({
        id: 'ms-2years',
        spaceId: SPACE_ID,
        title: 'Two years together',
        description: 'Celebrating our anniversary.',
        happenedOn: '2026-02-14',
        author: ME,
        authorId: ACCOUNT_ID,
        capabilities: CAPABILITIES,
        createdAt: '2026-02-14T00:00:00Z',
        updatedAt: '2026-02-14T00:00:00Z',
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/milestones/ms-2years/comments`
    ) {
      await fulfillJson({
        hasMore: false,
        items: options.withDetailComments ? DETAIL_COMMENTS : [],
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters`
    ) {
      await fulfillJson({
        items: [],
        hasMore: false,
        nextCursor: null,
      });
      return;
    }

    if (options.strict) {
      unexpected.push(`${method} ${pathname}`);
      await fulfillJson({ code: 'UNEXPECTED_TEST_REQUEST' }, 500);
    } else await fulfillJson({}, 200);
  });
  return unexpected;
}

export async function signIn(
  page: Page,
  email = 'lea@example.org',
): Promise<void> {
  await page.goto('/story?tab=timeline');
  await page.getByLabel(de.login.email).fill(email);
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}
