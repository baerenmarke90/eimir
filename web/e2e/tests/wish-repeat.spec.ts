import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import wishJourney from '../../src/i18n/locales/wishJourney';
import wishRepeat from '../../src/i18n/locales/wishRepeat';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { fulfillFreeEntitlements } from '../support/freeEntitlements';
import { mockEmptyPartnerNickname } from '../support/partnerNickname';
import { fulfillUnconfiguredPhotoSources } from '../support/photoSources';
import { fulfillEmptyPlanComments } from '../support/planComments';
import fs from 'node:fs';
import path from 'node:path';

/*
 * #1816: a completed wish can be experienced again. The repeat is a new wish
 * that remembers the first time; a series is one row under "Erfüllt"; a plan
 * reminder names the wish behind it.
 */

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const SEA_1 = '55555555-5555-4555-8555-555555555561';
const SEA_2 = '55555555-5555-4555-8555-555555555562';
const TRAIN = '55555555-5555-4555-8555-555555555563';
const STARS = '55555555-5555-4555-8555-555555555564';
const REPEATED = '55555555-5555-4555-8555-555555555565';
const REMINDER = '66666666-6666-4666-8666-666666666661';
const NOW = new Date().toISOString();
const capabilities = { canComment: false, canDelete: true, canEdit: true };
const creator = { id: ACCOUNT_ID, displayName: 'Anna' };

type WishFixture = ReturnType<typeof wishBody>;
type RepeatState = {
  repeated: WishFixture | null;
  repeatRequests: { key: string | undefined; body: unknown }[];
  unexpected: string[];
};

function wishBody(
  id: string,
  title: string,
  status: 'OPEN' | 'COMPLETED',
  series: { id: string; position: number; from: string | null },
  experiencedOn: string | null = null,
) {
  return {
    capabilities,
    createdAt: NOW,
    createdBy: ACCOUNT_ID,
    creator,
    followedFromWishId: series.from,
    hasMemory: false,
    id,
    plan:
      status === 'COMPLETED'
        ? {
            id: `44444444-4444-4444-8444-${id.slice(-12)}`,
            status: 'COMPLETED',
            plannedOn: null,
            plannedStart: null,
            experiencedOn,
          }
        : null,
    seriesId: series.id,
    seriesPosition: series.position,
    spaceId: SPACE_ID,
    status,
    tags: [],
    title,
    updatedAt: NOW,
    version: status === 'OPEN' ? 1 : 2,
  };
}

function wishes(state: RepeatState): WishFixture[] {
  return [
    wishBody(STARS, 'Stargazing', 'OPEN', {
      id: STARS,
      position: 1,
      from: null,
    }),
    wishBody(
      SEA_1,
      'Baltic Sea',
      'COMPLETED',
      { id: SEA_1, position: 1, from: null },
      '2026-05-12',
    ),
    wishBody(
      SEA_2,
      'Baltic Sea',
      'COMPLETED',
      { id: SEA_1, position: 2, from: SEA_1 },
      '2026-10-03',
    ),
    wishBody(TRAIN, 'Night train adventure', 'COMPLETED', {
      id: TRAIN,
      position: 1,
      from: null,
    }),
    ...(state.repeated ? [state.repeated] : []),
  ];
}

