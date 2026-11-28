import AxeBuilder from '../support/axe';
import {
  expect,
  type Page,
  type Route,
  type TestInfo,
  test,
} from '@playwright/test';
import dateIdeas from '../../src/i18n/locales/dateIdeas';
import m5s3 from '../../src/i18n/locales/m5s3';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import copy from '../../src/i18n/locales/wishSelection';
import {
  catalogIdea,
  type DateIdeasState,
  installDateIdeaMocks,
  SPACE_ID,
  signIn,
} from '../support/dateIdeas';
import { captureScreenshot } from '../support/storyTimelineFixture';

/*
 * #465 folded into #1535: curated Pro date ideas are typed candidates of the
 * one shared selection. Free keeps Wish-only rounds and sees the calm Pro
 * hint; Pro combines Wishes and ideas, chooses privately, and a common idea
 * becomes a Plan only through the existing composer. A downgrade pauses the
 * round without catalog content.
 */

const PATH = `/api/v1/spaces/${SPACE_ID}/wish-selection`;
const WISH = {
  id: '55555555-5555-4555-8555-555555555551',
  title: 'Night train to Vienna',
};
const SECOND_WISH = {
  id: '55555555-5555-4555-8555-555555555552',
  title: 'Bake bread together',
};
const FIRST = catalogIdea('eimir-date-001');
const SECOND = catalogIdea('eimir-date-002');

type Selection = {
  rounds: Record<string, unknown>[];
  owns: Record<string, unknown>[];
  view: Record<string, unknown>;
};

function emptyView() {
  return {
    id: null,
    version: 0,
    title: null,
    candidates: [],
    own: {
      favoriteWishIds: [],
      favoriteDateIdeaIds: [],
      published: false,
      version: 0,
    },
    selectionToken: null,
    roundToken: 'absent',
    resultState: 'NO_ROUND',
    commonWishIds: [],
    dateIdeaCandidates: [],
    commonDateIdeaIds: [],
  };
}

function candidate(wish: { id: string; title: string }) {
  return {
    wishId: wish.id,
    title: wish.title,
    version: 1,
    status: 'OPEN',
    planId: null,
  };
}

/**
 * Stateful wish-selection endpoint on top of the date-idea mocks. The partner
 * is simulated: their publication is already present, so the caller's own
 * publication reveals the intersection, exactly as the server computes it.
 */
async function installSelection(
  page: Page,
  dates: DateIdeasState,
  initial = emptyView(),
  partnerFavorites: string[] = [],
): Promise<Selection> {
  const state: Selection = {
    rounds: [],
    owns: [],
    view: structuredClone(initial),
  };
  await page.route(`**${PATH}**`, async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    const ideaView = (id: string) => ({
      dateIdeaId: id,
      current: true,
      idea: dates.pro ? catalogIdea(id) : null,
    });
    if (pathname === PATH && method === 'GET') {
      const view = state.view as {
        dateIdeaCandidates: { dateIdeaId: string }[];
      };
      return json({
        ...state.view,
        dateIdeaCandidates: view.dateIdeaCandidates.map((item) =>
          ideaView(item.dateIdeaId),
        ),
      });
    }
    if (pathname === PATH && method === 'PUT') {
      const body = request.postDataJSON();
      state.rounds.push(body);
      const ideas: string[] = body.dateIdeaIds ?? [];
      if (ideas.length && !dates.pro)
        return json(
          {
            status: 403,
            code: 'PREMIUM_ENTITLEMENT_REQUIRED',
            title: 'Forbidden',
          },
          403,
        );
      const version = Number(state.view.version) + 1;
      state.view = {
        ...emptyView(),
        id: 'round-1',
        version,
        roundToken: `round-1:${version}`,
        selectionToken: `round-1:${version}:0`,
        resultState: 'CHOOSING',
        title: body.title ?? null,
        candidates: [WISH, SECOND_WISH]
          .filter((wish) => body.wishIds.includes(wish.id))
          .map(candidate),
        dateIdeaCandidates: ideas.map(ideaView),
      };
      return json(state.view);
    }
    if (pathname === `${PATH}/own` && method === 'PUT') {
      const body = request.postDataJSON();
      state.owns.push(body);
      const own = state.view.own as { version: number };
      const ownVersion = own.version + 1;
      state.view = {
        ...state.view,
        own: { ...body, version: ownVersion },
        selectionToken: `round-1:${state.view.version}:${ownVersion}`,
        resultState: body.published ? 'READY' : 'CHOOSING',
        commonWishIds: body.published
          ? body.favoriteWishIds.filter((id: string) =>
              partnerFavorites.includes(id),
            )
          : [],
        commonDateIdeaIds: body.published
          ? body.favoriteDateIdeaIds.filter((id: string) =>
              partnerFavorites.includes(id),
            )
          : [],
      };
      return json(state.view);
    }
    return route.fallback();
  });
  return state;
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** The round hub's two sources and the pick bar (#1907 J1). */
function source(page: Page, title: string) {
  return page.getByRole('button', { name: new RegExp(title) });
}
async function finishPick(page: Page) {
  await page.getByRole('button', { name: copy.pickDone, exact: true }).click();
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

test('Free: Wish-only selection stays free and date ideas show the calm Pro hint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dates = await installDateIdeaMocks(page, {
    pro: false,
    wishes: [WISH, SECOND_WISH],
  });
  const selection = await installSelection(page, dates);
  await signIn(page);
  await page.goto('/plan/choose');
  await source(page, copy.sourceWishesTitle).click();
  await page.getByRole('checkbox', { name: WISH.title }).check();
  await finishPick(page);
  await source(page, copy.sourceIdeasTitle).click();
  await expect(page.getByText(copy.ideasLockedBody)).toBeVisible();
  await expect(
    page.getByRole('link', { name: dateIdeas.locked.action }),
  ).toHaveAttribute('href', /\/more\/pro\?context=dateIdeas$/);
  // No protected catalog read happens for a Free Space.
  expect(dates.catalogRequests).toBe(0);
  await page
    .locator('.wish-selection-heading')
    .getByRole('button', { name: taskBoundary.back })
    .click();
  await source(page, copy.sourceWishesTitle).click();
  await page.getByRole('checkbox', { name: SECOND_WISH.title }).check();
  await finishPick(page);
  await page.getByRole('button', { name: copy.start }).click();
  await expect(
    page.getByRole('heading', { name: copy.chooseTitle }),
  ).toBeVisible();
  expect(selection.rounds).toEqual([
    { wishIds: [WISH.id, SECOND_WISH.id], dateIdeaIds: [] },
  ]);
  expect(dates.unexpected).toEqual([]);
});

