import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import storyProducts from '../../src/i18n/locales/storyProducts';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-11T10:00:00Z';

function localToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function installApiMocks(page: Page): Promise<void> {
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

async function openHeartMomentCreate(page: Page): Promise<void> {
  await installApiMocks(page);
  await page.goto('/today');
  await signIn(page);
  await page.goto('/story/heart-moments/new');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: storyProducts.heartMomentProduct.createHeading,
    }),
  ).toBeVisible();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Heart Moment Create matches the #862 Compact composition (${colorScheme})`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
      colorScheme,
    });
    const page = await context.newPage();

    try {
      await openHeartMomentCreate(page);

      const form = page.locator('.heart-moment-create-form');
      const media = page.locator('.heart-moment-create-media');
      const note = page.locator('.heart-moment-create-note');
      const visibility = page.locator('.heart-moment-create-visibility');
      const actions = page.locator('.heart-moment-create-actions');
      const photoInput = page.locator('#heart-moment-create-photo');
      const sharedRadio = page.locator(
        '#heart-moment-create-visibility-shared',
      );
      const privateRadio = page.locator(
        '#heart-moment-create-visibility-private',
      );
      const privacySummary = page.locator(
        '.heart-moment-create-privacy-summary',
      );
      const saveButton = page.getByRole('button', {
        name: storyProducts.heartMomentProduct.save,
      });

      await expect(form).toBeVisible();
      await expect(media).toBeVisible();
      await expect(note).toBeVisible();
      await expect(visibility).toBeVisible();
      await expect(actions).toBeVisible();

      // The photo is intentionally prominent in #862 but remains optional.
      await expect(photoInput).not.toHaveAttribute('required', '');

      // Preserve the existing product default while making the choice explicit.
      await expect(sharedRadio).toBeChecked();
      await expect(privateRadio).not.toBeChecked();
      await expect(privacySummary).toHaveText(
        storyProducts.heartMomentProduct.sharedHelp,
      );

      await privateRadio.check();
      await expect(privateRadio).toBeChecked();
      await expect(sharedRadio).not.toBeChecked();
      await expect(privacySummary).toHaveText(
        storyProducts.heartMomentProduct.privateHelp,
      );

      await sharedRadio.check();
      await expect(sharedRadio).toBeChecked();

      const dateInput = page.getByLabel(
        storyProducts.heartMomentProduct.happenedOnLabel,
        { exact: true },
      );
      await expect(dateInput).toHaveValue(localToday());

      const domOrder = await form.evaluate((element) => {
        const children = Array.from(element.children);
        return {
          media: children.findIndex((child) =>
            child.classList.contains('heart-moment-create-media'),
          ),
          note: children.findIndex((child) =>
            child.classList.contains('heart-moment-create-note'),
          ),
          visibility: children.findIndex((child) =>
            child.classList.contains('heart-moment-create-visibility'),
          ),
          actions: children.findIndex((child) =>
            child.classList.contains('heart-moment-create-actions'),
          ),
        };
      });
      expect(domOrder.media).toBeGreaterThanOrEqual(0);
      expect(domOrder.media).toBeLessThan(domOrder.note);
      expect(domOrder.note).toBeLessThan(domOrder.visibility);
      expect(domOrder.visibility).toBeLessThan(domOrder.actions);

      const [saveBox, formBox] = await Promise.all([
        saveButton.boundingBox(),
        form.boundingBox(),
      ]);
      if (!saveBox || !formBox) throw new Error('Create form did not render.');
      expect(saveBox.height).toBeGreaterThanOrEqual(48);
      expect(saveBox.width).toBeGreaterThan(formBox.width * 0.9);

      await expectNoHorizontalOverflow(page);

      const axeResult = await new AxeBuilder({ page })
        .include('.heart-moment-create-page')
        .withTags([
          'wcag2a',
          'wcag2aa',
          'wcag21a',
          'wcag21aa',
          'wcag22a',
          'wcag22aa',
        ])
        .analyze();
      expect(axeResult.violations).toEqual([]);

      await page.screenshot({
        path: testInfo.outputPath(
          `shell-heart-moment-create-reference-390-${colorScheme}.png`,
        ),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  });
}

test('Heart Moment Create reflows at 320px and large text without horizontal overflow (#862)', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 568 },
  });
  const page = await context.newPage();

  try {
    await openHeartMomentCreate(page);
    await expectNoHorizontalOverflow(page);

    const privateCard = page
      .locator('.heart-moment-create-visibility-option')
      .filter({ has: page.locator('#heart-moment-create-visibility-private') });
    const sharedCard = page
      .locator('.heart-moment-create-visibility-option')
      .filter({ has: page.locator('#heart-moment-create-visibility-shared') });
    const [privateBox, sharedBox] = await Promise.all([
      privateCard.boundingBox(),
      sharedCard.boundingBox(),
    ]);
    if (!privateBox || !sharedBox) {
      throw new Error('Visibility cards did not render at 320px.');
    }
    expect(sharedBox.y).toBeGreaterThan(privateBox.y + privateBox.height - 1);

    await page.screenshot({
      path: testInfo.outputPath('shell-heart-moment-create-reference-320.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '24px';
    });
    await expectNoHorizontalOverflow(page);

    const [largeTextPrivateBox, largeTextSharedBox] = await Promise.all([
      privateCard.boundingBox(),
      sharedCard.boundingBox(),
    ]);
    if (!largeTextPrivateBox || !largeTextSharedBox) {
      throw new Error('Visibility cards did not render with large text.');
    }
    expect(largeTextSharedBox.y).toBeGreaterThan(
      largeTextPrivateBox.y + largeTextPrivateBox.height - 1,
    );

    await page.screenshot({
      path: testInfo.outputPath(
        'shell-heart-moment-create-reference-large-text.png',
      ),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

test('Heart Moment Create preserves the reference rhythm on a small-height phone (#862)', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 667 },
  });
  const page = await context.newPage();

  try {
    await openHeartMomentCreate(page);
    await expectNoHorizontalOverflow(page);
    await expect(
      page.getByRole('button', {
        name: storyProducts.heartMomentProduct.save,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(
        'shell-heart-moment-create-reference-small-height.png',
      ),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

test('Heart Moment Create adapts the Compact reference to Expanded Web (#862)', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openHeartMomentCreate(page);

  const pageSurface = page.locator('.heart-moment-create-page');
  const form = page.locator('.heart-moment-create-form');
  const [pageBox, formBox] = await Promise.all([
    pageSurface.boundingBox(),
    form.boundingBox(),
  ]);
  if (!pageBox || !formBox)
    throw new Error('Expanded create form did not render.');

  expect(pageBox.width).toBeLessThanOrEqual(680);
  expect(formBox.width).toBeLessThanOrEqual(680);
  await expectNoHorizontalOverflow(page);

  await page.screenshot({
    path: testInfo.outputPath(
      'shell-heart-moment-create-reference-expanded.png',
    ),
    fullPage: true,
  });
});
