import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { NOTIFICATION_WAKE_EVENT } from '../../src/client/foregroundNotifications';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import wishDateProposal from '../../src/i18n/locales/wishDateProposal';
import wishJourney from '../../src/i18n/locales/wishJourney';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '../support/axe';
import { fulfillFreeEntitlements } from '../support/freeEntitlements';
import { chooseItemMenuRow, itemMenuTrigger } from '../support/itemMenu';
import { fulfillNoOccasionSources } from '../support/occasionSources';
import { mockEmptyPartnerNickname } from '../support/partnerNickname';
import { fulfillUnconfiguredPhotoSources } from '../support/photoSources';
import { fulfillEmptyPlanComments } from '../support/planComments';
import { fulfillNoWishSelectionRound } from '../support/productContext';
import { captureScreenshot } from '../support/storyTimelineFixture';

/*
 * #1790 F2: a wish's journey (wished, planned, experienced, remembered) is
 * derived from existing data and visible across Planen, the wish detail and
 * the plan detail, ending in the wish fulfilment moment.
 */

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const MARKET_WISH = '55555555-5555-4555-8555-555555555551';
const TRAIN_WISH = '55555555-5555-4555-8555-555555555552';
const CONCERT_WISH = '55555555-5555-4555-8555-555555555553';
const OPEN_WISH = '55555555-5555-4555-8555-555555555554';
const OPEN_WISH_PLAN = '44444444-4444-4444-8444-444444444444';
const PARTNER_ID = '11111111-1111-4111-8111-111111111112';
const PARTNER_PROPOSAL = '22222222-2222-4222-8222-222222222223';
const SOURCE_URL =
  'https://www.bvb.de/de/de/signal-iduna-park/stadiontouren.html';
const MARKET_PLAN = '44444444-4444-4444-8444-444444444441';
const TRAIN_PLAN = '44444444-4444-4444-8444-444444444442';
const CONCERT_PLAN = '44444444-4444-4444-8444-444444444443';
const NOW = new Date().toISOString();

