import { fulfillEmptyMomentPlaces } from '../support/photoSources';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import sensitiveMedia from '../../src/i18n/locales/sensitiveMedia';
import sharedPhotos from '../../src/i18n/locales/sharedPhotos';
import { mockEmptyPartnerNickname } from '../support/partnerNickname';
import localizedFixture from '../fixtures/locales/de';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';

async function expectNoWcagViolations(page: Page): Promise<void> {
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
  const summary = result.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes.length} node(s)`,
    )
    .join('\n');
  expect(result.violations, summary || 'No axe violations').toEqual([]);
}

function author(id: string, displayName: string) {
  return { id, displayName };
}

const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };
const LEA = author(ACCOUNT_ID, 'Lea Sommer');
const ALEX = author('44444444-4444-4444-8444-444444444444', 'Alex Winter');

function memoryItem(
  id: string,
  title: string,
  effectiveDate: string,
  hasAttachment: boolean,
) {
  return {
    kind: 'MEMORY',
    effectiveDate,
    memory: {
      id,
      title,
      happenedOn: effectiveDate,
      createdAt: effectiveDate,
      author: LEA,
      capabilities: CAPABILITIES,
      attachments: hasAttachment
        ? [
            {
              id: `${id}-att`,
              position: 0,
              status: 'READY',
              mediaType: 'IMAGE',
              mimeType: 'image/jpeg',
              hasThumbnail: true,
              isSensitive: false,
              width: 800,
              height: 800,
              size: 12345,
            },
          ]
        : [],
    },
  };
}

function heartMomentItem(id: string, text: string, effectiveDate: string) {
  return {
    kind: 'HEART_MOMENT',
    effectiveDate,
    heartMoment: {
      id,
      text,
      emotion: 'LOVED',
      happenedOn: effectiveDate,
      createdAt: effectiveDate,
      author: ALEX,
      capabilities: CAPABILITIES,
      visibility: 'SHARED',
      attachment: null,
    },
  };
}

function milestoneItem(id: string, title: string, effectiveDate: string) {
  return {
    kind: 'MILESTONE',
    effectiveDate,
    milestone: {
      id,
      title,
      happenedOn: effectiveDate,
      createdAt: effectiveDate,
      author: LEA,
      capabilities: CAPABILITIES,
    },
  };
}

const DISCOVER_ITEMS = [
  heartMomentItem(
    'hm-1',
    'Danke, dass du heute für mich da warst.',
    '2026-09-05',
  ),
  heartMomentItem(
    'hm-2',
    'Danke, dass du heute einfach zugehört hast.',
    '2026-09-04',
  ),
  memoryItem('mem-1', 'Ein Wochenende am Wasser', '2026-08-24', true),
  milestoneItem('ms-1', 'Ein Jahr in unserer Wohnung', '2026-08-15'),
  memoryItem('mem-2', 'Konzertabend', '2026-08-10', true),
  memoryItem('mem-3', 'Spontaner Tagesausflug', '2026-07-26', true),
  memoryItem('mem-4', 'Picknick im Grünen', '2026-07-08', true),
  memoryItem('mem-5', 'Sonnenuntergang nach Feierabend', '2026-06-17', true),
  milestoneItem('ms-2', 'Erster gemeinsamer Umzug', '2026-06-16'),
  milestoneItem('ms-3', 'Drei Jahre wir', '2026-06-16'),
  memoryItem('mem-6', 'Filmabend auf dem Sofa', '2026-05-21', false),
  memoryItem('mem-7', 'Wochenendtrip nach Trier', '2026-04-28', true),
];

async function installDiscoverApiMocks(
  page: Page,
  options: {
    retrospective?: Record<string, unknown> | null;
    viewerLocalDate?: string;
  } = {},
): Promise<string[]> {
  const unexpectedRequests: string[] = [];

  await page.route('https://fake-media.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: fs.readFileSync(
        new URL(
          '../../../backend/demo_assets/images/lake-sunrise.jpg',
          import.meta.url,
        ),
      ),
    });
  });

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

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/recaps`) {
      await fulfillJson({
        canCompose: false,
        editions: [],
        periods: [],
        hasMore: false,
      });
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
        account: { displayName: 'Lea Sommer', id: ACCOUNT_ID },
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
      await fulfillJson({ displayName: 'Lea Sommer', id: ACCOUNT_ID });
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
        partners: [LEA, ALEX],
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
        displayName: 'Lea Sommer',
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
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        recentShared: [],
        relationshipDuration: null,
        viewerLocalDate: options.viewerLocalDate ?? '2026-09-17',
        retrospective: options.retrospective ?? null,
        space: { partner: ALEX, spaceId: SPACE_ID },
        upcoming: [],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
      await fulfillJson({
        items: DISCOVER_ITEMS,
        hasMore: false,
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/discover`
    ) {
      await fulfillJson({
        selectionDate: '2026-09-17',
        lead: DISCOVER_ITEMS[0],
        items: DISCOVER_ITEMS.slice(1),
        leadContext: null,
      });
      return;
    }

    if (
      method === 'POST' &&
      /^\/api\/v1\/spaces\/[^/]+\/attachments\/[^/]+\/read-access$/.test(
        pathname,
      )
    ) {
      await fulfillJson({
        method: 'SIGNED_URL',
        url: 'https://fake-media.test/photo.jpg',
        expiresAt: null,
      });
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

    if (
      method === 'GET' &&
      /^\/api\/v1\/spaces\/[^/]+\/(memories|heart-moments|milestones)\/[^/]+\/comments$/.test(
        pathname,
      )
    ) {
      await fulfillJson({ items: [], nextCursor: null, hasMore: false });
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

  await mockEmptyPartnerNickname(page, SPACE_ID, ALEX.id);
  return unexpectedRequests;
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

const canonicalItemLabels = [
  'Danke, dass du heute einfach zugehört hast.',
  'Ein Wochenende am Wasser',
  'Ein Jahr in unserer Wohnung',
  'Konzertabend',
  'Spontaner Tagesausflug',
  'Picknick im Grünen',
  'Sonnenuntergang nach Feierabend',
  'Erster gemeinsamer Umzug',
  'Drei Jahre wir',
  'Filmabend auf dem Sofa',
  'Wochenendtrip nach Trier',
];

async function verifyDiaryAndReturnToDiscover(page: Page): Promise<void> {
  const diaryTab = page.getByRole('tab', {
    name: de.story.tabTimeline,
    exact: true,
  });
  await diaryTab.click();
  await expect(diaryTab).toHaveAttribute('aria-selected', 'true');
  const diary = page.getByRole('tabpanel', {
    name: de.story.tabTimeline,
    exact: true,
  });
  await expect(diary).toBeVisible();
  await expect(diary.locator('[data-task-item-key]')).toHaveCount(
    DISCOVER_ITEMS.length,
  );
  for (const label of canonicalItemLabels)
    await expect(diary).toContainText(label);
  await expectNoWcagViolations(page);
  await page
    .getByRole('tab', { name: de.story.tabDiscover, exact: true })
    .click();
  await expect(
    page.getByRole('tabpanel', { name: de.story.tabDiscover, exact: true }),
  ).toBeVisible();
  await expect(diary).toBeHidden();
}

test('Momente Discover presents the real #452 anniversary with authorized image and remains accessible on mobile', async ({
  page,
}, testInfo) => {
  const unexpectedRequests = await installDiscoverApiMocks(page, {
    retrospective: {
      id: 'historic-lake',
      type: 'MEMORY',
      titleOrText: 'That day by the lake',
      occurredOn: '2025-09-17',
      createdAt: null,
      scheduledAt: null,
      previewAttachmentId: 'historic-lake-ready',
      previewIsSensitive: false,
    },
  });
  await page.setViewportSize({ width: 390, height: 1100 });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');

  const retrospective = page.getByRole('region', {
    name: de.story.retrospectiveHeading,
  });
  await expect(retrospective).toBeVisible();
  await expect(retrospective).toContainText('That day by the lake');
  await expect(
    retrospective.getByRole('link', { name: /That day by the lake/ }),
  ).toHaveAttribute('href', '/story/memories/historic-lake');
  await expect(
    retrospective.locator('.momente-retrospective-media'),
  ).toHaveCount(1);
  await expect(page.locator('.momente-hero-highlight')).toHaveCount(1);
  await expect(page.locator('.momente-tapestry-item')).toHaveCount(
    canonicalItemLabels.length,
  );
  await verifyDiaryAndReturnToDiscover(page);
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('story-601-retrospective-390-light.png'),
    fullPage: true,
  });
});

test('Momente Discover keeps a text-only retrospective readable at 320px in dark large-text mode', async ({
  page,
}, testInfo) => {
  const unexpectedRequests = await installDiscoverApiMocks(page, {
    retrospective: {
      id: 'first-memory',
      type: 'MEMORY',
      titleOrText: 'Our first evening by the water',
      occurredOn: '2023-09-17',
      createdAt: null,
      scheduledAt: null,
      previewAttachmentId: null,
      previewIsSensitive: false,
    },
  });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');
  await page.addStyleTag({ content: 'html { font-size: 125%; }' });

  const retrospective = page.getByRole('region', {
    name: de.story.retrospectiveHeading,
  });
  await expect(retrospective).toContainText('Our first evening by the water');
  await expect(
    retrospective.locator('.momente-retrospective-media'),
  ).toHaveCount(0);
  await expect(retrospective.getByRole('link')).toHaveAttribute(
    'href',
    '/story/memories/first-memory',
  );
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath(
      'story-601-retrospective-text-320-dark-reduced.png',
    ),
    fullPage: true,
  });
});

test('Momente Discover preserves canonical backend order in its desktop CSS grid and stays axe-clean', async ({
  page,
}, testInfo) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');

  await expect(
    page.getByRole('heading', { name: de.story.timelineTitle, level: 1 }),
  ).toBeVisible();
  await expect(page.locator('.momente-hero-highlight')).toContainText(
    'Danke, dass du heute für mich da warst.',
  );

  await expect(page.locator('.momente-tapestry-item')).toHaveCount(
    canonicalItemLabels.length,
  );
  const tapestryLinkTitles = await page
    .locator('.momente-tapestry-item')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label')),
    );
  expect(tapestryLinkTitles).toHaveLength(canonicalItemLabels.length);
  for (const [index, label] of tapestryLinkTitles.entries())
    expect(label).toContain(canonicalItemLabels[index]);
  await verifyDiaryAndReturnToDiscover(page);

  const grid = page.locator('.momente-tapestry').first();
  await expect(grid).toBeVisible();
  const gridStyle = await grid.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      display: style.display,
      columns: style.gridTemplateColumns.split(' ').filter(Boolean).length,
    };
  });
  expect(gridStyle.display).toBe('grid');
  expect(gridStyle.columns).toBe(2);
  await expect(page.locator('.momente-tapestry-column')).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('972-browse-1440-light.png'),
    fullPage: false,
  });
});

test('Momente Discover tapestry is axe-clean in dark mode', async ({
  page,
}, testInfo) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');

  await expect(
    page.getByRole('heading', { name: de.story.timelineTitle, level: 1 }),
  ).toBeVisible();
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('1300-discover-1440-dark.png'),
    fullPage: false,
  });
});

test('Momente Discover uses two compact rediscovery columns and a separate full Diary on mobile with no horizontal overflow', async ({
  page,
}) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  await page.setViewportSize({ width: 390, height: 1800 });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');

  await expect(
    page.getByRole('heading', { name: de.story.timelineTitle, level: 1 }),
  ).toBeVisible();

  await expect(page.locator('.momente-tapestry-item')).toHaveCount(
    canonicalItemLabels.length,
  );
  const tapestryLinkTitles = await page
    .locator('.momente-tapestry-item')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label')),
    );
  expect(tapestryLinkTitles).toHaveLength(canonicalItemLabels.length);
  for (const [index, label] of tapestryLinkTitles.entries())
    expect(label).toContain(canonicalItemLabels[index]);
  await verifyDiaryAndReturnToDiscover(page);

  const grid = page.locator('.momente-tapestry').first();
  const columnCount = await grid.evaluate(
    (element) =>
      getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean)
        .length,
  );
  expect(columnCount).toBe(2);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
});

test('Momente browse layer keeps four structural destinations compact and secondary at 390px', async ({
  page,
}, testInfo) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/story?tab=timeline');
  await signIn(page);
  await page.goto('/story?tab=timeline');

  const browse = page.getByRole('navigation', { name: de.story.browseTitle });
  await expect(browse).toBeVisible();
  await expect(browse.getByRole('link')).toHaveCount(4);
  await expect(
    browse.getByRole('link', { name: sharedPhotos.browse, exact: true }),
  ).toHaveAttribute('href', '/story/photos');
  await expect(
    browse.getByRole('link', { name: de.story.browseMilestones }),
  ).toHaveAttribute('href', '/story?tab=timeline&type=MILESTONE');
  await expect(
    browse.getByRole('link', { name: de.story.browseChapters }),
  ).toHaveAttribute('href', '/story/chapters');
  await expect(
    browse.getByRole('link', { name: de.story.browseYears }),
  ).toHaveAttribute('href', '/story/years');

  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(
    page.getByRole('tab', { name: de.story.tabTimeline, exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.momente-archive-links')).toHaveCount(0);
  await expect(page.locator('.momente-year-archive')).toHaveCount(0);
  await expect(page.getByText(de.story.milestonesDesc)).toHaveCount(0);
  await expect(page.getByText(de.story.yearArchiveSubtitle)).toHaveCount(0);
  await expect(page.getByText(de.story.yearArchiveAll)).toHaveCount(0);

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await browse.scrollIntoViewIfNeeded();

  const linkBoxes = await browse.getByRole('link').evaluateAll((links) =>
    links.map((link) => {
      const rect = link.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  for (const box of linkBoxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const milestoneEntry = browse.getByRole('link', {
    name: de.story.browseMilestones,
  });
  await milestoneEntry.focus();
  await expect(milestoneEntry).toBeFocused();
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('972-browse-390-light.png'),
    fullPage: false,
  });
});

test('Momente browse layer reflows at 320px with enlarged text in dark mode', async ({
  page,
}, testInfo) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/story?tab=timeline');
  await signIn(page);
  await page.goto('/story?tab=timeline');
  await page.addStyleTag({ content: 'html { font-size: 125%; }' });

  const browse = page.getByRole('navigation', { name: de.story.browseTitle });
  await expect(browse).toBeVisible();
  await expect(browse.getByRole('link')).toHaveCount(4);
  await expect(
    browse.getByRole('link', { name: sharedPhotos.browse, exact: true }),
  ).toHaveAttribute('href', '/story/photos');

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const linkBoxes = await browse.getByRole('link').evaluateAll((links) =>
    links.map((link) => {
      const rect = link.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  for (const box of linkBoxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('972-browse-320-dark-large-text.png'),
    fullPage: false,
  });
});

for (const [width, theme] of [
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`Diary categories, red hearts and single-date headings at ${width} ${theme}`, async ({
    page,
  }, info) => {
    const unexpected = await installDiscoverApiMocks(page);
    const emotions = [
      'LOVED',
      'SEEN',
      'APPRECIATED',
      'SUPPORTED',
      'GRATEFUL',
      'HAPPY',
    ];
    const items = emotions.map((emotion, index) => {
      const item = heartMomentItem(
        `category-${index}`,
        localizedFixture.diaryCategoryNotes[index],
        '2026-10-26',
      );
      return {
        ...item,
        heartMoment: {
          ...item.heartMoment,
          emotion,
          visibility: index === 0 ? 'PRIVATE' : 'SHARED',
        },
      };
    });
    const untitled = memoryItem(
      'single-date',
      'Erinnerung vom 26.10.2026',
      '2026-10-26',
      true,
    );
    if (width === 390) untitled.memory.attachments[0].isSensitive = true;
    await page.route(`**/api/v1/spaces/${SPACE_ID}/timeline*`, (route) =>
      route.fulfill({
        json: {
          items: [...items, untitled],
          hasMore: false,
          nextCursor: null,
          availableYears: [2026],
        },
      }),
    );
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/story?tab=timeline');
    await signIn(page);
    await page.goto('/story?tab=timeline');
    const diary = page.locator('#momente-diary');
    await expect(diary.locator('[data-heart-emotion]')).toHaveCount(6);
    await expect(
      diary.getByRole('navigation', { name: de.story.browseTitle }),
    ).toBeVisible();
    await expect(diary.locator('.story-filter-toggle svg')).toBeVisible();
    const surfaces = await diary
      .locator('[data-heart-emotion]')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const computed = getComputedStyle(node);
          const probe = document.createElement('span');
          probe.style.backgroundColor = 'var(--heart-emotion-surface)';
          node.append(probe);
          const expected = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return { background: computed.backgroundColor, expected };
        }),
      );
    expect(new Set(surfaces.map((s) => s.background)).size).toBe(6);
    for (const surface of surfaces)
      expect(surface.background).toBe(surface.expected);
    const hearts = await diary
      .locator('.story-timeline-marker-heart-moment')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--emotion-loved-accent)';
          node.append(probe);
          const expected = getComputedStyle(probe).color;
          probe.remove();
          return { color: getComputedStyle(node).color, expected };
        }),
      );
    for (const heart of hearts) expect(heart.color).toBe(heart.expected);
    // The same generated title is normalized by every StoryList consumer.
    const memory = diary.locator('.story-card-memory');
    await expect(memory.locator('h4')).toHaveCount(0);
    await expect(memory.locator('time')).toHaveText('26. Oktober');
    const photo = memory.locator('.story-media-preview').first();
    await photo.scrollIntoViewIfNeeded();
    await expect(photo).toBeVisible();
    const photoWidth = await photo.evaluate(
      (node) => node.getBoundingClientRect().width,
    );
    const cardWidth = await memory.evaluate(
      (node) => node.getBoundingClientRect().width,
    );
    expect(photoWidth).toBeGreaterThan(cardWidth * 0.75);
    if (width === 390) {
      const toggle = memory.getByRole('button', {
        name: sensitiveMedia.show,
      });
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      await expect(
        memory.getByRole('button', { name: sensitiveMedia.hide }),
      ).toHaveAttribute('aria-pressed', 'true');
      await memory.getByRole('button', { name: sensitiveMedia.hide }).click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    }
    await expect(memory.locator('time')).toHaveCount(1);
    await expect(memory).not.toContainText('Erinnerung vom');
    await expect(diary.locator('.story-card-visibility-private')).toHaveCount(
      1,
    );
    await page.setViewportSize({ width, height: 1400 });
    await diary.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await expectNoWcagViolations(page);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    await memory.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await memory.screenshot({
      path: info.outputPath(`untitled-photo-${width}-${theme}.png`),
    });
    await page.screenshot({
      path: info.outputPath(`diary-${width}-${theme}.png`),
      fullPage: false,
    });
    expect(unexpected).toEqual([]);
  });
}

for (const [width, theme] of [
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`Discover long authored text uses its reading width at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await installDiscoverApiMocks(page);
    const longText = localizedFixture.diaryCategoryNotes.join(' ');
    const note = heartMomentItem('long-note', longText, '2024-07-28');
    await page.route(`**/api/v1/spaces/${SPACE_ID}/discover`, (route) =>
      route.fulfill({
        json: {
          selectionDate: '2026-09-17',
          lead: DISCOVER_ITEMS[2],
          items: [
            note,
            DISCOVER_ITEMS[3],
            DISCOVER_ITEMS[4],
            DISCOVER_ITEMS[1],
          ],
          leadContext: null,
        },
      }),
    );
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/story?tab=discover');
    await signIn(page);
    await page.goto('/story?tab=discover');
    const card = page.locator(
      '.momente-tapestry-item[data-discover-wide="true"]',
    );
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(longText);
    const grid = page.locator('.momente-tapestry').first();
    await expect(grid).toHaveAttribute('data-discover-measured', 'true');
    const bounds = await card.boundingBox();
    const gridBounds = await grid.boundingBox();
    expect(bounds?.width).toBeCloseTo(gridBounds?.width ?? 0, 0);
    await expect(card.locator('.momente-tapestry-quote')).toHaveCSS(
      '-webkit-line-clamp',
      'none',
    );
    await card.scrollIntoViewIfNeeded();
    await expectNoWcagViolations(page);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`discover-readable-${width}-${theme}.png`),
      fullPage: true,
    });
  });
}

