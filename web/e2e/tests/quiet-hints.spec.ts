import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import m5s5 from '../../src/i18n/locales/m5s5';
import quietHints from '../../src/i18n/locales/quietHints';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '../support/axe';
import { fulfillFreeEntitlements } from '../support/freeEntitlements';
import { captureScreenshot } from '../support/storyTimelineFixture';

/*
 * #1907 I1 quiet hints: the move-in on Wir, one action in empty areas, the
 * one-time connected moment, and one personal contextual hint that retires
 * after dismissal. Real browser layout, focus, reload persistence and axe.
 */

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-11-16T10:00:00Z';

type Scenario = {
  partner: { id: string; displayName: string } | null;
  wishes: { id: string; title: string }[];
};

async function installMocks(page: Page, scenario: Scenario): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillFreeEntitlements(route, SPACE_ID)) return;
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const base = `/api/v1/spaces/${SPACE_ID}`;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    const empty = { hasMore: false, items: [], nextCursor: null };

    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      return json({
        account: { displayName: 'Lea', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'quiet-hints-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'quiet-hints-refresh-token',
        },
      });
    }
    if (method === 'POST' && pathname === `${base}/presence`) {
      return json({ state: null });
    }
    if (method !== 'GET') {
      return json({ status: 405, title: 'Unexpected write' }, 405);
    }
    switch (pathname) {
      case '/api/v1/instance/status':
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
      case '/api/v1/auth/me':
        return json({ displayName: 'Lea', id: ACCOUNT_ID });
      case '/api/v1/auth/capabilities':
        return json({ serverAdmin: false });
      case '/api/v1/auth/memberships':
        return json([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
      case base:
        return json({ id: SPACE_ID, createdAt: TEST_NOW, partners: [] });
      case `${base}/profile`:
        return json({
          spaceId: SPACE_ID,
          version: 1,
          relationshipStartedOn: null,
          showRelationshipDuration: false,
        });
      case `${base}/profile-preferences`:
      case `${base}/dashboard/preferences`:
        return json({ items: [] });
      case `${base}/profiles/${ACCOUNT_ID}`:
        return json({
          accountId: ACCOUNT_ID,
          createdAt: TEST_NOW,
          displayName: 'Lea',
          id: PROFILE_ID,
          preferences: [],
          profileAttachmentId: null,
          updatedAt: TEST_NOW,
          version: 1,
        });
      case `${base}/notifications/unread-count`:
        return json({ unreadCount: 0 });
      case `${base}/dashboard`:
        return json({
          recentShared: [],
          relationshipDuration: null,
          retrospective: null,
          space: { partner: scenario.partner, spaceId: SPACE_ID },
          upcoming: [],
          thinkingOfYouAvailableAt: null,
        });
      case `${base}/discover`:
        return json({
          selectionDate: '2026-11-16',
          lead: null,
          items: [],
          leadContext: null,
        });
      case `${base}/timeline`:
      case `${base}/story/timeline`:
        return json({ ...empty, availableYears: [] });
      case `${base}/recaps`:
        return json({
          canCompose: false,
          editions: [],
          periods: [],
          hasMore: false,
        });
      case `${base}/plans`:
      case `${base}/places`:
      case `${base}/activity`:
        return json(empty);
      case `${base}/wishes`: {
        const status = url.searchParams.get('status');
        if (status && status !== 'OPEN') return json(empty);
        return json({
          ...empty,
          items: scenario.wishes.map((wish) => ({
            capabilities: { canComment: true, canDelete: true, canEdit: true },
            createdAt: TEST_NOW,
            createdBy: ACCOUNT_ID,
            creator: { id: ACCOUNT_ID, displayName: 'Lea' },
            id: wish.id,
            spaceId: SPACE_ID,
            status: 'OPEN',
            title: wish.title,
            updatedAt: TEST_NOW,
            version: 1,
          })),
        });
      }
      default:
        return json(
          { status: 404, title: 'Not part of this browser test' },
          404,
        );
    }
  });
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    result.violations.map((violation) => violation.id),
    'No axe violations',
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await captureScreenshot(page, testInfo, `i1-${name}.png`, {
    animations: 'disabled',
  });
}

