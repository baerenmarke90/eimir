import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import de from '../../src/i18n/locales/de';
import storyProducts from '../../src/i18n/locales/storyProducts';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '99999999-9999-4999-8999-999999999999';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';

const ME = { id: ACCOUNT_ID, displayName: 'Lea Sommer' };
const PARTNER = { id: PARTNER_ID, displayName: 'Alex' };
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };

const DETAIL_COMMENTS = [
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

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function captureScreenshot(
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

function getTimelineItems() {
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

type MockOptions = {
  asPartner?: boolean;
  withDetailComments?: boolean;
};

async function installMocks(
  page: Page,
  options: MockOptions = {},
): Promise<void> {
  const currentUserId = options.asPartner ? PARTNER_ID : ACCOUNT_ID;
  const currentUserName = options.asPartner ? 'Alex' : 'Lea Sommer';

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
        method: 'DIRECT',
        url: `/api/v1/spaces/${SPACE_ID}/attachments/${attId}/file`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname.includes('/attachments/') &&
      (pathname.endsWith('/file') || pathname.endsWith('/thumbnail'))
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

    await fulfillJson({}, 200);
  });
}

async function expectCompactCommentHandoff(page: Page): Promise<void> {
  const panel = page.locator('.comments-panel-compact');
  await expect(panel.locator('.comment-card')).toHaveCount(2);

  const finalBody = panel.locator('.comment-card').last().locator('p');
  const trigger = panel.locator('.comment-compose-trigger');
  await expect(finalBody).toBeVisible();
  await expect(trigger).toBeVisible();

  const [bodyBox, triggerBox, rowGap] = await Promise.all([
    finalBody.boundingBox(),
    trigger.boundingBox(),
    panel.evaluate((element) => Number.parseFloat(getComputedStyle(element).rowGap)),
  ]);
  if (!bodyBox || !triggerBox || !Number.isFinite(rowGap)) {
    throw new Error('Comment spacing geometry is unavailable.');
  }
  const visibleGap = triggerBox.y - (bodyBox.y + bodyBox.height);
  expect(Math.abs(visibleGap - rowGap)).toBeLessThanOrEqual(1);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await trigger.click();
  await expect(panel.locator('.comment-form-compact textarea')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Abbrechen' })).toBeVisible();
  await panel.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(panel.locator('.comment-compose-trigger')).toBeVisible();
}

async function signIn(page: Page, email = 'lea@example.org'): Promise<void> {
  await page.goto('/story?tab=timeline');
  await page.getByLabel(de.login.email).fill(email);
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

test.describe('Momente > Zeitleiste Product Reference (#860)', () => {
  test('renders 390x844 reference layout, spine, markers, cards, and captures screenshots', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    await expect(
      page.getByRole('heading', { name: 'Momente', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(de.story.timelineIntro)).toBeVisible();

    const markers = page.locator('.story-timeline-marker');
    await expect(markers).toHaveCount(5);

    await expect(
      page.locator('.story-timeline-marker.marker-berry'),
    ).toHaveCount(0);
    await expect(
      page.locator('.story-timeline-marker.marker-teal'),
    ).toHaveCount(0);

    const imageMemoryCard = page
      .locator('.story-card-memory.has-image')
      .first();
    await expect(imageMemoryCard).toBeVisible();
    await expect(
      imageMemoryCard.getByText('Breakfast by the canal'),
    ).toBeVisible();
    await expect(
      imageMemoryCard.locator('img.story-media-preview'),
    ).toBeVisible();

    const noImageMemoryCard = page
      .locator('.story-card-memory.no-image')
      .first();
    await expect(noImageMemoryCard).toBeVisible();
    await expect(noImageMemoryCard.getByText('Mountain hike')).toBeVisible();
    await expect(noImageMemoryCard.locator('.story-media-preview')).toHaveCount(
      0,
    );

    const milestoneCard = page.locator('.story-card-milestone').first();
    await expect(milestoneCard).toBeVisible();
    await expect(milestoneCard.getByText('Two years together')).toBeVisible();

    const heartMomentCard = page
      .locator('.story-card-heart-moment.no-image')
      .first();
    await expect(heartMomentCard).toBeVisible();
    await expect(heartMomentCard.getByText('Thinking of you')).toBeVisible();
    await expect(heartMomentCard.locator('.story-media-preview')).toHaveCount(
      0,
    );

    const browseShell = page.locator('.momente-browse-links');
    const browseLink = page.locator('.momente-browse-link').first();
    const browseShape = await browseShell.evaluate((element) => {
      const style = getComputedStyle(element);
      const root = getComputedStyle(document.documentElement);
      return {
        radius: style.borderRadius,
        expectedRadius: root.getPropertyValue('--radius-card').trim(),
        shadow: style.boxShadow,
      };
    });
    const browseLinkShape = await browseLink.evaluate((element) => {
      const style = getComputedStyle(element);
      const root = getComputedStyle(document.documentElement);
      return {
        radius: style.borderRadius,
        expectedRadius: root.getPropertyValue('--radius-large').trim(),
      };
    });
    expect(browseShape.radius).toBe(browseShape.expectedRadius);
    expect(browseShape.shadow).not.toBe('none');
    expect(browseLinkShape.radius).toBe(browseLinkShape.expectedRadius);

    const compactEmotion = heartMomentCard.locator(
      '.heart-emotion-badge--compact',
    );
    await expect(compactEmotion).toHaveAttribute(
      'aria-label',
      'Gefühl: Geliebt',
    );
    await expect(compactEmotion).toHaveAttribute('title', 'Gefühl: Geliebt');
    await expect(compactEmotion.locator('.heart-emotion-icon')).toBeVisible();
    const compactEmotionLabel = compactEmotion.locator('.heart-emotion-label');
    const compactEmotionLabelStyle = await compactEmotionLabel.evaluate(
      (element) => {
        const style = getComputedStyle(element);
        return {
          position: style.position,
          width: style.width,
          height: style.height,
          overflow: style.overflow,
          clipPath: style.clipPath,
        };
      },
    );
    expect(compactEmotionLabelStyle).toMatchObject({
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
    });
    expect(compactEmotionLabelStyle.clipPath).not.toBe('none');
    await expect(compactEmotion).toHaveCSS('border-top-width', '0px');
    await expect(compactEmotion).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );

    await captureScreenshot(
      page,
      testInfo,
      '01-momente-timeline-390-light.png',
      {
        fullPage: true,
      },
    );
    await captureScreenshot(
      page,
      testInfo,
      '1018-story-momente-visual-polish-390-light.png',
      { fullPage: true },
    );

    await captureScreenshot(
      imageMemoryCard,
      testInfo,
      '05-momente-timeline-image-memory.png',
    );

    await captureScreenshot(
      noImageMemoryCard,
      testInfo,
      '06-momente-timeline-no-image-memory.png',
    );

    await captureScreenshot(
      heartMomentCard,
      testInfo,
      '07-momente-timeline-heart-moment.png',
    );
  });

  test('dark mode at 390x844 captures 02-momente-timeline-390-dark.png', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const compactEmotion = page
      .locator('.story-card-heart-moment .heart-emotion-badge--compact')
      .first();
    const compactEmotionLabel = compactEmotion.locator('.heart-emotion-label');
    const compactEmotionLabelStyle = await compactEmotionLabel.evaluate(
      (element) => {
        const style = getComputedStyle(element);
        return {
          position: style.position,
          width: style.width,
          height: style.height,
          overflow: style.overflow,
          clipPath: style.clipPath,
        };
      },
    );
    expect(compactEmotionLabelStyle).toMatchObject({
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
    });
    expect(compactEmotionLabelStyle.clipPath).not.toBe('none');
    await expect(compactEmotion.locator('.heart-emotion-icon')).toBeVisible();
    await expect(compactEmotion).toHaveCSS('border-top-width', '0px');

    await captureScreenshot(
      page,
      testInfo,
      '02-momente-timeline-390-dark.png',
      {
        fullPage: true,
      },
    );
    await captureScreenshot(
      page,
      testInfo,
      '1018-story-momente-visual-polish-390-dark.png',
      { fullPage: true },
    );
  });

  test('320px reflow produces no horizontal overflow and captures 03-momente-timeline-320-reflow.png', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    const hasHorizontalOverflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      );
    });
    expect(hasHorizontalOverflow).toBe(false);

    const browseLinks = page.locator('.momente-browse-link');
    await expect(browseLinks).toHaveCount(3);
    await expect(browseLinks.nth(2)).toHaveCSS('grid-column-start', '1');
    await expect(browseLinks.nth(2)).toHaveCSS('grid-column-end', '-1');

    await captureScreenshot(
      page,
      testInfo,
      '03-momente-timeline-320-reflow.png',
      { fullPage: true },
    );
    await captureScreenshot(
      page,
      testInfo,
      '1018-story-momente-visual-polish-320-reflow.png',
      { fullPage: true },
    );
  });

  test('1440 Expanded desktop view captures 04-momente-timeline-1440-expanded.png', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    const expandedEmotion = page
      .locator('.story-card-heart-moment .heart-emotion-badge--compact')
      .first();
    await expect(expandedEmotion.locator('.heart-emotion-icon')).toBeVisible();
    await expect(expandedEmotion.locator('.heart-emotion-label')).toBeVisible();
    await expect(expandedEmotion).toHaveCSS('border-top-width', '0px');
    const browseWidth = await page
      .locator('.momente-browse-links')
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(browseWidth).toBeLessThan(700);

    await captureScreenshot(
      page,
      testInfo,
      '04-momente-timeline-1440-expanded.png',
      { fullPage: true },
    );
    await captureScreenshot(
      page,
      testInfo,
      '1018-story-momente-visual-polish-1440-expanded.png',
      { fullPage: true },
    );
  });

  test('Filter disclosure QA on mobile: collapsed vs expanded and captures 08 and 09 screenshots', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    const filterToggle = page.locator('.story-filter-toggle');
    const filterPanel = page.locator('#story-filter-panel');
    const typeSelect = page.locator('#story-filter-type');

    await expect(filterToggle).toBeVisible();
    await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(typeSelect).not.toBeVisible();
    await expect(typeSelect).toHaveCount(0);

    await captureScreenshot(
      page,
      testInfo,
      '08-momente-timeline-filter-collapsed.png',
      { fullPage: true },
    );

    await filterToggle.click();
    await expect(filterToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(filterPanel).toHaveAttribute('aria-modal', 'true');
    expect(
      await filterPanel.evaluate((element) => element.matches(':modal')),
    ).toBe(true);
    await expect(typeSelect).toBeVisible();

    await typeSelect.focus();
    const isFocusedWhenExpanded = await typeSelect.evaluate(
      (el) => document.activeElement === el,
    );
    expect(isFocusedWhenExpanded).toBe(true);

    await captureScreenshot(
      page,
      testInfo,
      '09-momente-timeline-filter-expanded.png',
      { fullPage: true },
    );

    await typeSelect.selectOption('MEMORY');
    await expect(page).not.toHaveURL(/type=MEMORY/);
    await filterPanel
      .getByRole('button', { name: storyProducts.storyFilters.apply })
      .click();
    await expect(filterPanel).toHaveCount(0);
    await expect(page).toHaveURL(/type=MEMORY/);
    await expect(page.locator('.story-card-memory')).toHaveCount(3);
    await expect(page.locator('.story-card-milestone')).toHaveCount(0);
    await expect(page.locator('.story-card-heart-moment')).toHaveCount(0);
  });

  test('Detail navigation for Heart Moment and captures 10-momente-timeline-heart-moment-detail.png', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    await page.locator('.story-card-heart-moment').first().click();
    await expect(page).toHaveURL(/\/story\/heart-moments\/hm-love$/);

    await expect(page.locator('.layout-split-lead-rail')).toHaveCount(0);

    await expect(page.getByText('Thinking of you')).toBeVisible();
    const detailEmotion = page.locator('.heart-emotion-badge--detail');
    await expect(detailEmotion.locator('.heart-emotion-icon')).toBeVisible();
    await expect(detailEmotion.locator('.heart-emotion-label')).toBeVisible();
    await expect(detailEmotion).toHaveCSS('border-top-width', '0px');
    await expect(detailEmotion).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    const provenance = page.locator('.heart-moment-provenance-footer');
    await expect(provenance).toBeVisible();
    await expect(provenance).toContainText(ME.displayName.replace(/ .*/u, ''));
    await expect(provenance).not.toContainText(ME.displayName);

    await captureScreenshot(
      page,
      testInfo,
      '10-momente-timeline-heart-moment-detail.png',
      { fullPage: true },
    );
  });

  test('Detail navigation for Milestone and captures 11-momente-timeline-milestone-detail.png', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    await page.locator('.story-card-milestone').first().click();
    await expect(page).toHaveURL(/\/story\/milestones\/ms-2years$/);

    await expect(page.locator('.layout-split-lead-rail')).toHaveCount(0);

    await expect(
      page.getByRole('heading', { name: 'Two years together', level: 1 }),
    ).toBeVisible();
    const provenance = page.locator('.milestone-provenance-footer');
    await expect(provenance).toBeVisible();
    await expect(provenance).toContainText(ME.displayName.replace(/ .*/u, ''));
    await expect(provenance).not.toContainText(ME.displayName);

    await captureScreenshot(
      page,
      testInfo,
      '11-momente-timeline-milestone-detail.png',
      { fullPage: true },
    );
  });

  test('shared Story detail comments keep a compact handoff across detail types and reflow states (#1024)', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, { withDetailComments: true });
    await signIn(page);

    const details = [
      {
        path: '/story/memories/mem-canal',
        marker: 'Breakfast by the canal',
        shot: '1024-comments-memory-390-light.png',
      },
      {
        path: '/story/heart-moments/hm-love',
        marker: 'Thinking of you',
        shot: '1024-comments-heart-390-light.png',
      },
      {
        path: '/story/milestones/ms-2years',
        marker: 'Two years together',
        shot: '1024-comments-milestone-390-light.png',
      },
    ] as const;

    for (const detail of details) {
      await page.goto(detail.path);
      await expect(page.getByText(detail.marker).first()).toBeVisible();
      await expectCompactCommentHandoff(page);
      await captureScreenshot(page, testInfo, detail.shot, { fullPage: true });
    }

    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/story/memories/mem-canal');
    await expectCompactCommentHandoff(page);
    await captureScreenshot(page, testInfo, '1024-comments-memory-320.png', {
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/story/memories/mem-canal');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expectCompactCommentHandoff(page);
    await captureScreenshot(page, testInfo, '1024-comments-memory-200pct.png', {
      fullPage: true,
    });

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => window.localStorage.setItem('eimir.theme', 'system'));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/story/milestones/ms-2years');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectCompactCommentHandoff(page);
    await captureScreenshot(page, testInfo, '1024-comments-milestone-1440-dark.png', {
      fullPage: true,
    });
  });

  test('Momente > Entdecken consumes the canonical Discover response and captures 12-momente-timeline-discover-reference.png', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await signIn(page);
    await page.goto('/story?tab=discover');
    await page.waitForSelector('.momente-discover-page');

    await expect(page.getByText(de.story.title)).toBeVisible();
    await expect(page.getByText(de.story.intro)).toBeVisible();
    await expect(page.locator('.story-timeline-toolbar')).toHaveCount(0);
    await expect(page.locator('.momente-hero-highlight')).toContainText(
      'Breakfast by the canal',
    );

    await captureScreenshot(
      page,
      testInfo,
      '12-momente-timeline-discover-reference.png',
      { fullPage: true },
    );
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`Timeline is axe-clean at 390x844 in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.addInitScript(() =>
        window.localStorage.setItem('eimir.theme', 'system'),
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await installMocks(page);
      await signIn(page);
      await page.goto('/story?tab=timeline');
      await page.waitForSelector('.story-timeline');

      await expect(page.locator('html')).toHaveAttribute(
        'data-theme',
        colorScheme,
      );

      const result = await new AxeBuilder({ page })
        .withTags([
          'wcag2a',
          'wcag2aa',
          'wcag21a',
          'wcag21aa',
          'wcag22a',
          'wcag22aa',
        ])
        .analyze();
      expect(result.violations).toEqual([]);
    });
  }
});
