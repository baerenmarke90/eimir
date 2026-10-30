import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import copy from '../../src/i18n/locales/wishSelection';
import { wishSelectionDemo as demo } from '../fixtures/locales/wishSelection';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks as installBase,
  ME,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const ROOT = `/api/v1/spaces/${SPACE_ID}`;
const WISH_IDS = ['wish-pasta', 'wish-lake', 'wish-spa'];
const ROUND_ID = 'round-choice';
type Own = { favoriteWishIds: string[]; published: boolean; version: number };
type Round = {
  id: string | null;
  version: number;
  roundToken: string;
  title: string | null;
  candidates: Candidate[];
  own: Own;
  selectionToken: string | null;
  resultState: string;
  commonWishIds: string[];
};
type Candidate = {
  wishId: string;
  title: string;
  status: string;
  version: number;
  planId: string | null;
};

function emptyRound(): Round {
  return {
    id: null,
    version: 0,
    roundToken: 'absent',
    title: null,
    candidates: [],
    own: { favoriteWishIds: [], published: false, version: 0 },
    selectionToken: null,
    resultState: 'NO_ROUND',
    commonWishIds: [],
  };
}
function readyRound(common = true): Round {
  return {
    id: ROUND_ID,
    version: 1,
    roundToken: `${ROUND_ID}:1`,
    title: demo.occasion,
    candidates: WISH_IDS.map((wishId, index) => ({
      wishId,
      title: demo.wishes[index],
      version: 1,
      status: 'OPEN',
      planId: null,
    })),
    own: { favoriteWishIds: WISH_IDS.slice(0, 2), published: true, version: 1 },
    selectionToken: `${ROUND_ID}:1:1`,
    resultState: 'READY',
    commonWishIds: common ? [WISH_IDS[0]] : [],
  };
}

