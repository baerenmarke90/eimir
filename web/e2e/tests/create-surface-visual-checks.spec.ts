import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import memoryProduct from '../../src/i18n/locales/memoryProduct';
import photoSources from '../../src/i18n/locales/photoSources';
import storyProducts from '../../src/i18n/locales/storyProducts';
import { expectLabeledComposerTool } from '../support/addAction';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { fulfillFreeEntitlements } from '../support/freeEntitlements';
import { expectMediaIntakeAction } from '../support/mediaIntake';
import {
  closeComposerDate,
  closeContextTags,
  expectComposerDate,
  showComposerDate,
  showContextSuggestions,
  showContextTags,
  showMemoryDetails,
} from '../support/memoryDiary';
import { fulfillUnconfiguredPhotoSources } from '../support/photoSources';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const MEMORY_ID = '44444444-4444-4444-8444-444444444444';
const TEST_NOW = '2026-09-01T10:00:00Z';
const MEMORY_TITLE = 'Ein ruhiger Sonntagmorgen';
const MEMORY_BODY =
  'Wir haben lange geschlafen und dann gemeinsam Pfannkuchen gemacht.';

// Representative authored prose remains intact at each reading width.
const PROSE_CASES = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    title: 'S wie Anfang',
    body: 'Samstagmorgen war der Himmel klar und wir haben lange gefrühstückt, bevor wir losgezogen sind.',
  },
  {
    id: MEMORY_ID,
    title: MEMORY_TITLE,
    body: MEMORY_BODY,
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    title: 'A wie Anfang',
    body: 'Am Abend saßen wir noch lange draußen und haben über die letzten Monate gesprochen.',
  },
  {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    title: 'M wie Anfang',
    body: 'Mitten in der Nacht sind wir aufgewacht, weil es draußen so heftig gewittert hat.',
  },
  {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    title: 'Kleiner Anfang',
    body: 'we enjoyed the morning together.\n\nLater we went for a walk.',
  },
] as const;

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
  if (dimensions.scrollWidth > dimensions.clientWidth) {
    const elements = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .map((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            tag: element.tagName,
            className: element.className.toString(),
            id: element.id,
            left: box.left,
            right: box.right,
            width: box.width,
            position: style.position,
            inlineSize: style.inlineSize,
            minInlineSize: style.minInlineSize,
            overflow: style.overflow,
          };
        })
        .filter(
          (element) => element.right > innerWidth + 1 && element.width > 0,
        )
        .slice(0, 30),
    );
    await test.info().attach('horizontal-overflow-geometry', {
      body: JSON.stringify({ dimensions, elements }, null, 2),
      contentType: 'application/json',
    });
  }
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

/**
 * A focused mock harness for the create-surface visual regression checks:
 * the focused Memory Create composition, the local "today"
 * date default on HeartMoment/Milestone Create, and readable Memory Detail prose.
 */