test('Discover renewal confirms alternatives, guards duplicate activation and preserves content on rate/offline errors', async ({
  page,
}) => {
  await installDiscoverApiMocks(page, { viewerLocalDate: '2026-09-18' });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');
  const oldLead = page.locator('.momente-hero-highlight');
  await expect(oldLead).toContainText('Danke');
  await expect(
    page.getByText(de.story.discoverNewDay, { exact: true }),
  ).toBeVisible();
  let requests = 0;
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/discover/renew`,
    async (route) => {
      requests += 1;
      if (requests === 1) {
        await waiting;
        await route.fulfill({
          json: {
            selectionDate: '2026-09-18',
            lead: DISCOVER_ITEMS[4],
            items: [DISCOVER_ITEMS[5]],
            leadContext: null,
          },
        });
      } else {
        await route.fulfill({
          status: 429,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Too many requests',
            status: 429,
          }),
        });
      }
    },
  );
  await page
    .getByRole('button', { name: de.story.discoverRenew, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: de.story.discoverRenewing, exact: true }),
  ).toBeDisabled();
  await expect(oldLead).toContainText('Danke');
  expect(requests).toBe(1);
  release();
  await expect(page.locator('.momente-hero-highlight')).toContainText(
    'Konzertabend',
  );
  await expect(
    page.getByText(de.story.discoverNewDay, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: de.story.discoverRenewed }),
  ).toBeAttached();
  await page
    .getByRole('button', { name: de.story.discoverRenew, exact: true })
    .click();
  await expect(
    page.getByText(de.story.discoverRateLimit, { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.momente-hero-highlight')).toContainText(
    'Konzertabend',
  );
  await page.context().setOffline(true);
  await page
    .getByRole('button', { name: de.story.discoverRenew, exact: true })
    .click();
  await expect(
    page.getByText(de.story.discoverOffline, { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(2);
  await expect(page.locator('.momente-hero-highlight')).toContainText(
    'Konzertabend',
  );
  await page.context().setOffline(false);
  await page.route(`**/api/v1/spaces/${SPACE_ID}/discover/renew`, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'about:blank',
        title: 'Not found',
        status: 404,
      }),
    }),
  );
  await page
    .getByRole('button', { name: de.story.discoverRenew, exact: true })
    .click();
  await expect(page.locator('.momente-hero-highlight')).toHaveCount(0);
  await expect(page.locator('.momente-tapestry-item')).toHaveCount(0);
});