async function install(page: Page, initial = emptyRound()) {
  const unexpected = await installBase(page, { strict: true });
  let round = structuredClone(initial);
  let failShare = false;
  let selectedPlan: Record<string, unknown> | null = null;
  const requests: {
    kind: string;
    body: Record<string, unknown>;
    ifMatch: string | undefined;
  }[] = [];
  function wish(index: number) {
    return {
      id: WISH_IDS[index],
      spaceId: SPACE_ID,
      title: demo.wishes[index],
      createdBy: ACCOUNT_ID,
      creator: ME,
      status: selectedPlan && index === 0 ? 'PLANNED' : 'OPEN',
      version: 1,
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
      capabilities: CAPABILITIES,
    };
  }
  function plan(id: string, title: string, date: string | null) {
    return {
      id,
      spaceId: SPACE_ID,
      title,
      description: null,
      sourceWishId: null,
      placeId: null,
      createdBy: ACCOUNT_ID,
      creator: ME,
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
      version: 1,
      plannedOn: date,
      plannedStart: null,
      plannedEnd: null,
      experiencedOn: null,
      status: date ? 'PLANNED' : 'IDEA',
      attachments: [],
      coverAttachment: null,
      anticipationEnabled: false,
      capabilities: CAPABILITIES,
    };
  }
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      method = request.method(),
      path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (path === `${ROOT}/wish-selection`) {
      if (method === 'GET') {
        await json(round);
        return;
      }
      const body = method === 'DELETE' ? {} : request.postDataJSON();
      requests.push({
        kind: method === 'DELETE' ? 'close' : 'round',
        body,
        ifMatch: request.headers()['if-match'],
      });
      if (method === 'DELETE') {
        round = emptyRound();
        await route.fulfill({ status: 204 });
        return;
      }
      round = {
        ...readyRound(),
        version: round.version + 1,
        title: body.title ?? null,
        candidates: (body.wishIds as string[]).map((id) => ({
          wishId: id,
          title: demo.wishes[WISH_IDS.indexOf(id)],
          version: 1,
          status: 'OPEN',
          planId: null,
        })),
        own: { favoriteWishIds: [], published: false, version: 0 },
        commonWishIds: [],
        resultState: 'CHOOSING',
      };
      round.roundToken = `${ROUND_ID}:${round.version}`;
      round.selectionToken = `${ROUND_ID}:${round.version}:0`;
      await json(round);
      return;
    }
    if (path === `${ROOT}/wish-selection/own` && method === 'PUT') {
      const body = request.postDataJSON();
      requests.push({
        kind: 'own',
        body,
        ifMatch: request.headers()['if-match'],
      });
      if (failShare) {
        failShare = false;
        await json(
          {
            type: 'server_error',
            title: 'Temporary failure',
            detail: 'Try again.',
            status: 503,
            code: 'TEST_FAILURE',
          },
          503,
        );
        return;
      }
      round.own = { ...body, version: round.own.version + 1 };
      round.selectionToken = `${ROUND_ID}:${round.version}:${round.own.version}`;
      round.resultState = body.published ? 'WAITING' : 'CHOOSING';
      round.commonWishIds = [];
      await json(round);
      return;
    }
    if (path === `${ROOT}/wishes` && method === 'GET') {
      await json({
        items: WISH_IDS.map((_, index) => wish(index)).filter(
          (item) => item.status === 'OPEN',
        ),
        hasMore: false,
        nextCursor: null,
      });
      return;
    }
    if (path === `${ROOT}/plans` && method === 'GET') {
      await json({
        items: [
          plan('next-plan', demo.nextPlan, '2026-11-01'),
          plan('undated-plan', demo.undatedPlan, null),
          ...(selectedPlan ? [selectedPlan] : []),
        ].filter((item) => {
          const status = new URL(request.url()).searchParams.get('status');
          return !status || item.status === status;
        }),
        hasMore: false,
        nextCursor: null,
      });
      return;
    }
    if (path === `${ROOT}/wishes/${WISH_IDS[0]}/plan` && method === 'POST') {
      const body = request.postDataJSON();
      requests.push({
        kind: 'plan',
        body,
        ifMatch: request.headers()['if-match'],
      });
      selectedPlan = {
        ...plan(
          'saved-choice-plan',
          body.title ?? demo.wishes[0],
          body.schedule?.plannedOn ?? null,
        ),
        sourceWishId: WISH_IDS[0],
        description: body.description ?? null,
        plannedStart: body.schedule?.plannedStart ?? null,
        plannedEnd: body.schedule?.plannedEnd ?? null,
      };
      round.candidates[0] = {
        ...round.candidates[0],
        planId: 'saved-choice-plan',
        status: 'PLANNED',
        version: 2,
      };
      round.commonWishIds = [];
      await json({ wish: { ...wish(0), version: 2 }, plan: selectedPlan }, 201);
      return;
    }
    if (path === `${ROOT}/plans/saved-choice-plan` && method === 'GET') {
      await json(selectedPlan);
      return;
    }
    if (path === `${ROOT}/places` && method === 'GET') {
      await json({ items: [], hasMore: false, nextCursor: null });
      return;
    }
    if (
      path === `${ROOT}/plans/saved-choice-plan/chapters` &&
      method === 'GET'
    ) {
      await json({ items: [], hasMore: false, nextCursor: null });
      return;
    }
    await route.fallback();
  });
  return {
    unexpected,
    requests,
    publishPartner() {
      round.resultState = 'READY';
      round.commonWishIds = [WISH_IDS[0]];
    },
    failNextShare() {
      failShare = true;
    },
  };
}

async function enter(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-30T10:00:00Z'));
  await signIn(page);
  await page.goto('/plan');
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await captureScreenshot(page, info, `wish-selection-${name}.png`, {
    fullPage: true,
  });
}

test('mobile round -> private selection -> shared favorite -> canonical dated Plan -> return', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await install(page);
  await enter(page);
  await expect(page.getByText(demo.nextPlan, { exact: true })).toBeVisible();
  await expect(page.getByText(demo.undatedPlan, { exact: true })).toBeVisible();
  await capture(page, info, 'hub-390-light');
  await page.getByRole('link', { name: copy.entryAction, exact: true }).click();
  await expect(page.locator('.product-shell')).toHaveAttribute(
    'data-focused-task',
    'true',
  );
  await page.getByRole('checkbox', { name: demo.wishes[0] }).check();
  await page.getByRole('checkbox', { name: demo.wishes[1] }).check();
  await page.getByLabel(copy.occasion, { exact: true }).fill(demo.occasion);
  await capture(page, info, 'setup-390-light');
  await page.getByRole('button', { name: copy.start, exact: true }).click();
  await page.getByRole('checkbox', { name: demo.wishes[0] }).check();
  expect(fixture.requests.filter((item) => item.kind === 'own')).toHaveLength(
    0,
  );
  await capture(page, info, 'private-390-light');
  await page.getByRole('button', { name: copy.share, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: copy.waitingTitle }),
  ).toBeVisible();
  fixture.publishPartner();
  await page.getByRole('button', { name: copy.refresh, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: copy.sharedTitle }),
  ).toBeVisible();
  await capture(page, info, 'result-390-light');
  await page.getByRole('button', { name: copy.prepare, exact: true }).click();
  await expect(page.getByLabel(copy.planTitle, { exact: true })).toHaveValue(
    demo.wishes[0],
  );
  await page.locator('input[name="plannedDate"]').fill('2026-11-01');
  await capture(page, info, 'plan-390-light');
  await page.getByRole('button', { name: copy.savePlan, exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/plans\/saved-choice-plan$/);
  await expect(
    page.getByRole('heading', { name: demo.wishes[0], exact: true }),
  ).toBeVisible();
  expect(
    fixture.requests.find((item) => item.kind === 'plan')?.body.schedule,
  ).toEqual({ plannedOn: '2026-11-01' });
  await page.locator('.planning-page .back-link').click();
  await expect(page).toHaveURL(/\/plan\/choose$/);
  await expect(
    page.getByRole('link', {
      name: copy.openPlanFor.replace('{{title}}', demo.wishes[0]),
    }),
  ).toBeVisible();
  expect(fixture.requests.filter((item) => item.kind === 'plan')).toHaveLength(
    1,
  );
  expect(fixture.unexpected).toEqual([]);
});

