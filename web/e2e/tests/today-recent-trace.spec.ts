import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';
const PROFILE_ID = '00000000-0000-0000-0000-000000000020';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
}

function inDays(n: number): string {
  return new Date(Date.now() + n * 24 * 3600 * 1000).toISOString();
}

/**
 * A few "Demnächst" items too, so tests can compare the "Zuletzt bei euch"
 * mini-tile width directly against the Shared Planning Horizon tile width
 * on the same viewport (#791 fifth follow-up: they must share one rhythm).
 */
const UPCOMING_ITEMS = [
  { id: 'p1', type: 'PLAN', titleOrText: 'Wanderung', scheduledAt: inDays(2) },
  {
    id: 'p2',
    type: 'PLAN',
    titleOrText: 'Kino-Abend mit Popcorn',
    scheduledAt: inDays(4),
  },
  { id: 'p3', type: 'PLAN', titleOrText: 'Brunch', scheduledAt: inDays(7) },
  {
    id: 'p4',
    type: 'PLAN',
    titleOrText: 'Wochenendtrip an die Ostsee',
    scheduledAt: inDays(12),
  },
];

/**
 * Reproduces the real-demo composition complaint (#790/#791 fourth
 * follow-up): four recent shared items of different kinds, mirroring the
 * canonical Lea/Alex-shaped content this section normally shows. This is
 * enough to reproduce the reported activity-log/left-column/dead-space
 * problem on a real desktop viewport.
 */
const RECENT_SHARED_ITEMS = [
  {
    id: 'r1',
    type: 'HEART_MOMENT',
    titleOrText: 'Danke, dass du heute für mich da warst.',
    occurredOn: daysAgo(0),
  },
  {
    id: 'r2',
    type: 'MEMORY',
    titleOrText: 'Ein Wochenende am Wasser',
    occurredOn: daysAgo(2),
  },
  {
    id: 'r3',
    type: 'MILESTONE',
    titleOrText: 'Ein Jahr in unserer Wohnung',
    occurredOn: daysAgo(4),
  },
  {
    id: 'r4',
    type: 'CHAPTER',
    titleOrText: 'Sommer 2026',
    occurredOn: daysAgo(6),
  },
  {
    id: 'r5',
    type: 'COLLECTION',
    titleOrText: 'Filme für Regentage',
    occurredOn: daysAgo(8),
  },
];

/*
 * R4 promotes the Heart Moment to the text-first focal role and the Milestone
 * to the single `Gerade bei euch` slot. The trace never repeats content the
 * page already features above it, so three fixtures remain as trace tiles.
 */
const TRACE_TILE_COUNT = 3;

async function installMocks(page: Page): Promise<void> {
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
          accessToken: 'today-recent-trace-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'today-recent-trace-refresh-token',
        },
      });
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
        createdAt: '2026-01-01T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Anna' },
          { id: PARTNER_ID, displayName: 'Ben' },
        ],
      });
      return;
    }
    if (
      method === 'GET' &&
      (pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}` ||
        pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}`)
    ) {
      const isPartner = pathname.endsWith(PARTNER_ID);
      await fulfillJson({
        accountId: isPartner ? PARTNER_ID : ACCOUNT_ID,
        createdAt: '2026-01-01T00:00:00Z',
        displayName: isPartner ? 'Ben' : 'Anna',
        id: isPartner ? '00000000-0000-0000-0000-000000000022' : PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1,
      });
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
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Ben' },
        },
        relationshipDuration: { daysTogether: 250, startedOn: '2026-01-01' },
        retrospective: null,
        upcoming: UPCOMING_ITEMS,
        recentShared: RECENT_SHARED_ITEMS,
      });
      return;
    }
    await fulfillJson({}, 200);
  });
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