function isoDay(offsetDays: number): string {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  const local = new Date(day.getTime() - day.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const MARKET_DAY = isoDay(8);
const TODAY = isoDay(0);
const capabilities = { canComment: true, canDelete: true, canEdit: true };
const creator = { id: ACCOUNT_ID, displayName: 'Anna' };

type JourneyState = {
  marketCompleted: boolean;
  reminderAt: string | null;
  unexpected: string[];
  dateProposalEnabled: boolean;
  proposal: {
    id: string;
    proposedBy: string;
    recipientId: string;
    plannedStart: string;
    counter: boolean;
  } | null;
  acceptedStart: string | null;
  proposalNotificationAt: string | null;
};

function planBody(
  id: string,
  title: string,
  sourceWishId: string | null,
  overrides: Record<string, unknown> = {},
) {
  return {
    capabilities,
    createdAt: NOW,
    createdBy: ACCOUNT_ID,
    creator,
    description: null,
    experiencedOn: null,
    id,
    placeId: null,
    plannedEnd: null,
    plannedOn: null,
    plannedStart: null,
    sourceWishId,
    spaceId: SPACE_ID,
    status: 'IDEA',
    title,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

function marketPlan(state: JourneyState) {
  return planBody(MARKET_PLAN, 'Flohmarkt am Samstag', MARKET_WISH, {
    description: 'Früh los, danach Kaffee.',
    status: state.marketCompleted ? 'COMPLETED' : 'PLANNED',
    plannedOn: MARKET_DAY,
    experiencedOn: state.marketCompleted ? TODAY : null,
    version: state.marketCompleted ? 2 : 1,
  });
}

function wishBody(
  id: string,
  title: string,
  status: 'OPEN' | 'PLANNED' | 'COMPLETED',
  plan: Record<string, unknown> | null,
  hasMemory = false,
) {
  return {
    capabilities: { ...capabilities, canComment: false },
    createdAt: NOW,
    createdBy: ACCOUNT_ID,
    creator,
    id,
    spaceId: SPACE_ID,
    status,
    title,
    updatedAt: NOW,
    version: status === 'OPEN' ? 1 : 2,
    tags: [],
    plan,
    hasMemory,
  };
}

function wishes(state: JourneyState) {
  return [
    state.dateProposalEnabled
      ? {
          ...wishBody(
            OPEN_WISH,
            'Stadionführung',
            state.acceptedStart ? 'PLANNED' : 'OPEN',
            state.acceptedStart
              ? {
                  id: OPEN_WISH_PLAN,
                  status: 'PLANNED',
                  plannedStart: state.acceptedStart,
                }
              : null,
          ),
          description: SOURCE_URL,
        }
      : wishBody(OPEN_WISH, 'Sterne gucken', 'OPEN', null),
    wishBody(
      MARKET_WISH,
      'Flohmarkt',
      state.marketCompleted ? 'COMPLETED' : 'PLANNED',
      {
        id: MARKET_PLAN,
        status: state.marketCompleted ? 'COMPLETED' : 'PLANNED',
        plannedOn: MARKET_DAY,
        plannedStart: null,
        experiencedOn: state.marketCompleted ? TODAY : null,
      },
    ),
    wishBody(TRAIN_WISH, 'Nachtzug-Abenteuer', 'PLANNED', {
      id: TRAIN_PLAN,
      status: 'IDEA',
      plannedOn: null,
      plannedStart: null,
      experiencedOn: null,
    }),
    wishBody(
      CONCERT_WISH,
      'Konzert in Wien',
      'COMPLETED',
      {
        id: CONCERT_PLAN,
        status: 'COMPLETED',
        plannedOn: null,
        plannedStart: null,
        experiencedOn: isoDay(-30),
      },
      true,
    ),
  ];
}

async function installMocks(
  page: Page,
  dateProposalEnabled = false,
): Promise<JourneyState> {
  const state: JourneyState = {
    marketCompleted: false,
    reminderAt: null,
    unexpected: [],
    dateProposalEnabled,
    proposal: null,
    acceptedStart: null,
    proposalNotificationAt: null,
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
          accessToken: 'wish-journey-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'wish-journey-refresh-token',
        },
      });
    if (method === 'POST' && pathname === '/api/v1/auth/refresh')
      return json({
        accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        accessToken: 'wish-journey-access-token-refreshed',
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        refreshToken: 'wish-journey-refresh-token-refreshed',
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
    if (dateProposalEnabled && state.proposalNotificationAt && state.proposal) {
      const notice = {
        id: PARTNER_PROPOSAL,
        sourceEventId: PARTNER_PROPOSAL,
        kind: 'WISH_DATE_COUNTERED',
        actorId: PARTNER_ID,
        actor: { id: PARTNER_ID, displayName: 'Lea' },
        targetId: OPEN_WISH,
        targetType: 'WISH',
        target: {
          targetId: OPEN_WISH,
          targetType: 'WISH',
          title: 'Stadionführung',
        },
        createdAt: state.proposalNotificationAt,
        readAt: null,
        appointmentStart: state.proposal.plannedStart,
      };
      if (method === 'GET' && pathname === `${space}/notifications`)
        return page_([notice]);
      if (
        method === 'POST' &&
        pathname === `${space}/notifications/${PARTNER_PROPOSAL}/open`
      )
        return json({ ...notice, readAt: NOW });
    }
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

    if (method === 'GET' && pathname === `${space}/plans`) {
      const scope = url.searchParams.get('overviewScope') ?? 'OPEN';
      const all = [
        marketPlan(state),
        planBody(TRAIN_PLAN, 'Nachtzug-Abenteuer', TRAIN_WISH),
      ];
      return page_(
        all.filter((plan) =>
          scope === 'COMPLETED'
            ? plan.status === 'COMPLETED'
            : plan.status !== 'COMPLETED',
        ),
      );
    }
    if (method === 'GET' && pathname === `${space}/wishes`) {
      const status = url.searchParams.get('status');
      return page_(
        wishes(state).filter((wish) => !status || wish.status === status),
      );
    }
    if (pathname === `${space}/wishes/${OPEN_WISH}/reminder`) {
      if (method === 'PUT') state.reminderAt = request.postDataJSON().dueAt;
      if (method === 'DELETE') {
        state.reminderAt = null;
        return route.fulfill({ status: 204 });
      }
      if (method === 'GET' || method === 'PUT')
        return json({ dueAt: state.reminderAt });
    }
    const dateProposal = `${space}/wishes/${OPEN_WISH}/date-proposal`;
    if (pathname === dateProposal) {
      if (method === 'POST' && dateProposalEnabled) {
        const data = request.postDataJSON();
        state.proposal = {
          id: data.clientRequestId,
          proposedBy: ACCOUNT_ID,
          recipientId: PARTNER_ID,
          plannedStart: data.plannedStart,
          counter: false,
        };
      }
      if (method === 'GET' || method === 'POST')
        return json({
          canPropose: dateProposalEnabled,
          proposal: state.proposal,
        });
    }
    if (
      method === 'POST' &&
      pathname === `${dateProposal}/${PARTNER_PROPOSAL}/accept` &&
      state.proposal?.id === PARTNER_PROPOSAL
    ) {
      state.acceptedStart = state.proposal.plannedStart;
      state.proposal = null;
      return json({ planId: OPEN_WISH_PLAN });
    }
    const wishMatch = pathname.match(/\/wishes\/([^/]+)$/);
    if (method === 'GET' && wishMatch) {
      const wish = wishes(state).find((item) => item.id === wishMatch[1]);
      if (wish) return json(wish, 200, { ETag: `"${wish.version}"` });
    }
    if (method === 'GET' && pathname === `${space}/plans/${MARKET_PLAN}`) {
      const plan = marketPlan(state);
      return json(plan, 200, { ETag: `"${plan.version}"` });
    }
    if (
      method === 'GET' &&
      pathname === `${space}/plans/${OPEN_WISH_PLAN}` &&
      state.acceptedStart
    ) {
      return json(
        planBody(OPEN_WISH_PLAN, 'Stadionführung', OPEN_WISH, {
          description: SOURCE_URL,
          status: 'PLANNED',
          plannedStart: state.acceptedStart,
        }),
      );
    }
    if (dateProposalEnabled && pathname === `${space}/link-previews`)
      return json({ items: [] });
    if (
      method === 'POST' &&
      pathname === `${space}/plans/${MARKET_PLAN}/complete`
    ) {
      state.marketCompleted = true;
      return json(marketPlan(state), 200, {
        'X-Eimir-Shared-Achievement': 'plan-completed',
      });
    }
    // Completed Plans show their linked story; none exists in this journey.
    if (
      method === 'GET' &&
      /\/plans\/[^/]+\/(memories|heart-moments|milestones|chapters)$/.test(
        pathname,
      )
    )
      return page_([]);

    if (await fulfillNoOccasionSources(route)) return;
    if (await fulfillNoWishSelectionRound(route)) return;
    state.unexpected.push(`${method} ${pathname}`);
    return json(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Wish journey test does not define ${method} ${pathname}.`,
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

function journeyPath(page: Page) {
  return page.getByRole('list', { name: wishJourney.pathLabel });
}

async function expectCurrentStep(page: Page, label: string) {
  await expect(journeyPath(page).locator('[aria-current="step"]')).toHaveText(
    label,
  );
}

async function completeMarketPlan(page: Page): Promise<void> {
  // The market is still ahead, so the completion waits in the plan menu.
  await expect(page.locator('.planen-complete-cta')).toHaveCount(0);
  await page.getByRole('button', { name: m5s3.plan.menu }).click();
  await page
    .locator('.item-menu')
    .getByRole('button', { name: m5s3.plan.complete })
    .click();
  await page.getByLabel(m5s3.plan.experiencedOn).fill(TODAY);
  await page
    .locator('.planen-completion-sheet')
    .getByRole('button', { name: m5s3.plan.complete })
    .click();
  await expect(
    page.getByRole('heading', { name: wishJourney.fulfilledTitle }),
  ).toBeFocused();
}

test.describe('wish journey (#1790 F2)', () => {
  for (const { width, theme } of [
    { width: 360, theme: 'light' },
    { width: 430, theme: 'dark' },
    { width: 1280, theme: 'light' },
  ] as const) {
    test(`personal reminder returns to its Wish at ${width}px ${theme}`, async ({
      page,
    }, info) => {
      const copy = m5s3.wish.reminder;
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(
        (choice) => localStorage.setItem('eimir.theme', choice),
        theme,
      );
      const state = await installMocks(page);
      await signIn(page);
      await page.goto(`/plan/wishes/${OPEN_WISH}`);
      // The reminder is offered by the wish's actions menu, not on the page.
      const menu = itemMenuTrigger(page);
      const sheet = page.getByRole('dialog', { name: copy.action });
      await chooseItemMenuRow(page, copy.action);
      await expect(sheet.getByText(copy.privacy)).toBeVisible();
      await sheet.getByRole('button', { name: copy.nextWeek }).click();
      const date = sheet.getByLabel(copy.when);
      await expect(date).toHaveValue(`${isoDay(7)}T09:00`);
      await captureScreenshot(
        page,
        info,
        `wish-reminder-${width}-${theme}.png`,
      );
      await assertNoWcagViolations(page);
      await sheet.getByRole('button', { name: copy.save }).click();
      await expect(sheet).not.toBeVisible();
      await expect(menu).toBeFocused();
      expect(state.reminderAt).toEqual(
        new Date(`${isoDay(7)}T09:00`).toISOString(),
      );
      await page.reload();
      // With a saved reminder the menu row offers to change it.
      await chooseItemMenuRow(page, copy.edit);
      await expect(date).toHaveValue(`${isoDay(7)}T09:00`);
      await sheet.getByRole('button', { name: copy.remove }).click();
      await expect(menu).toBeFocused();
      expect(state.reminderAt).toBeNull();
      expect(state.unexpected).toEqual([]);
    });
  }

  test('sends a date, receives a counterproposal and opens the confirmed Plan', async ({
    page,
  }, info) => {
    const copy = wishDateProposal;
    const wishPath = `/plan/wishes/${OPEN_WISH}`;
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await installMocks(page, true);
    await signIn(page);
    await page.goto(wishPath);
    await expectCurrentStep(page, wishJourney.stages.wished);
    await expect(page.locator(`a[href="${SOURCE_URL}"]`)).toBeVisible();
    await page.getByRole('button', { name: copy.action }).click();
    const sheet = page.getByRole('dialog', { name: copy.action });
    const start = `${isoDay(8)}T14:00`;
    await sheet.getByLabel(copy.when).fill(start);
    const documentLeaveBlocked = () =>
      page.evaluate(
        () =>
          !window.dispatchEvent(
            new Event('beforeunload', { cancelable: true }),
          ),
      );
    await expect.poll(documentLeaveBlocked).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).not.toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect.poll(documentLeaveBlocked).toBe(false);
    expect(state.proposal).toBeNull();
    await page.getByRole('button', { name: copy.action }).click();
    await expect(sheet.getByLabel(copy.when)).toHaveValue(start);
    await sheet.getByRole('button', { name: copy.send, exact: true }).click();
    await expect(page.getByText(copy.waitingForReply)).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: copy.accept, exact: true }),
    ).toHaveCount(0);
    expect(state.proposal?.plannedStart).toBe(new Date(start).toISOString());
    expect(state.acceptedStart).toBeNull();

    await page.getByRole('link', { name: 'Planen', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Planen', exact: true }),
    ).toBeVisible();
    const counter = new Date(`${isoDay(8)}T15:30`).toISOString();
    state.proposal = {
      id: PARTNER_PROPOSAL,
      proposedBy: PARTNER_ID,
      recipientId: ACCOUNT_ID,
      plannedStart: counter,
      counter: true,
    };
    state.proposalNotificationAt = new Date().toISOString();
    await page.bringToFront();
    await page.evaluate(
      ({ type, scope }) => {
        window.dispatchEvent(new CustomEvent(type, { detail: scope }));
      },
      {
        type: NOTIFICATION_WAKE_EVENT,
        scope: {
          accountId: ACCOUNT_ID,
          apiBaseUrl: new URL(page.url()).origin,
          spaceId: SPACE_ID,
        },
      },
    );
    const receipt = page.getByTestId('partner-gesture-receipt');
    await expect(receipt).toHaveAttribute('data-variant', 'calm-ring');
    await expect(receipt.locator('[data-glyph="icon"]')).toBeVisible();
    await receipt.hover();
    await captureScreenshot(page, info, 'wish-date-in-app-receipt-390.png');
    await receipt.getByRole('button', { name: copy.review }).click();
    await expect(page).toHaveURL(new RegExp(`${wishPath}#terminvorschlag$`));
    const active = page.locator('#terminvorschlag');
    await expect(
      active.getByRole('button', { name: copy.counter }),
    ).toBeVisible();
    await expect(active).toBeInViewport();
    await assertNoHorizontalOverflow(page);
    await captureScreenshot(page, info, 'wish-date-counterproposal-390.png');
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await assertNoHorizontalOverflow(page);
    await captureScreenshot(
      page,
      info,
      'wish-date-counterproposal-expanded.png',
    );
    await active
      .getByRole('button', { name: copy.accept, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/plan/plans/${OPEN_WISH_PLAN}$`));
    await expect(page.getByText(wishJourney.fromWish)).toBeVisible();
    await expect(page.locator(`a[href="${SOURCE_URL}"]`)).toBeVisible();
    expect(state.acceptedStart).toBe(counter);
    await page.goto(wishPath);
    await expectCurrentStep(page, wishJourney.stages.planned);
    await expect(
      page.getByRole('link', { name: new RegExp(`^${wishJourney.openPlan}`) }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: copy.action })).toHaveCount(
      0,
    );
    expect(state.unexpected).toEqual([]);
  });

  test('follows a wish from planned to fulfilled and back to Planen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await installMocks(page);
    await signIn(page);
    await page.goto('/plan');

    // Plans from a wish carry their origin, and one quiet hint leads on.
    const next = page.locator('.planen-next-link');
    await expect(next).toContainText(wishJourney.planOrigin);
    await expect(page.locator('.planen-undated-link')).toContainText(
      wishJourney.planOrigin,
    );
    const hint = page.locator('.planen-wish-journey-hint');
    await expect(hint).toHaveText(
      wishJourney.hintUnderway_other.replace('{{count}}', '2'),
    );
    await hint.click();

    // Wishes: planned wishes stay visible, in date order, linking to plans.
    await expect(
      page.getByRole('tab', { name: m5s3.overview.segmentWishes }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('button', { name: wishJourney.scopePlanned }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/#planned-wishes$/);
    const cards = page.locator('.planen-wish-journey-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('Flohmarkt');
    await expect(cards.nth(1)).toContainText(wishJourney.plannedUndated);
    await assertNoHorizontalOverflow(page);

    // Wish detail: the quiet path instead of a status word, then the plan.
    await cards
      .nth(0)
      .getByRole('link', { name: 'Flohmarkt', exact: true })
      .click();
    await expectCurrentStep(page, wishJourney.stages.planned);
    await expect(page.getByText(m5s3.wish.status.PLANNED)).toHaveCount(0);
    await page
      .getByRole('link', { name: new RegExp(`^${wishJourney.openPlan}`) })
      .click();

    // Plan detail: origin above the title, then the fulfilment moment.
    const origin = page.getByRole('link', { name: wishJourney.fromWish });
    await expect(origin).toBeVisible();
    await expect(origin).toHaveAttribute('href', `/plan/wishes/${MARKET_WISH}`);
    await completeMarketPlan(page);
    await expect(
      page.getByText(
        wishJourney.fulfilledBody.replace('{{title}}', 'Flohmarkt am Samstag'),
      ),
    ).toBeVisible();
    await expectCurrentStep(page, wishJourney.stages.experienced);
    await expect(
      page.getByRole('button', { name: m5s3.planStory.memoryAction }),
    ).toBeVisible();
    await page.getByRole('button', { name: m5s3.planStory.later }).click();

    // Return: the wish now waits for a memory among the fulfilled ones.
    await page.goto('/plan#fulfilled-wishes');
    const fulfilled = page.locator('.planen-wish-journey-card');
    await expect(fulfilled).toHaveCount(2);
    await expect(
      fulfilled.filter({ hasText: 'Konzert in Wien' }),
    ).toContainText(wishJourney.remembered);
    await expect(fulfilled.filter({ hasText: 'Flohmarkt' })).toContainText(
      wishJourney.captureMoment,
    );
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
    test(`journey surfaces stay accessible at ${scenario.name}`, async ({
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
        await captureScreenshot(
          page,
          testInfo,
          `wish-journey-${surface}-${scenario.name}.png`,
        );
      };

      await page.goto('/plan');
      await scale();
      await expect(page.locator('.planen-wish-journey-hint')).toBeVisible();
      await shoot('plans');

      await page.goto('/plan#planned-wishes');
      await scale();
      await expect(page.locator('.planen-wish-journey-card')).toHaveCount(2);
      await shoot('planned');

      await page.goto('/plan#fulfilled-wishes');
      await scale();
      await expect(page.locator('.planen-wish-journey-card')).toHaveCount(1);
      await shoot('fulfilled');

      await page.goto(`/plan/wishes/${MARKET_WISH}`);
      await scale();
      await expectCurrentStep(page, wishJourney.stages.planned);
      await shoot('wish');

      await page.goto(`/plan/plans/${MARKET_PLAN}`);
      await scale();
      await completeMarketPlan(page);
      const arriving = page.locator(
        '.plan-wish-fulfilled .wish-journey-step.is-current .wish-journey-dot',
      );
      const animation = await arriving.evaluate(
        (node) => getComputedStyle(node).animationName,
      );
      // The catalogue keyframes of the motion layer (#2077).
      expect(animation).toBe(
        scenario.reducedMotion
          ? 'eimir-motion-enter-fade'
          : 'eimir-motion-enter-grow',
      );
      await page.locator('.plan-wish-fulfilled').evaluate(async (node) => {
        await Promise.all(
          node
            .getAnimations({ subtree: true })
            .map((running) => running.finished),
        );
      });
      await page.locator('.plan-wish-fulfilled').scrollIntoViewIfNeeded();
      await shoot('fulfilment');
      expect(state.unexpected).toEqual([]);
    });
  }
});