test('publication failure/offline retain private input and never replay a write', async ({
  page,
}) => {
  const initial = readyRound();
  initial.own = { favoriteWishIds: [], published: false, version: 0 };
  initial.selectionToken = `${ROUND_ID}:1:0`;
  initial.resultState = 'CHOOSING';
  initial.commonWishIds = [];
  const fixture = await install(page, initial);
  await enter(page);
  await page.goto('/plan/choose');
  await page.getByRole('checkbox', { name: demo.wishes[0] }).check();
  fixture.failNextShare();
  await page.getByRole('button', { name: copy.share, exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: demo.wishes[0] }),
  ).toBeChecked();
  await expect(
    page.getByRole('heading', { name: copy.waitingTitle }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: copy.share, exact: true }),
  ).toBeEnabled();
  await page.context().setOffline(true);
  await page.getByRole('button', { name: copy.share, exact: true }).click();
  await expect(
    page.getByRole('button', { name: copy.share, exact: true }),
  ).toBeEnabled();
  await page.context().setOffline(false);
  expect(fixture.requests.filter((item) => item.kind === 'own')).toHaveLength(
    1,
  );
  await expect(
    page.getByRole('checkbox', { name: demo.wishes[0] }),
  ).toBeChecked();
  expect(fixture.unexpected).toEqual([]);
});

test('zero common favorites allows a clearly labeled individual proposal and safe cancellation', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await install(page, readyRound(false));
  await enter(page);
  await page.goto('/plan/choose');
  await expect(
    page.getByRole('heading', { name: copy.noMatchTitle }),
  ).toBeVisible();
  await capture(page, info, 'no-match-390-light');
  await page
    .getByRole('button', { name: copy.ownContinue, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: copy.ownTitle }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: copy.prepare, exact: true })
    .first()
    .click();
  await expect(page.getByText(copy.proposal, { exact: true })).toBeVisible();
  await page
    .getByLabel(copy.planTitle, { exact: true })
    .fill('A changed proposal');
  await page
    .getByRole('button', { name: copy.toSelection, exact: true })
    .click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(fixture.requests.filter((item) => item.kind === 'plan')).toHaveLength(
    0,
  );
});

for (const scenario of [
  { width: 360, theme: 'light' },
  { width: 390, theme: 'dark' },
  { width: 430, theme: 'light' },
  { width: 1280, theme: 'dark' },
  { width: 320, theme: 'light', large: true },
]) {
  test(`common favorite at ${scenario.width} ${scenario.theme}${scenario.large ? ' large text and reduced motion' : ''}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await page.emulateMedia({
      colorScheme: scenario.theme as 'light' | 'dark',
      reducedMotion: scenario.large ? 'reduce' : 'no-preference',
    });
    const fixture = await install(page, readyRound());
    await enter(page);
    await page.goto('/plan/choose');
    await expect(
      page.getByRole('heading', { name: copy.sharedTitle }),
    ).toBeVisible();
    if (scenario.large)
      await page.evaluate(
        () => (document.documentElement.style.fontSize = '200%'),
      );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    const findings = await new AxeBuilder({ page })
      .include('.wish-selection-task')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(findings.violations).toEqual([]);
    await capture(
      page,
      info,
      `result-${scenario.width}-${scenario.theme}${scenario.large ? '-large-reduced' : ''}`,
    );
    expect(fixture.unexpected).toEqual([]);
  });
}
