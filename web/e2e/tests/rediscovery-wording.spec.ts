import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { fulfillFreeEntitlements } from '../support/freeEntitlements';

/*
 * #1790 C2: both rediscovery surfaces (Wir "Erinnert ihr euch?" and Momente
 * "Wisst ihr noch?") vary their wording instead of using a bare date as the
 * title. An authored title stays the headline with a variant secondary line;
 * an untitled entry gets a variant headline and keeps its date below.
 * Wording is stable across reloads on the same day.
 */

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-11-13T10:00:00Z';
const TODAY = '2026-11-13';
const ME = { id: ACCOUNT_ID, displayName: 'Lea' };
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };

const REDISCOVERY = {
  placeName: 'Lake Phoenix',
  chapterTitle: 'Summer holiday',
  tag: 'Sunset',
  excerpt: 'We just drove off without a plan',
  excerptTruncated: true,
  photoCount: 12,
  videoCount: 0,
  partOfDay: 'AFTERNOON',
};

type Scenario = { title: string };

function dashboard({ title }: Scenario) {
  return {
    space: {
      partner: { id: 'partner-1', displayName: 'Alex' },
      spaceId: SPACE_ID,
    },
    relationshipDuration: null,
    thinkingOfYouAvailableAt: null,
    upcoming: [],
    keepsake: null,
    recentShared: [],
    viewerLocalDate: TODAY,
    retrospective: {
      id: 'memory-retro',
      type: 'MEMORY',
      titleOrText: title,
      occurredOn: '2025-11-13',
      createdAt: '2025-11-13T15:00:00Z',
      scheduledAt: null,
      previewAttachmentId: null,
      previewIsSensitive: false,
    },
    retrospectiveRediscovery: REDISCOVERY,
  };
}

function discover({ title }: Scenario) {
  return {
    selectionDate: TODAY,
    leadContext: null,
    leadRediscovery: REDISCOVERY,
    lead: {
      kind: 'MEMORY',
      effectiveDate: '2023-11-12',
      memory: {
        id: 'discover-lead',
        title,
        happenedOn: '2023-11-12',
        createdAt: '2023-11-12T18:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        attachments: [],
      },
    },
    items: [],
  };
}

async function installMocks(page: Page, scenario: Scenario): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillFreeEntitlements(route, SPACE_ID)) return;
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    const space = `/api/v1/spaces/${SPACE_ID}`;

    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      return json({
        account: ME,
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'rediscovery-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'rediscovery-refresh-token',
        },
      });
    }
    if (pathname === '/api/v1/instance/status') {
      return json({
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
    }
    if (pathname === '/api/v1/auth/me') return json(ME);
    if (pathname === '/api/v1/auth/capabilities')
      return json({ serverAdmin: false });
    if (pathname === '/api/v1/auth/memberships') {
      return json([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
    }
    if (pathname === space)
      return json({ id: SPACE_ID, createdAt: NOW, partners: [] });
    if (pathname === `${space}/profile`) {
      return json({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: '2023-04-01T00:00:00Z',
        showRelationshipDuration: false,
      });
    }
    if (pathname === `${space}/profiles/${ACCOUNT_ID}`) {
      return json({
        accountId: ACCOUNT_ID,
        createdAt: NOW,
        displayName: 'Lea',
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: NOW,
        version: 1,
      });
    }
    if (pathname === `${space}/notifications/unread-count`) {
      return json({ unreadCount: 0 });
    }
    if (pathname === `${space}/daily-quote`) {
      return json({ checkedOn: TODAY, enabled: false, quote: null });
    }
    if (pathname === `${space}/recaps`) {
      return json({
        canCompose: false,
        editions: [],
        periods: [],
        hasMore: false,
      });
    }
    if (pathname === `${space}/dashboard`) return json(dashboard(scenario));
    if (pathname === `${space}/discover`) return json(discover(scenario));
    if (pathname === `${space}/timeline`) {
      return json({
        items: [],
        availableYears: [],
        hasMore: false,
        nextCursor: null,
      });
    }
    if (pathname === `${space}/activity` || pathname.endsWith('/comments')) {
      return json({ items: [], hasMore: false, nextCursor: null });
    }
    if (
      pathname === `${space}/profile-preferences` ||
      pathname === `${space}/dashboard/preferences`
    ) {
      return json({ items: [] });
    }
    if (method === 'POST' && pathname === `${space}/presence`) {
      return json({ state: null });
    }
    return json({});
  });
}

async function signIn(page: Page, target: string): Promise<void> {
  await page.goto(target);
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
  locator: string,
): Promise<void> {
  const filename = `rediscovery-wording-${name}.png`;
  await page.locator(locator).scrollIntoViewIfNeeded();
  const screenshot = await page.screenshot({
    path: testInfo.outputPath(filename),
  });
  const exportDirectory = process.env.SCREENSHOT_EXPORT_DIR;
  if (exportDirectory) {
    mkdirSync(exportDirectory, { recursive: true });
    writeFileSync(path.join(exportDirectory, filename), screenshot);
  }
}

async function expectNoOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const SURFACES = [
  {
    key: 'wir',
    route: '/today',
    card: '.today-living-retrospective',
    headline: '.today-retrospective-title',
    date: '.today-retrospective-date time',
    variant: '.today-retrospective-date .rediscovery-variant',
  },
  {
    key: 'momente',
    route: '/story?tab=discover',
    card: '.momente-hero-highlight',
    headline: '.momente-hero-title',
    date: '.momente-hero-meta time',
    variant: '.momente-hero-meta .rediscovery-variant',
  },
] as const;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW));
});

