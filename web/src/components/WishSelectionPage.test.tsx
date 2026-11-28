// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DateIdea } from '../api/generated/models/DateIdea';
import type { WishSelectionView } from '../api/generated/models/WishSelectionView';
import { dateIdeasQueryKey } from '../client/dateIdeas';
import { ClientProblemError } from '../client/problemDetails';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { spaceEntitlementQueryKey } from '../client/spaceEntitlement';
import { wishSelectionQueryKey } from '../client/wishSelection';
import { resolvedLocale } from '../i18n';
import dateCopy from '../i18n/locales/dateIdeas';
import m5s3 from '../i18n/locales/m5s3';
import taskBoundary from '../i18n/locales/taskBoundary';
import copy from '../i18n/locales/wishSelection';
import { WishSelectionPage } from './WishSelectionPage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => onlineManager.setOnline(true));

const candidates = [
  {
    wishId: 'pasta',
    title: 'Pasta night',
    version: 1,
    status: 'OPEN' as const,
    planId: null,
  },
  {
    wishId: 'lake',
    title: 'Walk by the lake',
    version: 1,
    status: 'OPEN' as const,
    planId: null,
  },
  {
    wishId: 'spa',
    title: 'Visit the spa',
    version: 1,
    status: 'OPEN' as const,
    planId: null,
  },
];

function projection(
  state: WishSelectionView['resultState'] = 'CHOOSING',
): WishSelectionView {
  return {
    id: state === 'NO_ROUND' ? null : 'round-1',
    version: state === 'NO_ROUND' ? 0 : 1,
    roundToken: state === 'NO_ROUND' ? 'absent' : 'round-1:1',
    title: state === 'NO_ROUND' ? null : 'Our weekend',
    candidates: state === 'NO_ROUND' ? [] : structuredClone(candidates),
    own: {
      favoriteWishIds:
        state === 'READY' || state === 'WAITING' ? ['pasta', 'lake'] : [],
      favoriteDateIdeaIds: [],
      published: state === 'READY' || state === 'WAITING',
      version: state === 'READY' || state === 'WAITING' ? 1 : 0,
    },
    selectionToken:
      state === 'NO_ROUND'
        ? null
        : `round-1:1:${state === 'READY' || state === 'WAITING' ? 1 : 0}`,
    resultState: state,
    commonWishIds: state === 'READY' ? ['pasta'] : [],
    dateIdeaCandidates: [],
    commonDateIdeaIds: [],
  };
}

const picnic: DateIdea = {
  id: 'eimir-date-001',
  category: 'food_drink',
  placeType: 'home',
  minutes: 40,
  budgetEurForTwo: 10,
  title: 'Living-room picnic',
  description: 'A blanket, two plates, no table.',
  wishTitle: 'Living-room picnic one evening',
  planTitle: 'Our living-room picnic',
  prerequisites: [],
  contentLocale: 'de',
  image: { id: 'category-food_drink', width: 3, height: 2, alt: 'Plates' },
};
const sunset: DateIdea = {
  ...picnic,
  id: 'eimir-date-002',
  category: 'nature',
  placeType: 'out',
  title: 'Sunset walk',
  wishTitle: 'A sunset walk',
  planTitle: 'Our sunset walk',
  image: { id: 'category-nature', width: 3, height: 2, alt: 'Path' },
};
const cooking: DateIdea = {
  ...picnic,
  id: 'eimir-date-003',
  title: 'A new recipe, two cooks',
};

/** Seeds the session caches that a Pro or Free Space would have loaded. */
function seedDateIdeas(client: QueryClient, pro: boolean) {
  client.setQueryData(spaceEntitlementQueryKey('account-a', 'space-1'), {
    capabilities: pro ? ['planning.date_inspiration'] : [],
  });
  if (pro)
    client.setQueryData(
      dateIdeasQueryKey('account-a', 'space-1', resolvedLocale()),
      {
        catalogVersion: '1.0.0',
        locale: 'de',
        currency: 'EUR',
        totalCount: 3,
        categories: [
          { id: 'food_drink', label: 'Essen & Trinken' },
          { id: 'nature', label: 'Natur' },
        ],
        placeTypes: [
          { id: 'home', label: 'Zuhause' },
          { id: 'out', label: 'Unterwegs' },
        ],
        ideas: [picnic, sunset, cooking],
      },
    );
}

function withIdeas(
  state: WishSelectionView['resultState'],
  options: { common?: string[]; favorites?: string[]; content?: boolean } = {},
): WishSelectionView {
  const view = projection(state === 'PAUSED' ? 'READY' : state);
  view.resultState = state;
  view.candidates = view.candidates.slice(0, 1);
  view.dateIdeaCandidates = [picnic, sunset].map((idea) => ({
    dateIdeaId: idea.id,
    current: true,
    idea: options.content === false ? null : idea,
  }));
  view.own.favoriteWishIds = [];
  view.own.favoriteDateIdeaIds = options.favorites ?? [];
  view.commonWishIds = [];
  view.commonDateIdeaIds = options.common ?? [];
  return view;
}