test('Pro: combine a Wish and date ideas, choose privately, plan the common idea and return', async ({
  page,
}, info: TestInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const dates = await installDateIdeaMocks(page, {
    pro: true,
    wishes: [WISH, SECOND_WISH],
  });
  const selection = await installSelection(page, dates, emptyView(), [
    FIRST.id,
  ]);
  await signIn(page);
  await page.goto('/plan/choose');
  await source(page, copy.sourceWishesTitle).click();
  await page.getByRole('checkbox', { name: WISH.title }).check();
  await finishPick(page);
  await source(page, copy.sourceIdeasTitle).click();
  // Pick mode: full cards, one action per card, filters behind one button.
  await expect(
    page.getByRole('button', { name: dateIdeas.filters.open }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: dateIdeas.card.save }),
  ).toHaveCount(0);
  const first = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: FIRST.title }) });
  await first.getByRole('button', { name: copy.ideaAdd }).click();
  await expect(
    first.getByRole('button', { name: copy.ideaAdded }),
  ).toHaveAttribute('aria-pressed', 'true');
  const second = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: SECOND.title }) });
  await second.getByRole('button', { name: copy.ideaAdd }).click();
  await assertNoHorizontalOverflow(page);
  await assertNoWcagViolations(page);
  await expect(
    page.locator('.wish-selection-pick-bar').getByRole('status'),
  ).toHaveText(copy.selected.replace('{{count}}', '3'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await captureScreenshot(
    page,
    info,
    'wish-selection-ideas-pick-390-light.png',
  );
  await finishPick(page);
  await captureScreenshot(
    page,
    info,
    'wish-selection-ideas-setup-390-light.png',
  );
  await page.getByRole('button', { name: copy.start }).click();

  await expect(
    page.getByRole('heading', { name: copy.chooseTitle }),
  ).toBeVisible();
  expect(selection.rounds).toEqual([
    { wishIds: [WISH.id], dateIdeaIds: [FIRST.id, SECOND.id] },
  ]);
  // #2371: the deck shows the Wish first, then the ideas in round order.
  const like = page.getByRole('button', { name: copy.deckLike, exact: true });
  const skip = page.getByRole('button', { name: copy.deckSkip, exact: true });
  await like.click();
  await like.click();
  await skip.click();
  await expect(skip).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: FIRST.title, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: WISH.title, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await captureScreenshot(
    page,
    info,
    'wish-selection-ideas-private-390-light.png',
  );
  expect(selection.owns).toEqual([]);
  await page.getByRole('button', { name: copy.share }).click();

  await expect(
    page.getByRole('heading', { name: copy.sharedTitle }),
  ).toBeVisible();
  expect(selection.owns).toEqual([
    {
      favoriteWishIds: [WISH.id],
      favoriteDateIdeaIds: [FIRST.id],
      published: true,
    },
  ]);
  const result = page.getByRole('region', { name: FIRST.title });
  await expect(result.getByText(copy.sharedIdea)).toBeVisible();
  await expect(page.getByRole('heading', { name: SECOND.title })).toHaveCount(
    0,
  );
  await expect(page.getByText(copy.ideaResultNote)).toBeVisible();
  await assertNoWcagViolations(page);
  await captureScreenshot(
    page,
    info,
    'wish-selection-ideas-result-390-light.png',
  );
  // Nothing was saved by the match itself.
  expect(dates.createdPlans).toEqual([]);
  expect(dates.wishCreates).toEqual([]);

  await result.getByRole('link', { name: dateIdeas.card.plan }).click();
  await expect(page).toHaveURL(/\/plan\/plans\/new$/);
  await expect(page.locator('#planning-create-title')).toHaveValue(
    FIRST.planTitle,
  );
  await page.getByRole('button', { name: m5s3.common.save }).click();
  await expect(page).toHaveURL(/\/plan\/plans\/77777777-/);
  expect(dates.createdPlans).toHaveLength(1);
  expect(dates.createdPlans[0]).toMatchObject({
    title: FIRST.planTitle,
    description: FIRST.description,
  });
  await page.goBack();
  await expect(page).toHaveURL(/\/plan\/choose$/);
  await expect(
    page.getByRole('heading', { name: copy.sharedTitle }),
  ).toBeVisible();
  expect(dates.unexpected).toEqual([]);
});