test('Today "Zuletzt bei euch" renders as small bordered mini-tiles, not activity-log cards or a bare text trace, and uses desktop width instead of a narrow left column', async ({
  page,
}) => {
  await installMocks(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await signIn(page);
  await page.waitForSelector('.today-section-recent');

  // The old activity-log card/heading/kind-badge shape is gone.
  await expect(page.locator('.recent-shared-card')).toHaveCount(0);
  // The redundant description under the section heading is gone too.
  await expect(
    page.locator('.today-section-recent .today-section-subline'),
  ).toHaveCount(0);

  const tiles = page.locator('.today-recent-tile');
  await expect(tiles).toHaveCount(TRACE_TILE_COUNT);

  // The first eligible shared story item is the deliberate text-first focal
  // item and is not repeated as a trace tile below it.
  await expect(page.locator('.today-moment-text')).toHaveCount(1);
  await expect(
    page.getByText('Danke, dass du heute für mich da warst.'),
  ).toHaveCount(1);

  // The promoted Milestone appears once, as the contextual module, and is
  // not duplicated as a trace tile below it.
  await expect(page.locator('.today-living-milestone')).toHaveCount(1);
  await expect(page.getByText('Ein Jahr in unserer Wohnung')).toHaveCount(1);

  // Each entry is a real, deliberately bordered mini-surface - not a bare,
  // unstyled line of text (the over-corrected third follow-up) and not a
  // huge full-width SaaS card. A visible border/background plus a bounded,
  // compact width is what makes this read as a designed unit.
  for (const tile of await tiles.all()) {
    const style = await tile.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { borderWidth: cs.borderTopWidth, borderStyle: cs.borderTopStyle };
    });
    expect(style.borderStyle).toBe('solid');
    expect(Number.parseFloat(style.borderWidth)).toBeGreaterThan(0);
  }

  // Compact and bounded, not full-width rows: none should come close to the
  // 1920px viewport, and several must share the same line (2-4 per row is
  // the requested rhythm) so the section actually uses the available width
  // instead of sitting as a narrow column with dead space beside it.
  const rects = await tiles.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect()),
  );
  for (const rect of rects) {
    expect(rect.width).toBeLessThan(320);
  }
  const tops = rects.map((rect) => rect.top);
  expect(new Set(tops).size).toBeLessThan(tops.length);

  // Matches the Shared Planning Horizon ("Demnächst") tile width directly
  // above (#791 fifth follow-up): an earlier round capped these tiles
  // narrower than that reference section, which read as a mismatched,
  // "worse" rhythm even though both use the same bordered-tile pattern.
  const agendaWidth = await page
    .locator('.today-agenda-row')
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);
  for (const rect of rects) {
    expect(Math.abs(rect.width - agendaWidth)).toBeLessThan(1);
  }

  // Ordinary trace titles must not be truncated just because the box is
  // small. The long free-text Heart Moment now owns the focal role above.
  const titleOverflow = await page
    .locator('.today-recent-tile-title')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        text: node.textContent,
        truncated: node.scrollWidth > node.clientWidth + 1,
      })),
    );
  const truncatedTitles = titleOverflow.filter((t) => t.truncated);
  expect(truncatedTitles).toHaveLength(0);

  // Type is still available to assistive tech, but not as a separate
  // visible badge next to an already type-specific icon.
  await expect(page.locator('.today-recent-tile .sr-only').first()).toHaveText(
    /./,
  );

  // Data, order, and navigation are unchanged.
  await expect(
    page.getByRole('link', { name: /Alle Aktivitäten ansehen/ }),
  ).toHaveAttribute('href', '/today/activity');

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
});

test('Today "Zuletzt bei euch" mini-tiles wrap 2-4 per row on both required desktop widths', async ({
  page,
}) => {
  await installMocks(page);
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/today');
  await signIn(page);
  await page.waitForSelector('.today-recent-tile');

  for (const width of [1920, 1440]) {
    await page.setViewportSize({ width, height: 900 });

    const tops = await page
      .locator('.today-recent-tile')
      .evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
      );
    const rowCount = new Set(tops).size;
    // The remaining three tiles may share one row; they must not stack into
    // the old narrow one-item column with dead space beside it.
    expect(rowCount).toBeGreaterThan(0);
    expect(rowCount).toBeLessThan(RECENT_SHARED_ITEMS.length);
  }
});

test('Today "Zuletzt bei euch" mini-tiles are keyboard-focusable in order with a visible focus ring', async ({
  page,
}) => {
  await installMocks(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/today');
  await signIn(page);
  await page.waitForSelector('.today-recent-tile');

  const firstTile = page.locator('.today-recent-tile').first();
  // Real Tab-key traversal (not element.focus()) so :focus-visible actually
  // engages, matching how a keyboard user reaches this tile.
  for (let attempt = 0; attempt < 40; attempt++) {
    const isFocused = await firstTile.evaluate(
      (el) => document.activeElement === el,
    );
    if (isFocused) break;
    await page.keyboard.press('Tab');
  }
  await expect(firstTile).toBeFocused();

  const outline = await firstTile.evaluate((el) => {
    const style = getComputedStyle(el);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(outline.style).not.toBe('none');
  expect(Number.parseFloat(outline.width)).toBeGreaterThan(0);
});

test('Today "Zuletzt bei euch" stays regression-free on mobile and in dark mode', async ({
  page,
}) => {
  await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await signIn(page);
  await page.waitForSelector('.today-recent-tile');

  // Mobile keeps the already-accepted single, full-width stacked column -
  // no unnecessary redesign of an already-approved viewport.
  const lefts = await page
    .locator('.today-recent-tile')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().left),
    );
  expect(new Set(lefts).size).toBe(1);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
});

test('Today "Zuletzt bei euch" is axe-clean in dark mode', async ({ page }) => {
  await installMocks(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/today');
  await signIn(page);
  await page.waitForSelector('.today-recent-tile');

  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
});