for (const surface of SURFACES) {
  test(`${surface.key}: an untitled entry gets a stable variant headline, never a bare date`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page, { title: '' });
    await signIn(page, surface.route);

    const headline = page.locator(surface.headline);
    await expect(headline).toBeVisible();
    const date = (await page.locator(surface.date).textContent())?.trim();
    const text = (await headline.textContent())?.trim();
    expect(date).toBeTruthy();
    expect(text).toBeTruthy();
    expect(text).not.toBe(date);
    await expect(page.locator(surface.variant)).toHaveCount(0);
    if (surface.key === 'momente') {
      await expect(page.locator('.momente-hero-link')).toHaveAttribute(
        'aria-label',
        `${de.story.featuredHighlight}: ${text}`,
      );
    }

    const results = await new AxeBuilder({ page })
      .include(surface.card)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.reload();
    await expect(page.locator(surface.headline)).toHaveText(text ?? '');

    for (const [width, scheme, large] of [
      [390, 'light', false],
      [390, 'dark', false],
      [360, 'light', false],
      [430, 'light', false],
      [390, 'light', true],
    ] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate((enlarged) => {
        document.documentElement.style.fontSize = enlarged ? '200%' : '';
      }, large);
      await expectNoOverflow(page);
      await capture(
        page,
        testInfo,
        `${surface.key}-untitled-${width}-${scheme}${large ? '-large-text' : ''}`,
        surface.card,
      );
    }
  });

  test(`${surface.key}: an authored title stays the headline with a variant secondary line`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 360, height: 780 });
    await installMocks(page, { title: 'That day by the lake' });
    await signIn(page, surface.route);

    await expect(page.locator(surface.headline)).toHaveText(
      'That day by the lake',
    );
    await expect(page.locator(surface.variant)).toHaveCount(1);
    await expect(page.locator(surface.variant)).not.toBeEmpty();
    // The date never breaks inside itself on narrow screens.
    const dateLines = await page.locator(surface.date).evaluate((node) => {
      const rects = node.getClientRects();
      return new Set(Array.from(rects, (rect) => Math.round(rect.top))).size;
    });
    expect(dateLines).toBe(1);
    await expectNoOverflow(page);

    for (const [width, scheme] of [
      [360, 'light'],
      [390, 'dark'],
      [430, 'light'],
    ] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 844 });
      await capture(
        page,
        testInfo,
        `${surface.key}-titled-${width}-${scheme}`,
        surface.card,
      );
    }
  });
}