test('a downgrade pauses a round with date ideas without catalog content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dates = await installDateIdeaMocks(page, {
    pro: false,
    wishes: [WISH, SECOND_WISH],
  });
  const paused = {
    ...emptyView(),
    id: 'round-1',
    version: 1,
    roundToken: 'round-1:1',
    selectionToken: 'round-1:1:1',
    resultState: 'PAUSED',
    candidates: [candidate(WISH)],
    dateIdeaCandidates: [{ dateIdeaId: FIRST.id }],
    own: {
      favoriteWishIds: [WISH.id],
      favoriteDateIdeaIds: [FIRST.id],
      published: true,
      version: 1,
    },
  };
  const selection = await installSelection(page, dates, paused);
  await signIn(page);
  await page.goto('/plan/choose');
  await expect(
    page.getByRole('heading', { name: copy.pausedTitle }),
  ).toBeVisible();
  await expect(page.getByText(FIRST.title)).toHaveCount(0);
  await page.getByRole('button', { name: copy.pausedReplace }).click();
  await expect(
    page.getByRole('heading', { name: copy.setupTitle }),
  ).toBeVisible();
  await source(page, copy.sourceWishesTitle).click();
  await page.getByRole('checkbox', { name: SECOND_WISH.title }).check();
  await finishPick(page);
  await page.getByRole('button', { name: copy.replace }).click();
  await expect(
    page.getByRole('heading', { name: copy.chooseTitle }),
  ).toBeVisible();
  expect(selection.rounds).toEqual([
    { wishIds: [WISH.id, SECOND_WISH.id], dateIdeaIds: [] },
  ]);
  expect(dates.catalogRequests).toBe(0);
  expect(dates.unexpected).toEqual([]);
});

for (const { width, theme, large } of [
  { width: 320, theme: 'light', large: true },
  { width: 360, theme: 'light', large: false },
  { width: 390, theme: 'dark', large: false },
  { width: 430, theme: 'light', large: false },
  { width: 1280, theme: 'dark', large: false },
] as const) {
  test(`date ideas in the selection reflow at ${width}px ${theme}${large ? ' with 200% text' : ''}`, async ({
    page,
  }, info: TestInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(
      (choice) => localStorage.setItem('eimir.theme', choice),
      theme,
    );
    const dates = await installDateIdeaMocks(page, {
      pro: true,
      wishes: [WISH, SECOND_WISH],
    });
    const ready = {
      ...emptyView(),
      id: 'round-1',
      version: 1,
      roundToken: 'round-1:1',
      selectionToken: 'round-1:1:1',
      resultState: 'READY',
      title: 'Unser Wochenende',
      candidates: [candidate(WISH)],
      dateIdeaCandidates: [{ dateIdeaId: FIRST.id }, { dateIdeaId: SECOND.id }],
      own: {
        favoriteWishIds: [],
        favoriteDateIdeaIds: [FIRST.id],
        published: true,
        version: 1,
      },
      commonDateIdeaIds: [FIRST.id],
    };
    await installSelection(page, dates, ready);
    await signIn(page);
    await page.goto('/plan/choose');
    await expect(
      page.getByRole('heading', { name: FIRST.title }),
    ).toBeVisible();
    if (large)
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    await assertNoHorizontalOverflow(page);
    if (!large) await assertNoWcagViolations(page);
    await captureScreenshot(
      page,
      info,
      `wish-selection-ideas-result-${width}-${theme}.png`,
      {
        fullPage: true,
      },
    );
    await page.getByText(copy.moreActions).click();
    await page.getByRole('button', { name: copy.changeIdeas }).click();
    await source(page, copy.sourceIdeasTitle).click();
    await expect(
      page.getByRole('heading', { name: SECOND.title }),
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);
    if (!large) await assertNoWcagViolations(page);
    await captureScreenshot(
      page,
      info,
      `wish-selection-ideas-setup-${width}-${theme}.png`,
      {
        fullPage: true,
      },
    );
    expect(dates.unexpected).toEqual([]);
  });
}