test('Wir: move-in with one action, invitation link and the connected moment', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const scenario: Scenario = { partner: null, wishes: [] };
  await installMocks(page, scenario);
  await signIn(page);

  const moveIn = page.locator('.new-space-experience');
  await expect(moveIn).toBeVisible();
  await expect(moveIn).toContainText(quietHints.moveIn.solo);
  await expect(
    moveIn.getByRole('link', { name: m5s5.dashboard.newSpaceAction }),
  ).toHaveAttribute('href', '/story/memories/new');
  await expect(
    moveIn.getByRole('link', { name: quietHints.moveIn.invite }),
  ).toHaveAttribute(
    'href',
    /\/more\/settings\/relationship#partner-connection/,
  );
  await expect(page.locator('.connected-moment')).toHaveCount(0);
  await expectAccessible(page);
  await shot(page, testInfo, 'wir-move-in-390-light');

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await shot(page, testInfo, 'wir-move-in-390-dark');
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, testInfo, 'wir-move-in-1280-dark');

  // 320 CSS px with doubled text still reflows without sideways scrolling.
  await page.setViewportSize({ width: 320, height: 700 });
  const largeText = await page.addStyleTag({
    content: 'html { font-size: 200% !important; }',
  });
  await expect(
    moveIn.getByRole('link', { name: m5s5.dashboard.newSpaceAction }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await largeText.evaluate((element) => element.remove());

  // Alex accepts the invitation: Lea sees the moment once, then the line.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  scenario.partner = { id: 'partner-alex', displayName: 'Alex' };
  await page.reload();
  const moment = page.locator('.connected-moment');
  await expect(
    moment.getByRole('heading', { name: quietHints.connected.title }),
  ).toBeVisible();
  await expect(moment).toHaveAttribute('data-playing', 'true');
  await expect(moveIn).toContainText(m5s5.dashboard.newSpaceIntro);
  await expect(
    moveIn.getByRole('link', { name: quietHints.moveIn.invite }),
  ).toHaveCount(0);
  await expectAccessible(page);
  await shot(page, testInfo, 'wir-connected-390-light');

  await page.reload();
  await expect(moment).toBeVisible();
  await expect(moment).not.toHaveAttribute('data-playing', 'true');
});

test('Momente and Planen: one action in each empty area', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await installMocks(page, { partner: null, wishes: [] });
  await signIn(page);

  await page.goto('/story');
  const storyAction = page
    .locator('#momente-panel-discover')
    .getByRole('link', { name: de.story.emptyAction });
  await expect(storyAction).toBeVisible();
  await expectAccessible(page);
  await shot(page, testInfo, 'moments-empty-390-light');

  await page.goto('/plan');
  await page.getByRole('tab', { name: m5s3.overview.segmentPlans }).click();
  await expect(
    page.getByRole('heading', { name: m5s3.overview.openPlansEmpty }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: quietHints.firstPlan }),
  ).toHaveAttribute('href', '/plan/plans/new');
  await shot(page, testInfo, 'plans-empty-390-light');

  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await expect(
    page.getByRole('link', { name: quietHints.firstWish }),
  ).toHaveAttribute('href', '/plan/wishes/new');
  await expectAccessible(page);

  await page.goto('/story');
  await page
    .locator('#momente-panel-discover')
    .getByRole('link', { name: de.story.emptyAction })
    .click();
  await expect(page).toHaveURL(/\/story\/memories\/new$/);
});

test('Planen: the wish-to-plan tip appears once and retires after Got it', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await installMocks(page, {
    partner: { id: 'partner-alex', displayName: 'Alex' },
    wishes: [
      { id: 'wish-sunrise', title: 'Sunrise by the sea' },
      { id: 'wish-pottery', title: 'Pottery together' },
    ],
  });
  await signIn(page);
  await page.goto('/plan');
  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();

  const hint = page.getByRole('complementary', {
    name: quietHints.tipLabel,
  });
  await expect(hint).toContainText(quietHints.tips.planFromWish);
  await expectAccessible(page);
  await shot(page, testInfo, 'wishes-tip-390-light');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await shot(page, testInfo, 'wishes-tip-390-dark');

  await hint.getByRole('button', { name: quietHints.gotIt }).click();
  await expect(hint).toHaveCount(0);
  await expect(page.locator(':focus')).not.toHaveCount(0);
  await page.reload();
  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  await expect(page.getByText('Sunrise by the sea')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: quietHints.tipLabel }),
  ).toHaveCount(0);
});
