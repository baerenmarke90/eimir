import { fulfillEmptyMomentPlaces } from '../support/photoSources';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { readFile, writeFile } from 'node:fs/promises';
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

async function expectHeartDetailContainment(page: Page): Promise<void> {
  const geometry = await page
    .locator('.heart-moment-detail-container article')
    .evaluate((card) => {
      const bounds = card.getBoundingClientRect();
      return [
        ...card.children,
        ...card.querySelectorAll('.heart-moment-provenance-footer > *'),
      ].map((element) => ({
        left: element.getBoundingClientRect().left - bounds.left,
        right: bounds.right - element.getBoundingClientRect().right,
      }));
    });
  for (const item of geometry) {
    expect(item.left).toBeGreaterThanOrEqual(0);
    expect(item.right).toBeGreaterThanOrEqual(0);
  }
  const action = await page
    .locator('.heart-moment-visibility-action')
    .boundingBox();
  expect(action?.width).toBeGreaterThanOrEqual(44);
  expect(action?.height).toBeGreaterThanOrEqual(44);
}

async function installApiMocks(page: Page): Promise<string[]> {
  const unexpectedRequests: string[] = [];
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
    isSensitive: false,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    position: 0,
  };
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillEmptyMomentPlaces(route)) return;
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
    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/story-views`
    ) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/partner-nickname`
    ) {
      await fulfillJson({ partnerId: null, nickname: null, version: 0 });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/entitlements`
    ) {
      await fulfillJson({
        spaceId: SPACE_ID,
        status: 'FREE',
        tier: 'FREE',
        capabilities: [],
        isInGracePeriod: false,
      });
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
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/attachments/${ATTACHMENT_ID}/content`
    ) {
      await route.fulfill({ contentType: 'image/jpeg', body: photo });
      return;
    }

    if (
      pathname ===
      `/api/v1/spaces/${SPACE_ID}/attachments/${ATTACHMENT_ID}/read-access`
    ) {
      await fulfillJson({
        method: 'STREAM',
        url: `/api/v1/spaces/${SPACE_ID}/attachments/${ATTACHMENT_ID}/content`,
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

    unexpectedRequests.push(`${method} ${pathname}`);
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
  return unexpectedRequests;
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function openHeartMomentCreate(page: Page): Promise<string[]> {
  const unexpectedRequests = await installApiMocks(page);
  await page.goto('/today');
  await signIn(page);
  await page.goto('/story/heart-moments/new');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: storyProducts.heartMomentProduct.createHeading,
    }),
  ).toBeVisible();
  return unexpectedRequests;
}

async function openVisibilityJourney(page: Page, failSecond = true) {
  const unexpectedRequests = await openHeartMomentCreate(page);
  await page.locator('#heart-moment-text').fill('A quiet afternoon together');
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith(`/spaces/${SPACE_ID}/heart-moments`),
  );
  await page
    .getByRole('button', { name: storyProducts.heartMomentProduct.save })
    .click();
  let current = (await (await created).json()) as Record<string, unknown>;
  await expect(page).toHaveURL(
    /\/story\/heart-moments\/44444444-4444-4444-8444-444444444444$/,
  );
  await expect(
    page.getByRole('heading', {
      name: 'A quiet afternoon together',
      exact: true,
    }),
  ).toBeVisible();
  let releaseFirst = () => {};
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const patches: { ifMatch: string | null; body: unknown }[] = [];
  const path = `/api/v1/spaces/${SPACE_ID}/heart-moments/44444444-4444-4444-8444-444444444444`;
  await page.route(`**${path}`, async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(current),
    });
  });
  await page.route(`**${path}/visibility`, async (route) => {
    expect(route.request().method()).toBe('PATCH');
    const request = route.request();
    patches.push({
      ifMatch: request.headers()['if-match'] ?? null,
      body: request.postDataJSON(),
    });
    const index = patches.length;
    if (index === 1) await firstGate;
    if (index === 2 && failSecond) {
      await route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          title: 'Temporarily unavailable',
          detail: 'Synthetic visibility failure',
          type: 'about:blank',
        }),
      });
      return;
    }
    current = {
      ...current,
      visibility: request.postDataJSON().visibility,
      version: Number(current.version) + 1,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(current),
    });
  });
  return { unexpectedRequests, patches, releaseFirst };
}