function renderTask(
  initial = projection(),
  paginated = false,
  dateIdeas: 'pro' | 'free' | null = null,
) {
  let current = structuredClone(initial);
  let sourceWishes = candidates.map((candidate) => ({
    id: candidate.wishId,
    title: candidate.title,
    status: candidate.status,
  }));
  const getWishSelection = vi.fn(async () => structuredClone(current));
  const replaceWishSelectionRound = vi.fn(async (request) => {
    current = projection();
    current.title = request.wishSelectionRoundUpdate.title ?? null;
    current.candidates = candidates.filter((candidate) =>
      request.wishSelectionRoundUpdate.wishIds.includes(candidate.wishId),
    );
    current.dateIdeaCandidates = [picnic, sunset]
      .filter((idea) =>
        request.wishSelectionRoundUpdate.dateIdeaIds?.includes(idea.id),
      )
      .map((idea) => ({ dateIdeaId: idea.id, current: true, idea }));
    return structuredClone(current);
  });
  const updateOwnWishSelection = vi.fn(async (request) => {
    current.own = {
      ...request.wishSelectionUpdate,
      version: current.own.version + 1,
    };
    current.selectionToken = `round-1:1:${current.own.version}`;
    current.resultState = current.own.published ? 'WAITING' : 'CHOOSING';
    current.commonWishIds = [];
    return structuredClone(current);
  });
  const decideWishSelection = vi.fn(async (request) => {
    const body = request.wishSelectionDecisionUpdate;
    if (body.action === 'CHOOSE')
      current.decision = {
        wishId: body.wishId ?? null,
        dateIdeaId: body.dateIdeaId ?? null,
        method: 'MANUAL',
      };
    if (body.action === 'CLEAR') current.decision = null;
    if (body.action === 'REQUEST_RANDOM')
      current.randomRequest = { mine: true, declined: false };
    if (body.action === 'ACCEPT_RANDOM') {
      current.decision = { wishId: 'lake', dateIdeaId: null, method: 'RANDOM' };
      current.randomRequest = null;
    }
    if (body.action === 'DECLINE_RANDOM')
      current.randomRequest = { mine: false, declined: true };
    return structuredClone(current);
  });
  const closeWishSelectionRound = vi.fn(async () => {
    current = projection('NO_ROUND');
  });
  const createWish = vi.fn(async ({ wishCreate }) => {
    const result = {
      id: 'new-wish',
      title: wishCreate.title,
      status: 'OPEN' as const,
    };
    sourceWishes = [...sourceWishes, result];
    return result;
  });
  const convertWishToPlan = vi.fn(
    async (
      _request: Parameters<SharedPlanningApis['plans']['convertWishToPlan']>[0],
    ) => ({
      wish: { id: 'pasta' },
      plan: { id: 'actual-plan' },
    }),
  );
  const apis = {
    wishSelections: {
      getWishSelection,
      replaceWishSelectionRound,
      updateOwnWishSelection,
      closeWishSelectionRound,
      decideWishSelection,
    },
    wishes: {
      listWishes: vi.fn(
        async ({ cursor } = {} as { cursor?: string | null }) =>
          paginated
            ? {
                items: cursor
                  ? [{ id: 'a', title: 'Apple', status: 'OPEN' }]
                  : [
                      { id: 'z', title: 'Zoo', status: 'OPEN' },
                      { id: 'b', title: 'Banana', status: 'OPEN' },
                    ],
                nextCursor: cursor ? null : 'second',
                hasMore: !cursor,
              }
            : { items: sourceWishes, nextCursor: null, hasMore: false },
      ),
      createWish,
    },
    plans: { convertWishToPlan },
  } as unknown as SharedPlanningApis;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (dateIdeas) seedDateIdeas(queryClient, dateIdeas === 'pro');
  function tree(accountId: string) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/choose']}>
          <Routes>
            <Route
              path="/plan/choose"
              element={
                <WishSelectionPage
                  apis={apis}
                  spaceId="space-1"
                  accountId={accountId}
                />
              }
            />
            <Route
              path="/plan/plans/:planId"
              element={<p>Canonical Plan result</p>}
            />
            <Route path="/plan" element={<p>Planning hub</p>} />
            <Route path="/plan/plans/new" element={<p>Plan composer</p>} />
            <Route path="/plan/wishes/new" element={<p>Wish composer</p>} />
            <Route path="/more/pro/*" element={<p>Pro paywall</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  const rendered = render(tree('account-a'));
  return {
    ...rendered,
    queryClient,
    apis,
    getWishSelection,
    replaceWishSelectionRound,
    updateOwnWishSelection,
    closeWishSelectionRound,
    decideWishSelection,
    createWish,
    convertWishToPlan,
    switchAccount: (account: string) => rendered.rerender(tree(account)),
  };
}

/** Opens the Wish source of the round hub (#1907 J1). */
async function openWishes() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: new RegExp(copy.sourceWishesTitle),
    }),
  );
}

