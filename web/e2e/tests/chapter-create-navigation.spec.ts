import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-01T10:00:00Z';
const CHAPTER_TITLE = 'Unser erster gemeinsamer Sommer';

/**
 * A focused mock harness for the Chapter Create navigation flow: it exists to
 * prove "Kapitel hinzufügen" leaves the Chapters overview entirely rather than
 * opening an inline create form underneath the list (the rejected #790/#793
 * behavior), lands on a dedicated Create surface, and returns to the newly
 * created Chapter's own page on success.
 */
async function installChapterApiMocks(
  page: Page,
): Promise<{ createChapterCalls: number }> {
  const calls = { createChapterCalls: 0 };
  let createdChapterId: string | null = null;

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
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
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
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
        upcoming: [],
      });
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

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters`
    ) {
      calls.createChapterCalls += 1;
      const body = request.postDataJSON() as {
        title: string;
        description?: string;
        startOn?: string;
        endOn?: string;
        placeId?: string;
      };
      createdChapterId = 'chapter-1';
      await fulfillJson(
        {
          capabilities: { canEdit: true, canDelete: true },
          createdAt: TEST_NOW,
          createdBy: ACCOUNT_ID,
          creator: { accountId: ACCOUNT_ID, displayName: 'Anna' },
          description: body.description ?? null,
          endOn: body.endOn ?? null,
          id: createdChapterId,
          placeId: body.placeId ?? null,
          spaceId: SPACE_ID,
          startOn: body.startOn ?? null,
          title: body.title,
          updatedAt: TEST_NOW,
          version: 1,
        },
        201,
      );
      return;
    }

    if (
      method === 'GET' &&
      createdChapterId &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters/${createdChapterId}`
    ) {
      await fulfillJson({
        capabilities: { canEdit: true, canDelete: true },
        createdAt: TEST_NOW,
        createdBy: ACCOUNT_ID,
        creator: { accountId: ACCOUNT_ID, displayName: 'Anna' },
        description: null,
        endOn: null,
        id: createdChapterId,
        placeId: null,
        spaceId: SPACE_ID,
        startOn: null,
        title: CHAPTER_TITLE,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      createdChapterId &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/chapters/${createdChapterId}/content`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
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

  return calls;
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

test('Kapitel hinzufügen navigates to its own Create experience instead of an inline overview form', async ({
  page,
}) => {
  await installChapterApiMocks(page);
  await page.goto('/today');
  await signIn(page);

  await page.goto('/plan/chapters');
  await expect(
    page.getByRole('heading', { name: m5s3.chapter.heading }),
  ).toBeVisible();

  // The rejected #790/#793 behavior: no inline create form under the list.
  await expect(page.locator('#chapter-create-details')).toHaveCount(0);
  await expect(page.locator('.immersive-create-card')).toHaveCount(0);

  await page.getByRole('link', { name: m5s3.chapter.create }).click();
  await expect(page).toHaveURL(/\/plan\/chapters\/new$/);
  await expect(
    page.getByRole('heading', { name: m5s3.chapter.createHeading }),
  ).toBeVisible();
});

test('creating a Chapter from its dedicated Create page saves and returns to the created Chapter', async ({
  page,
}) => {
  const calls = await installChapterApiMocks(page);
  await page.goto('/today');
  await signIn(page);

  await page.goto('/plan/chapters/new');
  await page.getByLabel(m5s3.common.title, { exact: true }).fill(CHAPTER_TITLE);
  await page.getByRole('button', { name: m5s3.common.save }).click();

  await expect(page).toHaveURL(/\/plan\/chapters\/chapter-1$/);
  await expect(
    page.getByRole('heading', { name: CHAPTER_TITLE }),
  ).toBeVisible();
  expect(calls.createChapterCalls).toBe(1);
});