async function installApiMocks(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillFreeEntitlements(route, SPACE_ID)) return;
    if (await fulfillUnconfiguredPhotoSources(route)) return;
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

    for (const memoryCase of PROSE_CASES) {
      if (
        method === 'GET' &&
        pathname === `/api/v1/spaces/${SPACE_ID}/memories/${memoryCase.id}`
      ) {
        await fulfillJson({
          attachments: [],
          author: { accountId: ACCOUNT_ID, displayName: 'Anna' },
          authorId: ACCOUNT_ID,
          body: memoryCase.body,
          capabilities: { canEdit: true, canDelete: true },
          createdAt: TEST_NOW,
          happenedOn: TEST_NOW,
          id: memoryCase.id,
          spaceId: SPACE_ID,
          tags: memoryCase.id === MEMORY_ID ? ['home'] : [],
          title: memoryCase.title,
          updatedAt: TEST_NOW,
          version: 1,
        });
        return;
      }

      if (
        method === 'GET' &&
        pathname ===
          `/api/v1/spaces/${SPACE_ID}/memories/${memoryCase.id}/comments`
      ) {
        await fulfillJson({ hasMore: false, items: [], nextCursor: null });
        return;
      }
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

async function expectFocusedMemoryCapture(page: Page): Promise<void> {
  // #1614 explicitly retires the redundant fixed-audience block. Keep its
  // absence covered instead of requiring the removed heart and caption.
  await expect(page.locator('.immersive-sharing-note')).toHaveCount(0);
  await expect(
    page.getByText(de.memory.sharedTitle, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(de.memory.sharedBody, { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel(de.memory.titleLabelOptional)).toBeVisible();
  await expect(
    page.locator('.immersive-create-narrative textarea'),
  ).toBeVisible();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Memory Create preserves focused capture without the retired sharing block (${colorScheme})`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await installApiMocks(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/today');
    await signIn(page);

    await page.goto('/story/memories/new');
    await expect(
      page.getByRole('heading', { name: de.memory.heading }),
    ).toBeVisible();

    await expectFocusedMemoryCapture(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `shell-memory-create-expanded-${colorScheme}.png`,
      ),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expectFocusedMemoryCapture(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`shell-memory-create-390-${colorScheme}.png`),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 667 });
    await expectFocusedMemoryCapture(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `shell-memory-create-small-height-${colorScheme}.png`,
      ),
      fullPage: true,
    });

    await page.setViewportSize({ width: 320, height: 568 });
    await expectFocusedMemoryCapture(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `shell-memory-create-320-reflow-${colorScheme}.png`,
      ),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '24px';
    });
    await expectFocusedMemoryCapture(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `shell-memory-create-large-text-${colorScheme}.png`,
      ),
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });

    await showMemoryDetails(page);
    await showContextTags(page);
    await showContextSuggestions(page);
    const homeTag = page.getByRole('checkbox', {
      name: de.memory.tagLabels.home,
    });
    await expect(homeTag).not.toBeChecked();
    await page.getByText(de.memory.tagLabels.home, { exact: true }).click();
    await expect(homeTag).toBeChecked();
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `shell-memory-tags-selected-390-${colorScheme}.png`,
      ),
      fullPage: true,
    });
    for (const width of [360, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(
          `shell-memory-tags-selected-${width}-${colorScheme}.png`,
        ),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `shell-memory-tags-320-200pct-${colorScheme}.png`,
      ),
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    await homeTag.focus();
    await page.keyboard.press('Space');
    await expect(homeTag).not.toBeChecked();

    const tagAxeResult = await new AxeBuilder({ page })
      .include('dialog.composer-tag-sheet')
      .withTags([
        'wcag2a',
        'wcag2aa',
        'wcag21a',
        'wcag21aa',
        'wcag22a',
        'wcag22aa',
      ])
      .analyze();
    expect(tagAxeResult.violations).toEqual([]);
    await closeContextTags(page);

    const axeResult = await new AxeBuilder({ page })
      .include('.page-composer')
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
  });
}

for (const width of [390, 320] as const) {
  test(`Memory Create keeps Place tools and the media-first intake bounded at ${width}px (#1730)`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      hasTouch: true,
      isMobile: true,
      viewport: { width, height: 844 },
    });
    const page = await context.newPage();
    try {
      await installApiMocks(page);
      await page.goto('/today');
      await signIn(page);

      await page.goto('/story/memories/new');
      await expect(
        page.getByRole('heading', { name: de.memory.heading }),
      ).toBeVisible();

      await expectFocusedMemoryCapture(page);

      await showMemoryDetails(page);

      const title = page.getByLabel(de.memory.titleLabelOptional);
      const media = page.locator('.immersive-create-media');
      const mediaGroup = media.locator('.media-action-group');
      const picker = media.locator('.media-intake-device');
      await expectMediaIntakeAction(picker, 'foto');
      const fileInputs = media.locator('input[type="file"]');
      await expect(fileInputs).toHaveCount(2);
      expect(
        await fileInputs.evaluateAll(
          (inputs) => new Set(inputs.map((input) => input.id)).size,
        ),
      ).toBe(2);
      const narrative = page.locator('.immersive-create-narrative');
      const titleField = page.locator('.immersive-create-title-field');
      const dateTrigger = page.locator('.composer-date-trigger');
      const places = page
        .locator('.composer-tool-row button')
        .filter({ has: page.locator('.eimir-icon-orte') });
      await expectLabeledComposerTool(places, 'orte');
      await expect(page.locator('.composer-tool-row button')).toHaveCount(3);
      await expect(
        page.locator('.composer-tool-row .eimir-icon-foto'),
      ).toHaveCount(1);
      const saveButton = page.getByRole('button', { name: de.memory.save });
      const form = page.locator('.immersive-create-form');
      const quickCreateTrigger = page.locator(
        '.mobile-quick-create .quick-create-trigger',
      );
      await expect(saveButton).toHaveCount(1);
      await expect(saveButton).toHaveAttribute('type', 'submit');
      expect(
        await saveButton.evaluate(
          (button: HTMLButtonElement) => button.form?.id,
        ),
      ).toBe(await form.getAttribute('id'));
      await expect(saveButton).toBeInViewport();
      const [
        placesBox,
        mediaBox,
        pickerBox,
        narrativeBox,
        titleFieldBox,
        dateBox,
        saveBox,
      ] = await Promise.all([
        places.boundingBox(),
        media.boundingBox(),
        picker.boundingBox(),
        narrative.boundingBox(),
        titleField.boundingBox(),
        dateTrigger.boundingBox(),
        saveButton.boundingBox(),
      ]);
      if (
        !placesBox ||
        !mediaBox ||
        !pickerBox ||
        !narrativeBox ||
        !titleFieldBox ||
        !dateBox ||
        !saveBox
      )
        throw new Error('The compact capture composition did not render.');

      // #1730 keeps native completion in the header and media before writing.
      expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(dateBox.y);
      expect(dateBox.y + dateBox.height).toBeLessThanOrEqual(mediaBox.y);
      expect(mediaBox.y + mediaBox.height).toBeLessThanOrEqual(titleFieldBox.y);
      expect(titleFieldBox.y + titleFieldBox.height).toBeLessThanOrEqual(
        narrativeBox.y,
      );
      expect(narrativeBox.y).toBeLessThan(placesBox.y);
      expect(saveBox.height).toBeGreaterThanOrEqual(48);
      expect(dateBox.height).toBeGreaterThanOrEqual(44);
      expect(titleFieldBox.x).toBeGreaterThanOrEqual(0);
      expect(placesBox.height).toBeLessThan(125);
      await expect(places.getByRole('listitem')).toHaveCount(0);
      const addPlaceBox = await places.boundingBox();
      if (!addPlaceBox) throw new Error('Add Place did not render.');
      expect(addPlaceBox.height + 0.001).toBeGreaterThanOrEqual(44);

      // The intake keeps the source entry; unavailable providers remain absent.
      await expect(mediaGroup).toHaveCSS('border-top-width', '0px');
      await expect(
        page.locator('.composer-content .media-action-group'),
      ).toHaveCount(1);
      await expect(media.locator('.media-gallery')).toHaveCount(0);
      const otherSource = media.getByRole('button', {
        name: photoSources.more,
        exact: true,
      });
      await expect(otherSource).toBeVisible();
      await expect(otherSource.locator('.pro-mark')).toBeVisible();
      await otherSource.click();
      const sourceSheet = page.getByRole('dialog', {
        name: photoSources.title,
        exact: true,
      });
      await expect(sourceSheet).toBeVisible();
      await expect(
        sourceSheet.getByRole('button', {
          name: photoSources.device,
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        sourceSheet.getByRole('button', {
          name: photoSources.google,
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        sourceSheet.getByRole('button', {
          name: photoSources.immich,
          exact: true,
        }),
      ).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(sourceSheet).toHaveCount(0);
      await expect(mediaGroup.locator('.media-action-group-label')).toHaveCount(
        0,
      );
      await expect(mediaGroup).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
      expect(mediaBox.height).toBeGreaterThanOrEqual(pickerBox.height);
      expect(pickerBox.height).toBeGreaterThanOrEqual(44);
      await expect(dateTrigger).toHaveAttribute('aria-haspopup', 'dialog');
      const dateInput = await showComposerDate(page);
      await expect(dateInput).toHaveAttribute('type', 'date');
      const nativeBox = await dateInput.boundingBox();
      if (!nativeBox) throw new Error('The native date task did not render.');
      expect(nativeBox.height + 0.001).toBeGreaterThanOrEqual(44);
      expect(nativeBox.width).toBeGreaterThanOrEqual(44);
      await dateInput.fill('2025-12-24');
      await closeComposerDate(page);
      await title.tap();
      await expectComposerDate(page, '2025-12-24');

      // 7. Floating global Quick Create does not collide with optional Places.
      if (await quickCreateTrigger.isVisible()) {
        const fabBox = await quickCreateTrigger.boundingBox();
        if (fabBox) {
          const overlapsHorizontally =
            placesBox.x < fabBox.x + fabBox.width &&
            placesBox.x + placesBox.width > fabBox.x;
          const overlapsVertically =
            placesBox.y < fabBox.y + fabBox.height &&
            placesBox.y + placesBox.height > fabBox.y;
          expect(overlapsHorizontally && overlapsVertically).toBe(false);
        }
      }

      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`shell-memory-create-${width}-compact.png`),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Memory Create native date stays editable and stable (${colorScheme})`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
      colorScheme,
    });
    const page = await context.newPage();
    try {
      await installApiMocks(page);
      await page.goto('/today');
      await signIn(page);
      await page.goto('/story/memories/new');
      const date = await showComposerDate(page);
      await expect(date).toHaveValue(localToday());
      await expect(date).toHaveAttribute('type', 'date');
      await expect(page.locator('.composer-date-trigger')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      const before = await date.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      await date.fill('2025-12-24');
      await closeComposerDate(page);
      await page.getByLabel(de.memory.bodyLabel, { exact: true }).tap();
      await showComposerDate(page);
      await expect(date).toHaveValue('2025-12-24');
      expect(
        await date.evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe(before);
      await date.focus();
      await expect(date).toBeFocused();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`native-date-390-${colorScheme}.png`),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  });
}

test('Memory Create native date supports 320px large text, reduced motion and forced colors', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 568 },
  });
  const page = await context.newPage();
  try {
    await installApiMocks(page);
    await page.goto('/today');
    await signIn(page);
    await page.goto('/story/memories/new');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    const date = await showComposerDate(page);
    await date.fill('2025-12-24');
    await expect(date).toHaveValue('2025-12-24');
    await expectNoHorizontalOverflow(page);
    const box = await date.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    for (const forcedColors of ['none', 'active'] as const) {
      await page.emulateMedia({ reducedMotion: 'reduce', forcedColors });
      await expect(date).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`native-date-320-large-${forcedColors}.png`),
        fullPage: true,
      });
    }
  } finally {
    await context.close();
  }
});

test('Memory Create native date keeps desktop keyboard focus and calendar semantics', async ({
  page,
}) => {
  await installApiMocks(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/today');
  await signIn(page);
  await page.goto('/story/memories/new');
  const date = await showComposerDate(page);
  await date.focus();
  await expect(date).toBeFocused();
  await date.fill('2025-12-24');
  await expect(date).toHaveValue('2025-12-24');
  await expect(date).toHaveCSS('font-weight', '400');
  await expectNoHorizontalOverflow(page);
});

test('HeartMoment Create defaults the date to local today and stays typeable', async ({
  page,
}) => {
  await installApiMocks(page);
  await page.goto('/today');
  await signIn(page);

  await page.goto('/story/heart-moments/new');
  const dateInput = await showComposerDate(
    page,
    storyProducts.heartMomentProduct.happenedOnLabel,
  );
  await expect(dateInput).toHaveValue(localToday());
  await dateInput.fill('2025-12-24');
  await expect(dateInput).toHaveValue('2025-12-24');
  await closeComposerDate(
    page,
    storyProducts.heartMomentProduct.happenedOnLabel,
  );
});

test('Milestone Create defaults the date to local today and stays typeable', async ({
  page,
}) => {
  await installApiMocks(page);
  await page.goto('/today');
  await signIn(page);

  await page.goto('/story/milestones/new');
  const dateInput = page.getByLabel(
    storyProducts.milestoneProduct.happenedOnLabel,
    { exact: true },
  );
  await expect(dateInput).toHaveValue(localToday());

  await dateInput.fill('2025-12-24');
  await expect(dateInput).toHaveValue('2025-12-24');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Memory Detail keeps authored prose readable with the restored initial (${colorScheme})`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await installApiMocks(page);
    await page.goto('/today');
    await signIn(page);

    await page.goto(`/story/memories/${MEMORY_ID}`);
    await expect(
      page.getByRole('heading', { name: MEMORY_TITLE }),
    ).toBeVisible();

    const body = page.locator('.memory-detail-body');
    await expect(body).toBeVisible();
    await expect(body).toHaveText(MEMORY_BODY);
    const initial = body.locator('.drop-cap-letter');
    await expect(initial).toHaveText('W');
    const fontSize = await body.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    );
    expect(fontSize).toBeGreaterThanOrEqual(16);
    const initialStyle = await initial.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        textTransform: style.textTransform,
        float: style.float,
      };
    });
    expect(initialStyle.fontSize).toBeGreaterThan(fontSize);
    expect(initialStyle.textTransform).toBe('uppercase');
    expect(initialStyle.float).toBe('none');

    await page.screenshot({
      path: testInfo.outputPath(`memory-detail-prose-${colorScheme}.png`),
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await expect(
      page.getByText(de.memory.tagLabels.home, { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(
        `shell-memory-tags-detail-390-${colorScheme}.png`,
      ),
      fullPage: true,
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('html').evaluate((element) => {
      element.style.zoom = '2';
    });
    await expectNoHorizontalOverflow(page);
    await page.locator('html').evaluate((element) => {
      element.style.zoom = '';
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('link', { name: memoryProduct.edit }).click();
    await showContextTags(page);
    await showContextSuggestions(page);
    await expect(
      page.getByRole('checkbox', { name: de.memory.tagLabels.home }),
    ).toBeChecked();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `shell-memory-tags-edit-390-${colorScheme}.png`,
      ),
      fullPage: true,
    });
  });
}

for (const width of [390, 1440]) {
  test(`Memory Detail preserves complete prose at ${width}px`, async ({
    page,
  }) => {
    await installApiMocks(page);
    await page.goto('/today');
    await signIn(page);
    await page.setViewportSize({ width, height: 900 });
    for (const memoryCase of PROSE_CASES) {
      await page.goto(`/story/memories/${memoryCase.id}`);
      await expect(page.locator('.memory-detail-body')).toHaveText(
        memoryCase.body.split(/\n\n/),
      );
      const initial = page.locator('.drop-cap-letter');
      await expect(initial).toHaveCount(1);
      await expect(initial).toHaveText(memoryCase.body[0]);
      await expect(initial).toHaveCSS('text-transform', 'uppercase');
      await expectNoHorizontalOverflow(page);
    }
  });
}