/** Opens the date-idea source of the round hub in pick mode. */
async function openIdeas() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: new RegExp(copy.sourceIdeasTitle),
    }),
  );
}

/** Returns from a source to the round hub with the pick bar. */
function finishPick() {
  fireEvent.click(screen.getByRole('button', { name: copy.pickDone }));
}

/**
 * #2371: a first choice starts as a card deck. Skips every card (no
 * favourite) until the summary list with its toggles and Share shows.
 */
async function passDeck(ready: () => boolean = () => false) {
  await waitFor(() => {
    if (!screen.queryByRole('button', { name: copy.deckSkip }) && !ready())
      throw new Error('Neither the deck nor the list is shown yet.');
  });
  for (let card = 0; card < 10; card += 1) {
    const skip = screen.queryByRole('button', { name: copy.deckSkip });
    if (!skip || skip.hasAttribute('disabled')) break;
    fireEvent.click(skip);
  }
}

/** A private favourite toggle in the vote step (after the deck). */
async function favorite(name: string | RegExp) {
  await passDeck(() => Boolean(screen.queryByRole('button', { name })));
  return screen.findByRole('button', { name });
}

describe('WishSelectionPage', () => {
  it('explains the round in three steps and offers two sources while it is empty', async () => {
    renderTask(projection('NO_ROUND'));
    expect(
      await screen.findByRole('heading', { level: 1, name: copy.setupTitle }),
    ).toBeTruthy();
    const steps = screen.getByRole('list', { name: copy.stepsLabel });
    expect(steps.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByText(copy.stepFavoritesBodyUnnamed)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: new RegExp(copy.sourceWishesTitle) }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: new RegExp(copy.sourceIdeasTitle) }),
    ).toBeTruthy();
    // The segmented source switch and the setup intros are gone.
    expect(screen.queryByRole('group', { name: copy.sourcesLabel })).toBeNull();
    expect(screen.getByRole('button', { name: copy.start })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('sorts the combined paginated open Wishes alphabetically without losing selection', async () => {
    const { apis, replaceWishSelectionRound } = renderTask(
      projection('NO_ROUND'),
      true,
    );
    await openWishes();
    await screen.findByRole('checkbox', { name: 'Apple' });
    expect(vi.mocked(apis.wishes.listWishes)).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'second' }),
    );
    expect(
      screen
        .getAllByRole('checkbox')
        .map((input) => input.closest('label')?.textContent),
    ).toEqual(['Apple', 'Banana', 'Zoo']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Apple' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zoo' }));
    expect(
      screen.getByText(copy.selected.replace('{{count}}', '2')),
    ).toBeTruthy();
    finishPick();
    // The hub shows how many Wishes the source contributed.
    expect(
      screen.getByText(copy.sourceCount.replace('{{count}}', '2')),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.start }));
    await waitFor(() =>
      expect(replaceWishSelectionRound).toHaveBeenCalledWith(
        expect.objectContaining({
          wishSelectionRoundUpdate: expect.objectContaining({
            wishIds: ['a', 'z'],
          }),
        }),
      ),
    );
  });

  it('starts a bounded round from real Wishes without opening the keyboard', async () => {
    const { replaceWishSelectionRound } = renderTask(projection('NO_ROUND'));
    await openWishes();
    const pasta = await screen.findByRole('checkbox', {
      name: candidates[0].title,
    });
    expect(document.activeElement).not.toBe(
      screen.getByPlaceholderText(copy.newIdeaPlaceholder),
    );
    fireEvent.click(pasta);
    finishPick();
    expect(screen.getByText(copy.needOneMore)).toBeTruthy();
    expect(document.activeElement).not.toBe(
      screen.getByPlaceholderText(copy.occasionPlaceholder),
    );
    const start = screen.getByRole('button', { name: copy.start });
    expect(start).toHaveProperty('disabled', true);
    await openWishes();
    fireEvent.click(
      screen.getByRole('checkbox', { name: candidates[1].title }),
    );
    finishPick();
    fireEvent.click(screen.getByRole('button', { name: copy.start }));
    await screen.findByRole('heading', { name: copy.chooseTitle });
    expect(replaceWishSelectionRound).toHaveBeenCalledWith({
      spaceId: 'space-1',
      locale: resolvedLocale(),
      ifMatch: 'absent',
      wishSelectionRoundUpdate: {
        wishIds: ['pasta', 'lake'],
        dateIdeaIds: [],
        title: undefined,
      },
    });
  });

  it('does not publish before the deliberate Share action', async () => {
    const { updateOwnWishSelection } = renderTask();
    const pasta = await favorite(candidates[0].title);
    // Nothing is preselected; the step exists to narrow the round down.
    expect(pasta.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pasta);
    expect(pasta.getAttribute('aria-pressed')).toBe('true');
    expect(updateOwnWishSelection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.share }));
    await screen.findByRole('heading', { name: copy.waitingTitle });
    expect(updateOwnWishSelection).toHaveBeenCalledWith({
      spaceId: 'space-1',
      locale: resolvedLocale(),
      ifMatch: 'round-1:1:0',
      wishSelectionUpdate: {
        favoriteWishIds: ['pasta'],
        favoriteDateIdeaIds: [],
        published: true,
      },
    });
    expect(screen.queryByText(copy.sharedTitle)).toBeNull();
  });

  it('starts a first choice as a card deck and hands over to the list (#2371)', async () => {
    const { updateOwnWishSelection } = renderTask();
    const first = await screen.findByRole('group', {
      name: `${candidates[0].title}, 1 von 3`,
    });
    expect(first.getAttribute('tabindex')).toBe('0');
    // Only the top card is exposed; the card behind it waits.
    expect(screen.getAllByRole('group')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: copy.deckBack })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: copy.deckLike }));
    expect(
      screen.getByText(
        copy.deckLiked.replace('{{title}}', candidates[0].title),
      ),
    ).toBeTruthy();
    // The keyboard decides like the buttons: Arrow Left leaves it out.
    fireEvent.keyDown(
      await screen.findByRole('group', {
        name: `${candidates[1].title}, 2 von 3`,
      }),
      { key: 'ArrowLeft' },
    );
    // Back to the previous card, then on again.
    fireEvent.click(screen.getByRole('button', { name: copy.deckBack }));
    await screen.findByRole('group', {
      name: `${candidates[1].title}, 2 von 3`,
    });
    fireEvent.click(screen.getByRole('button', { name: copy.deckSkip }));
    fireEvent.click(screen.getByRole('button', { name: copy.deckSkip }));

    // The summary list shows the choices and can still change them.
    const pasta = await screen.findByRole('button', {
      name: candidates[0].title,
    });
    expect(pasta.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen
        .getByRole('button', { name: candidates[1].title })
        .getAttribute('aria-pressed'),
    ).toBe('false');
    expect(updateOwnWishSelection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.share }));
    await screen.findByRole('heading', { name: copy.waitingTitle });
    expect(updateOwnWishSelection.mock.calls[0][0].wishSelectionUpdate).toEqual(
      {
        favoriteWishIds: ['pasta'],
        favoriteDateIdeaIds: [],
        published: true,
      },
    );
  });

  it('opens the list directly when favourites already exist (#2371)', async () => {
    renderTask(withIdeas('CHOOSING', { favorites: [picnic.id] }), false, 'pro');
    expect(
      (
        await screen.findByRole('button', { name: new RegExp(picnic.title) })
      ).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.queryByRole('button', { name: copy.deckLike })).toBeNull();
  });

  it('allows zero favorites and shows the authoritative waiting state', async () => {
    const { updateOwnWishSelection } = renderTask();
    await passDeck();
    fireEvent.click(
      await screen.findByRole('button', { name: copy.shareNone }),
    );
    await screen.findByRole('heading', { name: copy.waitingTitle });
    expect(
      updateOwnWishSelection.mock.calls[0][0].wishSelectionUpdate
        .favoriteWishIds,
    ).toEqual([]);
  });

  it('renders only server-authorized common favorites', async () => {
    renderTask(projection('READY'));
    await screen.findByRole('heading', { name: copy.sharedTitle });
    expect(
      screen.getByRole('heading', { name: candidates[0].title }),
    ).toBeTruthy();
    expect(screen.queryByText(candidates[1].title)).toBeNull();
    expect(screen.queryByText(candidates[2].title)).toBeNull();
  });

  it('lets the couple pick one of several common favourites and decide again', async () => {
    const initial = projection('READY');
    initial.commonWishIds = ['pasta', 'lake'];
    initial.randomPool = 'COMMON';
    const { convertWishToPlan, decideWishSelection } = renderTask(initial);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: copy.sharedManyTitle.replace('{{amount}}', '2'),
      }),
    ).toBeTruthy();
    expect(screen.getByText(copy.sharedManyIntro)).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.prepare })).toBeNull();
    expect(
      screen.getByRole('button', { name: copy.randomPropose }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: candidates[1].title }));
    expect(
      await screen.findByRole('heading', { level: 1, name: copy.chosenTitle }),
    ).toBeTruthy();
    // The tap is stored on the round so both devices show the same pick.
    expect(
      decideWishSelection.mock.calls[0][0].wishSelectionDecisionUpdate,
    ).toEqual({ action: 'CHOOSE', wishId: 'lake', dateIdeaId: undefined });
    expect(screen.getByText(copy.chosenLabel)).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: copy.alsoShared }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.unchoose }));
    fireEvent.click(
      await screen.findByRole('button', { name: candidates[0].title }),
    );
    fireEvent.click(await screen.findByRole('button', { name: copy.prepare }));
    fireEvent.click(await screen.findByRole('button', { name: copy.savePlan }));
    await screen.findByText('Canonical Plan result');
    expect(convertWishToPlan.mock.calls[0][0].wishId).toBe('pasta');
  });

  it('proposes chance only with consent and shows the pending question', async () => {
    const initial = projection('READY');
    initial.commonWishIds = [];
    initial.randomPool = 'FAVORITES';
    const { decideWishSelection } = renderTask(initial);
    await screen.findByRole('heading', { name: copy.noMatchTitle });
    expect(screen.getByText(new RegExp(copy.randomPoolFavorites))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.randomPropose }));
    expect(
      await screen.findByRole('button', { name: copy.randomWithdraw }),
    ).toBeTruthy();
    expect(
      decideWishSelection.mock.calls[0][0].wishSelectionDecisionUpdate.action,
    ).toBe('REQUEST_RANDOM');
    // Nothing is decided before the partner agrees.
    expect(screen.queryByText(copy.chosenRandomLabel)).toBeNull();
  });

  it('lets the partner agree to chance and shows the stored result', async () => {
    const initial = projection('READY');
    initial.commonWishIds = [];
    initial.randomPool = 'FAVORITES';
    initial.randomRequest = { mine: false, declined: false };
    renderTask(initial);
    expect(
      await screen.findByText(new RegExp(copy.randomOnlyOne)),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: copy.randomChangeFirst }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.randomAccept }));
    // A short reveal plays first; the stored pick follows on both devices.
    expect(await screen.findByText(copy.randomRolling)).toBeTruthy();
    expect(
      await screen.findByText(copy.chosenRandomLabel, {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: candidates[1].title }),
    ).toBeTruthy();
  });

  it('keeps deciding together when the partner declines chance', async () => {
    const initial = projection('READY');
    initial.commonWishIds = [];
    initial.randomPool = 'FAVORITES';
    initial.randomRequest = { mine: false, declined: false };
    renderTask(initial);
    fireEvent.click(
      await screen.findByRole('button', { name: copy.randomDecline }),
    );
    expect(
      await screen.findByRole('button', { name: copy.randomPropose }),
    ).toBeTruthy();
    expect(screen.queryByText(copy.chosenRandomLabel)).toBeNull();
  });

  it('hints softly when every candidate is a favourite', async () => {
    renderTask();
    for (const candidate of candidates)
      fireEvent.click(await favorite(candidate.title));
    expect(
      screen.getByText(new RegExp(copy.allFavorites.replace('?', '\\?'))),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.share })).toBeTruthy();
  });

  it('keeps the zero-match path useful without claiming mutual agreement', async () => {
    const initial = projection('READY');
    initial.commonWishIds = [];
    renderTask(initial);
    await screen.findByRole('heading', { name: copy.noMatchTitle });
    expect(screen.getByRole('button', { name: copy.newRound })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.ownContinue }));
    await screen.findByRole('heading', { name: copy.ownTitle });
    expect(screen.getByText(copy.ownBody)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: copy.prepare })[0]);
    expect(await screen.findByText(copy.proposal)).toBeTruthy();
  });

  it('withdraws publication before editing a shared selection', async () => {
    const { updateOwnWishSelection } = renderTask(projection('READY'));
    fireEvent.click(
      await screen.findByRole('button', { name: copy.changeOwn }),
    );
    const pasta = await favorite(candidates[0].title);
    expect(pasta.getAttribute('aria-pressed')).toBe('true');
    expect(
      updateOwnWishSelection.mock.calls[0][0].wishSelectionUpdate.published,
    ).toBe(false);
    expect(
      screen.queryByRole('heading', { name: copy.sharedTitle }),
    ).toBeNull();
  });

  it('preserves selected favorites after a failed publication', async () => {
    const { updateOwnWishSelection } = renderTask();
    updateOwnWishSelection.mockRejectedValueOnce(
      new ClientProblemError('server'),
    );
    const pasta = await favorite(candidates[0].title);
    fireEvent.click(pasta);
    fireEvent.click(screen.getByRole('button', { name: copy.share }));
    await waitFor(() =>
      expect(updateOwnWishSelection).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: copy.share })).toHaveProperty(
        'disabled',
        false,
      ),
    );
    expect(pasta.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.queryByRole('heading', { name: copy.waitingTitle }),
    ).toBeNull();
  });

  it('does not queue or replay publication while offline', async () => {
    const { updateOwnWishSelection } = renderTask();
    const pasta = await favorite(candidates[0].title);
    fireEvent.click(pasta);
    onlineManager.setOnline(false);
    fireEvent.click(screen.getByRole('button', { name: copy.share }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: copy.share })).toHaveProperty(
        'disabled',
        false,
      ),
    );
    expect(updateOwnWishSelection).not.toHaveBeenCalled();
    onlineManager.setOnline(true);
    expect(updateOwnWishSelection).not.toHaveBeenCalled();
    expect(pasta.getAttribute('aria-pressed')).toBe('true');
  });

  it('retains a dirty selection when Back is cancelled', async () => {
    renderTask();
    fireEvent.click(await favorite(candidates[0].title));
    fireEvent.click(screen.getByRole('button', { name: taskBoundary.back }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: m5s3.common.keepEditing }),
    );
    expect(
      screen
        .getByRole('button', { name: candidates[0].title })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('uses canonical Wish-to-Plan conversion and opens the actual undated result', async () => {
    const { convertWishToPlan } = renderTask(projection('READY'));
    fireEvent.click(await screen.findByRole('button', { name: copy.prepare }));
    fireEvent.click(await screen.findByRole('button', { name: copy.savePlan }));
    await screen.findByText('Canonical Plan result');
    expect(convertWishToPlan).toHaveBeenCalledWith({
      spaceId: 'space-1',
      wishId: 'pasta',
      ifMatch: '1',
      wishToPlan: {
        title: candidates[0].title,
        description: undefined,
        schedule: undefined,
      },
    });
  });

  it('preserves date-only Plan semantics', async () => {
    const { convertWishToPlan } = renderTask(projection('READY'));
    fireEvent.click(await screen.findByRole('button', { name: copy.prepare }));
    const date = document.querySelector('input[type="date"]');
    expect(date).toBeTruthy();
    fireEvent.change(date as HTMLInputElement, {
      target: { value: '2026-11-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.savePlan }));
    await waitFor(() => expect(convertWishToPlan).toHaveBeenCalledTimes(1));
    expect(convertWishToPlan.mock.calls[0][0].wishToPlan.schedule).toEqual({
      plannedOn: new Date('2026-11-01T00:00:00Z'),
    });
    // Saving releases the plan step's and the task's history entries in turn.
    await screen.findByText('Canonical Plan result');
  });

  it('opens a converted source without creating another Plan', async () => {
    const initial = projection('READY');
    initial.candidates[0].planId = 'already-created';
    initial.candidates[0].status = 'PLANNED';
    initial.commonWishIds = [];
    const { convertWishToPlan } = renderTask(initial);
    fireEvent.click(
      await screen.findByRole('link', {
        name: copy.openPlanFor.replace('{{title}}', candidates[0].title),
      }),
    );
    await screen.findByText('Canonical Plan result');
    expect(convertWishToPlan).not.toHaveBeenCalled();
  });

  it('does not reuse consent when a source requires review', async () => {
    renderTask(projection('NEEDS_IDEAS'));
    await screen.findByRole('heading', { name: copy.changedTitle });
    expect(screen.queryByRole('button', { name: copy.share })).toBeNull();
    expect(screen.getByRole('button', { name: copy.reviewIdeas })).toBeTruthy();
  });

  it('does not overwrite a local draft when another device changes the round', async () => {
    const { queryClient, updateOwnWishSelection } = renderTask();
    fireEvent.click(await favorite(candidates[0].title));
    const changed = projection();
    changed.version = 2;
    changed.roundToken = 'round-1:2';
    changed.selectionToken = 'round-1:2:0';
    act(() =>
      queryClient.setQueryData(
        wishSelectionQueryKey('', 'account-a', 'space-1'),
        changed,
      ),
    );
    expect(
      screen
        .getByRole('button', { name: candidates[0].title })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: copy.share })).toHaveProperty(
        'disabled',
        true,
      ),
    );
    expect(updateOwnWishSelection).not.toHaveBeenCalled();
  });

  it('keeps the personal draft and offers explicit reload when a source changes', async () => {
    const { queryClient, updateOwnWishSelection } = renderTask();
    fireEvent.click(await favorite(candidates[0].title));
    const changed = projection('NEEDS_IDEAS');
    changed.candidates[0].version = 2;
    act(() =>
      queryClient.setQueryData(
        wishSelectionQueryKey('', 'account-a', 'space-1'),
        changed,
      ),
    );
    expect(
      screen
        .getByRole('button', { name: candidates[0].title })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: copy.share })).toHaveProperty(
        'disabled',
        true,
      ),
    );
    expect(screen.getByText(copy.changedBody)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.reload }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: m5s3.common.keepEditing }),
    );
    expect(
      screen
        .getByRole('button', { name: candidates[0].title })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(updateOwnWishSelection).not.toHaveBeenCalled();
  });

  it('keeps a round-setup draft when a source is removed on another device', async () => {
    const { queryClient, replaceWishSelectionRound } = renderTask(
      projection('READY'),
    );
    fireEvent.click(await screen.findByText(copy.moreActions));
    fireEvent.click(screen.getByRole('button', { name: copy.changeIdeas }));
    fireEvent.change(screen.getByLabelText(copy.occasion), {
      target: { value: 'A new occasion' },
    });
    const changed = projection('NEEDS_IDEAS');
    changed.candidates = changed.candidates.slice(1);
    act(() =>
      queryClient.setQueryData(
        wishSelectionQueryKey('', 'account-a', 'space-1'),
        changed,
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: copy.replace })).toHaveProperty(
        'disabled',
        true,
      ),
    );
    expect(screen.getByLabelText(copy.occasion)).toHaveProperty(
      'value',
      'A new occasion',
    );
    expect(screen.getByRole('button', { name: copy.reload })).toBeTruthy();
    expect(replaceWishSelectionRound).not.toHaveBeenCalled();
  });

  it('clears personal drafts when the active account changes', async () => {
    const { switchAccount } = renderTask();
    fireEvent.click(await favorite(candidates[0].title));
    switchAccount('account-b');
    // The other account starts fresh, with the deck, and nothing chosen.
    expect(
      (await favorite(candidates[0].title)).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('ignores a late publication response after the active account changes', async () => {
    const { switchAccount, updateOwnWishSelection, queryClient } = renderTask();
    let resolvePublication: (view: WishSelectionView) => void = () => {
      throw new Error('Publication was not started.');
    };
    updateOwnWishSelection.mockImplementationOnce(
      () =>
        new Promise<WishSelectionView>((resolve) => {
          resolvePublication = resolve;
        }),
    );
    fireEvent.click(await favorite(candidates[0].title));
    fireEvent.click(screen.getByRole('button', { name: copy.share }));
    await waitFor(() =>
      expect(updateOwnWishSelection).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.getByRole('button', { name: taskBoundary.back }),
    ).toHaveProperty('disabled', true);
    switchAccount('account-b');
    await favorite(candidates[0].title);
    await act(async () => resolvePublication(projection('READY')));
    expect(
      screen.queryByRole('heading', { name: copy.sharedTitle }),
    ).toBeNull();
    expect(
      screen
        .getByRole('button', { name: candidates[0].title })
        .getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      queryClient.getQueryData<WishSelectionView>(
        wishSelectionQueryKey('', 'account-b', 'space-1'),
      )?.own.published,
    ).toBe(false);
    expect(
      queryClient.getQueryData(
        wishSelectionQueryKey('', 'account-a', 'space-1'),
      ),
    ).toBeUndefined();
  });

  it('adds new ideas through normal idempotent Wish creation', async () => {
    const { createWish } = renderTask(projection('NO_ROUND'));
    await openWishes();
    const input = await screen.findByPlaceholderText(copy.newIdeaPlaceholder);
    fireEvent.change(input, { target: { value: 'Make bread together' } });
    fireEvent.click(screen.getByRole('button', { name: copy.addIdea }));
    expect(
      await screen.findByRole('checkbox', { name: 'Make bread together' }),
    ).toHaveProperty('checked', true);
    expect(createWish).toHaveBeenCalledWith({
      spaceId: 'space-1',
      idempotencyKey: expect.any(String),
      wishCreate: { title: 'Make bread together' },
    });
  });

  it('keeps date ideas behind the calm Pro hint for a Free Space', async () => {
    const { replaceWishSelectionRound } = renderTask(
      projection('NO_ROUND'),
      false,
      'free',
    );
    await openIdeas();
    expect(
      await screen.findByRole('heading', {
        name: new RegExp(dateCopy.locked.title),
      }),
    ).toBeTruthy();
    // Free sees no pick bar: nothing can be added from the locked catalog.
    expect(screen.queryByRole('button', { name: copy.pickDone })).toBeNull();
    expect(screen.getByText(copy.ideasLockedBody)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: dateCopy.locked.action }),
    ).toHaveProperty('href', expect.stringContaining('/more/pro'));
    expect(screen.queryByText(picnic.title)).toBeNull();
    // Wishes stay fully usable in the same draft.
    fireEvent.click(screen.getByRole('button', { name: taskBoundary.back }));
    await openWishes();
    fireEvent.click(
      screen.getByRole('checkbox', { name: candidates[0].title }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: candidates[1].title }),
    );
    finishPick();
    fireEvent.click(screen.getByRole('button', { name: copy.start }));
    await waitFor(() =>
      expect(replaceWishSelectionRound).toHaveBeenCalledWith(
        expect.objectContaining({
          wishSelectionRoundUpdate: {
            wishIds: ['pasta', 'lake'],
            dateIdeaIds: [],
            title: undefined,
          },
        }),
      ),
    );
  });

  it('combines Wishes and Pro date ideas in one bounded round', async () => {
    const { replaceWishSelectionRound } = renderTask(
      projection('NO_ROUND'),
      false,
      'pro',
    );
    await openWishes();
    fireEvent.click(
      await screen.findByRole('checkbox', { name: candidates[0].title }),
    );
    finishPick();
    await openIdeas();
    // Pick mode shows full cards with one action each and no remember action.
    const add = await screen.findAllByRole('button', { name: copy.ideaAdd });
    expect(add).toHaveLength(3);
    expect(screen.getAllByText(picnic.description)).toHaveLength(3);
    expect(screen.queryByRole('link', { name: dateCopy.card.save })).toBeNull();
    expect(
      screen.getByRole('button', { name: dateCopy.filters.open }),
    ).toBeTruthy();
    fireEvent.click(add[0]);
    expect(screen.getByRole('button', { name: copy.ideaAdded })).toHaveProperty(
      'ariaPressed',
      'true',
    );
    finishPick();
    // The tray keeps both sources visible and removable.
    expect(
      screen.getByRole('button', {
        name: copy.removeCandidate.replace('{{title}}', picnic.title),
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.start }));
    await waitFor(() =>
      expect(replaceWishSelectionRound).toHaveBeenCalledWith({
        spaceId: 'space-1',
        locale: resolvedLocale(),
        ifMatch: 'absent',
        wishSelectionRoundUpdate: {
          wishIds: ['pasta'],
          dateIdeaIds: [picnic.id],
          title: undefined,
        },
      }),
    );
    expect(
      (await favorite(new RegExp(picnic.title))).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('never adds a sixth candidate from the catalog', async () => {
    renderTask(projection('NO_ROUND'), false, 'pro');
    await openWishes();
    for (const candidate of candidates)
      fireEvent.click(
        await screen.findByRole('checkbox', { name: candidate.title }),
      );
    finishPick();
    await openIdeas();
    const [first, second, third] = await screen.findAllByRole('button', {
      name: copy.ideaAdd,
    });
    fireEvent.click(first);
    fireEvent.click(second);
    expect(screen.getByText(copy.ideasFull)).toBeTruthy();
    expect(third).toHaveProperty('disabled', true);
    expect(
      screen.getByText(copy.selected.replace('{{count}}', '5')),
    ).toBeTruthy();
    // Removing one from the tray frees a place again.
    finishPick();
    fireEvent.click(
      screen.getByRole('button', {
        name: copy.removeCandidate.replace('{{title}}', picnic.title),
      }),
    );
    await openIdeas();
    expect(third).toHaveProperty('disabled', false);
  });

  it('publishes date-idea favorites only with the deliberate Share action', async () => {
    const { updateOwnWishSelection } = renderTask(
      withIdeas('CHOOSING'),
      false,
      'pro',
    );
    fireEvent.click(await favorite(new RegExp(sunset.title)));
    expect(updateOwnWishSelection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.share }));
    await screen.findByRole('heading', { name: copy.waitingTitle });
    expect(updateOwnWishSelection).toHaveBeenCalledWith({
      spaceId: 'space-1',
      locale: resolvedLocale(),
      ifMatch: 'round-1:1:0',
      wishSelectionUpdate: {
        favoriteWishIds: [],
        favoriteDateIdeaIds: [sunset.id],
        published: true,
      },
    });
  });

  it('turns a common date idea into nothing until a composer saves it', async () => {
    const { createWish, convertWishToPlan } = renderTask(
      withIdeas('READY', { common: [picnic.id], favorites: [picnic.id] }),
      false,
      'pro',
    );
    expect(
      await screen.findByRole('heading', { name: picnic.title }),
    ).toBeTruthy();
    expect(screen.getByText(copy.sharedIdea)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: sunset.title })).toBeNull();
    expect(
      screen.getByRole('link', { name: dateCopy.card.save }),
    ).toHaveProperty('href', expect.stringContaining('/plan/wishes/new'));
    fireEvent.click(screen.getByRole('link', { name: dateCopy.card.plan }));
    expect(await screen.findByText('Plan composer')).toBeTruthy();
    expect(createWish).not.toHaveBeenCalled();
    expect(convertWishToPlan).not.toHaveBeenCalled();
  });

  it('offers a later return without saving a common date idea', async () => {
    renderTask(
      withIdeas('READY', { common: [picnic.id], favorites: [picnic.id] }),
      false,
      'pro',
    );
    fireEvent.click(await screen.findByRole('button', { name: copy.later }));
    expect(await screen.findByText('Planning hub')).toBeTruthy();
  });

  it('pauses a round with date ideas after a downgrade without catalog content', async () => {
    renderTask(withIdeas('PAUSED', { content: false }), false, 'free');
    expect(
      await screen.findByRole('heading', { name: copy.pausedTitle }),
    ).toBeTruthy();
    expect(
      screen.getByText(copy.pausedIdeas_other.replace('{{count}}', '2')),
    ).toBeTruthy();
    expect(screen.queryByText(picnic.title)).toBeNull();
    expect(
      screen.getByRole('link', { name: dateCopy.locked.action }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.pausedReplace }));
    expect(
      await screen.findByRole('heading', { name: copy.setupTitle }),
    ).toBeTruthy();
    // Paused ideas without content are not carried into the Free replacement.
    expect(screen.getByText(copy.needOneMore)).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: copy.removeCandidate.replace('{{title}}', candidates[0].title),
      }),
    ).toBeTruthy();
    expect(screen.queryByText(copy.ideaSource)).toBeNull();
  });
});
