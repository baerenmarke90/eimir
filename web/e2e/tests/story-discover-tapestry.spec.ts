import fs from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import navigation from '../../src/i18n/locales/navigation';
import sensitiveMedia from '../../src/i18n/locales/sensitiveMedia';
import storyProducts from '../../src/i18n/locales/storyProducts';
import localizedFixture from '../fixtures/locales/de';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '../support/axe';
import { pinDiaryLayout } from '../support/diaryLayout';
import { fulfillNoOccasionSources } from '../support/occasionSources';
import { mockEmptyPartnerNickname } from '../support/partnerNickname';
import { fulfillEmptyMomentPlaces } from '../support/photoSources';

// These checks describe the compact composition, not the Album default.
test.beforeEach(async ({ page }) => {
  await pinDiaryLayout(page, 'compact');
});

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
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes
          .map((node) => `${node.target.join(' ')}: ${node.failureSummary}`)
          .join('\n')}`,
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

    if (await fulfillNoOccasionSources(route)) return;
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

const story = storyProducts.discoverStory;

// Fotostory themes (direction C): photos, heart moments, milestones and
// memories told in words, each in the canonical backend order.
const STORY_THEMES = ['photos', 'heartMoments', 'milestones', 'words'];
const storyThemeOf: Record<string, string> = {
  'Danke, dass du heute einfach zugehört hast.': 'heartMoments',
  'Ein Wochenende am Wasser': 'photos',
  'Ein Jahr in unserer Wohnung': 'milestones',
  Konzertabend: 'photos',
  'Spontaner Tagesausflug': 'photos',
  'Picknick im Grünen': 'photos',
  'Sonnenuntergang nach Feierabend': 'photos',
  'Erster gemeinsamer Umzug': 'milestones',
  'Drei Jahre wir': 'milestones',
  'Filmabend auf dem Sofa': 'words',
  'Wochenendtrip nach Trier': 'photos',
};
const canonicalStoryOrder = STORY_THEMES.flatMap((theme) =>
  canonicalItemLabels
    .filter((label) => storyThemeOf[label] === theme)
    .map((label) => ({ theme, label })),
);

/** Stop autoplay, if motion allows it, so a walk reads stable slides. */
async function pauseStory(page: Page): Promise<void> {
  const pause = page.getByRole('button', { name: story.pause, exact: true });
  if (await pause.count()) await pause.click();
}

/** Page through every slide with the visible "next" control. */
async function walkStory(
  page: Page,
  total: number,
): Promise<Array<{ theme: string; label: string; href: string }>> {
  await pauseStory(page);
  const viewer = page.locator('.momente-story-viewer');
  const open = viewer.getByRole('link', {
    name: new RegExp(`^${de.common.open}:`),
  });
  const steps = [];
  for (let index = 0; index < total; index++) {
    await expect(open).toBeVisible();
    steps.push({
      theme: (await viewer.getAttribute('data-story-theme')) ?? '',
      label: (await open.getAttribute('aria-label')) ?? '',
      href: (await open.getAttribute('href')) ?? '',
    });
    await page.getByRole('button', { name: story.next, exact: true }).click();
  }
  return steps;
}

async function expectCanonicalStory(page: Page): Promise<void> {
  const steps = await walkStory(page, canonicalStoryOrder.length + 1);
  // The rediscovery lead plays first, in a theme of its own (#2192).
  const [lead, ...curated] = steps;
  expect(lead.theme).toBe('remember');
  expect(lead.href).toBe('/story/heart-moments/hm-1');
  expect(curated.map((step) => step.theme)).toEqual(
    canonicalStoryOrder.map((step) => step.theme),
  );
  for (const [index, step] of curated.entries())
    expect(step.label).toContain(canonicalStoryOrder[index].label);
  expect(new Set(steps.map((step) => step.href)).size).toBe(steps.length);
  // Bubbles name each theme with its number of moments.
  await expect(
    page.getByRole('list', { name: story.themesLabel }).getByRole('button'),
  ).toHaveCount(STORY_THEMES.length + 1);
}

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

for (const [width, theme, textScale] of [
  [390, 'light', 100],
  [320, 'dark', 125],
  [1280, 'dark', 100],
] as const) {
  test(`Fotostory includes the Wir memory as an ordinary slide at ${width} ${theme}`, async ({
    page,
  }, info) => {
    const unexpectedRequests = await installDiscoverApiMocks(page, {
      retrospective: {
        id: 'mem-1',
        type: 'MEMORY',
        titleOrText: 'Ein Wochenende am Wasser',
        occurredOn: '2026-08-24',
        previewAttachmentId: 'mem-1-att',
        previewIsSensitive: false,
        previewHasThumbnail: true,
      },
    });
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/story?tab=discover');
    await signIn(page);
    await page.goto('/story?tab=discover');
    if (textScale > 100)
      await page.addStyleTag({ content: `html { font-size: ${textScale}%; }` });

    const discover = page.getByRole('tabpanel', {
      name: de.story.tabDiscover,
      exact: true,
    });
    const fotostory = discover.getByRole('region', { name: story.label });
    const viewer = fotostory.locator('.momente-story-viewer');
    await expect(discover.locator('.momente-retrospective')).toHaveCount(0);
    await expect(discover.locator('.momente-hero-highlight')).toHaveCount(1);
    // The lead plays first (#2192); the Wir memory follows as an ordinary
    // photo slide.
    await expect(viewer).toHaveAttribute('data-story-theme', 'remember');
    await fotostory
      .getByRole('button', { name: story.next, exact: true })
      .click();
    await expect(
      fotostory.getByRole('heading', {
        name: 'Ein Wochenende am Wasser',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      fotostory.getByRole('link', { name: /Ein Wochenende am Wasser/ }),
    ).toHaveAttribute('href', '/story/memories/mem-1');
    await expect(
      discover.locator('a[href="/story/memories/mem-1"]'),
    ).toHaveCount(1);
    await expect(fotostory).toHaveAttribute('data-autoplay', 'false');

    const geometry = await viewer.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const root = document.documentElement;
      return {
        aspect: box.height / box.width,
        overflow: root.scrollWidth - root.clientWidth,
        immediatePredecessor:
          node.closest('.momente-story')?.previousElementSibling?.className,
      };
    });
    expect(geometry.overflow).toBeLessThanOrEqual(0);
    expect(geometry.aspect).toBeGreaterThanOrEqual(1.24);
    // The Fotostory opens the world; no renew action stands above it.
    expect(geometry.immediatePredecessor).toBeUndefined();

    await fotostory.scrollIntoViewIfNeeded();
    await expect(viewer.locator('[data-state="current"] img')).toHaveAttribute(
      'src',
      /^blob:/,
    );
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.screenshot({
      path: info.outputPath(
        `fotostory-after-experiences-${width}-${theme}.png`,
      ),
      fullPage: true,
    });
    await expectNoWcagViolations(page);
    if (width === 390) await verifyDiaryAndReturnToDiscover(page);
    expect(unexpectedRequests).toEqual([]);
  });
}

test('Momente Discover preserves canonical order inside each Fotostory theme on Expanded and stays axe-clean', async ({
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
  await expectCanonicalStory(page);
  await verifyDiaryAndReturnToDiscover(page);

  // One centred story viewer with a sensible Expanded size, no card grid.
  await expect(page.locator('.momente-tapestry')).toHaveCount(0);
  const viewer = page.locator('.momente-story-viewer');
  const geometry = await viewer.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const column = node
      .closest('.momente-discover-page')!
      .getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      leftGap: box.left - column.left,
      rightGap: column.right - box.right,
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
    };
  });
  expect(geometry.width).toBeLessThanOrEqual(32 * geometry.rem + 1);
  expect(geometry.height / geometry.width).toBeCloseTo(1.25, 1);
  expect(Math.abs(geometry.leftGap - geometry.rightGap)).toBeLessThan(2);

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

test('Momente Discover Fotostory is axe-clean in dark mode', async ({
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
  await expect(page.locator('.momente-story-viewer')).toBeVisible();
  await pauseStory(page);
  await expectNoWcagViolations(page);
  // Every slide kind stays axe-clean in dark mode.
  for (const theme of STORY_THEMES.slice(1)) {
    await page
      .locator(`.momente-story-bubble[data-story-theme="${theme}"]`)
      .click();
    await expect(page.locator('.momente-story-viewer')).toHaveAttribute(
      'data-story-theme',
      theme,
    );
    await expectNoWcagViolations(page);
  }
  expect(unexpectedRequests).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('1300-discover-1440-dark.png'),
    fullPage: false,
  });
});

for (const width of [320, 390, 430] as const) {
  test(`Momente Discover Fotostory fills the Compact column at ${width} without overflow or a renew button`, async ({
    page,
  }, info) => {
    const unexpectedRequests = await installDiscoverApiMocks(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/story?tab=discover');
    await signIn(page);
    await page.goto('/story?tab=discover');

    await expect(
      page.getByRole('heading', { name: de.story.timelineTitle, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(de.story.discoverInvitation, { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.discover-toolbar')).toHaveCount(0);
    // Pull-to-refresh is the only renew gesture; there is no renew button.
    await expect(page.locator('.momente-discover-renew')).toHaveCount(0);
    await expectCanonicalStory(page);
    await verifyDiaryAndReturnToDiscover(page);

    const viewer = page.locator('.momente-story-viewer');
    const geometry = await viewer.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const column = node
        .closest('.momente-discover-page')!
        .getBoundingClientRect();
      return { width: box.width, height: box.height, column: column.width };
    });
    expect(geometry.width).toBeCloseTo(geometry.column, 0);
    expect(geometry.height / geometry.width).toBeGreaterThanOrEqual(1.24);
    // The authorized photo of the first photo slide fills the viewer.
    await page
      .locator('.momente-story-bubble[data-story-theme="photos"]')
      .click();
    const photo = viewer
      .locator(
        '.momente-story-slide[data-state="current"] .momente-story-photo img',
      )
      .first();
    await expect(photo).toBeVisible();
    expect(await photo.getAttribute('src')).toMatch(/^blob:/);
    // Theme bubbles share the column and keep a comfortable target.
    const themes = page.getByRole('list', { name: story.themesLabel });
    for (const bubble of await themes.getByRole('button').all()) {
      const box = await bubble.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await viewer.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`fotostory-${width}-light.png`),
      fullPage: true,
    });
    await expectNoWcagViolations(page);
    expect(unexpectedRequests).toEqual([]);
  });
}

test('Momente Discover Fotostory autoplays only with motion, pauses on request and pages by keyboard', async ({
  page,
}) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');
  const viewer = page.locator('.momente-story-viewer');
  await viewer.scrollIntoViewIfNeeded();
  const fill = viewer.locator(
    '.momente-story-segment[data-state="current"] .momente-story-segment-fill',
  );
  await expect(fill).toHaveCSS(
    'animation-name',
    'eimir-motion-momente-story-progress',
  );
  await expect(fill).toHaveCSS('animation-play-state', 'running');
  // The rediscovery lead plays first and dwells longer (#2192).
  await expect(viewer).toHaveAttribute('data-story-theme', 'remember');
  await expect(fill).toHaveCSS('animation-duration', '8s');
  const zoom = viewer.locator(
    '.momente-story-slide[data-state="current"] .momente-story-photo > *',
  );

  // WCAG 2.2.2: a visible, named pause toggle.
  const pause = page.getByRole('button', { name: story.pause, exact: true });
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(fill).toHaveCSS('animation-play-state', 'paused');
  await expect(
    page.getByRole('button', { name: story.play, exact: true }),
  ).toBeVisible();

  // Keyboard paging once the viewer has focus.
  const open = viewer.getByRole('link', {
    name: new RegExp(`^${de.common.open}:`),
  });
  await expect(open).toHaveAttribute('href', '/story/heart-moments/hm-1');
  await viewer.focus();
  await page.keyboard.press('ArrowRight');
  await expect(open).toHaveAttribute('href', '/story/memories/mem-1');
  await expect(fill).toHaveCSS('animation-duration', '5s');
  await expect(zoom).toHaveCSS(
    'animation-name',
    'eimir-motion-momente-story-ken-burns',
  );
  await page.keyboard.press('ArrowRight');
  await expect(open).toHaveAttribute('href', '/story/memories/mem-2');
  await page.keyboard.press('ArrowLeft');
  await expect(open).toHaveAttribute('href', '/story/memories/mem-1');

  // Autoplay continues to the next slide after its dwell time.
  await page.getByRole('button', { name: story.play, exact: true }).click();
  await expect(open).toHaveAttribute('href', '/story/memories/mem-2', {
    timeout: 8_000,
  });

  // Reduced motion: no autoplay, no Ken Burns, no toggle; paging still works.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.momente-story')).toHaveAttribute(
    'data-autoplay',
    'false',
  );
  await expect(fill).toHaveCSS('animation-name', 'none');
  await expect(zoom).toHaveCSS('animation-name', 'none');
  await expect(
    page.getByRole('button', { name: story.pause, exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: story.next, exact: true }).click();
  await expect(open).toHaveAttribute('href', '/story/memories/mem-3');
  await page.waitForTimeout(6_000);
  await expect(open).toHaveAttribute('href', '/story/memories/mem-3');
  expect(unexpectedRequests).toEqual([]);
});

test('Momente Discover lead plays first and its photo develops, not under reduced motion (#2192)', async ({
  page,
}) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  await page.route(`**/api/v1/spaces/${SPACE_ID}/discover`, (route) =>
    route.fulfill({
      json: {
        selectionDate: '2026-09-17',
        lead: DISCOVER_ITEMS[2],
        items: [DISCOVER_ITEMS[3], DISCOVER_ITEMS[4]],
        leadContext: null,
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');

  const discover = page.getByRole('tabpanel', {
    name: de.story.tabDiscover,
    exact: true,
  });
  const fotostory = discover.getByRole('region', { name: story.label });
  const viewer = fotostory.locator('.momente-story-viewer');
  // One story block: the lead's bubble comes first and the lead is not a
  // separate card above or below the story.
  const bubbles = fotostory
    .getByRole('list', { name: story.themesLabel })
    .getByRole('button');
  await expect(bubbles.first()).toHaveAttribute('data-story-theme', 'remember');
  await expect(bubbles.first()).toContainText(story.theme.remember);
  await expect(discover.locator('.momente-hero-highlight')).toHaveCount(1);
  await expect(
    fotostory.locator('.momente-story-slide-lead .momente-hero-highlight'),
  ).toHaveCount(1);
  // The time-for-you group (`coupleExperiences.title`) follows the story.
  const order = await discover.evaluate((node) => {
    const storyBox = node.querySelector('.momente-story')!;
    const group = node.querySelector('.couple-experience-links')!;
    return Boolean(
      storyBox.compareDocumentPosition(group) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(order).toBe(true);

  // The lead photo develops and the lead dwells longer.
  const photo = viewer.locator(
    '.momente-story-slide-lead[data-state="current"] .momente-hero-media .story-media-preview',
  );
  await expect(photo).toHaveCSS(
    'animation-name',
    'eimir-motion-momente-story-develop',
  );
  await expect(
    viewer.locator(
      '.momente-story-segment[data-state="current"] .momente-story-segment-fill',
    ),
  ).toHaveCSS('animation-duration', '8s');
  await expect(
    viewer.getByRole('link', { name: new RegExp(`^${de.common.open}:`) }),
  ).toHaveAttribute('href', '/story/memories/mem-1');

  // Reduced motion: the photo is shown at once.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(photo).toHaveCSS('animation-name', 'none');
  await expect(photo).toHaveCSS('filter', 'none');
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
});

test('Momente Discover Fotostory never shows sensitive photos unblurred', async ({
  page,
}) => {
  const unexpectedRequests = await installDiscoverApiMocks(page);
  const sensitive = memoryItem(
    'mem-private',
    'Only for the two of us',
    '2026-08-20',
    true,
  );
  sensitive.memory.attachments[0].isSensitive = true;
  await page.route(`**/api/v1/spaces/${SPACE_ID}/discover`, (route) =>
    route.fulfill({
      json: {
        selectionDate: '2026-09-17',
        lead: DISCOVER_ITEMS[0],
        items: [sensitive, DISCOVER_ITEMS[2]],
        leadContext: null,
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');
  const viewer = page.locator('.momente-story-viewer');
  const slide = viewer.locator('.momente-story-slide[data-state="current"]');
  // The lead plays first (#2192); open the photos theme.
  await page
    .locator('.momente-story-bubble[data-story-theme="photos"]')
    .click();
  await expect(slide.locator('.sensitive-media-cover')).toHaveCount(1);
  await expect(slide).toContainText(sensitiveMedia.label);
  // Every image in the sensitive slide and its bubble stays inside the blur.
  for (const scope of [
    slide,
    page.locator('.momente-story-bubble[data-story-theme="photos"]'),
  ]) {
    const unblurred = await scope
      .locator('img')
      .evaluateAll(
        (images) =>
          images.filter((image) => !image.closest('.sensitive-media-blurred'))
            .length,
      );
    expect(unblurred).toBe(0);
  }
  await expect(
    viewer.getByRole('button', { name: sensitiveMedia.show }),
  ).toHaveCount(0);
  await expectNoWcagViolations(page);
  expect(unexpectedRequests).toEqual([]);
});

test('Diary uses its filter and keeps annual history reachable under More', async ({
  page,
}, info) => {
  const unexpected = await installDiscoverApiMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/story?tab=timeline');
  await signIn(page);
  await page.goto('/story?tab=timeline');
  await expect(
    page.getByRole('navigation', { name: de.story.browseTitle }),
  ).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.locator('.story-filter-toggle')).toBeVisible();
  await page.getByRole('link', { name: navigation.more, exact: true }).click();
  const years = page.getByRole('link', {
    name: de.more.destinations.yearsAndRecaps,
    exact: true,
  });
  await expect(years).toHaveAttribute('href', '/story/years');
  await expect(
    page.locator('.more-destination[href="/story/photos"]'),
  ).toBeVisible();
  await expect(
    page.locator('.more-destination[href="/story/chapters"]'),
  ).toBeVisible();
  await years.focus();
  await expect(years).toBeFocused();
  const bounds = await years.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await expectNoWcagViolations(page);
  await page.screenshot({
    path: info.outputPath('1616-more-years-390-light.png'),
    fullPage: false,
  });
  await years.click();
  await expect(
    page.getByRole('heading', { name: de.storyYears.title, level: 1 }),
  ).toBeVisible();
  await page.goBack();
  await expect(years).toBeVisible();
  expect(unexpected).toEqual([]);
});

test('Diary filter reflows at 320px with 200 percent text in dark mode', async ({
  page,
}, info) => {
  const unexpected = await installDiscoverApiMocks(page);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/story?tab=timeline');
  await signIn(page);
  await page.goto('/story?tab=timeline');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(
    page.getByRole('navigation', { name: de.story.browseTitle }),
  ).toHaveCount(0);
  const filter = page.locator('.story-filter-toggle');
  await expect(filter).toBeVisible();
  await filter.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(filter).toBeFocused();
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  await expectNoWcagViolations(page);
  expect(unexpected).toEqual([]);
  await page.screenshot({
    path: info.outputPath('1616-diary-320-dark-large-text.png'),
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
    ).toHaveCount(0);
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
      await expect(memory.locator('.sensitive-media-cover')).toBeVisible();
      await expect(
        memory.locator('.sensitive-media-blurred img'),
      ).toBeVisible();
      await expect(
        memory.getByRole('button', { name: sensitiveMedia.show }),
      ).toHaveCount(0);
      await expect(
        memory.getByRole('button', { name: sensitiveMedia.hide }),
      ).toHaveCount(0);
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

for (const [width, theme, textScale] of [
  [360, 'light', 100],
  [390, 'dark', 100],
  [390, 'light', 100],
  [430, 'dark', 100],
  [1280, 'dark', 100],
  [320, 'dark', 200],
] as const) {
  test(`Discover HeartMoment notes follow their emotion at ${width} ${theme} ${textScale}% text (#1784)`, async ({
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
    ] as const;
    const notes = emotions.map((emotion, index) => {
      const item = heartMomentItem(
        `discover-emotion-${index}`,
        localizedFixture.diaryCategoryNotes[index],
        '2026-10-26',
      );
      return { ...item, heartMoment: { ...item.heartMoment, emotion } };
    });
    await page.route(`**/api/v1/spaces/${SPACE_ID}/discover`, (route) =>
      route.fulfill({
        json: {
          selectionDate: '2026-09-17',
          lead: DISCOVER_ITEMS[2],
          items: notes,
          leadContext: null,
        },
      }),
    );
    await page.setViewportSize({ width, height: 1500 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/story?tab=discover');
    await signIn(page);
    await page.goto('/story?tab=discover');
    if (textScale !== 100)
      await page.addStyleTag({
        content: `html { font-size: ${textScale}%; }`,
      });

    // Six Heart Moments form one theme; every slide wears its feeling.
    const heartBubble = page.locator(
      '.momente-story-bubble[data-story-theme="heartMoments"]',
    );
    await expect(heartBubble).toHaveCount(1);
    // The lead plays first (#2192); open the Heart Moments theme.
    await heartBubble.click();
    const viewer = page.locator('.momente-story-viewer');
    await expect(viewer.locator('.momente-story-segment')).toHaveCount(
      emotions.length,
    );
    const slide = viewer.locator('.momente-story-slide[data-state="current"]');
    const surfaces: string[] = [];
    for (const [index, emotion] of emotions.entries()) {
      await expect(slide).toHaveAttribute('data-heart-emotion', emotion);
      const surface = await slide.evaluate((node) => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--heart-emotion-surface)';
        node.append(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { background: getComputedStyle(node).backgroundColor, expected };
      });
      expect(surface.background).toBe(surface.expected);
      surfaces.push(surface.background);
      const label = storyProducts.heartEmotion[emotion];
      await expect(slide.locator('.heart-emotion-label')).toHaveText(label);
      await expect(
        slide.getByRole('img', {
          name: `${storyProducts.heartMomentProduct.emotionLabel}: ${label}`,
        }),
      ).toHaveCount(1);
      await expect(slide).toContainText(
        localizedFixture.diaryCategoryNotes[index],
      );
      // Badge and text stay inside their slide, also with enlarged text.
      const overflow = await slide.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const badge = node
          .querySelector('.heart-emotion-badge')
          ?.getBoundingClientRect();
        return (
          !badge ||
          badge.left < box.left - 1 ||
          badge.right > box.right + 1 ||
          node.scrollWidth > node.clientWidth + 1
        );
      });
      expect(overflow).toBe(false);
      if (index === 0) {
        await viewer.scrollIntoViewIfNeeded();
        await expectNoWcagViolations(page);
      }
      if (index < emotions.length - 1)
        await page
          .getByRole('button', { name: story.next, exact: true })
          .click();
    }
    expect(new Set(surfaces).size).toBe(emotions.length);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expectNoWcagViolations(page);
    await page.screenshot({
      path: info.outputPath(
        `discover-emotion-notes-${width}-${theme}-${textScale}.png`,
      ),
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
    await page
      .locator('.momente-story-bubble[data-story-theme="heartMoments"]')
      .click();
    const slide = page.locator(
      '.momente-story-slide[data-state="current"][data-story-slide="heart"]',
    );
    await expect(slide).toContainText(longText);
    const quote = slide.locator('.momente-story-quote');
    await expect(quote).toHaveAttribute('data-length', 'long');
    await expect(quote).toHaveCSS('-webkit-line-clamp', 'none');
    // The whole text stays readable: the slide grows instead of clipping.
    const fits = await slide.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const text = node
        .querySelector('.momente-story-quote')!
        .getBoundingClientRect();
      return text.top >= box.top - 1 && text.bottom <= box.bottom + 1;
    });
    expect(fits).toBe(true);
    await slide.scrollIntoViewIfNeeded();
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
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 1 }),
  );
  await installDiscoverApiMocks(page, { viewerLocalDate: '2026-09-18' });
  // Without autoplay the lead slide stays the visible one while the
  // renewal states are checked (#2192).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/story?tab=discover');
  await signIn(page);
  await page.goto('/story?tab=discover');
  const oldLead = page.locator('.momente-hero-highlight');
  await expect(oldLead).toContainText('Danke');
  await expect(
    page.getByText(
      'Für heute wartet eine neue Auswahl. Mit „Neu entdecken“ könnt ihr sie ansehen.',
      { exact: true },
    ),
  ).toHaveCount(0);
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
  await pullDiscover(page);
  await expect(page.locator('.app-pull-refresh-indicator')).toHaveClass(
    /is-refreshing/,
  );
  await pullDiscover(page);
  await expect(oldLead).toContainText('Danke');
  expect(requests).toBe(1);
  release();
  await expect(page.locator('.momente-hero-highlight')).toContainText(
    'Konzertabend',
  );
  await expect(
    page.getByText(
      'Für heute wartet eine neue Auswahl. Mit „Neu entdecken“ könnt ihr sie ansehen.',
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: de.story.discoverRenewed }),
  ).toBeAttached();
  await pullDiscover(page);
  await expect(
    page.getByText(de.story.discoverRateLimit, { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.momente-hero-highlight')).toContainText(
    'Konzertabend',
  );
  await page.context().setOffline(true);
  await pullDiscover(page);
  await expect(
    page.getByText(de.story.discoverOffline, { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(2);
  await expect(page.locator('.momente-hero-highlight')).toContainText(
    'Konzertabend',
  );
  await page.context().setOffline(false);
  await expect(page.locator('.momente-discover-page')).toHaveAttribute(
    'aria-busy',
    'false',
  );
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
  await pullDiscover(page);
  await expect(page.locator('.momente-hero-highlight')).toHaveCount(0);
  await expect(page.locator('.momente-story')).toHaveCount(0);
});

/** Exercise the shared touch primitive, including pending duplicate gestures. */
async function pullDiscover(page: Page) {
  await page.evaluate(() => {
    const target = document.querySelector('.story-page');
    if (!target) throw new Error('Discover surface unavailable');
    for (const [type, y] of [
      ['touchstart', 40],
      ['touchmove', 200],
      ['touchend', null],
    ] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', {
        value: y === null ? [] : [{ clientX: 10, clientY: y }],
      });
      target.dispatchEvent(event);
    }
  });
}
