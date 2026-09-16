import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';

/**
 * R1 exact-build visual evidence (#964). Produces named screenshots into
 * docs/product/design/evidence/r1/, mirroring the F2 evidence layout. This
 * is supplementary to the behavioral regression coverage in
 * memory-create-defaults.spec.ts / create-surface-visual-checks.spec.ts /
 * f2-task-boundaries.spec.ts, not a replacement for it.
 */

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const MEMORY_ID = '44444444-4444-4444-8444-444444444444';
const TEST_NOW = '2026-09-16T10:00:00Z';
const EVIDENCE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docs',
  'product',
  'design',
  'evidence',
  'r1',
);
const CABIN_FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'backend',
  'demo_assets',
  'images',
  'cabin-lake.jpg',
);
const ATTACHMENT_ID = '55555555-5555-4555-8555-555555555555';

interface MemoryCreateRequestBody {
  body?: string;
  happenedOn?: string | null;
  title?: string;
}

async function installApiMocks(page: Page): Promise<void> {
  let savedMemory: Record<string, unknown> | null = null;
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
          accessToken: 'r1-evidence-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'r1-evidence-refresh-token',
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
    const attachment = {
      id: ATTACHMENT_ID,
      spaceId: SPACE_ID,
      ownerId: ACCOUNT_ID,
      version: 1,
      status: 'READY',
      mediaType: 'IMAGE',
      mimeType: 'image/jpeg',
      size: 12_345,
      originalName: 'cabin-lake.jpg',
      width: 1200,
      height: 800,
      hasThumbnail: true,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
      position: 0,
    };
    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/attachments`
    ) {
      await fulfillJson(
        {
          attachment,
          method: 'STREAM',
          requiredHeaders: {},
          uploadUrl: `/api/v1/spaces/${SPACE_ID}/attachments/${ATTACHMENT_ID}/bytes`,
        },
        201,
      );
      return;
    }
    if (pathname.endsWith(`/attachments/${ATTACHMENT_ID}/bytes`)) {
      await route.fulfill({ status: 204 });
      return;
    }
    if (
      pathname.endsWith(`/attachments/${ATTACHMENT_ID}/finalize`) ||
      pathname.endsWith(`/attachments/${ATTACHMENT_ID}`)
    ) {
      await fulfillJson(attachment);
      return;
    }
    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories`
    ) {
      const body = request.postDataJSON() as MemoryCreateRequestBody;
      savedMemory = {
        attachments: [],
        author: { accountId: ACCOUNT_ID, displayName: 'Anna' },
        authorId: ACCOUNT_ID,
        body: body.body ?? '',
        capabilities: { canEdit: true, canDelete: true },
        createdAt: TEST_NOW,
        happenedOn: body.happenedOn ?? null,
        id: MEMORY_ID,
        spaceId: SPACE_ID,
        title: body.title ?? '',
        updatedAt: TEST_NOW,
        version: 1,
      };
      await fulfillJson(savedMemory, 201);
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/memories/${MEMORY_ID}` &&
      savedMemory
    ) {
      await fulfillJson(savedMemory);
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
      await fulfillJson({
        availableYears: [],
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      return;
    }
    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The evidence run did not define this API request: ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected evidence request',
      },
      500,
    );
  });
}

async function openMemoryCreate(page: Page): Promise<void> {
  await installApiMocks(page);
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await page.goto('/story/memories/new');
  await expect(
    page.getByRole('heading', { name: de.memory.heading }),
  ).toBeVisible();
}

test.describe('R1 Memory Create evidence', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [320, 360, 390, 430, 1280]) {
      test(`initial empty composition at ${width}px (${colorScheme})`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 900 });
        await openMemoryCreate(page);
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `r1-empty-${width}-${colorScheme}.png`),
        });
      });
    }
  }

  test('text-only capture: narrative visible immediately, no photo placeholder', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await openMemoryCreate(page);
    await page
      .getByLabel(de.memory.bodyLabel, { exact: true })
      .fill('Wir haben heute den ganzen Nachmittag am See verbracht.');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'r1-text-only-390-light.png'),
    });
  });

  test('title-only capture: title filled, narrative and photo still empty', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await openMemoryCreate(page);
    await page
      .getByLabel(de.memory.titleLabelOptional, { exact: true })
      .fill('Unser Tag am See');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'r1-title-only-390-light.png'),
    });
  });

  test('photo-only capture: selected media becomes visually dominant', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await openMemoryCreate(page);
    await page.locator('#memory-create-images').setInputFiles(CABIN_FIXTURE);
    await expect(page.getByText(de.memory.photoReady)).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'r1-photo-only-390-light.png'),
    });
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`mixed capture: photo, narrative and title together, plus date change and audience (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 390, height: 1000 });
      await openMemoryCreate(page);
      await page.locator('#memory-create-images').setInputFiles(CABIN_FIXTURE);
      await expect(page.getByText(de.memory.photoReady)).toBeVisible();
      await page
        .getByLabel(de.memory.bodyLabel, { exact: true })
        .fill('Wir haben heute den ganzen Nachmittag am See verbracht.');
      await page
        .getByLabel(de.memory.titleLabelOptional, { exact: true })
        .fill('Unser Tag am See');
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `r1-mixed-390-${colorScheme}.png`),
      });
      await page
        .getByRole('button', { name: new RegExp(de.memory.dateLabel) })
        .click();
      await page.screenshot({
        path: path.join(
          EVIDENCE_DIR,
          `r1-mixed-date-open-390-${colorScheme}.png`,
        ),
      });
    });
  }

  test('320 reflow has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openMemoryCreate(page);
    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });

  test('200% text remains operable at 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await openMemoryCreate(page);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(
      page.getByLabel(de.memory.bodyLabel, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: de.memory.save }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'r1-200pct-text-390-light.png'),
      fullPage: true,
    });
  });

  test('reduced motion preserves the same resting composition', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 900 });
    await openMemoryCreate(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'r1-reduced-motion-390-light.png'),
    });
  });

  test('confirmed save opens the actual canonical Memory', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await openMemoryCreate(page);
    await page
      .getByLabel(de.memory.bodyLabel, { exact: true })
      .fill('Ein Nachmittag, den wir nie vergessen werden.');
    await page.getByRole('button', { name: de.memory.save }).click();
    await expect(page).toHaveURL(new RegExp(`/story/memories/${MEMORY_ID}`));
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'r1-confirmed-result-390-light.png'),
    });
  });
});
