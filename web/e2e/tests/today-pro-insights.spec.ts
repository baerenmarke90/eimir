import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import dailyInsights from '../../src/i18n/locales/dailyInsights';
import de from '../../src/i18n/locales/de';
import navigation from '../../src/i18n/locales/navigation';
import weeklyInsights from '../../src/i18n/locales/weeklyInsights';
import { fulfillDefaultAppIcon } from '../support/appIcon';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';
/** The authoritative Space day used by every mocked insights read (a Wednesday). */
const SPACE_TODAY = '2026-09-23';

const VIBES = [
  'GOOD',
  'GOOD',
  'OKAY',
  'NEEDS_CONNECTION',
  'STRESSED',
  'NEEDS_SPACE',
  'SAD',
] as const;

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Deterministic history so screenshots and assertions are stable. */
function historyDay(date: string, index: number) {
  const seed = (index * 37 + 11) % 100;
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const base = weekday >= 5 ? 70 : weekday === 0 ? 40 : 55;
  const energy = (offset: number) =>
    Math.max(
      10,
      Math.min(100, Math.round((base + ((seed + offset) % 41) - 20) / 10) * 10),
    );
  const vibe = (offset: number) => VIBES[(seed + offset) % VIBES.length];
  const partnerMissing = seed % 9 === 0;
  return {
    checkedOn: date,
    ownVibe: vibe(0),
    ownEnergy: energy(0),
    partnerVibe: partnerMissing
      ? { state: 'NO_CHECK_IN' }
      : { state: 'VISIBLE', value: vibe(3) },
    partnerEnergy: partnerMissing
      ? { state: 'NO_CHECK_IN' }
      : { state: 'VISIBLE', value: energy(7) },
  };
}

