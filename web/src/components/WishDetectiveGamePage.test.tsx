// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import games from '../i18n/locales/games';
import type { WishDetectiveGameSetup } from './WishDetectiveGamePage';
import { WishDetectiveGamePage } from './WishDetectiveGamePage';

const remote = vi.hoisted(() => ({ state: undefined as unknown }));
const api = vi.hoisted(() => ({
  getGameWishCandidates: vi.fn(),
  getSpace: vi.fn(),
}));

// #2158 H: the default loaders talk to these two clients only.
vi.mock('../api/generated/apis/GamesApi', () => ({
  GamesApi: class {
    getGameWishCandidates = api.getGameWishCandidates;
  },
}));
vi.mock('../api/generated/apis/SpacesApi', () => ({
  SpacesApi: class {
    getSpaceApiV1SpacesSpaceIdGet = api.getSpace;
  },
}));

// #2048: the play-mode choice comes first; these tests play on one phone.
vi.mock('../client/useRemoteCoupleGames', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../client/useRemoteCoupleGames')>();
  const ok = async () => ({ ok: true as const });
  const stub = () => ({
    state: remote.state,
    isLoading: false,
    loadError: null,
    problem: null,
    busy: false,
    refetch: () => undefined,
    view: { phase: 'notStarted' as const, readiness: null },
    missingWishes: null,
    start: ok,
    end: ok,
    continue: () => undefined,
  });
  return {
    ...actual,
    useRemoteWhoOfUsGame: stub,
    useRemoteWishDetectiveGame: stub,
    useRemoteOurMomentsGame: stub,
  };
});

async function chooseTogether() {
  fireEvent.click(
    await screen.findByRole('radio', {
      name: new RegExp(games.playMode.together),
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: games.playMode.start }));
}

const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const SECRET_WISH_TITLE = 'Stargazing in the garden';

function localized(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  );
}

function playableSetup(): WishDetectiveGameSetup {
  return {
    participants: [
      { id: 'lea', displayName: 'Lea' },
      { id: 'alex', displayName: 'Alex' },
    ],
    rounds: [
      { wishId: 'l1', createdBy: 'lea', title: SECRET_WISH_TITLE },
      { wishId: 'a1', createdBy: 'alex', title: 'Weekend by the sea' },
      { wishId: 'l2', createdBy: 'lea', title: 'Picnic by the lake' },
      { wishId: 'a2', createdBy: 'alex', title: 'Concert in Berlin' },
    ],
  };
}