for (const viewport of [
  { width: 390, theme: 'light', large: false },
  { width: 430, theme: 'dark', large: false },
  { width: 1440, theme: 'light', large: false },
  { width: 1440, theme: 'dark', large: false },
  { width: 320, theme: 'dark', large: true },
] as const) {
  test(`Heart Moment visibility retains pending through return and deliberate retry at ${viewport.width}px ${viewport.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: viewport.width, height: 900 });
    await page.emulateMedia({
      colorScheme: viewport.theme,
      reducedMotion: 'reduce',
    });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    const state = await openVisibilityJourney(page);
    if (viewport.large)
      await page.locator('html').evaluate((element) => {
        element.style.fontSize = '200%';
      });
    const makePrivate = page.getByRole('button', {
      name: storyProducts.heartMomentProduct.makePrivate,
      exact: true,
    });
    const makeShared = page.getByRole('button', {
      name: storyProducts.heartMomentProduct.makeShared,
      exact: true,
    });
    const pending = page.getByText(
      storyProducts.heartMomentProduct.visibilityChanging,
      { exact: true },
    );
    await makePrivate.click();
    await expect.poll(() => state.patches.length).toBe(1);
    await expect(pending).toBeVisible();
    await expect(makePrivate).toBeDisabled();
    await page
      .getByRole('link', { name: navigation.more, exact: true })
      .click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(
      page.getByRole('heading', {
        name: 'A quiet afternoon together',
        exact: true,
      }),
    ).toHaveCount(0);
    await page.goBack();
    await expect(
      page.getByRole('heading', {
        name: 'A quiet afternoon together',
        exact: true,
      }),
    ).toBeVisible();
    const prefix = `heart-visibility-${viewport.width}-${viewport.theme}${viewport.large ? '-large' : ''}`;
    await writeFile(
      info.outputPath(`${prefix}-geometry.json`),
      JSON.stringify(
        await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          scrollX: window.scrollX,
        })),
        null,
        2,
      ),
    );
    await page.screenshot({
      path: info.outputPath(`${prefix}-return.png`),
      fullPage: true,
    });
    await expect(pending).toBeVisible();
    await expect(makePrivate).toBeDisabled();
    await expect(page.locator('.comments-panel')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectHeartDetailContainment(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    state.releaseFirst();
    await expect(makeShared).toBeEnabled();
    await expect(
      page.getByText(storyProducts.heartMomentProduct.commentsPrivate, {
        exact: true,
      }),
    ).toBeVisible();
    await expectHeartDetailContainment(page);
    await page.screenshot({
      path: info.outputPath(`${prefix}-private.png`),
      fullPage: true,
    });
    await makeShared.click();
    await expect(
      page.getByText(de.states.server.title, { exact: true }),
    ).toBeVisible();
    await expect(makeShared).toBeEnabled();
    await expect(
      page.getByText(storyProducts.heartMomentProduct.commentsPrivate, {
        exact: true,
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectHeartDetailContainment(page);
    await page.screenshot({
      path: info.outputPath(`${prefix}-error.png`),
      fullPage: true,
    });
    await makeShared.click();
    await expect(makePrivate).toBeEnabled();
    await expect(page.locator('.comments-panel')).toBeVisible();
    await expect(
      page.getByText(de.states.server.title, { exact: true }),
    ).toHaveCount(0);
    expect(state.patches).toEqual([
      { ifMatch: '1', body: { visibility: 'PRIVATE' } },
      { ifMatch: '2', body: { visibility: 'SHARED' } },
      { ifMatch: '2', body: { visibility: 'SHARED' } },
    ]);
    await page
      .getByRole('link', { name: navigation.more, exact: true })
      .click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(
      page.getByRole('heading', {
        name: 'A quiet afternoon together',
        exact: true,
      }),
    ).toHaveCount(0);
    await page.goBack();
    await expect(makePrivate).toBeEnabled();
    await expect(pending).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectHeartDetailContainment(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    for (let tabs = 0; tabs < 30; tabs += 1) {
      if (
        await makePrivate.evaluate(
          (element) => element === document.activeElement,
        )
      )
        break;
      await page.keyboard.press('Tab');
    }
    await expect(makePrivate).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`${prefix}-confirmed.png`),
      fullPage: true,
    });
    expect(state.unexpectedRequests).toEqual([]);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Heart Moment visibility offline attempt does not replay on reconnect in ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    const state = await openVisibilityJourney(page, false);
    await page.context().setOffline(true);
    const action = page.getByRole('button', {
      name: storyProducts.heartMomentProduct.makePrivate,
      exact: true,
    });
    await action.click();
    await expect(
      page.getByText(de.states.offline.title, { exact: true }),
    ).toBeVisible();
    await expect(action).toBeEnabled();
    expect(state.patches).toHaveLength(0);
    await page.screenshot({
      path: info.outputPath(`heart-visibility-offline-360-${theme}.png`),
      fullPage: true,
    });
    await page.context().setOffline(false);
    await page
      .getByRole('link', { name: navigation.more, exact: true })
      .click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(
      page.getByRole('heading', {
        name: 'A quiet afternoon together',
        exact: true,
      }),
    ).toHaveCount(0);
    await page.goBack();
    await expect(action).toBeEnabled();
    expect(state.patches).toHaveLength(0);
    await action.click();
    await expect.poll(() => state.patches.length).toBe(1);
    state.releaseFirst();
    await expect(
      page.getByRole('button', {
        name: storyProducts.heartMomentProduct.makeShared,
        exact: true,
      }),
    ).toBeEnabled();
    expect(state.patches).toHaveLength(1);
    expect(state.unexpectedRequests).toEqual([]);
  });
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
      await expect(
        page.getByText(storyProducts.heartMomentProduct.sharedHelp),
      ).toHaveCount(0);
      await expect(
        page.getByText(storyProducts.heartMomentProduct.privateHelp),
      ).toHaveCount(0);
      await expect(page.locator('.heart-moment-create-identity')).toHaveCount(
        0,
      );

      const emotion = page.locator('.heart-moment-create-emotion-picker');
      const label = emotion
        .getByRole('group', {
          name: storyProducts.heartMomentProduct.emotionLabel,
        })
        .locator('legend');
      const [surfaceBox, labelBox] = await Promise.all([
        emotion.boundingBox(),
        label.boundingBox(),
      ]);
      if (!surfaceBox || !labelBox)
        throw new Error('Emotion group is missing.');
      expect(labelBox.y).toBeGreaterThan(surfaceBox.y);
      expect(labelBox.y + labelBox.height).toBeLessThan(
        surfaceBox.y + surfaceBox.height,
      );

      await privateRadio.check();
      await expect(privateRadio).toBeChecked();
      await expect(sharedRadio).not.toBeChecked();
      await privateRadio.focus();
      await privateRadio.press('ArrowRight');
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

      await page.locator('#heart-moment-create-heading').click();
      await page.screenshot({
        path: testInfo.outputPath(
          `shell-heart-moment-create-reference-390-${colorScheme}.png`,
        ),
        fullPage: true,
      });
      await emotion.screenshot({
        path: testInfo.outputPath(`heart-emotion-field-390-${colorScheme}.png`),
      });
      await visibility.screenshot({
        path: testInfo.outputPath(`heart-audience-390-${colorScheme}.png`),
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
    expect(sharedBox.y).toBe(privateBox.y);
    expect(sharedBox.x).toBeGreaterThanOrEqual(privateBox.x + privateBox.width);
    expect(sharedBox.height).toBeGreaterThanOrEqual(44);
    expect(privateBox.height).toBeGreaterThanOrEqual(44);

    await page.screenshot({
      path: testInfo.outputPath('shell-heart-moment-create-reference-320.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    await expectNoHorizontalOverflow(page);

    const [largeTextPrivateBox, largeTextSharedBox] = await Promise.all([
      privateCard.boundingBox(),
      sharedCard.boundingBox(),
    ]);
    if (!largeTextPrivateBox || !largeTextSharedBox) {
      throw new Error('Visibility cards did not render with large text.');
    }
    expect(largeTextSharedBox.y).toBe(largeTextPrivateBox.y);
    expect(largeTextSharedBox.x).toBeGreaterThanOrEqual(
      largeTextPrivateBox.x + largeTextPrivateBox.width,
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