async function installMocks(
  page: Page,
  options: {
    capabilities?: string[];
    general?: boolean;
    failedFeedback?: boolean;
  } = {},
) {
  const capabilities = options.capabilities ?? ['daily.insights'];
  const requests = {
    insights: 0,
    entitlements: 0,
    weeklyReads: 0,
    inference: 0,
    revision: 'a'.repeat(64),
    denied: false,
    feedback: [] as { recommendationKey: string; rating: string }[],
  };

  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const json = async (
      body: unknown,
      status = 200,
      headers: Record<string, string> = {},
    ) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
      });
    const space = `/api/v1/spaces/${SPACE_ID}`;
    if (pathname === `${space}/daily-check-in/weekly-review`) {
      if (requests.denied) {
        await json(
          {
            code: 'PREMIUM_ENTITLEMENT_REQUIRED',
            status: 403,
            title: 'Pro required',
          },
          403,
        );
        return;
      }
      if (method === 'POST') requests.inference += 1;
      else requests.weeklyReads += 1;
      await json({
        evidenceToken: requests.revision,
        weekStart: '2026-09-21',
        weekEnd: '2026-09-27',
        historyStart: '2026-08-03',
        historyEnd: SPACE_TODAY,
        general: options.general ?? false,
        generatedBy: options.general ? 'RULES' : 'AI',
        feedback: requests.feedback,
        observations: options.general
          ? []
          : [
              {
                key: 'weekend_higher',
                kind: 'WEEKEND_HIGHER',
                sampleCount: 42,
              },
            ],
        recommendations: ['quiet_time', 'small_plan'],
      });
      return;
    }
    if (
      pathname.startsWith(`${space}/daily-check-in/weekly-feedback/`) &&
      method === 'PUT'
    ) {
      if (options.failedFeedback) {
        await json(
          { code: 'UNAVAILABLE', status: 503, title: 'Unavailable' },
          503,
        );
        return;
      }
      const recommendationKey = pathname.split('/').at(-1) as string;
      const rating = request.postDataJSON().rating as string | null;
      requests.feedback = requests.feedback.filter(
        (entry) => entry.recommendationKey !== recommendationKey,
      );
      if (rating) requests.feedback.push({ recommendationKey, rating });
      await json({ recommendationKey, rating });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await json({
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
      await json({
        account: { displayName: 'Anna Berger', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'insights-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'insights-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await json({ serverAdmin: false });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await json([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
      return;
    }
    if (method === 'GET' && pathname === space) {
      await json({
        id: SPACE_ID,
        createdAt: '2026-01-01T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Anna Berger' },
          { id: PARTNER_ID, displayName: 'Ben Winter' },
        ],
      });
      return;
    }
    if (method === 'GET' && pathname === `${space}/configuration`) {
      await json(
        {
          canManageSpaceConfiguration: true,
          dailyContextTimezone: 'Europe/Berlin',
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: true,
          energyVisibilityMode: 'MUTUAL_REVEAL',
          loveNotesEnabled: false,
          sharedAchievementsEnabled: false,
          spaceId: SPACE_ID,
          supportGesturesEnabled: true,
          version: 7,
          vibeCheckEnabled: true,
          vibeVisibilityMode: 'MUTUAL_REVEAL',
        },
        200,
        { ETag: '"7"' },
      );
      return;
    }
    if (
      method === 'GET' &&
      (pathname === `${space}/profiles/${ACCOUNT_ID}` ||
        pathname === `${space}/profiles/${PARTNER_ID}`)
    ) {
      const partner = pathname.endsWith(PARTNER_ID);
      await json({
        accountId: partner ? PARTNER_ID : ACCOUNT_ID,
        createdAt: '2026-01-01T00:00:00Z',
        displayName: partner ? 'Ben' : 'Anna',
        id: partner
          ? '00000000-0000-0000-0000-000000000022'
          : '00000000-0000-0000-0000-000000000020',
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1,
      });
      return;
    }
    if (method === 'GET' && pathname === `${space}/dashboard/preferences`) {
      await json({ items: [] });
      return;
    }
    if (method === 'GET' && pathname === `${space}/dashboard`) {
      await json({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Ben Winter' },
        },
        relationshipDuration: { daysTogether: 250, startedOn: '2026-01-01' },
        retrospective: null,
        recentShared: [],
        upcoming: [
          {
            id: '00000000-0000-0000-0000-000000000040',
            type: 'PLAN',
            titleOrText: 'Gemeinsamer Abend',
            scheduledAt: '2026-09-22T18:00:00Z',
          },
        ],
        thinkingOfYouAvailableAt: null,
      });
      return;
    }
    if (method === 'GET' && pathname === `${space}/activity`) {
      await json({ hasMore: false, items: [], nextCursor: null });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `${space}/notifications/unread-count`
    ) {
      await json({ unreadCount: 0 });
      return;
    }
    if (
      (method === 'GET' || method === 'POST') &&
      pathname === `${space}/presence`
    ) {
      await json({ state: 'ACTIVE' });
      return;
    }
    if (method === 'GET' && pathname === `${space}/daily-check-in/today`) {
      await json(
        {
          checkedOn: SPACE_TODAY,
          dailyContextTimezone: 'Europe/Berlin',
          own: { energyLevel: 60, vibe: 'OKAY', version: 1 },
          energy: {
            visibilityMode: 'MUTUAL_REVEAL',
            partner: { state: 'VISIBLE', value: 80 },
          },
          vibe: {
            visibilityMode: 'MUTUAL_REVEAL',
            partner: { state: 'VISIBLE', value: 'GOOD' },
          },
        },
        200,
        { ETag: '"today:1"', 'Cache-Control': 'private, no-store' },
      );
      return;
    }
    if (method === 'GET' && pathname === `${space}/entitlements`) {
      requests.entitlements += 1;
      await json({
        spaceId: SPACE_ID,
        status: capabilities.length > 0 ? 'ACTIVE' : 'FREE',
        tier: capabilities.length > 0 ? 'PREMIUM' : 'FREE',
        capabilities,
        isInGracePeriod: false,
      });
      return;
    }
    if (method === 'GET' && pathname === `${space}/daily-check-in/insights`) {
      requests.insights += 1;
      const start =
        url.searchParams.get('start_date') ?? addDays(SPACE_TODAY, -6);
      const end = url.searchParams.get('end_date') ?? SPACE_TODAY;
      const days = [];
      for (let date = start; date <= end; date = addDays(date, 1)) {
        // Days after the Space's today are not part of the history yet.
        days.push(
          date > SPACE_TODAY
            ? { checkedOn: date }
            : historyDay(date, Math.abs(Date.parse(date) / 86_400_000)),
        );
      }
      await json({
        startDate: start,
        endDate: end,
        dailyContextTimezone: 'Europe/Berlin',
        vibeEnabled: true,
        energyEnabled: true,
        days,
        summary: {
          totalDays: days.length,
          daysWithOwnCheckIn: 0,
          daysWithPartnerCheckIn: 0,
          daysWithMutualCheckIn: 0,
        },
      });
      return;
    }

    await json(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Unexpected ${method} ${pathname}`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return requests;
}

async function signIn(page: Page) {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

/**
 * The insights surfaces and More destination rows must stay within the viewport
 * without introducing document-level horizontal scrolling.
 */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const overflowing = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.daily-insights *, .more-destination *',
      ),
    )
      .filter((element) => !(element instanceof SVGElement))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: String(element.className),
          left: rect.left,
          right: rect.right,
          width: rect.width,
        };
      })
      .filter(
        (box) =>
          box.width > 0 && (box.left < -1 || box.right > root.clientWidth + 1),
      )
      .slice(0, 8);
    return {
      overflowing,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });
  expect(
    result.overflowing,
    `Elements outside viewport: ${JSON.stringify(result.overflowing, null, 2)}`,
  ).toEqual([]);
  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
}

async function openInsightsFromMore(
  page: Page,
  testInfo?: import('@playwright/test').TestInfo,
  label?: string,
) {
  await page.getByRole('link', { name: navigation.more, exact: true }).click();
  await expect(page).toHaveURL(/\/more$/);
  await expect(
    page.getByRole('heading', { level: 1, name: de.more.title }),
  ).toBeVisible();

  const entry = page.getByRole('link', {
    name: `${dailyInsights.week.title} ${dailyInsights.pro}`,
  });
  await expect(entry).toBeVisible();
  await expect(
    page.getByText(dailyInsights.week.subtitle, { exact: true }),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  if (testInfo && label) {
    await page.screenshot({
      path: testInfo.outputPath(`more-insights-entry-${label}.png`),
      fullPage: true,
    });
  }

  await entry.click();
  await expect(page).toHaveURL(/\/more\/insights$/);
  await expect(
    page.getByRole('heading', { level: 1, name: dailyInsights.week.title }),
  ).toBeVisible();
}

/** Loads the previous week so charts, statements and highlights have data. */
async function goToPreviousWeek(page: Page) {
  await page.getByRole('button', { name: dailyInsights.week.previous }).click();
  await expect(
    page.getByRole('heading', { name: dailyInsights.week.vibeTitle }),
  ).toBeVisible();
}

async function visitViews(
  page: Page,
  testInfo: import('@playwright/test').TestInfo,
  label: string,
) {
  await openInsightsFromMore(page, testInfo, label);
  await goToPreviousWeek(page);
  await expectNoHorizontalOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath(`insights-week-${label}.png`),
    fullPage: true,
  });

  await page.getByRole('link', { name: dailyInsights.nav.patterns }).click();
  await expect(
    page.getByRole('heading', { name: dailyInsights.patterns.glanceTitle }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath(`insights-patterns-${label}.png`),
    fullPage: true,
  });

  await page.getByRole('link', { name: dailyInsights.nav.recap }).click();
  await expect(
    page.getByText(dailyInsights.recap.heroLabel, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: dailyInsights.week.previous }).click();
  await expect(
    page.getByRole('heading', { name: dailyInsights.recap.noticedTitle }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath(`insights-recap-${label}.png`),
    fullPage: true,
  });
}

test('Pro insights are absent from Today and open from More on Compact', async ({
  page,
}, testInfo) => {
  await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  await signIn(page);

  // The free daily ritual stays on Today, but weekly insights do not.
  await expect(page.getByTestId('daily-vibe-checkin')).toBeVisible();
  await expect(
    page.getByRole('link', { name: dailyInsights.week.title }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('today-without-weekly-insights-390-light.png'),
    fullPage: true,
  });

  await visitViews(page, testInfo, '390-light');
});

test('Pro insights reflow from More at 320px with large text, Dark and Reduced Motion', async ({
  page,
}, testInfo) => {
  await installMocks(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await signIn(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(
    page.getByRole('link', { name: dailyInsights.week.title }),
  ).toHaveCount(0);
  await visitViews(page, testInfo, '320-dark-200pct');
});

test('Pro insights adapt to Expanded Web from More', async ({
  page,
}, testInfo) => {
  await installMocks(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  await signIn(page);
  await visitViews(page, testInfo, '1280-light');
});

test('Free Spaces see a calm gated state and never request insights', async ({
  page,
}, testInfo) => {
  const requests = await installMocks(page, { capabilities: [] });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await openInsightsFromMore(page, testInfo, '390-free');
  await expect(
    page.getByRole('heading', { name: dailyInsights.gate.title }),
  ).toBeVisible();
  await expect(page.getByText(dailyInsights.gate.freeNote)).toBeVisible();
  expect(requests.insights).toBe(0);
  await expectNoHorizontalOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('insights-gated-390-light.png'),
    fullPage: true,
  });
});

for (const state of [
  { width: 360, theme: 'light', large: false },
  { width: 390, theme: 'dark', large: false },
  { width: 430, theme: 'light', large: false },
  { width: 1280, theme: 'dark', large: false },
  { width: 320, theme: 'dark', large: true },
] as const) {
  test(`Weekly AI insight selection and private feedback at ${state.width} ${state.theme}`, async ({
    page,
  }, testInfo) => {
    const requests = await installMocks(page);
    await page.setViewportSize({ width: state.width, height: 844 });
    await page.emulateMedia({
      colorScheme: state.theme,
      reducedMotion: 'reduce',
    });
    await signIn(page);
    await openInsightsFromMore(page);
    if (state.large)
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
    expect(requests.inference).toBe(0);
    expect(requests.weeklyReads).toBe(0);
    await page.getByRole('button', { name: weeklyInsights.generate }).click();
    await expect(
      page.getByText(weeklyInsights.ai, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(weeklyInsights.facts.WEEKEND_HIGHER, { exact: true }),
    ).toBeVisible();
    const feedback = page.getByRole('group', {
      name: weeklyInsights.feedbackFor.replace(
        '{{title}}',
        weeklyInsights.recommendations.quiet_time.title,
      ),
    });
    await feedback
      .getByRole('button', { name: weeklyInsights.ratings.HELPFUL })
      .click();
    await expect(
      feedback.getByRole('button', { name: weeklyInsights.ratings.HELPFUL }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(requests.inference).toBe(1);
    await expect(
      page.getByRole('link', { name: dailyInsights.week.closingCta }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(
      (await new AxeBuilder({ page }).include('.weekly-review').analyze())
        .violations,
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(
        `weekly-ai-${state.width}-${state.theme}${state.large ? '-200pct' : ''}.png`,
      ),
      fullPage: true,
    });
    await page
      .getByRole('link', { name: dailyInsights.nav.patterns, exact: true })
      .click();
    await expect(page.locator('.weekly-review')).toHaveCount(0);
    await page
      .getByRole('link', { name: dailyInsights.nav.week, exact: true })
      .click();
    await expect(
      page.getByText(weeklyInsights.ai, { exact: true }),
    ).toHaveCount(0);
    expect(requests.inference).toBe(1);
  });
}

test('Weekly AI general fallback preserves failed feedback and requires explicit retry', async ({
  page,
}, testInfo) => {
  const requests = await installMocks(page, {
    general: true,
    failedFeedback: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await openInsightsFromMore(page);
  await page.getByRole('button', { name: weeklyInsights.generate }).click();
  await expect(
    page.getByText(weeklyInsights.general, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(weeklyInsights.sparse, { exact: true }),
  ).toBeVisible();
  const button = page
    .getByRole('button', { name: weeklyInsights.ratings.HELPFUL })
    .first();
  await button.click();
  await expect(page.getByRole('alert')).toContainText(weeklyInsights.error);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(requests.feedback).toEqual([]);
  expect(requests.inference).toBe(1);
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('weekly-ai-sparse-error-390.png'),
    fullPage: true,
  });
});

test('Weekly AI hides stale evidence and revoked access without automatic inference', async ({
  page,
}) => {
  const requests = await installMocks(page);
  await page.clock.install();
  await signIn(page);
  await openInsightsFromMore(page);
  await page.getByRole('button', { name: weeklyInsights.generate }).click();
  await expect(
    page.getByText(weeklyInsights.ai, { exact: true }),
  ).toBeVisible();
  requests.revision = 'b'.repeat(64);
  await page.clock.fastForward(31_000);
  await expect(page.getByText(weeklyInsights.ai, { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText(weeklyInsights.changed, { exact: true }),
  ).toBeVisible();
  expect(requests.inference).toBe(1);
  requests.denied = true;
  await page.clock.fastForward(31_000);
  await expect(
    page.getByText(weeklyInsights.error, { exact: true }),
  ).toBeVisible();
  expect(requests.inference).toBe(1);
});
