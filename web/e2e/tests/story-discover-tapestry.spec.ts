import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const BROWSE_EVIDENCE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docs',
  'product',
  'design',
  'evidence',
  '972-momente-browse-layer',
);

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
    .exclude('.momente-tapestry-kind')
    .exclude('.momente-stream-all-link')
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

async function installDiscoverApiMocks(page: Page): Promise<string[]> {
  const unexpectedRequests: string[] = [];

  await page.route('https://fake-media.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: Buffer.from(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
        'base64',
      ),
    });
  });

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
        retrospective: null,
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

test('Momente Discover preserves canonical backend order in its desktop CSS grid and stays axe-clean', async ({
  page,
}) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');

  await expect(
    page.getByRole('heading', { name: 'Unsere Momente', level: 1 }),
  ).toBeVisible();
  await expect(page.locator('.momente-hero-highlight')).toContainText(
    'Danke, dass du heute für mich da warst.',
  );

  const tapestryLinkTitles = await page
    .locator('.momente-tapestry-item')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label')),
    );
  expect(tapestryLinkTitles).toEqual(canonicalItemLabels);

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
  expect(gridStyle.columns).toBe(3);
  await expect(page.locator('.momente-tapestry-column')).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);

  fs.mkdirSync(BROWSE_EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(BROWSE_EVIDENCE_DIR, '972-browse-1440-light.png'),
    fullPage: false,
  });
});

test('Momente Discover tapestry is axe-clean in dark mode', async ({
  page,
}) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');

  await expect(
    page.getByRole('heading', { name: 'Unsere Momente', level: 1 }),
  ).toBeVisible();
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
});

test('Momente Discover uses one canonical CSS-grid column on mobile with no horizontal overflow', async ({
  page,
}) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  await page.setViewportSize({ width: 390, height: 1800 });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');

  await expect(
    page.getByRole('heading', { name: 'Unsere Momente', level: 1 }),
  ).toBeVisible();

  const tapestryLinkTitles = await page
    .locator('.momente-tapestry-item')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label')),
    );
  expect(tapestryLinkTitles).toEqual(canonicalItemLabels);

  const grid = page.locator('.momente-tapestry').first();
  const columnCount = await grid.evaluate(
    (element) =>
      getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean)
        .length,
  );
  expect(columnCount).toBe(1);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
});

test('Momente browse layer keeps three structural destinations compact and secondary at 390px', async ({
  page,
}) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');

  const browse = page.getByRole('navigation', { name: de.story.browseTitle });
  await expect(browse).toBeVisible();
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
  await expect(page.locator('.momente-archive-links')).toHaveCount(0);
  await expect(page.locator('.momente-year-archive')).toHaveCount(0);
  await expect(page.getByText(de.story.milestonesDesc)).toHaveCount(0);
  await expect(page.getByText(de.story.yearArchiveSubtitle)).toHaveCount(0);
  await expect(page.getByText(de.story.yearArchiveAll)).toHaveCount(0);

  const browseBox = await browse.boundingBox();
  const heroBox = await page.locator('.momente-hero-highlight').boundingBox();
  expect(browseBox).not.toBeNull();
  expect(heroBox).not.toBeNull();
  expect(browseBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
    heroBox?.y ?? Number.NEGATIVE_INFINITY,
  );

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

  fs.mkdirSync(BROWSE_EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(BROWSE_EVIDENCE_DIR, '972-browse-390-light.png'),
    fullPage: false,
  });
});

test('Momente browse layer reflows at 320px with enlarged text in dark mode', async ({
  page,
}) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');
  await page.addStyleTag({ content: 'html { font-size: 125%; }' });

  const browse = page.getByRole('navigation', { name: de.story.browseTitle });
  await expect(browse).toBeVisible();
  await expect(browse.getByRole('link')).toHaveCount(3);

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
  fs.mkdirSync(BROWSE_EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(BROWSE_EVIDENCE_DIR, '972-browse-320-dark-large-text.png'),
    fullPage: false,
  });
});