async function installMocks(page: Page): Promise<RepeatState> {
  const state: RepeatState = {
    repeated: null,
    repeatRequests: [],
    unexpected: [],
  };
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillFreeEntitlements(route, SPACE_ID)) return;
    if (await fulfillUnconfiguredPhotoSources(route)) return;
    if (await fulfillEmptyPlanComments(route)) return;
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const space = `/api/v1/spaces/${SPACE_ID}`;
    const json = (body: unknown, status = 200, headers = {}) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
      });
    const page_ = (items: unknown[]) =>
      json({ items, hasMore: false, nextCursor: null });

    if (method === 'GET' && pathname === '/api/v1/instance/status')
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
    if (method === 'POST' && pathname === '/api/v1/auth/sign-in')
      return json({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'wish-repeat-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'wish-repeat-refresh-token',
        },
      });
    if (method === 'POST' && pathname === '/api/v1/auth/refresh')
      return json({
        accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        accessToken: 'wish-repeat-access-token-refreshed',
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        refreshToken: 'wish-repeat-refresh-token-refreshed',
      });
    if (method === 'GET' && pathname === '/api/v1/auth/me')
      return json({ displayName: 'Anna', id: ACCOUNT_ID });
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities')
      return json({ serverAdmin: false });
    if (method === 'GET' && pathname === '/api/v1/auth/memberships')
      return json([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
    if (method === 'GET' && pathname === space)
      return json({ id: SPACE_ID, createdAt: NOW, partners: [] });
    if (method === 'GET' && pathname === `${space}/profile`)
      return json({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
      });
    if (
      method === 'GET' &&
      (pathname === `${space}/profile-preferences` ||
        pathname === `${space}/dashboard/preferences`)
    )
      return json({ items: [] });
    if (method === 'GET' && pathname === `${space}/configuration`)
      return json(
        {
          canManageSpaceConfiguration: true,
          dailyContextTimezone: null,
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: false,
          energyVisibilityMode: 'IMMEDIATE',
          loveNotesEnabled: false,
          sharedAchievementsEnabled: true,
          spaceId: SPACE_ID,
          supportGesturesEnabled: true,
          version: 1,
          vibeCheckEnabled: false,
          vibeVisibilityMode: 'IMMEDIATE',
        },
        200,
        { ETag: '"1"' },
      );
    if (method === 'GET' && pathname === `${space}/dashboard`)
      return json({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
        upcoming: [],
      });
    if (method === 'GET' && pathname === `${space}/profiles/${ACCOUNT_ID}`)
      return json({
        accountId: ACCOUNT_ID,
        createdAt: NOW,
        displayName: 'Anna',
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: NOW,
        version: 1,
      });
    if (method === 'GET' && pathname === `${space}/notifications/unread-count`)
      return json({ unreadCount: 0 });
    if (method === 'POST' && pathname === `${space}/presence`)
      return json({ state: null });
    if (method === 'GET' && pathname === `${space}/places`) return page_([]);
    if (method === 'GET' && pathname === `${space}/activity`) return page_([]);
    if (method === 'GET' && pathname === `${space}/recaps`)
      return json({
        canCompose: false,
        editions: [],
        periods: [],
        hasMore: false,
        nextCursor: null,
      });

    if (method === 'GET' && pathname === `${space}/plans`) return page_([]);
    if (method === 'GET' && pathname === `${space}/wishes`) {
      const status = url.searchParams.get('status');
      return page_(
        wishes(state).filter((wish) => !status || wish.status === status),
      );
    }
    const repeatMatch = pathname.match(/\/wishes\/([^/]+)\/repeat$/);
    if (method === 'POST' && repeatMatch) {
      const source = wishes(state).find((item) => item.id === repeatMatch[1]);
      const body = request.postDataJSON() ?? {};
      state.repeatRequests.push({
        key: request.headers()['idempotency-key'],
        body,
      });
      if (!source || source.status !== 'COMPLETED')
        return json(
          {
            code: 'WISH_REPEAT_REQUIRES_COMPLETED',
            status: 409,
            title: 'Conflict',
          },
          409,
        );
      state.repeated = wishBody(REPEATED, body.title ?? source.title, 'OPEN', {
        id: source.seriesId,
        position: source.seriesPosition + 1,
        from: source.id,
      });
      return json(state.repeated, 201, { ETag: '"1"' });
    }
    const wishMatch = pathname.match(/\/wishes\/([^/]+)$/);
    if (method === 'GET' && wishMatch) {
      const wish = wishes(state).find((item) => item.id === wishMatch[1]);
      if (wish) return json(wish, 200, { ETag: `"${wish.version}"` });
    }
    if (method === 'GET' && pathname === `${space}/reminders/${REMINDER}`)
      return json(
        {
          id: REMINDER,
          spaceId: SPACE_ID,
          title: 'Baltic Sea',
          description: null,
          source: 'GENERATED',
          sourceType: 'PLAN',
          sourceId: '44444444-4444-4444-8444-444444444499',
          ruleKey: 'plan_start_reminder',
          createdBy: ACCOUNT_ID,
          creator,
          schedule: {
            type: 'ONCE',
            at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
          },
          offsets: [1, 0],
          muted: false,
          version: 1,
          createdAt: NOW,
          updatedAt: NOW,
          capabilities: { canComment: false, canDelete: false, canEdit: false },
          originWish: { wishId: SEA_2, seriesPosition: 2 },
        },
        200,
        { ETag: '"1"' },
      );

    state.unexpected.push(`${method} ${pathname}`);
    return json(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Wish repeat test does not define ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });
  await mockEmptyPartnerNickname(page, SPACE_ID, null);
  return state;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function assertNoWcagViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = result.violations
    .map((violation) => `${violation.id}: ${violation.nodes.length} node(s)`)
    .join('\n');
  expect(result.violations, summary || 'No axe violations').toEqual([]);
}

