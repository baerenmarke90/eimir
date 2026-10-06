import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import contextTags from '../../src/i18n/locales/contextTags';
import navigation from '../../src/i18n/locales/navigation';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const ATTACHMENT_ID = '55555555-5555-4555-8555-555555555555';
const TEST_NOW = '2026-09-11T10:00:00Z';
const PHOTO = new URL(
  '../../../backend/demo_assets/images/cabin-lake.jpg',
  import.meta.url,
);

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
  let savedMoment: Record<string, unknown> | null = null;
  const photo = await readFile(PHOTO);
  const attachment = {
    id: ATTACHMENT_ID,
    spaceId: SPACE_ID,
    ownerId: ACCOUNT_ID,
    version: 1,
    status: 'READY',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    size: photo.length,
    originalName: 'cabin-lake.jpg',
    width: 1200,
    height: 800,
    hasThumbnail: true,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    position: 0,
  };
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
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
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

    if (
      pathname ===
      `/api/v1/spaces/${SPACE_ID}/attachments/${ATTACHMENT_ID}/bytes`
    ) {
      await route.fulfill(
        method === 'PUT'
          ? { status: 204 }
          : { contentType: 'image/jpeg', body: photo },
      );
      return;
    }

    if (
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/attachments/${ATTACHMENT_ID}/finalize` ||
      pathname === `/api/v1/spaces/${SPACE_ID}/attachments/${ATTACHMENT_ID}`
    ) {
      await fulfillJson(attachment);
      return;
    }

    if (
      pathname ===
      `/api/v1/spaces/${SPACE_ID}/attachments/${ATTACHMENT_ID}/read-access`
    ) {
      await fulfillJson({
        method: 'STREAM',
        url: `/api/v1/spaces/${SPACE_ID}/attachments/${ATTACHMENT_ID}/bytes`,
      });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/heart-moments`
    ) {
      const submitted = request.postDataJSON();
      savedMoment = {
        ...submitted,
        id: '44444444-4444-4444-8444-444444444444',
        spaceId: SPACE_ID,
        authorId: ACCOUNT_ID,
        author: { id: ACCOUNT_ID, displayName: 'Anna' },
        capabilities: { canEdit: true, canDelete: true, canComment: true },
        attachment: submitted.attachmentId ? attachment : null,
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
        version: 1,
      };
      await fulfillJson(savedMoment, 201);
      return;
    }

    if (
      method === 'PATCH' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/heart-moments/44444444-4444-4444-8444-444444444444` &&
      savedMoment
    ) {
      savedMoment = {
        ...savedMoment,
        ...request.postDataJSON(),
        version: Number(savedMoment.version) + 1,
      };
      await fulfillJson(savedMoment);
      return;
    }

    if (
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/heart-moments/44444444-4444-4444-8444-444444444444` &&
      savedMoment
    ) {
      await fulfillJson(savedMoment);
      return;
    }

    if (
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/heart-moments/44444444-4444-4444-8444-444444444444/comments`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
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

test('custom tag-only Heart Moment survives create, reload, edit and removal (#1290)', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openHeartMomentCreate(page);
  await page.getByLabel(contextTags.newLabel).fill('Ostsee');
  await page.getByLabel(contextTags.newLabel).press('Enter');
  await expect(page.locator('#heart-moment-text')).toHaveValue('');
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: testInfo.outputPath('shell-heart-tags-selected-390.png'),
    fullPage: true,
  });

  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().endsWith(`/spaces/${SPACE_ID}/heart-moments`),
  );
  await page
    .getByRole('button', { name: storyProducts.heartMomentProduct.save })
    .click();
  const request = await requestPromise;
  expect(request.postDataJSON()).toEqual(
    expect.objectContaining({
      text: '',
      tags: ['Ostsee'],
    }),
  );
  await expect(page).toHaveURL(
    /\/story\/heart-moments\/44444444-4444-4444-8444-444444444444$/,
  );
  await expect(
    page.getByRole('heading', {
      name: storyProducts.heartMomentProduct.untitled,
    }),
  ).toBeVisible();
  await expect(page.getByText('Ostsee', { exact: true })).toBeVisible();
  await expect(page.locator('.comments-panel')).toBeVisible();
  await expect(page.locator('.comments-panel .ui-state')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('shell-heart-tags-detail-390.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByText('Ostsee', { exact: true })).toBeVisible();
  await page
    .getByRole('link', {
      name: storyProducts.heartMomentProduct.edit,
      exact: true,
    })
    .click();
  await page
    .getByRole('button', {
      name: contextTags.remove.replace('{{tag}}', 'Ostsee'),
    })
    .click();
  await page.getByLabel(contextTags.newLabel).fill('Our tradition');
  const update = page.waitForRequest(
    (request) =>
      request.method() === 'PATCH' &&
      request.url().includes('/heart-moments/44444444'),
  );
  await page
    .getByRole('button', { name: storyProducts.heartMomentProduct.save })
    .click();
  expect((await update).postDataJSON().tags).toEqual(['Our tradition']);
  await expect(page).toHaveURL(
    /\/story\/heart-moments\/44444444-4444-4444-8444-444444444444$/,
  );
  await page.reload();
  await expect(page.getByText('Our tradition', { exact: true })).toBeVisible();
  await expect(page.getByText('Ostsee', { exact: true })).toHaveCount(0);
});

test('photo-only Heart Moment saves without text and opens its photo (#509)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHeartMomentCreate(page);
  await expect(page.locator('#heart-moment-text')).not.toBeFocused();
  await page.locator('#heart-moment-create-photo').setInputFiles({
    name: 'cabin-lake.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(PHOTO),
  });
  await expect(page.getByText(de.memory.photoReady)).toBeVisible();
  await expect(page.locator('#heart-moment-text')).toHaveValue('');

  const createRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().endsWith(`/spaces/${SPACE_ID}/heart-moments`),
  );
  await page
    .getByRole('button', { name: storyProducts.heartMomentProduct.save })
    .click();
  expect((await createRequest).postDataJSON()).toEqual(
    expect.objectContaining({
      text: '',
      tags: [],
      attachmentId: ATTACHMENT_ID,
    }),
  );
  await expect(page).toHaveURL(
    /\/story\/heart-moments\/44444444-4444-4444-8444-444444444444$/,
  );
  await expect(
    page.getByRole('heading', {
      name: storyProducts.heartMomentProduct.untitled,
    }),
  ).toBeVisible();
  const savedPhoto = page.locator('.media-gallery-thumb-content');
  await expect(savedPhoto).toBeVisible();
  await expect
    .poll(() =>
      savedPhoto.evaluate(
        (element) => (element as HTMLImageElement).naturalWidth,
      ),
    )
    .toBeGreaterThan(0);
  await page.locator('.shell-detail-back').click();
  await expect(page).toHaveURL(/\/story$/);
});

test('Quick Create Heart Moment returns from a saved tag-only result to Today (#509)', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    await installApiMocks(page);
    await page.goto('/today');
    await signIn(page);
    await expect(page.locator('.today-content')).toBeVisible();
    await expect(page.locator('.today-page .ui-state-error')).toHaveCount(0);

    await page
      .getByRole('button', { name: navigation.newContent, exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: navigation.quickCreateTitle }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('shell-heart-quick-create-sheet-390.png'),
      fullPage: true,
    });
    await page
      .getByRole('link', {
        name: navigation.quickCreateHeartMoment,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/story\/heart-moments\/new$/);
    await expect(
      page.getByRole('button', { name: taskBoundary.back, exact: true }),
    ).toBeVisible();
    await expect(page.locator('#heart-moment-text')).not.toBeFocused();
    await page.getByRole('button', { name: de.common.cancel }).click();
    await expect(page).toHaveURL(/\/today$/);
    await page
      .getByRole('button', { name: navigation.newContent, exact: true })
      .click();
    await page
      .getByRole('link', {
        name: navigation.quickCreateHeartMoment,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/story\/heart-moments\/new$/);
    await page.screenshot({
      path: testInfo.outputPath('shell-heart-quick-create-task-390.png'),
      fullPage: true,
    });

    await page.getByText(contextTags.suggestions, { exact: true }).click();
    await page
      .getByRole('checkbox', {
        name: storyProducts.heartMomentProduct.tagLabels.everyday,
      })
      .check();
    const createRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().endsWith(`/spaces/${SPACE_ID}/heart-moments`),
    );
    await page
      .getByRole('button', { name: storyProducts.heartMomentProduct.save })
      .click();
    expect((await createRequest).postDataJSON()).toEqual(
      expect.objectContaining({ text: '', tags: ['everyday'] }),
    );
    await expect(page).toHaveURL(
      /\/story\/heart-moments\/44444444-4444-4444-8444-444444444444$/,
    );
    await expect(
      page.getByRole('heading', {
        name: storyProducts.heartMomentProduct.untitled,
      }),
    ).toBeVisible();
    await expect(page.locator('.comments-panel .ui-state')).toHaveCount(0);
    await page.locator('.shell-detail-back').click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole('button', { name: navigation.newContent, exact: true }),
    ).toBeFocused();
  } finally {
    await context.close();
  }
});