function renderPage(setup?: WishDetectiveGameSetup) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/games/wish-detective']}>
          <WishDetectiveGamePage
            apiBaseUrl="http://api.example.test"
            accessToken="test-token"
            spaceId={SPACE_ID}
            currentAccountId="lea"
            loadSetup={setup ? async () => setup : undefined}
          />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe('WishDetectiveGamePage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    remote.state = undefined;
    api.getGameWishCandidates.mockReset();
    api.getSpace.mockReset();
  });

  it('keeps the wish visible during clue entry and hides it for handoff and guessing', async () => {
    renderPage(playableSetup());
    await chooseTogether();

    await screen.findByRole('heading', {
      name: games.entries.wishes.title,
      level: 1,
    });
    expect(await screen.findByText(SECRET_WISH_TITLE)).toBeTruthy();

    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 1 }),
      ),
      { target: { value: 'Night' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 2 }),
      ),
      { target: { value: 'Blanket' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 3 }),
      ),
      { target: { value: 'Warm' } },
    );

    expect(screen.getByText(SECRET_WISH_TITLE)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: games.wishDetective.startHandoff,
      }),
    );

    expect(screen.queryByText(SECRET_WISH_TITLE)).toBeNull();
    expect(
      screen.getByRole('heading', {
        name: localized(games.wishDetective.handoffTitle, { name: 'Alex' }),
      }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: localized(games.wishDetective.handoffConfirm, { name: 'Alex' }),
      }),
    );
    expect(screen.queryByText(SECRET_WISH_TITLE)).toBeNull();
    expect(screen.getByText('Night')).toBeTruthy();
    expect(screen.getByText('Blanket')).toBeTruthy();
    expect(screen.getByText('Warm')).toBeTruthy();
    expect(
      screen.getByLabelText(
        localized(games.wishDetective.guessLabel, { name: 'Lea' }),
      ),
    ).toBeTruthy();
  });

  it('does not reveal the secret when a hidden phase is remounted', async () => {
    const firstRender = renderPage(playableSetup());
    await chooseTogether();
    await screen.findByText(SECRET_WISH_TITLE);

    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 1 }),
      ),
      { target: { value: 'Night' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 2 }),
      ),
      { target: { value: 'Blanket' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 3 }),
      ),
      { target: { value: 'Warm' } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: games.wishDetective.startHandoff,
      }),
    );
    expect(screen.queryByText(SECRET_WISH_TITLE)).toBeNull();

    firstRender.unmount();
    renderPage(playableSetup());

    await screen.findByRole('heading', {
      name: games.wishDetective.interruptedTitle,
      level: 2,
    });
    expect(screen.queryByText(SECRET_WISH_TITLE)).toBeNull();
    expect(
      screen
        .getByRole('link', { name: games.wishDetective.backToGames })
        .getAttribute('href'),
    ).toBe('/games');
  });

  it('shows validation feedback instead of silently accepting invalid clues', async () => {
    renderPage(playableSetup());
    await chooseTogether();
    await screen.findByText(SECRET_WISH_TITLE);

    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 1 }),
      ),
      { target: { value: 'romantic evening' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 2 }),
      ),
      { target: { value: 'garden' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        localized(games.wishDetective.clueLabel, { index: 3 }),
      ),
      { target: { value: 'garden' } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: games.wishDetective.startHandoff,
      }),
    );

    expect(screen.getByText(games.wishDetective.errors.oneWord)).toBeTruthy();
    expect(
      screen.getAllByText(games.wishDetective.errors.duplicate),
    ).toHaveLength(2);
    expect(screen.getByText(SECRET_WISH_TITLE)).toBeTruthy();
  });

  it('shows the sparse state without exposing hidden candidate totals', async () => {
    const setup = playableSetup();
    renderPage({
      participants: setup.participants,
      rounds: [],
      missing: { you: true, partner: false },
    });
    await chooseTogether();

    await screen.findByRole('heading', {
      name: games.wishDetective.sparseTitleYou,
      level: 2,
    });
    const wishesLink = screen.getByRole('link', {
      name: games.wishDetective.sparseAction,
    });
    expect(wishesLink.getAttribute('href')).toBe('/plan/wishes/new');
  });

  it('names the partner who still needs a wish, without an action for them', async () => {
    const setup = playableSetup();
    renderPage({
      participants: setup.participants,
      rounds: [],
      missing: { you: false, partner: true },
    });
    await chooseTogether();

    await screen.findByRole('heading', {
      name: games.wishDetective.sparseTitlePartner.replace('{{name}}', 'Alex'),
      level: 2,
    });
    expect(
      screen.queryByRole('link', { name: games.wishDetective.sparseAction }),
    ).toBeNull();
  });

  it('starts with one wish per person', async () => {
    const setup = playableSetup();
    renderPage({
      participants: setup.participants,
      rounds: setup.rounds.slice(0, 2),
    });
    await chooseTogether();
    await screen.findByText(SECRET_WISH_TITLE);
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', {
          name: games.wishDetective.sparseTitleBoth,
        }),
      ).toBeNull(),
    );
    expect(screen.queryByText(games.wishDetective.sparseEyebrow)).toBeNull();
  });

  it('says who still needs a wish from the server readiness, before any mode', async () => {
    remote.state = {
      game: null,
      readiness: { ownWishesAvailable: true, partnerWishesAvailable: false },
    };
    renderPage(playableSetup());

    await screen.findByRole('heading', {
      name: games.wishDetective.sparseTitlePartner.replace('{{name}}', 'Alex'),
      level: 2,
    });
    expect(
      screen.queryByRole('radio', { name: new RegExp(games.playMode.apart) }),
    ).toBeNull();
  });

  it('loads the wish titles only for a game on one phone (#2158 H)', async () => {
    api.getSpace.mockResolvedValue({
      partners: [
        { id: 'lea', displayName: 'Lea' },
        { id: 'alex', displayName: 'Alex' },
      ],
    });
    api.getGameWishCandidates.mockResolvedValue({
      items: [
        { wishId: 'l1', createdBy: 'lea', title: SECRET_WISH_TITLE },
        { wishId: 'a1', createdBy: 'alex', title: 'Weekend by the sea' },
      ],
    });
    remote.state = {
      game: null,
      readiness: { ownWishesAvailable: true, partnerWishesAvailable: true },
    };
    renderPage();

    fireEvent.click(
      await screen.findByRole('radio', {
        name: new RegExp(games.playMode.apart),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: games.playMode.start }));
    await waitFor(() => expect(api.getSpace).toHaveBeenCalledTimes(1));
    expect(api.getGameWishCandidates).not.toHaveBeenCalled();

    await chooseTogether();
    await screen.findByText(SECRET_WISH_TITLE);
    expect(api.getGameWishCandidates).toHaveBeenCalledTimes(1);
  });

  it('does not start when the active Space is not a two-partner couple', async () => {
    renderPage({ participants: null, rounds: [] });

    await screen.findByText(games.wishDetective.coupleRequiredTitle);
    expect(screen.queryByText(SECRET_WISH_TITLE)).toBeNull();
  });
});