const seriesLabel = wishRepeat.series.experienced_other.replace(
  '{{count}}',
  '2',
);

test.describe('repeat a completed wish (#1816)', () => {
  test('folds a series into one row, repeats a wish and returns to Planen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await installMocks(page);
    await signIn(page);

    // Erfüllt: the series is one row with its times folded away.
    await page.goto('/plan#fulfilled-wishes');
    const cards = page.locator('.planen-wish-journey-card');
    await expect(cards).toHaveCount(2);
    const series = cards.filter({ hasText: 'Baltic Sea' });
    await expect(series).toContainText(seriesLabel);
    const details = series.locator('details.planen-wish-series');
    await expect(details).not.toHaveAttribute('open', '');
    await details.getByText(wishRepeat.series.showAll).click();
    await expect(details.getByRole('link')).toHaveCount(2);
    await assertNoHorizontalOverflow(page);

    // A single completed wish opens its detail and offers the repeat.
    await cards
      .filter({ hasText: 'Night train adventure' })
      .getByRole('link', { name: 'Night train adventure', exact: true })
      .click();
    await page.getByRole('button', { name: wishRepeat.action }).click();
    const title = page.getByLabel(wishRepeat.sheet.titleLabel);
    await expect(title).toHaveValue('Night train adventure');

    // Dismissing writes nothing.
    await page.keyboard.press('Escape');
    await expect(title).toBeHidden();
    expect(state.repeatRequests).toHaveLength(0);

    // Create from an edited proposal: one request, one idempotency key.
    await page.getByRole('button', { name: wishRepeat.action }).click();
    await page
      .getByLabel(wishRepeat.sheet.titleLabel)
      .fill('Night train in winter');
    await page.getByRole('button', { name: wishRepeat.sheet.create }).click();
    await expect(page).toHaveURL(new RegExp(`/plan/wishes/${REPEATED}$`));
    expect(state.repeatRequests).toHaveLength(1);
    expect(state.repeatRequests[0].body).toEqual({
      title: 'Night train in winter',
    });
    expect(state.repeatRequests[0].key).toMatch(/^[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Night train in winter' }),
    ).toBeVisible();

    // Return: the open repeat carries the quiet time mark.
    await page.goto('/plan#wishes');
    const repeated = page
      .locator('.planen-wish-link')
      .filter({ hasText: 'Night train in winter' });
    await expect(repeated).toContainText(
      wishRepeat.series.nthTime.replace('{{position}}', '2'),
    );
    expect(state.unexpected).toEqual([]);
  });

  test('a plan reminder names the wish behind it and opens it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await installMocks(page);
    await signIn(page);

    await page.goto(`/plan/reminders/${REMINDER}`);
    const link = page.getByRole('link', {
      name: wishRepeat.reminder.fromWishTitledNth
        .replace('{{title}}', 'Baltic Sea')
        .replace('{{position}}', '2'),
    });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/plan/wishes/${SEA_2}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Baltic Sea' }),
    ).toBeVisible();
    expect(state.unexpected).toEqual([]);
  });

  type Scenario = {
    name: string;
    viewport: { width: number; height: number };
    theme: 'light' | 'dark';
    reducedMotion?: boolean;
    fontScale?: number;
  };
  const scenarios: Scenario[] = [
    {
      name: '360-light',
      viewport: { width: 360, height: 800 },
      theme: 'light',
    },
    {
      name: '390-light',
      viewport: { width: 390, height: 844 },
      theme: 'light',
    },
    { name: '390-dark', viewport: { width: 390, height: 844 }, theme: 'dark' },
    {
      name: '430-light',
      viewport: { width: 430, height: 932 },
      theme: 'light',
    },
    {
      name: '390-reduced-motion',
      viewport: { width: 390, height: 844 },
      theme: 'light',
      reducedMotion: true,
    },
    {
      name: '390-200-percent',
      viewport: { width: 390, height: 844 },
      theme: 'light',
      fontScale: 2,
    },
    {
      name: '1280-expanded-dark',
      viewport: { width: 1280, height: 900 },
      theme: 'dark',
    },
  ];

  for (const scenario of scenarios) {
    test(`repeat surfaces stay accessible at ${scenario.name}`, async ({
      page,
    }, testInfo: TestInfo) => {
      await page.setViewportSize(scenario.viewport);
      await page.emulateMedia({
        colorScheme: scenario.theme,
        reducedMotion: scenario.reducedMotion ? 'reduce' : 'no-preference',
      });
      await page.addInitScript((theme) => {
        window.localStorage.setItem('eimir.theme', theme);
      }, scenario.theme);
      const state = await installMocks(page);
      await signIn(page);
      const scale = async () => {
        if (scenario.fontScale)
          await page.addStyleTag({
            content: `html { font-size: ${scenario.fontScale * 100}% !important; }`,
          });
      };
      const shoot = async (surface: string) => {
        await assertNoHorizontalOverflow(page);
        await assertNoWcagViolations(page);
        const outputPath = testInfo.outputPath(
          `wish-repeat-${surface}-${scenario.name}.png`,
        );
        await page.screenshot({ path: outputPath });
        const exportDir = process.env.SCREENSHOT_EXPORT_DIR;
        if (exportDir) {
          fs.mkdirSync(exportDir, { recursive: true });
          fs.copyFileSync(
            outputPath,
            path.join(exportDir, `wish-repeat-${surface}-${scenario.name}.png`),
          );
        }
      };

      await page.goto('/plan#fulfilled-wishes');
      await scale();
      await expect(page.locator('.planen-wish-journey-card')).toHaveCount(2);
      await page.locator('details.planen-wish-series summary').click();
      await shoot('fulfilled');

      await page.goto('/plan#wishes');
      await scale();
      await expect(page.locator('.planen-wish-link').first()).toBeVisible();
      await shoot('open');

      await page.goto(`/plan/wishes/${TRAIN}`);
      await scale();
      await expect(
        page.getByRole('button', { name: wishRepeat.action }),
      ).toBeVisible();
      await shoot('wish');

      await page.getByRole('button', { name: wishRepeat.action }).click();
      await expect(page.getByLabel(wishRepeat.sheet.titleLabel)).toBeVisible();
      await shoot('sheet');

      await page.goto(`/plan/reminders/${REMINDER}`);
      await scale();
      await expect(page.locator('.reminder-read-origin')).toBeVisible();
      await shoot('reminder');
      expect(state.unexpected).toEqual([]);
    });
  }
});
