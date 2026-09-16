import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import storyProducts from '../../src/i18n/locales/storyProducts';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const MEMORY_ID = '44444444-4444-4444-8444-444444444444';
const TEST_NOW = '2026-09-01T10:00:00Z';
const MEMORY_TITLE = 'Ein ruhiger Sonntagmorgen';
const MEMORY_BODY =
  'Wir haben lange geschlafen und dann gemeinsam Pfannkuchen gemacht.';

// Covers the initials the drop cap must stay visually controlled for: a
// narrow letter (S), and the widest common German-copy letters (W, M) plus
// one more (A) — the width-consistency regression the real drop-cap element
// exists to fix.
const DROP_CAP_CASES = [
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
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

/**
 * A focused mock harness for the create-surface visual regression checks:
 * the inline shared-visibility metadata on Memory Create, the local "today"
 * date default on HeartMoment/Milestone Create, and the Memory Detail drop
 * cap.
 */
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

    for (const memoryCase of DROP_CAP_CASES) {
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

async function expectSharingMetadataAligned(page: Page): Promise<void> {
  const note = page.locator('.immersive-sharing-note');
  await expect(note).toBeVisible();
  await expect(note).toHaveAttribute('role', 'note');
  await expect(
    note.getByText(de.memory.sharedTitle, { exact: true }),
  ).toBeVisible();
  await expect(
    note.getByText(de.memory.sharedBody, { exact: true }),
  ).toBeHidden();

  const icon = note.locator('.sharing-icon');
  const svg = icon.locator('svg');
  const path = svg.locator('path');
  await expect(icon).toBeVisible();
  await expect(svg).toBeVisible();
  await expect(path).toBeVisible();

  const [iconBox, svgBox, noteLayout, maskImage] = await Promise.all([
    icon.boundingBox(),
    svg.boundingBox(),
    note.evaluate((element) => {
      const style = getComputedStyle(element);
      return { display: style.display, alignItems: style.alignItems };
    }),
    svg.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.maskImage || style.getPropertyValue('-webkit-mask-image');
    }),
  ]);
  if (!iconBox || !svgBox) throw new Error('Sharing icon did not render.');

  expect(noteLayout.display).toBe('flex');
  expect(noteLayout.alignItems).toBe('center');
  expect(maskImage === 'none' || maskImage === '').toBe(true);

  const iconCenterX = iconBox.x + iconBox.width / 2;
  const svgCenterX = svgBox.x + svgBox.width / 2;
  const iconCenterY = iconBox.y + iconBox.height / 2;
  const svgCenterY = svgBox.y + svgBox.height / 2;

  // 2.5px is the #855 ceiling for the retained 16px SVG geometry. It absorbs
  // sub-pixel/runner quantization while still detecting the old several-pixel
  // left/top displacement that motivated the original heart-centering test.
  expect(Math.abs(iconCenterX - svgCenterX)).toBeLessThanOrEqual(2.5);
  expect(Math.abs(iconCenterY - svgCenterY)).toBeLessThanOrEqual(2.5);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Memory Create aligns the inline shared-visibility metadata (${colorScheme})`, async ({
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

    await expectSharingMetadataAligned(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `shell-memory-create-expanded-${colorScheme}.png`,
      ),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expectSharingMetadataAligned(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`shell-memory-create-390-${colorScheme}.png`),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 667 });
    await expectSharingMetadataAligned(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `shell-memory-create-small-height-${colorScheme}.png`,
      ),
      fullPage: true,
    });

    await page.setViewportSize({ width: 320, height: 568 });
    await expectSharingMetadataAligned(page);
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
    await expectSharingMetadataAligned(page);
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

    const axeResult = await new AxeBuilder({ page })
      .include('.immersive-sharing-note')
      .include('.immersive-create-details')
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
  test(`Memory Create keeps sharing and the empty photo picker compact at ${width}px (#855)`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
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

      await expectSharingMetadataAligned(page);

      const title = page.getByLabel(de.memory.titleLabel);
      const media = page.locator('.immersive-create-media');
      const picker = media.locator('.file-picker');
      const details = page.locator('.immersive-create-details');
      const note = page.locator('.immersive-sharing-note');
      const actions = page.locator('.form-actions');
      const saveButton = page.getByRole('button', { name: de.memory.save });
      const quickCreateTrigger = page.locator(
        '.mobile-quick-create .quick-create-trigger',
      );

      const domOrder = await page.evaluate(() => {
        const form = document.querySelector('.immersive-create-form');
        if (!form) return null;
        const children = Array.from(form.children);
        return {
          titleIndex: children.findIndex((el) =>
            el.classList.contains('immersive-create-hero'),
          ),
          mediaIndex: children.findIndex((el) =>
            el.classList.contains('immersive-create-media'),
          ),
          detailsIndex: children.findIndex((el) =>
            el.classList.contains('immersive-create-details'),
          ),
          noteIndex: children.findIndex((el) =>
            el.classList.contains('immersive-sharing-note'),
          ),
          actionsIndex: children.findIndex((el) =>
            el.classList.contains('form-actions'),
          ),
        };
      });
      if (!domOrder) {
        throw new Error('Memory Create form children not found.');
      }
      expect(domOrder.titleIndex).toBeLessThan(domOrder.mediaIndex);
      expect(domOrder.mediaIndex).toBeLessThan(domOrder.detailsIndex);
      expect(domOrder.detailsIndex).toBeLessThan(domOrder.noteIndex);
      expect(domOrder.noteIndex).toBeLessThan(domOrder.actionsIndex);

      const [
        noteBox,
        titleBox,
        mediaBox,
        pickerBox,
        detailsBox,
        actionsBox,
        saveBox,
        mediaBorder,
        pickerBorder,
      ] = await Promise.all([
        note.boundingBox(),
        title.boundingBox(),
        media.boundingBox(),
        picker.boundingBox(),
        details.boundingBox(),
        actions.boundingBox(),
        saveButton.boundingBox(),
        media.evaluate((element) => getComputedStyle(element).borderTopStyle),
        picker.evaluate((element) => getComputedStyle(element).borderTopStyle),
      ]);
      if (
        !noteBox ||
        !titleBox ||
        !mediaBox ||
        !pickerBox ||
        !detailsBox ||
        !actionsBox ||
        !saveBox
      ) {
        throw new Error('Memory Create composition did not render.');
      }

      // 1. Authored content (title, media, optional details) precedes the visibility cue
      expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(noteBox.y);
      expect(mediaBox.y + mediaBox.height).toBeLessThanOrEqual(noteBox.y);
      expect(detailsBox.y + detailsBox.height).toBeLessThanOrEqual(noteBox.y);

      // 2. Visibility cue precedes the primary form action area and Save button
      expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(actionsBox.y);
      expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(saveBox.y);

      // 3. Spacing above (from details) and below (to actions) is intentional and balanced
      const spacingAbove = noteBox.y - (detailsBox.y + detailsBox.height);
      const spacingBelow = actionsBox.y - (noteBox.y + noteBox.height);
      expect(spacingAbove).toBeGreaterThanOrEqual(10);
      expect(spacingBelow).toBeGreaterThanOrEqual(10);

      // 4. Inline metadata remains a single quiet, compact row
      expect(noteBox.height).toBeLessThan(40);

      // 5. Media picker remains compact with solid boundaries
      expect(mediaBorder).toBe('solid');
      expect(pickerBorder).toBe('solid');
      expect(mediaBox.height).toBeLessThan(125);
      expect(pickerBox.height).toBeLessThan(80);
      expect(pickerBox.height).toBeGreaterThanOrEqual(44);

      // 6. Optional details summary is a calm rounded secondary disclosure control
      const summary = details.locator('summary');
      const addIcon = summary.locator('.summary-add-icon');
      const chevron = summary.locator('.summary-chevron');
      const summaryLabel = summary.locator('.summary-label');

      await expect(summary).toBeVisible();
      await expect(addIcon).toBeVisible();
      await expect(chevron).toBeVisible();
      await expect(summaryLabel).toHaveText(de.memory.addMoreDetails);

      const summaryBox = await summary.boundingBox();
      if (!summaryBox) throw new Error('Summary did not render.');
      // Mobile touch target: minimum 44px height
      expect(summaryBox.height).toBeGreaterThanOrEqual(44);
      // Fill the content region independently of responsive page gutters.
      expect(summaryBox.width).toBeGreaterThanOrEqual(44);
      expect(summaryBox.x).toBeCloseTo(detailsBox.x, 1);
      expect(summaryBox.width).toBeCloseTo(detailsBox.width, 1);

      // Verify native details open/close toggle and stable resting material (#888)
      const closedBg = await summary.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      );
      await expect(details).not.toHaveAttribute('open', '');
      await summary.tap();
      await expect(details).toHaveAttribute('open', '');
      await expect
        .poll(async () =>
          summary.evaluate((el) => window.getComputedStyle(el).backgroundColor),
        )
        .toBe(closedBg);
      await expect(
        details.getByRole('textbox', { name: de.memory.bodyLabel }),
      ).toBeVisible();
      if (width === 390) {
        await page.screenshot({
          path: testInfo.outputPath('shell-memory-create-details-open-390.png'),
        });
      }
      await summary.tap();
      await expect(details).not.toHaveAttribute('open', '');

      // 7. Floating global Quick Create FAB does not collide with the visibility note
      if (await quickCreateTrigger.isVisible()) {
        const fabBox = await quickCreateTrigger.boundingBox();
        if (fabBox) {
          const overlapsHorizontally =
            noteBox.x < fabBox.x + fabBox.width &&
            noteBox.x + noteBox.width > fabBox.x;
          const overlapsVertically =
            noteBox.y < fabBox.y + fabBox.height &&
            noteBox.y + noteBox.height > fabBox.y;
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
  test(`Memory Create keeps optional-details resting material stable when opened (${colorScheme}) (#888)`, async ({
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
      await installApiMocks(page);
      await page.goto('/today');
      await signIn(page);

      await page.goto('/story/memories/new');
      await expect(
        page.getByRole('heading', { name: de.memory.heading }),
      ).toBeVisible();

      const details = page.locator('.immersive-create-details');
      const summary = details.locator('summary');
      const chevron = summary.locator('.summary-chevron');
      const content = details.locator('.immersive-create-details-content');
      const bodyInput = details.getByRole('textbox', {
        name: de.memory.bodyLabel,
      });
      const dateInput = details.getByLabel(de.memory.dateLabel);

      await expect(details).not.toHaveAttribute('open', '');
      await expect(summary).toBeVisible();
      await expect(content).toBeHidden();

      // Verify touch target >= 44 CSS px
      const summaryBox = await summary.boundingBox();
      if (!summaryBox) throw new Error('Summary did not render.');
      expect(summaryBox.height).toBeGreaterThanOrEqual(44);

      await expectNoHorizontalOverflow(page);

      // 1. Capture computed resting visual properties while CLOSED
      const closedStyles = await summary.evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return {
          backgroundColor: cs.backgroundColor,
          color: cs.color,
          borderTopColor: cs.borderTopColor,
          borderTopWidth: cs.borderTopWidth,
          borderTopStyle: cs.borderTopStyle,
        };
      });

      await page.screenshot({
        path: testInfo.outputPath(
          `shell-memory-create-details-390-${colorScheme}-closed.png`,
        ),
      });

      // 2. Open "Mehr Details hinzufügen (optional)" via tap on touch device
      // No artificial mouse.move(0, 0) or summary.blur()!
      await summary.tap();
      await expect(details).toHaveAttribute('open', '');
      await expect(content).toBeVisible();
      await expect(bodyInput).toBeVisible();
      await expect(dateInput).toBeVisible();

      // 3. Directly verify computed resting visual properties while OPEN
      // Waits for transient :active transition (180ms) to settle without manual hover-clearing
      await expect
        .poll(async () =>
          summary.evaluate((el) => {
            const cs = window.getComputedStyle(el);
            return {
              backgroundColor: cs.backgroundColor,
              color: cs.color,
              borderTopColor: cs.borderTopColor,
              borderTopWidth: cs.borderTopWidth,
              borderTopStyle: cs.borderTopStyle,
            };
          }),
        )
        .toEqual({
          backgroundColor: closedStyles.backgroundColor,
          color: closedStyles.color,
          borderTopColor: closedStyles.borderTopColor,
          borderTopWidth: closedStyles.borderTopWidth,
          borderTopStyle: closedStyles.borderTopStyle,
        });

      // Verify chevron rotation communicates open state
      const chevronTransform = await chevron.evaluate(
        (el) => window.getComputedStyle(el).transform,
      );
      expect(chevronTransform).toContain('matrix');
      expect(chevronTransform).not.toBe('none');

      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: testInfo.outputPath(
          `shell-memory-create-details-390-${colorScheme}-open.png`,
        ),
      });

      // 4. Tap to close again: material remains identical (no sticky hover)
      await summary.tap();
      await expect(details).not.toHaveAttribute('open', '');
      await expect(content).toBeHidden();

      await expect
        .poll(async () =>
          summary.evaluate((el) => {
            const cs = window.getComputedStyle(el);
            return {
              backgroundColor: cs.backgroundColor,
              color: cs.color,
              borderTopColor: cs.borderTopColor,
            };
          }),
        )
        .toEqual({
          backgroundColor: closedStyles.backgroundColor,
          color: closedStyles.color,
          borderTopColor: closedStyles.borderTopColor,
        });

      // 5. Tap to open again: material remains identical
      await summary.tap();
      await expect(details).toHaveAttribute('open', '');
      await expect(content).toBeVisible();

      await expect
        .poll(async () =>
          summary.evaluate((el) => {
            const cs = window.getComputedStyle(el);
            return {
              backgroundColor: cs.backgroundColor,
              color: cs.color,
              borderTopColor: cs.borderTopColor,
            };
          }),
        )
        .toEqual({
          backgroundColor: closedStyles.backgroundColor,
          color: closedStyles.color,
          borderTopColor: closedStyles.borderTopColor,
        });

      // 6. Keyboard operation: toggle close and open via Space/Enter
      await summary.focus();
      await page.keyboard.press('Space');
      await expect(details).not.toHaveAttribute('open', '');
      await expect(content).toBeHidden();

      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      await expect(content).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test('Memory Create optional-details disclosure stays stable under 320px reflow, reduced motion, and forced colors (#888)', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
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
    await expect(
      page.getByRole('heading', { name: de.memory.heading }),
    ).toBeVisible();

    const details = page.locator('.immersive-create-details');
    const summary = details.locator('summary');

    // --- 320px Reflow with Touch ---
    await expectNoHorizontalOverflow(page);

    const closedStyles320 = await summary.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        borderTopColor: cs.borderTopColor,
      };
    });

    await page.screenshot({
      path: testInfo.outputPath(
        'shell-memory-create-details-320-reflow-closed.png',
      ),
    });

    // Tap to open without artificial mouse/blur cleanup
    await summary.tap();
    await expect(details).toHaveAttribute('open', '');

    await expect
      .poll(async () =>
        summary.evaluate((el) => {
          const cs = window.getComputedStyle(el);
          return {
            backgroundColor: cs.backgroundColor,
            color: cs.color,
            borderTopColor: cs.borderTopColor,
          };
        }),
      )
      .toEqual({
        backgroundColor: closedStyles320.backgroundColor,
        color: closedStyles320.color,
        borderTopColor: closedStyles320.borderTopColor,
      });

    const summaryBox320 = await summary.boundingBox();
    if (!summaryBox320) throw new Error('Summary did not render at 320px.');
    expect(summaryBox320.height).toBeGreaterThanOrEqual(44);

    await expectNoHorizontalOverflow(page);

    await page.screenshot({
      path: testInfo.outputPath(
        'shell-memory-create-details-320-reflow-open.png',
      ),
    });

    // Tap to close again: material remains identical
    await summary.tap();
    await expect(details).not.toHaveAttribute('open', '');
    await expect
      .poll(async () =>
        summary.evaluate((el) => {
          const cs = window.getComputedStyle(el);
          return {
            backgroundColor: cs.backgroundColor,
            color: cs.color,
            borderTopColor: cs.borderTopColor,
          };
        }),
      )
      .toEqual({
        backgroundColor: closedStyles320.backgroundColor,
        color: closedStyles320.color,
        borderTopColor: closedStyles320.borderTopColor,
      });

    // --- Reduced Motion ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const summaryTransition = await summary.evaluate(
      (el) => window.getComputedStyle(el).transitionDuration,
    );
    expect(summaryTransition === '0s' || summaryTransition === '').toBe(true);

    await page.screenshot({
      path: testInfo.outputPath(
        'shell-memory-create-details-reduced-motion.png',
      ),
      fullPage: true,
    });

    // --- Forced Colors / High Contrast ---
    await page.emulateMedia({
      forcedColors: 'active',
      reducedMotion: 'no-preference',
    });
    await expect(summary).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.screenshot({
      path: testInfo.outputPath(
        'shell-memory-create-details-forced-colors.png',
      ),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

test('Memory Create optional-details disclosure provides hover feedback on desktop fine pointer (#888)', async ({
  page,
}) => {
  await installApiMocks(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/today');
  await signIn(page);

  await page.goto('/story/memories/new');
  await expect(
    page.getByRole('heading', { name: de.memory.heading }),
  ).toBeVisible();

  const details = page.locator('.immersive-create-details');
  const summary = details.locator('summary');

  await expect(summary).toBeVisible();

  // 1. Resting state (no hover)
  await page.mouse.move(0, 0);
  const restingBg = await summary.evaluate(
    (el) => window.getComputedStyle(el).backgroundColor,
  );

  // 2. Hover with mouse
  await summary.hover();
  await expect
    .poll(async () =>
      summary.evaluate((el) => window.getComputedStyle(el).backgroundColor),
    )
    .not.toBe(restingBg);
  const hoveredBg = await summary.evaluate(
    (el) => window.getComputedStyle(el).backgroundColor,
  );

  // On desktop fine pointer, hover changes the surface background
  expect(hoveredBg).not.toBe(restingBg);

  // 3. Move mouse away -> returns to resting
  await page.mouse.move(0, 0);
  await expect
    .poll(async () =>
      summary.evaluate((el) => window.getComputedStyle(el).backgroundColor),
    )
    .toBe(restingBg);
  const unhoveredBg = await summary.evaluate(
    (el) => window.getComputedStyle(el).backgroundColor,
  );
  expect(unhoveredBg).toBe(restingBg);
  expect(unhoveredBg).not.toBe(hoveredBg);
});

test('HeartMoment Create defaults the date to local today and stays typeable', async ({
  page,
}) => {
  await installApiMocks(page);
  await page.goto('/today');
  await signIn(page);

  await page.goto('/story/heart-moments/new');
  const dateInput = page.getByLabel(
    storyProducts.heartMomentProduct.happenedOnLabel,
    { exact: true },
  );
  await expect(dateInput).toHaveValue(localToday());

  await dateInput.fill('2025-12-24');
  await expect(dateInput).toHaveValue('2025-12-24');
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
  test(`Memory Detail keeps an inline, enlarged drop cap on the body paragraph (${colorScheme})`, async ({
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
    const letter = body.locator('.drop-cap-letter');
    await expect(body).toBeVisible();
    await expect(letter).toBeVisible();
    await expect(letter).toHaveText('W');
    // The rest of the paragraph's real text must be unaffected — the split
    // is purely visual, not a rewording or duplication of the content.
    await expect(body).toHaveText(MEMORY_BODY);

    const [bodyFontSize, letterStyle] = await Promise.all([
      body.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
      letter.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          float: style.float,
          display: style.display,
          fontSize: Number.parseFloat(style.fontSize),
        };
      }),
    ]);
    // Deliberately not a classic floated drop cap: it stays part of the
    // normal inline text flow (no reserved column, no text wrapping around
    // it) so the word it starts always reads as one unit.
    expect(letterStyle.float).toBe('none');
    expect(letterStyle.display).toBe('inline');
    expect(letterStyle.fontSize).toBeGreaterThan(bodyFontSize * 1.2);
    expect(letterStyle.fontSize).toBeLessThan(bodyFontSize * 2);

    await page.screenshot({
      path: testInfo.outputPath(`memory-detail-drop-cap-${colorScheme}.png`),
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('html').evaluate((element) => {
      element.style.zoom = '2';
    });
    await expectNoHorizontalOverflow(page);
  });
}

/**
 * Measures the drop-cap letter's box and the immediately following text's
 * position for one memory, at whatever viewport is currently set.
 */
async function measureDropCapGap(
  page: Page,
  memoryCase: (typeof DROP_CAP_CASES)[number],
): Promise<{ letterBox: { x: number; width: number }; restX: number }> {
  await page.goto(`/story/memories/${memoryCase.id}`);
  await expect(
    page.getByRole('heading', { name: memoryCase.title }),
  ).toBeVisible();

  const letter = page.locator('.drop-cap-letter');
  await expect(letter).toHaveText(memoryCase.body[0]);

  const [letterBox, restRect] = await Promise.all([
    letter.boundingBox(),
    page.locator('.memory-detail-body').evaluate((el) => {
      // The rest of the text is a plain text node right after the letter
      // span; measure its first character via a Range so we can compare
      // its left edge against the drop cap's right edge.
      const range = document.createRange();
      const textNode = Array.from(el.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE,
      );
      if (!textNode) return null;
      range.setStart(textNode, 0);
      range.setEnd(textNode, 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.x };
    }),
  ]);
  if (!letterBox || !restRect) {
    throw new Error(
      `Drop cap or body text did not render for ${memoryCase.title}.`,
    );
  }
  return { letterBox, restX: restRect.x };
}

// Desktop and mobile deliberately share the same inline drop-cap logic (see
// MemoryProductPage.css) — only the font-size scales between them — so one
// parametrized check covers both: the letter must stay flush against the
// rest of its word ("Mitten", not "M itten") at every breakpoint.
for (const viewport of [
  { name: 'desktop 1440px', width: 1440, height: 900 },
  { name: 'desktop 1920px', width: 1920, height: 1080 },
  { name: 'mobile 390px', width: 390, height: 844 },
] as const) {
  test(`Memory Detail drop cap stays flush against the rest of its word for S/W/A/M initials (${viewport.name})`, async ({
    page,
  }) => {
    await installApiMocks(page);
    await page.goto('/today');
    await signIn(page);
    await page.setViewportSize(viewport);

    for (const memoryCase of DROP_CAP_CASES) {
      const { letterBox, restX } = await measureDropCapGap(page, memoryCase);
      // The following text must start at or after the drop cap's right
      // edge (never underneath/overlapping it), and the gap itself must
      // read as normal inline text spacing, not the initial standing apart
      // from the rest of its own word as a separate character.
      const gap = restX - (letterBox.x + letterBox.width);
      expect(gap).toBeGreaterThanOrEqual(-1);
      expect(gap).toBeLessThanOrEqual(3);
      await expectNoHorizontalOverflow(page);
    }
  });
}
